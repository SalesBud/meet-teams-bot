import { SpeakerLog, SpeakerCount } from '../types/Transcript';
import { UnifiedTalk } from '../services/SpeakerMappingService';

export function countUniqueSpeakers(speakersLog: SpeakerLog[]): SpeakerCount {
    try {
        const isOnlyOneSpeaker = new Set(speakersLog.map(speaker => speaker.name)).size === 1
        if (isOnlyOneSpeaker) {
            return { speakersExpected: 1, speakers: [speakersLog[0].name] }
        }

        const speakingInstances = new Set<string>();

        speakersLog.forEach((log, index) => {
            const hasValidName = log?.name && typeof log.name === 'string' && log.name.trim() !== '';
            if (log.isSpeaking && hasValidName) {
                const nextEntries = speakersLog.slice(index + 1);
                const endSpeakingEntry = nextEntries.find(entry =>
                    entry.name === log.name && !entry.isSpeaking
                );

                if (endSpeakingEntry && endSpeakingEntry.timestamp - log.timestamp >= 1000) {
                    speakingInstances.add(log.name);
                }
            }
        });

        const speakers = Array.from(speakingInstances);

        return {
            speakersExpected: speakers.length,
            speakers
        };
    } catch (error) {
        console.error('Error counting unique speakers', { error });
        return {
            speakersExpected: 0,
            speakers: []
        };
    }
}

export function extractSpeechSegments(speakersLog: SpeakerLog[], minDurationMs = 500): UnifiedTalk[] {
    try {
        const segments: UnifiedTalk[] = [];

        const entriesByTimestamp = new Map();

        speakersLog.forEach(entry => {
            if (!entriesByTimestamp.has(entry.timestamp)) {
                entriesByTimestamp.set(entry.timestamp, []);
            }
            entriesByTimestamp.get(entry.timestamp).push(entry);
        });

        const sortedTimestamps = Array.from(entriesByTimestamp.keys()).sort((a, b) => a - b);

        const speakingStates = new Map();

        for (const timestamp of sortedTimestamps) {
            const entries = entriesByTimestamp.get(timestamp);

            entries.forEach((entry: any) => {
                const { name, isSpeaking } = entry;
                const currentState = speakingStates.get(name) || { isSpeaking: false };

                if (isSpeaking && !currentState.isSpeaking) {
                    speakingStates.set(name, { isSpeaking: true, startTime: timestamp });
                } else if (!isSpeaking && currentState.isSpeaking && currentState.startTime) {
                    const duration = timestamp - currentState.startTime;

                    if (duration >= minDurationMs) {
                        segments.push({
                            speaker: name,
                            start: currentState.startTime,
                            end: timestamp
                        });
                    }

                    speakingStates.set(name, { isSpeaking: false });
                }
            });
        }

        const lastTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
        speakingStates.forEach((state, speaker) => {
            if (state.isSpeaking && state.startTime) {
                const duration = lastTimestamp - state.startTime;
                if (duration >= minDurationMs) {
                    segments.push({
                        speaker,
                        start: state.startTime,
                        end: lastTimestamp
                    });
                }
            }
        });

        segments.sort((a, b) => a.start - b.start);

        console.info(`Extracted ${segments.length} speech segments`);

        return segments;
    } catch (error) {
        console.warn('Error extracting speech segments: ', { error });
        return [];
    }
}

