import axios from 'axios'
import { GLOBAL } from './singleton'
import { TranscriptionFinishedData } from './types/Transcript'
import Logger from './utils/DatadogLogger'

export class Events {
    private static EVENTS: Events | null = null
    private sentEvents: Set<string> = new Set()

    static init() {
        if (GLOBAL.get().bot_uuid == null) return
        if (GLOBAL.get().bots_webhook_url == null) return

        Events.EVENTS = new Events(
            GLOBAL.get().bot_uuid,
            GLOBAL.get().bots_api_key,
            GLOBAL.get().bots_webhook_url,
        )
    }

    static async apiRequestStop() {
        return Events.EVENTS?.sendOnce('api_request_stop')
    }

    static async joiningCall() {
        return Events.EVENTS?.sendOnce('joining_call')
    }

    static async inWaitingRoom() {
        return Events.EVENTS?.sendOnce('in_waiting_room')
    }

    static async inCallNotRecording() {
        return Events.EVENTS?.sendOnce('in_call_not_recording')
    }

    static async inCallRecording(data: { start_time: number }) {
        return Events.EVENTS?.sendOnce('in_call_recording', data)
    }

    static async recordingPaused() {
        // Send webhook in parallel - don't wait for completion
        Events.EVENTS?.send('recording_paused')
    }

    static async recordingResumed() {
        // Send webhook in parallel - don't wait for completion
        Events.EVENTS?.send('recording_resumed')
    }

    static async callEnded() {
        return Events.EVENTS?.sendOnce('call_ended')
    }

    // Nouveaux événements pour les erreurs
    static async botRejected() {
        return Events.EVENTS?.sendOnce('bot_rejected')
    }

    static async botRemoved() {
        return Events.EVENTS?.sendOnce('bot_removed')
    }

    static async botRemovedTooEarly() {
        return Events.EVENTS?.sendOnce('bot_removed_too_early')
    }

    static async waitingRoomTimeout() {
        return Events.EVENTS?.sendOnce('waiting_room_timeout')
    }

    static async invalidMeetingUrl() {
        return Events.EVENTS?.sendOnce('invalid_meeting_url')
    }

    static async meetingError(error: Error) {
        return Events.EVENTS?.sendOnce('meeting_error', {
            error_message: error.message,
            error_type: error.constructor.name,
        })
    }

    // Final webhook events (replacing sendWebhookOnce)
    static async recordingSucceeded() {
        return Events.EVENTS?.sendOnce('recording_succeeded')
    }

    static async transcriptionFinished(data: TranscriptionFinishedData) {
        const { event } = data
        return Events.EVENTS?.send(event, data, event)
    }

    static async recordingFailed(errorMessage: string) {
        Logger.withFunctionName('recordingFailed')
        Logger.info(`Events.recordingFailed called with: ${errorMessage}`)
        return Events.EVENTS?.sendOnce('recording_failed', {
            error_message: errorMessage,
        })
    }

    static async failed() {
        Logger.withFunctionName('failed')
        Logger.warn('Events.failed called')
        return Events.EVENTS?.send('failed', {
            bot_id: Events.EVENTS?.botId,
            error: 'BotNotAccepted',
            message: 'BotNotAccepted'
        }, 'failed')
    }


    private constructor(
        private botId: string,
        private apiKey: string,
        private webhookUrl: string,
    ) { }

    /**
     * Send an event only once - prevents duplicate webhooks
     * Used for all events to ensure each event is sent exactly once
     */
    private async sendOnce(
        code: string,
        additionalData: Record<string, any> = {},
        event: string = 'bot.status_change',
    ): Promise<void> {
        Logger.withFunctionName('[Events] sendOnce')
        if (this.sentEvents.has(code)) {
            Logger.warn(`Event ${code} already sent, skipping...`)
            return
        }

        this.sentEvents.add(code)
        // Send webhook in parallel - don't wait for completion
        this.send(code, additionalData, event)
    }

    private async send(
        code: string,
        additionalData: Record<string, any> = {},
        event: string = 'bot.status_change',
    ): Promise<void> {
        Logger.withFunctionName('[Events] send')
        try {
            await axios({
                method: 'POST',
                url: this.webhookUrl,
                headers: {
                    'User-Agent': 'meetingbaas/1.0',
                    'x-meeting-baas-api-key': this.apiKey,
                },
                data: {
                    event,
                    data: {
                        bot_id: this.botId,
                        status: {
                            code,
                            created_at: new Date().toISOString(),
                        },
                        ...additionalData,
                    },
                },
            })
            Logger.info(
                'Event sent successfully:',
                { code, botId: this.botId, webhookUrl: this.webhookUrl, event },
            )
        } catch (error) {
            if (error instanceof Error) {
                Logger.warn(
                    'Unable to send event (continuing execution):',
                    { code, botId: this.botId, webhookUrl: this.webhookUrl, error: error.message },
                )
            }
        }
    }
}
