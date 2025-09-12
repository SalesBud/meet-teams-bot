import { Events } from '../../events'
import { GLOBAL } from '../../singleton'
import { HtmlSnapshotService } from '../../services/html-snapshot-service'

import {
    MeetingEndReason,
    MeetingStateType,
    StateExecuteResult,
} from '../types'
import { BaseState } from './base-state'
import Logger from '../../utils/DatadogLogger'

export class ErrorState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Log the error
            await this.logError()

            // Notify error events
            await this.notifyError()

            // Update metrics
            this.updateMetrics()

            // Move to cleanup
            return this.transition(MeetingStateType.Cleanup)
        } catch (error) {
            Logger.withFunctionName('execute')
            Logger.error('Error in ErrorState:', { error })
            // Even if error handling fails, transition to cleanup
            return this.transition(MeetingStateType.Cleanup)
        }
    }

    private async logError(): Promise<void> {
        Logger.withFunctionName('logError')
        const errorMessage = GLOBAL.getErrorMessage()
        const endReason = GLOBAL.getEndReason()

        // Capture DOM state on error if page is available (void to avoid blocking)
        if (this.context.playwrightPage) {
            const htmlSnapshot = HtmlSnapshotService.getInstance()
            void htmlSnapshot.captureSnapshot(
                this.context.playwrightPage,
                'error_state_dom_capture',
            )
        }

        if (!endReason) {
            Logger.warn('Unknown error occurred')
            return
        }

        // Create a detailed error object
        const errorDetails = {
            message: errorMessage || 'Unknown error',
            reason: endReason,
            state: this.stateType,
            meetingUrl: GLOBAL.get().meeting_url,
            botName: GLOBAL.get().bot_name,
            sessionId: GLOBAL.get().session_id,
            timestamp: Date.now(),
        }

        // Log the error with all details
        Logger.error('Meeting error occurred:', errorDetails)
    }

    private async notifyError(): Promise<void> {
        Logger.withFunctionName('notifyError')
        const notifyPromise = async (): Promise<void> => {
            const endReason = GLOBAL.getEndReason()
            const errorMessage = GLOBAL.getErrorMessage()

            if (!endReason) {
                Logger.warn('No error reason found in global singleton')
                return
            }

            // Full log for debugging
            Logger.warn('Error in notifyError:', {
                reason: endReason,
                message: errorMessage,
            })

            try {
                switch (endReason) {
                    case MeetingEndReason.BotNotAccepted:
                        await Events.botRejected()
                        break
                    case MeetingEndReason.BotRemoved:
                        await Events.botRemoved()
                        break
                    case MeetingEndReason.BotRemovedTooEarly:
                        await Events.botRemovedTooEarly()
                        break
                    case MeetingEndReason.TimeoutWaitingToStart:
                        await Events.waitingRoomTimeout()
                        break
                    case MeetingEndReason.InvalidMeetingUrl:
                        await Events.invalidMeetingUrl()
                        break
                    case MeetingEndReason.ApiRequest:
                        Logger.warn('Notifying API request stop')
                        await Events.apiRequestStop()
                        break
                    default:
                        Logger.warn(`Unhandled error reason: ${endReason}`)
                        await Events.meetingError(
                            new Error(errorMessage || 'Unknown error'),
                        )
                }
            } catch (eventError) {
                Logger.error('Failed to send event notification:', { error: eventError })
            }
        }

        // Increase timeout for error notification
        const timeoutPromise = new Promise<void>(
            (_, reject) =>
                setTimeout(
                    () => reject(new Error('Notify error timeout')),
                    15000,
                ), // 15 seconds instead of 5
        )

        try {
            await Promise.race([notifyPromise(), timeoutPromise])
        } catch (error) {
            Logger.error('Error notification timed out:', { error })
            // Continue even if notification fails
        }
    }

    private updateMetrics(): void {
        Logger.withFunctionName('updateMetrics')
        const endReason = GLOBAL.getEndReason()
        const errorMessage = GLOBAL.getErrorMessage()

        const metrics = {
            errorType: 'MeetingError',
            errorReason: endReason || 'Internal',
            errorMessage: errorMessage || 'Unknown error',
            timestamp: Date.now(),
            meetingDuration: this.context.startTime
                ? Date.now() - this.context.startTime
                : 0,
            state: this.stateType,
            // Other relevant context metrics
            attendeesCount: this.context.attendeesCount,
            firstUserJoined: this.context.firstUserJoined,
            sessionId: GLOBAL.get().session_id,
        }

        // Log metrics
        Logger.info('Error metrics:', metrics)
    }
}
