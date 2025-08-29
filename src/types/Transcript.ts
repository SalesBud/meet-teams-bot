import { MeetingBotStatus } from '../constants/Transcript';

export interface SpeakerLog {
    speaker: string;
    start: number;
    end: number;
    [key: string]: any;
}

export interface SpeakerCount {
    speakers: string[];
    minSpeakersExpected: number;
    maxSpeakersExpected: number;
}

export interface TranscriptionFinishedData {
    event: MeetingBotStatus.COMPLETE | MeetingBotStatus.FAILED;
    bot_id: string;
    transcript?: {
        speaker: string;
        offset: number;
        words: {
            start: number;
            end: number;
            word: string;
        }[];
    }[];
    speakers?: string[];
    mp4?: string;
    error?: string;
    message?: string;
    duration?: number;
}
