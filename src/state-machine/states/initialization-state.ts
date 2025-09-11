import { generateBranding, playBranding } from '../../branding'
import { openBrowser } from '../../browser/browser'
import { GLOBAL } from '../../singleton'

import { PathManager } from '../../utils/PathManager'
import {
    MeetingEndReason,
    MeetingStateType,
    StateExecuteResult,
} from '../types'
import { BaseState } from './base-state'

export class InitializationState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Validate parameters
            if (!process.env.MEETING_URL) {
                GLOBAL.setError(MeetingEndReason.InvalidMeetingUrl)
                throw new Error('Invalid meeting URL')
            }

            // Setup path manager first (important for logs)
            await this.setupPathManager()

            // Setup branding generation if needed - MUST complete before browser setup
            let brandingVideoPath: string | undefined
            if (GLOBAL.get().custom_branding_bot_path) {
                try {
                    brandingVideoPath = await this.setupBrandingGeneration()
                    console.log('Branding video ready for browser integration')
                } catch (error) {
                    console.warn(
                        'Branding generation failed, continuing without custom branding:',
                        error,
                    )
                }
            }

            // Setup browser - critical (with branding video path if available)
            try {
                await this.setupBrowser(brandingVideoPath)
            } catch (error) {
                console.error('Critical error: Browser setup failed:', error)
                // Add details to the error for easier diagnosis
                const enhancedError = new Error(
                    `Browser initialization failed: ${error instanceof Error ? error.message : String(error)}`,
                )
                enhancedError.stack =
                    error instanceof Error ? error.stack : undefined
                throw enhancedError
            }
            // All initialization successful
            return this.transition(MeetingStateType.WaitingRoom)
        } catch (error) {
            return this.handleError(error as Error)
        }
    }

    private async setupBrandingGeneration(): Promise<string> {
        this.context.brandingProcess = generateBranding(
            GLOBAL.get().bot_name,
            GLOBAL.get().custom_branding_bot_path,
        )
        await this.context.brandingProcess.wait
        console.log('Branding video generated successfully')

        // Return the path to the generated branding video for Chrome fake video capture
        return 'branding.y4m'
    }

    private async setupBrowser(brandingVideoPath?: string): Promise<void> {
        const maxRetries = 3
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.info(`Browser setup attempt ${attempt}/${maxRetries}`)

                // Définir le type de retour attendu de openBrowser
                type BrowserResult = {
                    browser: any
                }

                // Augmenter le timeout pour les environnements plus lents
                const timeoutMs = 60000 // 60 secondes au lieu de 30

                // Create a promise that rejects after a delay
                const timeoutPromise = new Promise<BrowserResult>(
                    (_, reject) => {
                        const id = setTimeout(() => {
                            clearTimeout(id)
                            reject(
                                new Error(
                                    `Browser setup timeout (${timeoutMs}ms)`,
                                ),
                            )
                        }, timeoutMs)
                    },
                )

                // Execute the promise to open the browser with a timeout
                const result = await Promise.race<BrowserResult>([
                    openBrowser(false, brandingVideoPath),
                    timeoutPromise,
                ])

                // If we get here, openBrowser has succeeded
                this.context.browserContext = result.browser

                console.info('Browser setup completed successfully')
                return // Exit the function if successful
            } catch (error) {
                lastError = error as Error
                console.error(`Browser setup attempt ${attempt} failed:`, error)

                // Si ce n'est pas la dernière tentative, attendre avant de réessayer
                if (attempt < maxRetries) {
                    const waitTime = attempt * 5000 // Attente progressive: 5s, 10s, 15s...
                    console.info(`Waiting ${waitTime}ms before retry...`)
                    await new Promise((resolve) =>
                        setTimeout(resolve, waitTime),
                    )
                }
            }
        }

        // Si on arrive ici, c'est que toutes les tentatives ont échoué
        console.error('All browser setup attempts failed')
        throw (
            lastError ||
            new Error('Browser setup failed after multiple attempts')
        )
    }

    private async setupPathManager(): Promise<void> {
        try {
            if (!this.context.pathManager) {
                this.context.pathManager = PathManager.getInstance()
            }
        } catch (error) {
            console.error('Path manager setup failed:', error)
            // Create base directories if possible
            try {
                const fs = require('fs')
                const path = require('path')
                const baseDir = path.join(
                    process.cwd(),
                    'logs',
                    GLOBAL.get().bot_uuid,
                )
                fs.mkdirSync(baseDir, { recursive: true })
                console.info('Created fallback log directory:', baseDir)
            } catch (fsError) {
                console.error(
                    'Failed to create fallback log directory:',
                    fsError,
                )
            }
            throw error
        }
    }
}
