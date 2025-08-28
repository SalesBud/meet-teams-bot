export interface TranscriptSegment {
    speaker: string;
    start: number;
    end: number;
    text: string;
}

export interface UnifiedTalk {
    speaker: string;
    start: number;
    end: number;
}

export interface SpeakerMapping {
    [anonymousSpeaker: string]: string;
}

export interface OverlapScores {
    [anonymousSpeaker: string]: {
        [realSpeaker: string]: number;
    };
}

export default class SpeakerMappingService {
    private static logger = console;

    private static buildSpeakerMapping(
        transcriptSegments: TranscriptSegment[],
        allParticipants: string[] = [],
        detectedSpeakers: string[] = [],
        unifiedTalks?: UnifiedTalk[]
    ): SpeakerMapping {
        let mapping: SpeakerMapping = {};

        if (unifiedTalks && unifiedTalks.length > 0) {
            mapping = this.mapTranscriptToSpeakers(unifiedTalks, transcriptSegments);
        }

        if (Object.keys(mapping).length === 0) {
            this.logger.error(
                'Unable to map speakers by overlap\n' +
                `Detected speakers: ${JSON.stringify(detectedSpeakers)}\n` +
                `Expected speakers: ${JSON.stringify(allParticipants)}\n` +
                `Speakers from transcript: ${JSON.stringify(transcriptSegments)}\n` +
                `Speakers from unified_talks: ${JSON.stringify(unifiedTalks)}`
            );
            return {};
        }

        return mapping;
    }

    private static calculateOverlap(
        start1: number,
        end1: number,
        start2: number,
        end2: number
    ): number {
        const overlapStart = Math.max(start1, start2);
        const overlapEnd = Math.min(end1, end2);

        return Math.max(0, overlapEnd - overlapStart);
    }

