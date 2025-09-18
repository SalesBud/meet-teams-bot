import { Api } from './api/methods'
import { Events } from './events'
import { server } from './server'
import { GLOBAL } from './singleton'
import { MeetingStateMachine } from './state-machine/machine'
import { detectMeetingProvider } from './utils/detectMeetingProvider'
import {
    setupConsoleLogger,
    setupExitHandler,
    uploadLogsToS3,
} from './utils/Logger'
import Logger from './utils/DatadogLogger'
import { PathManager } from './utils/PathManager'

import { BOT_NOT_ACCEPTED_ERROR_CODES, getErrorMessageFromCode } from './state-machine/types'
import { MeetingParams } from './types'

import { exit } from 'process'
import TranscriptionProcess from './transcription/CreateTranscription'
import { TranscriptionFinishedData } from './types/Transcript'

// ========================================
// CONFIGURATION
// ========================================

// Setup console logger first to ensure proper formatting
setupConsoleLogger()

// Setup crash handlers to upload logs in case of unexpected exit
setupExitHandler()

// Configuration to enable/disable DEBUG logs
export const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true'
if (DEBUG_LOGS) {
    import('./browser/page-logger')
        .then(({ enablePrintPageLogs }) => enablePrintPageLogs())
        .catch((e) => Logger.error('Failed to enable page logs dynamically:', { error: e }))
    Logger.debug('DEBUG mode activated - speakers debug logs will be shown')
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Initialize meeting parameters from environment variables
 */
async function initializeMeetingParams(): Promise<void> {
    try {
        const params = {} as MeetingParams

        params.meetingProvider = detectMeetingProvider(
            process.env.MEETING_URL,
        )

        GLOBAL.set(params)
        PathManager.getInstance().initializePaths()
    } catch (error) {
        Logger.error('Failed to initialize meeting parameters:', { error })
        Logger.error('Make sure MEETING_URL and BOT_ID environment variables are set')
        process.exit(1)
    }
}

/**
 * Handle successful recording completion
 */
async function handleSuccessfulRecording(): Promise<void> {
    Logger.debug(
        `Recording ended normally with reason: ${MeetingStateMachine.instance.getEndReason()}`,
    )

    if (!GLOBAL.isServerless()) {
        await Api.instance.handleEndMeetingWithRetry()
    }

    // Send success webhook
    await Events.recordingSucceeded()
}

/**
 * Handle failed recording
 */
async function handleFailedRecording(): Promise<void> {
    const endReason = GLOBAL.getEndReason()
    Logger.info(`Recording failed with reason: ${endReason || 'Unknown'}`)

    // Send failure webhook to user before sending to backend
    const errorMessage =
        (GLOBAL.hasError() && GLOBAL.getErrorMessage()) ||
        (endReason
            ? getErrorMessageFromCode(endReason)
            : 'Recording did not complete successfully')
    await Events.recordingFailed(errorMessage)

    if (!process.env.API_SERVER_BASEURL) {
        return
    }

    if (!GLOBAL.isServerless() && Api.instance) {
        await Api.instance.notifyRecordingFailure()
    }

    // Send failure webhook to user
    await Events.recordingFailed(errorMessage)
}

// ========================================
// MAIN ENTRY POINT
// ========================================

/**
 * Main application entry point
 *
 * Syntax conventions:
 * - minus => Library
 * - CONST => Const
 * - camelCase => Fn
 * - PascalCase => Classes
 */
; (async () => {
    await initializeMeetingParams()

    try {
        // Start the server
        await server().catch((e) => {
            Logger.error(`Failed to start server: ${e}`)
            throw e
        })

        // Initialize components
        MeetingStateMachine.init()
        Events.init()
        Events.joiningCall()

        // Create API instance for non-serverless mode
        if (!GLOBAL.isServerless()) {
            new Api()
        }

        // Start the meeting recording
        await MeetingStateMachine.instance.startRecordMeeting()

        // Handle recording result
        if (MeetingStateMachine.instance.wasRecordingSuccessful()) {
            await handleSuccessfulRecording()
        } else {
            await handleFailedRecording()
        }
    } catch (error) {
        // Handle explicit errors from state machine
        Logger.warn(
            'Meeting failed:',
            { error: error instanceof Error ? error.message : error },
        )

        // Use global error if available, otherwise fallback to error message
        const errorMessage = GLOBAL.hasError()
            ? GLOBAL.getErrorMessage() || 'Unknown error'
            : error instanceof Error
                ? error.message
                : 'Recording failed to complete'

        // Notify backend of recording failure
        if (!GLOBAL.isServerless() && Api.instance) {
            await Api.instance.notifyRecordingFailure()
        }

        await Events.recordingFailed(errorMessage)
    } finally {
        if (!GLOBAL.isServerless()) {
            try {
                await uploadLogsToS3({})
            } catch (error) {
                Logger.error('Failed to upload logs to S3:', { error })
            }

            if (BOT_NOT_ACCEPTED_ERROR_CODES.includes(GLOBAL.getEndReason())) {
                Logger.warn('Skipping transcription for error code:', { errorCode: GLOBAL.getEndReason() })
                await Events.failed()
            } else {
                const transcriptionData = await new TranscriptionProcess().createTranscriptionData()
                await Events.transcriptionFinished(transcriptionData as TranscriptionFinishedData)
            }
        }
        Logger.info('Exiting instance')
        exit(0)
    }
})()
