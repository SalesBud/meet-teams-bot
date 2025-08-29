/**
 * Run TranscriptionProcess.createTranscriptionData() locally
 *
 * This script runs only the transcription function without starting the full bot.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import TranscriptionProcess from './src/transcription/CreateTranscription';
import { GLOBAL } from './src/singleton';
import { TranscriptionFinishedData } from './src/types/Transcript';
import { MeetingParams, MeetingProvider } from './src/types';

// Load environment variables
dotenv.config();

// Ensure required environment variables are set
function checkRequiredEnvVars(): boolean {
    const requiredVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_REGION',
        'ASSEMBLYAI_API_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:');
        missingVars.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        console.log('\nPlease create a .env file with these variables or set them in your environment.');
        return false;
    }

    return true;
}

// Get bot ID from command line or use default
function getBotId(): string {
    const args = process.argv.slice(2);
    const botIdArg = args.find(arg => arg.startsWith('--bot-id='));

    if (botIdArg) {
        return botIdArg.split('=')[1];
    }

    return process.env.BOT_ID || 'test-local-bot-uuid';
}

// Get S3 bucket name from command line or use default
function getBucketName(): string {
    const args = process.argv.slice(2);
    const bucketArg = args.find(arg => arg.startsWith('--bucket='));

    if (bucketArg) {
        return bucketArg.split('=')[1];
    }

    return process.env.AWS_S3_VIDEO_BUCKET || 'default-bucket-name';
}

// Check if debug mode is enabled
function isDebugMode(): boolean {
    const args = process.argv.slice(2);
    return args.includes('--debug') || process.env.DEBUG === 'true';
}

// Initialize the global state with required MeetingParams fields
function initializeGlobalState(botId: string, bucketName: string): void {
    // Create a minimal MeetingParams object with required fields
    const params: MeetingParams = {
        id: botId,
        bot_uuid: botId,
        meeting_url: 'https://meet.google.com/dummy-url',
        meetingProvider: 'Meet' as MeetingProvider,
        user_token: '',
        bot_name: 'TranscriptionBot',
        user_id: 0,
        session_id: 'transcription-session',
        email: 'transcription@example.com',
        vocabulary: [],
        force_lang: false,
        bots_api_key: '',
        recording_mode: 'speaker_view',
        local_recording_server_location: 'local',
        automatic_leave: {
            waiting_room_timeout: 600,
            noone_joined_timeout: 600
        },
        mp4_s3_path: `${botId}/output.mp4`,
        environ: 'local',
        aws_s3_temporary_audio_bucket: bucketName,
        remote: {
            api_server_baseurl: 'http://localhost',
            aws_s3_video_bucket: bucketName,
            aws_s3_log_bucket: bucketName
        },
        secret: 'dummy-secret',
        use_my_vocabulary: false
    };

    // Set the global state
    GLOBAL.set(params);
    console.log(`🔧 Initialized global state with bot_uuid: ${botId}`);
    console.log(`🔧 Using S3 bucket: ${bucketName}`);
}

// Save transcription result to file
function saveTranscriptionResult(result: TranscriptionFinishedData, botId: string): void {
    const outputDir = path.join(__dirname, 'transcriptions');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `${botId}-transcription.json`);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    console.log(`✅ Transcription result saved to: ${outputFile}`);
}

// Main function
async function main(): Promise<void> {
    console.log('🚀 Starting TranscriptionProcess.createTranscriptionData()');

    // Check for required environment variables
    if (!checkRequiredEnvVars()) {
        process.exit(1);
    }

    // Get bot ID and bucket name
    const botId = getBotId();
    const bucketName = getBucketName();
    const debug = isDebugMode();

    if (debug) {
        console.log('🐛 DEBUG mode enabled');
        console.log('📊 Environment variables:');
        console.log(`   - AWS_S3_VIDEO_BUCKET: ${bucketName}`);
        console.log(`   - BOT_ID: ${botId}`);
    }

    // Initialize global state with required MeetingParams fields
    initializeGlobalState(botId, bucketName);

    try {

        // Run the transcription process
        console.log('⏳ Running transcription process...');
        const transcriptionProcess = new TranscriptionProcess();
        const result = await transcriptionProcess.createTranscriptionData();

        console.log('✅ Transcription process completed');

        if (result) {
            // Save result to file
            saveTranscriptionResult(result as TranscriptionFinishedData, botId);

            // Print summary
            console.log('\n📝 Transcription Summary:');
            console.log(`   - Event: ${result.event}`);

            if (result.event === 'COMPLETE') {
                console.log(`   - Duration: ${result.duration} seconds`);
                console.log(`   - Speakers: ${result.speakers?.length || 0}`);
                console.log(`   - Transcript segments: ${result.transcript?.length || 0}`);
            } else {
                console.log(`   - Error: ${result.error}`);
                console.log(`   - Message: ${result.message}`);
            }
        } else {
            console.error('❌ Transcription process returned no result');
        }
    } catch (error) {
        console.error('❌ Error running transcription process:');
        console.error(error instanceof Error ? error.message : String(error));
        if (debug && error instanceof Error && error.stack) {
            console.error('\n🐛 Stack trace:');
            console.error(error.stack);
        }
    }
}

// Run the main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
