import { MeetingEndReason, MeetingStateType, ParticipantState } from './types'

import { MeetProvider } from '../meeting/meet'
import { TeamsProvider } from '../meeting/teams'
import { SimpleDialogObserver } from '../services/dialog-observer/simple-dialog-observer'
import { GLOBAL } from '../singleton'
import { MeetingProviderInterface } from '../types'
import { getStateInstance } from './states'
import { MeetingContext } from './types'
import { NORMAL_END_REASONS } from './constants'
import Logger from '../utils/DatadogLogger'

export class MeetingStateMachine {
    static instance: MeetingStateMachine | null = null
    private currentState: MeetingStateType
    public context: MeetingContext
    private provider: MeetingProviderInterface

    static init() {
        Logger.withFunctionName('init')
        if (MeetingStateMachine.instance == null) {
            MeetingStateMachine.instance = new MeetingStateMachine()
            Logger.info(
                '*** INIT MeetingStateMachine.instance',
                { meeting_url: GLOBAL.get().meeting_url },
            )
        }
    }

    constructor() {
        this.currentState = MeetingStateType.Initialization
        this.provider =
            GLOBAL.get().meetingProvider === 'Teams'
                ? new TeamsProvider()
                : new MeetProvider()

        this.context = {
            provider: this.provider,
            error: null,
        } as MeetingContext

        this.context.dialogObserver = new SimpleDialogObserver(this.context)
    }

    public async start(): Promise<void> {
        Logger.withFunctionName('start')
        try {
            while (this.currentState !== MeetingStateType.Terminated) {
                Logger.info(`Current state: ${this.currentState}`)

                // Execute current state and transition to next
                const state = getStateInstance(this.currentState, this.context)
                const transition = await state.execute()

                this.currentState = transition.nextState
                this.context = transition.context
            }

            // State machine completed
        } catch (error) {
            await this.handleError(error as Error)
        }
    }

    public async requestStop(reason: MeetingEndReason): Promise<void> {
        Logger.withFunctionName('requestStop')
        Logger.info(`Stop requested with reason: ${reason}`)
        GLOBAL.setEndReason(reason)
    }

    public getCurrentState(): MeetingStateType {
        return this.currentState
    }

    public getError(): Error | null {
        return GLOBAL.hasError()
            ? new Error(GLOBAL.getErrorMessage() || 'Unknown error')
            : null
    }

    public getStartTime(): number {
        return this.context.startTime ?? 0
    }

    private async handleError(error: Error): Promise<void> {
        // Set error in global singleton
        GLOBAL.setError(MeetingEndReason.Internal, error.message)

        // Transition to error state - the main loop will handle the rest
        this.currentState = MeetingStateType.Error
    }

    public async pauseRecording(): Promise<void> {
        Logger.withFunctionName('pauseRecording')
        if (this.currentState !== MeetingStateType.Recording) {
            throw new Error('Cannot pause: meeting is not in recording state')
        }

        Logger.info('Pause requested')
        this.context.isPaused = true
        this.currentState = MeetingStateType.Paused
    }

    public async resumeRecording(): Promise<void> {
        Logger.withFunctionName('resumeRecording')
        if (this.currentState !== MeetingStateType.Paused) {
            throw new Error('Cannot resume: meeting is not paused')
        }

        Logger.info('Resume requested')
        this.context.isPaused = false
        this.currentState = MeetingStateType.Resuming
    }

    public isPaused(): boolean {
        return this.currentState === MeetingStateType.Paused
    }

    public getPauseDuration(): number {
        return this.context.totalPauseDuration || 0
    }

    public updateParticipantState(state: ParticipantState): void {
        if (this.currentState === MeetingStateType.Recording) {
            this.context.attendeesCount = state.attendeesCount
            if (state.firstUserJoined) {
                this.context.firstUserJoined = true
            }
            this.context.lastSpeakerTime = state.lastSpeakerTime
            this.context.noSpeakerDetectedTime = state.noSpeakerDetectedTime
        }
    }

    public getContext(): MeetingContext {
        return this.context
    }

    // Methods from MeetingHandle
    public async startRecordMeeting(): Promise<void> {
        try {
            await this.start()

            // Check if an error occurred during execution
            if (
                this.getError() ||
                this.currentState === MeetingStateType.Error
            ) {
                throw (
                    this.getError() || new Error('Recording failed to complete')
                )
            }
        } catch (error) {
            Logger.error(
                'Error in startRecordMeeting:',
                { error: error instanceof Error ? error.message : error },
            )
            throw error
        }
    }

    public async stopMeeting(reason: MeetingEndReason): Promise<void> {
        Logger.withFunctionName('stopMeeting')
        Logger.info(`Stop meeting requested with reason: ${reason}`)
        GLOBAL.setEndReason(reason)
    }

    public wasRecordingSuccessful(): boolean {
        const endReason = GLOBAL.getEndReason()
        if (!endReason || GLOBAL.hasError()) {
            return false
        }

        return NORMAL_END_REASONS.includes(endReason)
    }

    public getEndReason(): MeetingEndReason | undefined {
        return GLOBAL.getEndReason() || undefined
    }
}
