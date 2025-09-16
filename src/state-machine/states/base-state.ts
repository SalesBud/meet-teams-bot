import { Page } from '@playwright/test'
import { listenPage } from '../../browser/page-logger'
import { BOT_WARNING_CODES, MeetingContext, MeetingStateType, StateExecuteResult } from '../types'
import Logger from '../../utils/DatadogLogger'
import { GLOBAL } from '../../singleton'

export abstract class BaseState {
    protected context: MeetingContext
    protected stateType: MeetingStateType

    constructor(context: MeetingContext, stateType: MeetingStateType) {
        this.context = context
        this.stateType = stateType

        this.setupPageLoggers()
    }

    private setupPageLoggers(): void {
        if (this.context.playwrightPage) {
            listenPage(this.context.playwrightPage)
        }
    }

    protected async setupNewPage(page: Page, pageName: string): Promise<void> {
        listenPage(page)
    }

    abstract execute(): StateExecuteResult

    protected transition(nextState: MeetingStateType): StateExecuteResult {
        return Promise.resolve({
            nextState,
            context: this.context,
        })
    }

    protected async handleError(error: Error): StateExecuteResult {
        Logger.withFunctionName('handleError')
        if (BOT_WARNING_CODES.includes(GLOBAL.getEndReason())) {
            Logger.warn(`Error in state ${this.stateType}:`, { error })
        } else {
            Logger.error(`Error in state ${this.stateType}:`, { error })
        }
        return this.transition(MeetingStateType.Error)
    }
}