    private static mapTranscriptToSpeakers(
        unifiedTalks: UnifiedTalk[],
        transcriptSegments: TranscriptSegment[]
    ): SpeakerMapping {
        if (
            !unifiedTalks ||
            unifiedTalks.length === 0 ||
            !transcriptSegments ||
            transcriptSegments.length === 0
        ) {
            this.logger.warn('Insufficient data for overlap mapping');
            return {};
        }

        try {
            for (const talk of unifiedTalks) {
                const requiredKeys = ['speaker', 'start', 'end'];
                if (!requiredKeys.every(key => key in talk)) {
                    this.logger.warn('Invalid structure in unified_talks');
                    return {};
                }
                if (typeof talk.start !== 'number' || typeof talk.end !== 'number') {
                    this.logger.warn('Invalid time values in unified_talks');
                    return {};
                }
            }

            for (const seg of transcriptSegments) {
                const requiredKeys = ['speaker', 'start', 'end'];
                if (!requiredKeys.every(key => key in seg)) {
                    this.logger.warn('Invalid structure in transcript_segments');
                    return {};
                }
                if (typeof seg.start !== 'number' || typeof seg.end !== 'number') {
                    this.logger.warn('Invalid time values in transcript_segments');
                    return {};
                }
            }
        } catch (error) {
            this.logger.error(`Error validating data: ${error}`);
            return {};
        }

        const realSpeakers = [...new Set(unifiedTalks.map(talk => talk.speaker))].sort();
        const anonSpeakers = [...new Set(transcriptSegments.map(seg => seg.speaker))].sort();

        if (realSpeakers.length === 0 || anonSpeakers.length === 0) {
            this.logger.warn('No speakers found for mapping');
            return {};
        }

        const overlapScores: OverlapScores = {};
        anonSpeakers.forEach(anon => {
            overlapScores[anon] = {};
            realSpeakers.forEach(real => {
                overlapScores[anon][real] = 0;
            });
        });

        anonSpeakers.forEach(anonLabel => {
            realSpeakers.forEach(realName => {
                const anonSegs = transcriptSegments.filter(s => s.speaker === anonLabel);
                const realSegs = unifiedTalks.filter(t => t.speaker === realName);

                const totalOverlap = anonSegs.reduce((sum, aSeg) => {
                    return (
                        sum +
                        realSegs.reduce((innerSum, rSeg) => {
                            return innerSum + this.calculateOverlap(aSeg.start, aSeg.end, rSeg.start, rSeg.end);
                        }, 0)
                    );
                }, 0);

                overlapScores[anonLabel][realName] = totalOverlap;
            });
        });

        const initialMapping: SpeakerMapping = {};
        Object.entries(overlapScores).forEach(([anonLabel, scores]) => {
            if (Object.keys(scores).length > 0) {
                const bestMatch = Object.entries(scores).reduce((a, b) =>
                    scores[a[0]] > scores[b[0]] ? a : b
                );
                initialMapping[anonLabel] = bestMatch[0];
            }
        });

        const realToAnonAssignments: { [realName: string]: string[] } = {};
        Object.entries(initialMapping).forEach(([anon, real]) => {
            if (!realToAnonAssignments[real]) {
                realToAnonAssignments[real] = [];
            }
            realToAnonAssignments[real].push(anon);
        });

        const finalMapping: SpeakerMapping = {};
        const conflictingAnonSpeakers: string[] = [];

        Object.entries(realToAnonAssignments).forEach(([realName, assignedAnons]) => {
            if (assignedAnons.length === 1) {
                finalMapping[assignedAnons[0]] = realName;
            } else {
                const winnerAnon = assignedAnons.reduce((winner, anon) =>
                    overlapScores[anon][realName] > overlapScores[winner][realName] ? anon : winner
                );

                finalMapping[winnerAnon] = realName;

                assignedAnons.forEach(anon => {
                    if (anon !== winnerAnon) {
                        conflictingAnonSpeakers.push(anon);
                    }
                });
            }
        });

        const assignedReal = new Set(Object.values(finalMapping));
        const unassignedReal = realSpeakers.filter(name => !assignedReal.has(name));

        if (conflictingAnonSpeakers.length > 0 && unassignedReal.length > 0) {
            const availableReal = [...unassignedReal];

            conflictingAnonSpeakers.forEach(anonToRemap => {
                if (availableReal.length > 0) {
                    const bestNewMatch = availableReal.reduce((best, real) =>
                        overlapScores[anonToRemap][real] > overlapScores[anonToRemap][best] ? real : best
                    );

                    finalMapping[anonToRemap] = bestNewMatch;

                    const index = availableReal.indexOf(bestNewMatch);
                    if (index > -1) {
                        availableReal.splice(index, 1);
                    }
                }
            });
        }

        const unmappedAnons = anonSpeakers.filter(anon => !(anon in finalMapping));
        const remainingReal = realSpeakers.filter(name => !assignedReal.has(name));

        unmappedAnons.forEach((anon, index) => {
            if (index < remainingReal.length) {
                finalMapping[anon] = remainingReal[index];
            } else {
                finalMapping[anon] = anon;
            }
        });

        this.logger.info(`Speaker mapping completed: ${JSON.stringify(finalMapping)}`);
        return finalMapping;
    }

    public static async replaceSpeakerLabels(
        transcriptSegments: TranscriptSegment[],
        allParticipants: string[] = [],
        detectedSpeakers: string[] = [],
        unifiedTalks?: UnifiedTalk[]
    ) {
        try {

            if (transcriptSegments.length === 0) {
                this.logger.warn('No speaker segments in transcription.');
                return transcriptSegments;
            }

            const mapping = this.buildSpeakerMapping(
                transcriptSegments,
                allParticipants,
                detectedSpeakers,
                unifiedTalks
            );

            const updatedSegments = transcriptSegments.map(utterance => ({
                ...utterance,
                speaker: mapping[utterance.speaker] || utterance.speaker
            }));

            this.logger.info(`Speakers replaced successfully`);
            return updatedSegments;
        } catch (error) {
            this.logger.error(`Error replacing speakers: ${error}`);
            throw error;
        }
    }
}

