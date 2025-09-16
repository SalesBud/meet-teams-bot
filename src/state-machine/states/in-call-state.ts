import { Events } from '../../events'
import { HtmlCleaner } from '../../meeting/htmlCleaner'
import { SpeakersObserver } from '../../meeting/speakersObserver'
import { GLOBAL } from '../../singleton'
import { SpeakerManager } from '../../speaker-manager'
import { MEETING_CONSTANTS } from '../constants'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'
import Logger from '../../utils/DatadogLogger'

export class InCallState extends BaseState {
    async execute(): StateExecuteResult {
        Logger.withFunctionName('execute')
        try {
            // Start with global timeout for setup
            await Promise.race([this.setupRecording(), this.createTimeout()])
            return this.transition(MeetingStateType.Recording)
        } catch (error) {
            Logger.error('Setup recording failed:', { error })
            return this.handleError(error as Error)
        }
    }

    private createTimeout(): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(
                    new Error(
                        'Setup timeout: Recording sequence took too long',
                    ),
                )
            }, MEETING_CONSTANTS.SETUP_TIMEOUT)
        })
    }

    private async setupRecording(): Promise<void> {
        Logger.withFunctionName('setupRecording')
        try {

            // Notifier qu'on est en appel mais pas encore en enregistrement
            Events.inCallNotRecording()

            // Initialize services
            await this.initializeServices()

            // Clean HTML and start observation
            await this.setupBrowserComponents()
        } catch (error) {
            Logger.error('Failed during recording setup:', { error })
            throw error
        }
    }

    private async initializeServices(): Promise<void> {
        if (!this.context.pathManager) {
            throw new Error('PathManager not initialized')
        }
    }

    private async setupBrowserComponents(): Promise<void> {
        Logger.withFunctionName('setupBrowserComponents')
        if (!this.context.playwrightPage) {
            throw new Error('Playwright page not initialized')
        }

        try {

            // Start HTML cleanup first to clean the interface
            await this.startHtmlCleaning()
        } catch (error) {
            Logger.error('Error in setupBrowserComponents:', { error })
            Logger.error('Context state:', {
                hasPlaywrightPage: !!this.context.playwrightPage,
                recordingMode: GLOBAL.get().recording_mode,
                meetingProvider: GLOBAL.get().meetingProvider,
                botName: GLOBAL.get().bot_name,
            })
            throw new Error(`Browser component setup failed: ${error as Error}`)
        }

        // Start speakers observation in all cases
        // Speakers observation is independent of video recording
        try {
            await this.startSpeakersObservation()
        } catch (error) {
            Logger.error('Failed to start speakers observation:', { error })
            // Continue even if speakers observation fails
        }

        // Notify that recording has started
        Events.inCallRecording({ start_time: this.context.startTime })
    }

    private async startSpeakersObservation(): Promise<void> {
        Logger.withFunctionName('startSpeakersObservation')
        Logger.debug(
            `Starting speakers observation for ${GLOBAL.get().meetingProvider}`,
        )

        // Start SpeakerManager
        SpeakerManager.start()

        if (!this.context.playwrightPage) {
            Logger.error(
                'Playwright page not available for speakers observation',
            )
            return
        }

        // Create and start integrated speakers observer
        const speakersObserver = new SpeakersObserver(
            GLOBAL.get().meetingProvider,
        )

        // Callback to handle speakers changes
        const onSpeakersChange = async (speakers: any[]) => {
            try {
                await SpeakerManager.getInstance().handleSpeakerUpdate(speakers)
            } catch (error) {
                Logger.error('Error handling speaker update:', { error })
            }
        }

        try {
            await speakersObserver.startObserving(
                this.context.playwrightPage,
                GLOBAL.get().recording_mode,
                GLOBAL.get().bot_name,
                onSpeakersChange,
                this.context.startTime,
            )

            // Store the observer in context for cleanup later
            this.context.speakersObserver = speakersObserver
        } catch (error) {
            Logger.error(
                'Failed to start integrated speakers observer:',
                { error },
            )
            throw error
        }
    }

    private async startHtmlCleaning(): Promise<void> {
        Logger.withFunctionName('startHtmlCleaning')
        if (!this.context.playwrightPage) {
            Logger.error('Playwright page not available for HTML cleanup')
            return
        }

        Logger.info(`Starting HTML cleanup for ${GLOBAL.get().meetingProvider}`)

        try {
            // EXACT SAME LOGIC AS EXTENSION: Use centralized HtmlCleaner
            const htmlCleaner = new HtmlCleaner(
                this.context.playwrightPage,
                GLOBAL.get().meetingProvider,
                GLOBAL.get().recording_mode,
            )

            await htmlCleaner.start()

            // Store for cleanup later
            this.context.htmlCleaner = htmlCleaner
        } catch (error) {
            Logger.error('Failed to start HTML cleanup:', { error })
            // Continue even if HTML cleanup fails - it's not critical
        }
    }
}
