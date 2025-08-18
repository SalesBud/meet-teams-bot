import { Events } from '../../events'
import { ScreenRecorderManager } from '../../recording/ScreenRecorder'
import { HtmlSnapshotService } from '../../services/html-snapshot-service'
import { GLOBAL } from '../../singleton'
import { Streaming } from '../../streaming'
import Logger from '../../utils/DatadogLogger'

import {
    MeetingEndReason,
    MeetingStateType,
    StateExecuteResult,
} from '../types'
import { BaseState } from './base-state'

export class WaitingRoomState extends BaseState {
    async execute(): StateExecuteResult {
        Logger.withFunctionName('execute')
        try {
            Logger.info('Entering waiting room state')

            // Get meeting information
            const { meetingId, password } = await this.getMeetingInfo()
            Logger.info('Meeting info retrieved', {
                meetingId,
                hasPassword: !!password,
            })

            // Generate the meeting link
            const meetingLink = this.context.provider.getMeetingLink(
                meetingId,
                password,
                0,
                GLOBAL.get().bot_name,
                GLOBAL.get().enter_message,
            )

            // Start the dialog observer before opening the page
            this.startDialogObserver()

            // Open the meeting page
            await this.openMeetingPage(meetingLink)

            // Capture DOM state after meeting page is opened (void to avoid blocking)
            if (this.context.playwrightPage) {
                const htmlSnapshot = HtmlSnapshotService.getInstance()
                void htmlSnapshot.captureSnapshot(
                    this.context.playwrightPage,
                    'waiting_room_page_opened',
                )
            }

            this.context.streamingService = new Streaming(
                GLOBAL.get().streaming_input,
                GLOBAL.get().streaming_output,
                GLOBAL.get().streaming_audio_frequency,
                GLOBAL.get().bot_uuid,
            )

            ScreenRecorderManager.getInstance().startRecording(
                this.context.playwrightPage,
            )

            // Send waiting room event after the page is open
            Events.inWaitingRoom()

            // Wait for acceptance into the meeting
            await this.waitForAcceptance()
            Logger.info('Successfully joined meeting')

            // If everything is fine, move to the InCall state
            return this.transition(MeetingStateType.InCall)
        } catch (error) {
            Logger.error('Error in waiting room state:', { error })

            // Handle specific error types based on MeetingEndReason
            const endReason = GLOBAL.getEndReason()
            if (endReason) {
                switch (endReason) {
                    case MeetingEndReason.BotNotAccepted:
                        Events.botRejected()
                        return this.handleError(error as Error)
                    case MeetingEndReason.TimeoutWaitingToStart:
                        Events.waitingRoomTimeout()
                        return this.handleError(error as Error)
                    case MeetingEndReason.ApiRequest:
                        Events.apiRequestStop()
                        return this.handleError(error as Error)
                }
            }

            return this.handleError(error as Error)
        }
    }

    private async getMeetingInfo() {
        Logger.withFunctionName('getMeetingInfo')
        if (!this.context.browserContext) {
            throw new Error('Browser context not initialized')
        }

        try {
            return await this.context.provider.parseMeetingUrl(
                process.env.MEETING_URL,
            )
        } catch (error) {
            Logger.error('Failed to parse meeting URL:', { error })
            GLOBAL.setError(MeetingEndReason.InvalidMeetingUrl)
            throw new Error('Failed to parse meeting URL')
        }
    }

    private async openMeetingPage(meetingLink: string) {
        Logger.withFunctionName('openMeetingPage')
        if (!this.context.browserContext) {
            throw new Error('Browser context not initialized')
        }

        try {
            this.context.playwrightPage =
                await this.context.provider.openMeetingPage(
                    this.context.browserContext,
                    meetingLink,
                    GLOBAL.get().streaming_input,
                )
        } catch (error) {
            Logger.error('Failed to open meeting page:', {
                error,
                message:
                    error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            })

            throw new Error(
                error instanceof Error
                    ? error.message
                    : 'Failed to open meeting page',
            )
        }
    }

    private async waitForAcceptance(): Promise<void> {
        Logger.withFunctionName('waitForAcceptance')
        if (!this.context.playwrightPage) {
            throw new Error('Meeting page not initialized')
        }

        const timeoutMs =
            GLOBAL.get().automatic_leave.waiting_room_timeout * 1000
        Logger.info(`Setting waiting room timeout to ${timeoutMs}ms`)

        let joinSuccessful = false // Flag indicating we joined the meeting

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!joinSuccessful) {
                    // Trigger the timeout only if we are not in the meeting
                    GLOBAL.setError(MeetingEndReason.TimeoutWaitingToStart)
                    const timeoutError = new Error(
                        'Waiting room timeout reached',
                    )
                    Logger.error('Waiting room timeout reached', { error: timeoutError })
                    reject(timeoutError)
                }
            }, timeoutMs)

            const checkStopSignal = setInterval(() => {
                if (
                    GLOBAL.getEndReason() === MeetingEndReason.ApiRequest ||
                    GLOBAL.getEndReason() === MeetingEndReason.LoginRequired
                ) {
                    clearInterval(checkStopSignal)
                    clearTimeout(timeout)
                    reject()
                }
            }, 1000)

            this.context.provider
                .joinMeeting(
                    this.context.playwrightPage,
                    () => GLOBAL.getEndReason() === MeetingEndReason.ApiRequest,
                    // Add a callback to notify that the join succeeded
                    () => {
                        joinSuccessful = true
                        Logger.info('Join successful notification received')
                        if (GLOBAL.get().custom_branding_bot_path) {
                            Logger.info('Custom branding is active via browser fake video capture')
                        }
                    },
                )
                .then(() => {
                    clearInterval(checkStopSignal)
                    clearTimeout(timeout)
                    resolve()
                })
                .catch((error) => {
                    clearInterval(checkStopSignal)
                    clearTimeout(timeout)
                    reject(error)
                })
        })
    }

    private startDialogObserver() {
        Logger.withFunctionName('startDialogObserver')
        // Use the global observer instead of creating a local one
        // Stopping the dialog observer is done in the cleanup state
        if (this.context.dialogObserver) {
            this.context.dialogObserver.setupGlobalDialogObserver()
        } else {
            Logger.warn(
                `Global dialog observer not available in state ${this.constructor.name}`,
            )
        }
    }
}
