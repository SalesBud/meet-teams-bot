import { NORMAL_END_REASONS } from './state-machine/constants'
import {
    getErrorMessageFromCode,
    MeetingEndReason,
} from './state-machine/types'
import { MeetingParams, RecordingMode, SpeechToTextProvider } from './types'

class Global {
    private meetingParams: MeetingParams | null = null
    private endReason: MeetingEndReason | null = null
    private errorMessage: string | null = null
    public constructor() { }

    public set(meetingParams: MeetingParams) {
        // Validate critical environment variables before setting meeting params
        const meetingUrl = process.env.MEETING_URL
        if (!meetingUrl || meetingUrl.trim() === '') {
            throw new Error('Missing required environment variable: MEETING_URL')
        }

        const botUuid = process.env.BOT_ID
        if (!botUuid || botUuid.trim() === '') {
            throw new Error('Missing required environment variable: BOT_ID')
        }

        // Override meetingParams with environment variables
        this.meetingParams = {
            ...meetingParams,
            meeting_url: meetingUrl,
            bot_uuid: botUuid,
            bot_name: process.env.BOT_NAME || 'Salesbud',
            bots_api_key: process.env.BOTS_API_KEY,
            bots_webhook_url: process.env.BOTS_WEBHOOK_URL,
            streaming_audio_frequency: Number(process.env.STREAMING_AUDIO_FREQUENCY) || 24000,
            enter_message: process.env.ENTER_MESSAGE || 'Recording bot has joined the meeting',
            recording_mode: process.env.RECORDING_MODE as RecordingMode || 'speaker_view',
            local_recording_server_location: process.env.LOCAL_RECORDING_SERVER_LOCATION || 'docker',
            automatic_leave: {
                waiting_room_timeout: Number(process.env.WAITING_ROOM_TIMEOUT) || 600,
                noone_joined_timeout: Number(process.env.NOONE_JOINED_TIMEOUT) || 600,
            },
            mp4_s3_path: process.env.MP4_S3_PATH || 'recordings/output.mp4',
            custom_branding_bot_path: process.env.CUSTOM_BRANDING_BOT_PATH || 'https://salesbud-assets.s3.amazonaws.com/sbv2.jpg',
            environ: process.env.ENV || 'local',
            aws_s3_temporary_audio_bucket: process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || 'meeting-baas-dev',
            remote: {
                aws_s3_video_bucket: process.env.AWS_S3_VIDEO_BUCKET || 'meeting-baas-dev',
                aws_s3_log_bucket: process.env.AWS_S3_LOG_BUCKET || 'meeting-baas-dev',
            },
            secret: process.env.SECRET,
            streaming_input: process.env.STREAMING_INPUT,
            streaming_output: process.env.STREAMING_OUTPUT,
            speech_to_text_api_key: process.env.SPEECH_TO_TEXT_API_KEY,
            speech_to_text_provider: process.env.SPEECH_TO_TEXT_PROVIDER as SpeechToTextProvider || 'Default',
            force_lang: process.env.FORCE_LANG === 'true' || false,
            translation_lang: process.env.TRANSLATION_LANG,
            vocabulary: process.env.VOCABULARY?.split(',') || [],
            user_token: process.env.USER_TOKEN || 'dummy-token-for-production',
            user_id: Number(process.env.USER_ID) || 123,
            session_id: process.env.SESSION_ID || 'production-session',
            email: process.env.EMAIL || 'bot@example.com'
        }

        console.log(`BOT_ID: ${botUuid}`)
    }

    public get(): MeetingParams {
        if (this.meetingParams === null) {
            throw new Error('Meeting params are not set')
        }
        return this.meetingParams
    }

    public isServerless(): boolean {
        return process.env.IS_SERVERLESS === 'true'
    }

    public setError(reason: MeetingEndReason, message?: string): void {
        console.warn(`Setting global error: ${reason}`)
        this.endReason = reason
        this.errorMessage = message || getErrorMessageFromCode(reason)
        console.warn(`End reason set to: ${this.endReason}`)
    }

    public setEndReason(reason: MeetingEndReason): void {
        console.log(`Setting global end reason: ${reason}`)
        this.endReason = reason

        if (NORMAL_END_REASONS.includes(reason)) {
            console.log(`Clearing error state for normal termination: ${reason}`)
            // This ensures that an error message isn't propagated to the client for normal termination
            this.clearError()
        }
    }

    public getEndReason(): MeetingEndReason | null {
        return this.endReason
    }

    public getErrorMessage(): string | null {
        return this.errorMessage
    }

    public hasError(): boolean {
        // Only return true if we have an error message (indicating an actual error)
        // Having an end reason alone doesn't mean there's an error
        return this.errorMessage !== null
    }

    public clearError(): void {
        // Only clear the error message, keep the end reason
        // This allows normal termination reasons to be preserved
        this.errorMessage = null
    }
}

export let GLOBAL = new Global()
