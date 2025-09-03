import { SoundContext, VideoContext } from '../../media_context'
import { ScreenRecorderManager } from '../../recording/ScreenRecorder'
import { HtmlSnapshotService } from '../../services/html-snapshot-service'

import { MEETING_CONSTANTS } from '../constants'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'
import Logger from '../../utils/DatadogLogger'

export class CleanupState extends BaseState {
    async execute(): StateExecuteResult {
        Logger.withFunctionName('execute')
        try {
            // Use Promise.race to implement the timeout
            const cleanupPromise = this.performCleanup()
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error('Cleanup timeout')),
                    MEETING_CONSTANTS.CLEANUP_TIMEOUT,
                )
            })

            try {
                await Promise.race([cleanupPromise, timeoutPromise])
            } catch (error) {
                Logger.error('Cleanup failed or timed out:', { error })
                // Continue to Terminated even if cleanup fails
            }
            return this.transition(MeetingStateType.Terminated) // État final
        } catch (error) {
            Logger.error('Error during cleanup:', { error })
            // Always transition to Terminated to avoid infinite loops
            Logger.info('Forcing transition to Terminated despite error')
            return this.transition(MeetingStateType.Terminated)
        }
    }

    private async performCleanup(): Promise<void> {
        Logger.withFunctionName('performCleanup')
        try {
            // 1. Stop the dialog observer
            try {
                this.stopDialogObserver()
            } catch (error) {
                Logger.warn(
                    'Dialog observer stop failed, continuing cleanup:',
                    { error },
                )
            }

            // 🎬 PRIORITY 2: Stop video recording immediately to avoid data loss
            await this.stopScreenRecorder()

            // 3. Capture final DOM state before cleanup
            if (this.context.playwrightPage) {
                const htmlSnapshot = HtmlSnapshotService.getInstance()
                await htmlSnapshot.captureSnapshot(
                    this.context.playwrightPage,
                    'cleanup_final_dom_state',
                )
            }

            // 🚀 PARALLEL CLEANUP: Independent steps that can run simultaneously
            await Promise.allSettled([
                // 4. Stop the streaming (fast, no await needed)
                (async () => {
                    if (this.context.streamingService) {
                        this.context.streamingService.stop()
                    }
                })(),

                // 5. Stop speakers observer (with 3s timeout)
                (async () => {
                    await this.stopSpeakersObserver()
                })(),

                // 6. Stop HTML cleaner (with 3s timeout)
                (async () => {
                    await this.stopHtmlCleaner()
                })(),

                // 7. Stop video fixing observer (with 3s timeout)
                (async () => {
                    console.info('🧹 Step 7/7: Stopping video fixing observer')
                    await this.stopVideoFixingObserver()
                })(),
            ])

            // 7. Clean up browser resources (must be sequential after others)
            await this.cleanupBrowserResources()

        } catch (error) {
            Logger.warn('Cleanup error:', { error })
            // Continue even if an error occurs
            // Don't re-throw - errors are already handled
            return
        }
    }

    private async stopSpeakersObserver(): Promise<void> {
        Logger.withFunctionName('stopSpeakersObserver')
        try {
            if (this.context.speakersObserver) {

                // Add 3-second timeout to prevent hanging
                await Promise.race([
                    (async () => {
                        this.context.speakersObserver.stopObserving()
                        this.context.speakersObserver = null
                    })(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () =>
                                reject(
                                    new Error('Speakers observer stop timeout'),
                                ),
                            3000,
                        ),
                    ),
                ])
            } else {
                Logger.info('Speakers observer not active, nothing to stop')
            }
        } catch (error) {
            if (error instanceof Error && error.message?.includes('timeout')) {
                Logger.warn(
                    'Speakers observer stop timed out after 3s, continuing cleanup',
                )
                // Force cleanup
                this.context.speakersObserver = null
            } else {
                Logger.error('Error stopping speakers observer:', { error })
            }
            // Don't throw as this is non-critical
        }
    }

    private async stopHtmlCleaner(): Promise<void> {
        Logger.withFunctionName('stopHtmlCleaner')
        try {
            if (this.context.htmlCleaner) {

                // Add 3-second timeout to prevent hanging
                await Promise.race([
                    this.context.htmlCleaner.stop(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () =>
                                reject(new Error('HTML cleaner stop timeout')),
                            3000,
                        ),
                    ),
                ])

                this.context.htmlCleaner = undefined
            } else {
                Logger.info('HTML cleaner not active, nothing to stop')
            }
        } catch (error) {
            if (error instanceof Error && error.message?.includes('timeout')) {
                Logger.warn(
                    'HTML cleaner stop timed out after 3s, continuing cleanup',
                )
                // Force cleanup
                this.context.htmlCleaner = undefined
            } else {
                Logger.error('Error stopping HTML cleaner:', { error })
            }
            // Don't throw as this is non-critical
        }
    }

    private async stopVideoFixingObserver(): Promise<void> {
        try {
            if (this.context.videoFixingObserver) {
                await Promise.race([
                    (async () => {
                        this.context.videoFixingObserver.stopObserving()
                        this.context.videoFixingObserver = undefined
                    })(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () =>
                                reject(
                                    new Error('Video fixing observer stop timeout'),
                                ),
                            3000,
                        ),
                    ),
                ])
            }
        } catch (error) {
            if (error instanceof Error && error.message?.includes('timeout')) {
                this.context.videoFixingObserver = undefined
            }
        }
        
    }

    private async stopScreenRecorder(): Promise<void> {
        Logger.withFunctionName('stopScreenRecorder')
        try {
            if (ScreenRecorderManager.getInstance().isCurrentlyRecording()) {
                await ScreenRecorderManager.getInstance().stopRecording()
            } else {
                Logger.info('ScreenRecorder not recording, nothing to stop')
            }
        } catch (error) {
            Logger.error(
                'Error stopping ScreenRecorder:',
                { error: error instanceof Error ? error.message : error },
            )

            // Don't re-throw - errors are already handled

            // Don't throw error if recording was already stopped
            if (
                error instanceof Error &&
                error.message &&
                error.message.includes('not recording')
            ) {
                Logger.info(
                    'ScreenRecorder was already stopped, continuing cleanup',
                )
            } else {
                throw error
            }
        }
    }
    private async cleanupBrowserResources(): Promise<void> {
        Logger.withFunctionName('cleanupBrowserResources')
        try {
            // 1. Stop branding
            if (this.context.brandingProcess) {
                this.context.brandingProcess.kill()
            }

            // 2. Stop media contexts
            VideoContext.instance?.stop()
            SoundContext.instance?.stop()

            // 3. Close pages and clean the browser
            await Promise.all([
                this.context.playwrightPage?.close().catch(() => {}),
                this.context.browserContext?.close().catch(() => {}),
            ])
        } catch (error) {
            Logger.error('Failed to cleanup browser resources:', { error })
        }
    }

    private stopDialogObserver() {
        Logger.withFunctionName('stopDialogObserver')
        if (this.context.dialogObserver) {
            this.context.dialogObserver.stopGlobalDialogObserver()
        } else {
            Logger.warn(
                `Global dialog observer not available in state ${this.constructor.name}`,
            )
        }
    }
}
