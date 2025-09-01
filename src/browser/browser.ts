import { BrowserContext, chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

export async function openBrowser(
    slowMo: boolean = false,
    brandingVideoPath?: string,
): Promise<{ browser: BrowserContext }> {
    const width = 1280 // 640
    const height = 720 // 480

    try {
        console.log('Launching persistent context with exact extension args...')

        let chromePath = process.env.CHROME_PATH
        if (!chromePath) {
            if (process.platform === 'win32') {
                const possiblePaths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
                ]

                for (const path of possiblePaths) {
                    if (fs.existsSync(path)) {
                        chromePath = path
                        break
                    }
                }

                if (!chromePath) {
                    throw new Error('Chrome not found. Please set CHROME_PATH environment variable.')
                }
            } else if (process.platform === 'darwin') {
                const possiblePaths = [
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    '/Applications/Chromium.app/Contents/MacOS/Chromium',
                    process.env.HOME + '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
                ]

                for (const path of possiblePaths) {
                    if (fs.existsSync(path)) {
                        chromePath = path
                        break
                    }
                }

                if (!chromePath) {
                    console.warn('Chrome not found in standard macOS locations, trying Playwright bundled Chromium')
                }
            } else {
                chromePath = '/usr/bin/google-chrome'
            }
        }
        console.log(`🔍 Using Chrome path: ${chromePath}`)

        const finalBrandingPath = await getBrandingPath(brandingVideoPath)

        // Build Chrome arguments dynamically
        const chromeArgs = [
            // Security configurations
            '--no-sandbox',
            '--disable-setuid-sandbox',

            // ========================================
            // AUDIO CONFIGURATION FOR PULSEAUDIO
            // ========================================
            '--use-pulseaudio', // Force Chromium to use PulseAudio
            '--enable-audio-service-sandbox=false', // Disable audio service sandbox for virtual devices
            '--audio-buffer-size=2048', // Set buffer size for better audio handling
            '--disable-features=AudioServiceSandbox', // Additional sandbox disable
            '--autoplay-policy=no-user-gesture-required', // Allow autoplay for meeting platforms

            // WebRTC optimizations (required for meeting audio/video capture)
            '--disable-rtc-smoothness-algorithm',
            '--disable-webrtc-hw-decoding',
            '--disable-webrtc-hw-encoding',
            '--enable-webrtc-capture-audio', // Ensure WebRTC can capture audio
            '--force-webrtc-ip-handling-policy=default', // Better WebRTC handling

            // Virtual camera configuration (order matters for fake video capture)
            '--use-fake-device-for-media-stream', // Use fake devices for testing
            '--use-fake-ui-for-media-stream', // Use fake UI for media permissions
            '--allow-running-insecure-content', // Allow insecure content for fake video
            '--disable-web-security', // Disable web security for media access

            // Performance and resource management optimizations
            '--disable-blink-features=AutomationControlled',
            '--disable-background-timer-throttling',
            '--enable-features=SharedArrayBuffer',
            '--memory-pressure-off', // Disable memory pressure handling for consistent performance
            '--max_old_space_size=4096', // Increase V8 heap size to 4GB for large meetings
            '--disable-background-networking', // Reduce background network activity
            '--disable-features=TranslateUI', // Disable translation features to save resources
            '--disable-features=AutofillServerCommunication', // Disable autofill to reduce network usage
            '--disable-component-extensions-with-background-pages', // Reduce background extension overhead
            '--disable-default-apps', // Disable default Chrome apps
            '--renderer-process-limit=4', // Limit renderer processes to prevent resource exhaustion
            '--disable-ipc-flooding-protection', // Improve IPC performance for high-frequency operations
            '--aggressive-cache-discard', // Enable aggressive cache management for memory efficiency
            '--disable-features=MediaRouter', // Disable media router for reduced overhead

            // Certificate and security optimizations for meeting platforms
            '--ignore-certificate-errors',
            '--allow-insecure-localhost',
            '--disable-blink-features=TrustedDOMTypes',
            '--disable-features=TrustedScriptTypes',
            '--disable-features=TrustedHTML',

            // Additional audio debugging (remove in production)
            '--enable-logging=stderr',
            '--log-level=1',
            '--vmodule=*audio*=3', // Enable audio debug logging
        ]

        // Add fake video capture argument if branding video is available
        if (finalBrandingPath) {
            chromeArgs.push(`--use-file-for-fake-video-capture=${finalBrandingPath}`)
        }

        const launchOptions: any = {
            headless: false,
            viewport: { width, height },
            args: chromeArgs,
            slowMo: slowMo ? 100 : undefined,
            permissions: ['microphone', 'camera'],
            ignoreHTTPSErrors: true,
            acceptDownloads: true,
            bypassCSP: true,
            timeout: 120000,
        }

        // Only set executablePath if we found Chrome, otherwise use Playwright's bundled browser
        if (chromePath) {
            launchOptions.executablePath = chromePath
        }

        const context = await chromium.launchPersistentContext('', launchOptions)

        console.log('✅ Chromium launched with PulseAudio configuration')
        return { browser: context }
    } catch (error) {
        console.error('Failed to open browser:', error)

        // Provide more detailed error information
        if (error instanceof Error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
            })
        }

        throw error
    }
}

async function getBrandingPath(brandingVideoPath?: string): Promise<string | null> {
    if (!brandingVideoPath) {
        return null
    }

    // Try Y4M first (better for Chrome fake video capture)
    if (fs.existsSync(brandingVideoPath)) {
        console.log(`Using branding video (Y4M): ${brandingVideoPath}`)
        return path.resolve(brandingVideoPath)
    }
    // Fallback to MP4 if Y4M doesn't exist
    else {
        const mp4Path = brandingVideoPath.replace('.y4m', '.mp4')
        if (fs.existsSync(mp4Path)) {
            console.log(`Using branding video (MP4 fallback): ${mp4Path}`)
            return path.resolve(mp4Path)
        } else {
            console.warn(`Branding video file not found: ${brandingVideoPath}`)
            return null
        }
    }
}
