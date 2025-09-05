import { Page } from '@playwright/test'
import { MeetingProvider, RecordingMode, SpeakerData } from '../types'
import { MeetSpeakersObserver } from './meet/speakersObserver'
import { TeamsSpeakersObserver } from './teams/speakersObserver'
import Logger from '../utils/DatadogLogger'

export class SpeakersObserver {
    private meetingProvider: MeetingProvider
    private observer: MeetSpeakersObserver | TeamsSpeakersObserver | null = null
    private isObserving: boolean = false
    private retryCount: number = 0
    private maxRetries: number = 3

    constructor(meetingProvider: MeetingProvider) {
        this.meetingProvider = meetingProvider
    }

    public async startObserving(
        page: Page,
        recordingMode: RecordingMode,
        botName: string,
        onSpeakersChange: (speakers: SpeakerData[]) => void,
        meetingStartTime?: number,
    ): Promise<void> {
        Logger.withFunctionName('startObserving')
        if (this.isObserving) {
            return
        }

        Logger.info(
            `[SpeakersObserver] Starting for ${this.meetingProvider}...`,
        )

        // Create the appropriate observer based on meeting provider - SIMPLE ROUTING
        switch (this.meetingProvider) {
            case 'Meet':
                this.observer = new MeetSpeakersObserver(
                    page,
                    recordingMode,
                    botName,
                    onSpeakersChange,
                    meetingStartTime,
                )
                break

            case 'Teams':
                this.observer = new TeamsSpeakersObserver(
                    page,
                    recordingMode,
                    botName,
                    onSpeakersChange,
                    meetingStartTime,
                )
                break

            default:
                throw new Error(
                    `Unknown meeting provider: ${this.meetingProvider}`,
                )
        }

        if (this.observer) {
            try {
                await this.observer.startObserving()
                this.isObserving = true
                this.retryCount = 0
            } catch (error) {
                Logger.warn(
                    `[SpeakersObserver] Failed to initialize (attempt ${this.retryCount + 1}/${this.maxRetries}):`,
                    { error },
                )

                // Retry logic - same as before
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++
                    setTimeout(() => {
                        Logger.info(
                            `[SpeakersObserver] Retrying (attempt ${this.retryCount}/${this.maxRetries})...`,
                        )
                        this.startObserving(
                            page,
                            recordingMode,
                            botName,
                            onSpeakersChange,
                            meetingStartTime,
                        )
                    }, 5000)
                } else {
                    Logger.error(
                        `[SpeakersObserver] Max retries (${this.maxRetries}) reached. Giving up.`,
                    )
                    this.isObserving = false
                    this.observer = null
                }
            }
        }
    }

    public stopObserving(): void {
        if (!this.isObserving || !this.observer) {
            return
        }

        this.observer.stopObserving()
        this.observer = null
        this.isObserving = false
        this.retryCount = 0
    }

    public isCurrentlyObserving(): boolean {
        return this.isObserving
    }
}
