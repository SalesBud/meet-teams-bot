import { AssemblyAI } from 'assemblyai';

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
    }

    async getTranscript(
        url: string,
        model: AvailableModels = AvailableModels.UNIVERSAL,
        speakersExpected?: number
    ) {
        return await this.client.transcripts.transcribe({
            audio: url,
            speaker_labels: true,
            speech_model: model,
            language_detection: true,
            disfluencies: true,
            ...(speakersExpected && { speakers_expected: speakersExpected })
        });
    }
}

