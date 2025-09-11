import { Page } from '@playwright/test'
import { MeetingProvider, RecordingMode } from '../types'
import { MeetHtmlCleaner } from './meet/htmlCleaner'
import { TeamsHtmlCleaner } from './teams/htmlCleaner'
import Logger from '../utils/DatadogLogger'

export class HtmlCleaner {
    private meetingProvider: MeetingProvider
    private cleaner: MeetHtmlCleaner | TeamsHtmlCleaner | null = null
    private isRunning: boolean = false

    constructor(
        page: Page,
        meetingProvider: MeetingProvider,
        recordingMode: RecordingMode,
    ) {
        this.meetingProvider = meetingProvider

        // Create the appropriate cleaner based on meeting provider
        switch (this.meetingProvider) {
            case 'Meet':
                this.cleaner = new MeetHtmlCleaner(page, recordingMode)
                break

            case 'Teams':
                this.cleaner = new TeamsHtmlCleaner(page, recordingMode)
                break

            default:
                throw new Error(
                    `Unknown meeting provider: ${this.meetingProvider}`,
                )
        }
    }

    public async start(): Promise<void> {
        Logger.withFunctionName('start')
        if (this.isRunning) {
            return
        }

        if (this.cleaner) {
            try {
                await this.cleaner.start()
                this.isRunning = true
                Logger.info(
                    `[HtmlCleaner] Started for ${this.meetingProvider}`,
                )
            } catch (error) {
                Logger.error(
                    `Failed to start ${this.meetingProvider} HTML cleaner:`,
                    { error },
                )
                throw error
            }
        }
    }

    public async stop(): Promise<void> {
        Logger.withFunctionName('stop')
        if (!this.isRunning || !this.cleaner) {
            return
        }


        try {
            await this.cleaner.stop()
            this.isRunning = false
            Logger.info(`[HtmlCleaner] Stopped for ${this.meetingProvider}`)
        } catch (error) {
            Logger.warn(
                `Failed to stop ${this.meetingProvider} HTML cleaner:`,
                { error },
            )
        }
    }

    public isCurrentlyRunning(): boolean {
        return this.isRunning
    }
}
