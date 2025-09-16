import { AssemblyAI } from 'assemblyai';
import { GLOBAL } from '../singleton';
import Logger from '../utils/DatadogLogger';

export enum AvailableModels {
    NANO = 'nano',
    UNIVERSAL = 'universal'
}

export default class AssemblyAiService {
    private client: AssemblyAI;
    
    constructor() {
        this.client = new AssemblyAI({
            apiKey: process.env.ASSEMBLYAI_API_KEY as string
        });
        Logger.withFunctionName('AssemblyAiService')
    }

    async getTranscript(
        url: string,
        model: AvailableModels = AvailableModels.UNIVERSAL,
        minSpeakersExpected?: number,
        maxSpeakersExpected?: number
    ) {
        const transcript = await this.client.transcripts.transcribe({
            audio: url,
            speaker_labels: true,
            speech_model: model,
            language_detection: true,
            disfluencies: true,
            speaker_options: {
                min_speakers_expected: minSpeakersExpected,
                max_speakers_expected: maxSpeakersExpected
            }
        });

        const transcriptPath = this.saveTranscriptLocal(transcript);

        const wordsCount = transcript?.words?.length || 0;
        const utterancesCount = transcript?.utterances?.length || 0;
        
        Logger.info(`Transcription generated with ${wordsCount} words and ${utterancesCount} utterances`);
        return {
            transcript,
            transcriptPath
        };
    }

    private saveTranscriptLocal(transcript: any) {
        const bot_id = GLOBAL.get().bot_uuid;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const tempDir = path.join(os.tmpdir(), 'meet-teams-bot-transcripts');

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `transcript-${bot_id}-${Date.now()}.json`);
        fs.writeFileSync(tempFilePath, JSON.stringify(transcript));
        Logger.info(`Transcription saved to ${tempFilePath}`);
        return tempFilePath;
    }
}

