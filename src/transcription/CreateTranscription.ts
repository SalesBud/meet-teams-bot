import RecordingBucketService from '../services/RecordingBucketService'
import AssemblyAiService from '../services/AssemblyAiService'
import { minWordsLength } from '../constants/Transcript'
import { countUniqueSpeakers, extractSpeechSegments } from './utils'
import SpeakerMappingService from '../services/SpeakerMappingService'
import { GLOBAL } from '../singleton'
import { MeetingBotStatus } from '../constants/Transcript'
import { getErrorMessageFromCode } from '../state-machine/types'
import { S3Uploader } from '../utils/S3Uploader'
import Logger from '../utils/DatadogLogger'

export const EVENT_TYPE = 'CREATE_TRANSCRIPTION'
const GENERAL_ERROR_CODE = 'TranscriptionProcessFailed'

export default class TranscriptionProcess {
    public async createTranscriptionData() {
        Logger.withFunctionName('createTranscriptionData')
        const bot_id = GLOBAL.get().bot_uuid

        try {
            const bucketService = new RecordingBucketService()

            const { audioUrl, videoUrl, speakersLog } = await this.getFiles(
                bot_id,
                bucketService,
            )

            if (!speakersLog || !speakersLog.length) {
                Logger.error('Failed to process speaker_separation.log, file not found')
                return {
                    event: MeetingBotStatus.FAILED,
                    error: GENERAL_ERROR_CODE,
                    message: 'Failed to process speaker_separation.log file',
                }
            }

            const { minSpeakersExpected, maxSpeakersExpected, speakers } = countUniqueSpeakers(speakersLog);

            Logger.info(
                `Processing transcription with ${minSpeakersExpected} to ${maxSpeakersExpected} expected speakers for bot_id: ${bot_id}`,
                {
                    speakers,
                },
            )

            if (maxSpeakersExpected === 0) {
                Logger.error(
                    `No speakers detected during recording for bot_id: ${bot_id}`,
                )
                return {
                    event: MeetingBotStatus.FAILED,
                    error: GENERAL_ERROR_CODE,
                    message: 'No speakers detected during recording.',
                }
            }

            if (!audioUrl) {
                Logger.error('Failed to get audio url for bot_id: ${bot_id}', {
                    bot_id,
                })
                return {
                    event: MeetingBotStatus.FAILED,
                    error: GENERAL_ERROR_CODE,
                    message: 'Failed to get audio url from S3',
                }
            }

            const { transcript, transcriptPath } =
                await new AssemblyAiService().getTranscript(
                    audioUrl,
                    undefined,
                    minSpeakersExpected,
                    maxSpeakersExpected,
                )

            if (
                !transcript?.words?.length ||
                transcript?.words?.length < minWordsLength ||
                transcript.error
            ) {
                Logger.error(
                    `Insufficient words (${transcript?.words?.length}) in transcript for bot_id: ${bot_id}`,
                    {
                        error: transcript.error ?? 'unknown error',
                    },
                )
                return {
                    event: MeetingBotStatus.FAILED,
                    error: GENERAL_ERROR_CODE,
                    message: `Insufficient words in transcript for bot_id: ${bot_id}`,
                }
            }

            if (!transcript?.utterances) {
                Logger.error(
                    `No utterances found in transcript for bot_id: ${bot_id}`,
                    {
                        error: transcript.error ?? 'unknown error',
                    },
                )
                return {
                    event: MeetingBotStatus.FAILED,
                    error: GENERAL_ERROR_CODE,
                    message: `No utterances found in transcript for bot_id: ${bot_id}`,
                }
            }

            await this.saveTranscriptToS3(transcriptPath, bot_id)

            const unifiedTalks = extractSpeechSegments(speakersLog)
            const detectedSpeakers = transcript.utterances.map(
                (utterance) => utterance.speaker,
            )

            const mappedUtterances =
                await SpeakerMappingService.replaceSpeakerLabels(
                    transcript.utterances,
                    speakers,
                    detectedSpeakers,
                    unifiedTalks,
                )

            Logger.info(
                'Create transcription data completed, building bot data to webhook',
            )
            return this.buildBotDataToWebhook(
                mappedUtterances,
                videoUrl,
                transcript,
            )
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            Logger.error('Fatal error in create transcription', {
                eventType: EVENT_TYPE,
                error: errorMessage,
                bot_id,
            })

            const endReason = GLOBAL.getEndReason()
            const message = endReason
                ? getErrorMessageFromCode(endReason)
                : 'Transcription process failed'
            return {
                event: MeetingBotStatus.FAILED,
                error: GENERAL_ERROR_CODE,
                message: message,
            }
        }
    }

    private async getFiles(
        bot_id: string,
        bucketService: RecordingBucketService,
    ) {
        const bucketName = GLOBAL.get().remote.aws_s3_video_bucket

        const audioUrl = await bucketService.generatePresignedUrl(
            `${bot_id}/${bot_id}.wav`,
            bucketName,
        )

        const videoUrl = await bucketService.generatePresignedUrl(
            `${bot_id}/${bot_id}.mp4`,
            bucketName,
        )

        const speakersLogBuffer = await bucketService.downloadFromBucket(
            `${bot_id}/speaker_separation.json`,
            bucketName,
        )

        const speakersLog = speakersLogBuffer ? JSON.parse(speakersLogBuffer.toString()).flat() : [];

        return {
            audioUrl,
            videoUrl,
            speakersLog,
        }
    }

    private buildBotDataToWebhook(
        mappedUtterances: any,
        videoUrl: string,
        transcript: any,
    ): Record<string, any> {
        if (mappedUtterances?.length > 0) {
            const mappedTranscript = mappedUtterances.map(
                (transcript: any) => ({
                    speaker: transcript.speaker,
                    offset: transcript.start,
                    words: transcript.words.map((word: any) => ({
                        start: word.start / 1000,
                        end: word.end / 1000,
                        word: word.text,
                    })),
                }),
            )

            const speakers = [
                ...new Set(mappedUtterances.map((t: any) => t.speaker)),
            ]

            return {
                transcript: mappedTranscript,
                speakers: speakers,
                mp4: videoUrl,
                event: MeetingBotStatus.COMPLETE,
                duration: transcript.audio_duration,
            }
        }
        return {
            event: MeetingBotStatus.FAILED,
            error: GENERAL_ERROR_CODE,
            message: 'Transcription is failed with mapped utterances length 0',
        }
    }

    private async saveTranscriptToS3(transcriptPath: string, bot_id: string) {
        Logger.withFunctionName('saveTranscriptToS3')
        try {
            const bucketName = GLOBAL.get().remote.aws_s3_video_bucket
            const s3Uploader = S3Uploader.getInstance()
            await s3Uploader.uploadFile(
                transcriptPath,
                bucketName,
                `${bot_id}/transcript.json`,
            )
        } catch (error) {
            Logger.warn('Error saving transcript on S3', {
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }
}
