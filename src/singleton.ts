import { NORMAL_END_REASONS } from './state-machine/constants'
import {
    getErrorMessageFromCode,
    MeetingEndReason,
} from './state-machine/types'
import { MeetingParams } from './types'

class Global {
    private meetingParams: MeetingParams | null = null
    private endReason: MeetingEndReason | null = null
    private errorMessage: string | null = null
    public constructor() { }

    public set(meetingParams: MeetingParams) {
        if (this.meetingParams !== null) {
            throw new Error('Meeting params are already set')
        }

        // Validate critical parameters before setting them
        const meetingUrl = process.env.MEETING_URL
        if (
            !meetingUrl ||
            meetingUrl.trim() === ''
        ) {
            throw new Error('Missing required environment variable: MEETING_URL')
        }
        const botUuid = process.env.BOT_ID
        if (!botUuid || botUuid.trim() === '') {
            throw new Error('Missing required environment variable: BOT_ID')
        }

        this.meetingParams = meetingParams
        console.log(
            `BOT_ID: ${botUuid}`,
        )
    }

    public get(): MeetingParams {
        if (this.meetingParams === null) {
            throw new Error('Meeting params are not set')
        }
        return this.meetingParams
    }

    public isServerless(): boolean {
        if (this.meetingParams === null) {
            throw new Error('Meeting params are not set')
        }
        return this.meetingParams.remote === null
    }

    public setError(reason: MeetingEndReason, message?: string): void {
        console.log(`🔴 Setting global error: ${reason}`)
        this.endReason = reason
        this.errorMessage = message || getErrorMessageFromCode(reason)
        console.log(`🔴 End reason set to: ${this.endReason}`)
    }

    public setEndReason(reason: MeetingEndReason): void {
        console.log(`🔵 Setting global end reason: ${reason}`)
        this.endReason = reason

        if (NORMAL_END_REASONS.includes(reason)) {
            console.log(`🔵 Clearing error state for normal termination: ${reason}`)
            // This ensures that an error message isn't propagated to the client for normal termination
            this.clearError()
        }
    }

    public getEndReason(): MeetingEndReason | null {
        return this.endReason
    }

    public getErrorMessage(): string | null {
        return this.errorMessage
    }

    public hasError(): boolean {
        // Only return true if we have an error message (indicating an actual error)
        // Having an end reason alone doesn't mean there's an error
        return this.errorMessage !== null
    }

    public clearError(): void {
        // Only clear the error message, keep the end reason
        // This allows normal termination reasons to be preserved
        this.errorMessage = null
    }
}

export let GLOBAL = new Global()
