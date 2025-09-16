import { BrowserContext, Page } from '@playwright/test'

import { MeetingEndReason } from '../state-machine/types'
import { MeetingProviderInterface } from '../types'

import { HtmlSnapshotService } from '../services/html-snapshot-service'
import { GLOBAL } from '../singleton'
import { parseMeetingUrlFromJoinInfos } from '../urlParser/teamsUrlParser'
import { sleep } from '../utils/sleep'
import Logger from '../utils/DatadogLogger'

export class TeamsProvider implements MeetingProviderInterface {
    constructor() { }
    async parseMeetingUrl(meeting_url: string) {
        return parseMeetingUrlFromJoinInfos(meeting_url)
    }
    getMeetingLink(
        meeting_id: string,
        _password: string,
        _role: number,
        _bot_name: string,
    ) {
        return meeting_id
    }

    async openMeetingPage(
        browserContext: BrowserContext,
        link: string,
        streaming_input: string | undefined,
        attempts: number = 0,
    ): Promise<Page> {
        const url = new URL(link)
        const page = await browserContext.newPage()
        const maxAttempts = 10

        page.setDefaultTimeout(30000)
        page.setDefaultNavigationTimeout(30000)

        // Set permissions based on streaming_input
        if (streaming_input) {
            await browserContext.grantPermissions(['microphone', 'camera'], {
                origin: url.origin,
            })
        } else {
            await browserContext.grantPermissions(['camera'], {
                origin: url.origin,
            })
        }

        try {
            await page.goto(link, {
                waitUntil: 'domcontentloaded',
                timeout: 15000, // Reduced from 30s
            })

            // Quick check for buttons with reduced timeout
            await Promise.race([
                page
                    .getByRole('button', { name: 'Join now' })
                    .waitFor({ timeout: 5000 }),
                page
                    .getByRole('button', {
                        name: 'Continue without audio or video',
                    })
                    .waitFor({ timeout: 5000 }),
            ]).catch(() => {
                // Silent catch - no need to log timeout
            })

            const currentUrl = await page.url()
            const isLightInterface =
                currentUrl.includes('light-meetings') ||
                currentUrl.includes('light')

            if (isLightInterface && attempts < 3) {
                // Limit retries to 3
                await page.close()
                Logger.info(
                    `Light interface detected, retry ${attempts + 1}/3`,
                )
                await sleep(500) // Reduced wait time
                return await this.openMeetingPage(
                    browserContext,
                    link,
                    streaming_input,
                    attempts + 1,
                )
            } else if (isLightInterface && attempts >= 3) {
                Logger.warn(
                    'Light interface persists after 3 retries, continuing anyway',
                )
            }

            return page
        } catch (error) {
            Logger.error('Error in openMeetingPage:', { error })
            throw error
        }
    }

    async joinMeeting(
        page: Page,
        cancelCheck: () => boolean,
        onJoinSuccess: () => void,
    ): Promise<void> {
        Logger.withFunctionName('joinMeeting')

        // Capture DOM state before starting Teams join process
        const htmlSnapshot = HtmlSnapshotService.getInstance()
        await htmlSnapshot.captureSnapshot(page, 'teams_join_meeting_start')

        try {
            await ensurePageLoaded(page)
        } catch (error) {
            Logger.error('Page load failed:', { error })
            throw new Error('Page failed to load - retrying')
        }

        try {
            // Try multiple approaches to handle Teams button scenarios
            const maxAttempts = 15 // Increased for better reliability

            for (let i = 0; i < maxAttempts; i++) {
                if (cancelCheck?.()) break

                // Check if we've been redirected to a login page
                if (await isOnMicrosoftLoginPage(page)) {
                    throw new Error('LoginRequired')
                }

                // Check all buttons in one pass with more attempts
                const [continueOnBrowser, joinNow, continueWithoutAudio] =
                    await Promise.all([
                        clickWithInnerText(
                            page,
                            'button',
                            'Continue on this browser',
                            2,
                            false,
                        ),
                        clickWithInnerText(
                            page,
                            'button',
                            'Join now',
                            2,
                            false,
                        ),
                        clickWithInnerText(
                            page,
                            'button',
                            'Continue without audio or video',
                            2,
                            false,
                        ),
                    ])

                if (continueOnBrowser) {
                    await clickWithInnerText(
                        page,
                        'button',
                        'Continue on this browser',
                        3,
                        true,
                    )
                    break
                }

                if (joinNow) {
                    break
                }

                if (continueWithoutAudio) {
                    await clickWithInnerText(
                        page,
                        'button',
                        'Continue without audio or video',
                        3,
                        true,
                    )
                    // Don't break immediately - sometimes there are multiple steps
                    await sleep(1000)
                }

                if (i === 7)
                    Logger.warn('Still looking for Teams buttons...') // Log midway
                await sleep(300) // Slightly reduced wait time
            }

            // Extra attempts for "Continue without audio" in light interface
            Logger.warn(
                'Extra attempts for "Continue without audio or video"...',
            )
            for (let i = 0; i < 5; i++) {
                if (cancelCheck?.()) break

                // Check if we've been redirected to a login page
                if (await isOnMicrosoftLoginPage(page)) {
                    throw new Error('LoginRequired')
                }

                const found = await clickWithInnerText(
                    page,
                    'button',
                    'Continue without audio or video',
                    3,
                    true,
                )
                if (found) {
                    await sleep(1000)
                    break
                }
                await sleep(500)
            }
        } catch (e) {
            if (e instanceof Error && e.message === 'LoginRequired') {
                throw e // Re-throw LoginRequired errors
            }
            Logger.warn('Failed during Teams button handling:', e)
        }

        const currentUrl = await page.url()
        const isLightInterface = currentUrl.includes('light')
        const isLiveInterface = currentUrl.includes('live')

        Logger.info(
            'interface : ',
            {
                interface: isLightInterface
                    ? 'light'
                    : isLiveInterface
                        ? 'live'
                        : 'old'
            },
        )

        try {
            await clickWithInnerText(page, 'button', 'Join now', 100, false)
        } catch (e) {
            Logger.warn('Failed to find "Join now" button (first attempt):', { error: e })
        }

        // Additional attempt for "Continue without audio" in case it appears later
        try {
            Logger.info(
                'Additional attempt for "Continue without audio or video"...',
            )
            for (let i = 0; i < 3; i++) {
                if (cancelCheck?.()) break

                const found = await clickWithInnerText(
                    page,
                    'button',
                    'Continue without audio or video',
                    2,
                    true,
                )
                if (found) {
                    await sleep(1000)
                    break
                }
                await sleep(500)
            }
        } catch (e) {
            Logger.warn(
                'Additional "Continue without audio" attempt failed:',
                { error: e },
            )
        }

        if (isLightInterface) {
            try {
                await handlePermissionDialog(page)

                // Quick camera/mic setup with timeouts
                await Promise.race([
                    activateCamera(page),
                    sleep(3000).then(() => {
                        throw new Error('Camera timeout')
                    }),
                ]).catch((e) =>
                    Logger.warn(
                        'Camera setup failed:',
                        { error: e instanceof Error ? e.message : e },
                    ),
                )

                const streaming_input = GLOBAL.get().streaming_input
                if (streaming_input) {
                    await Promise.race([activateMicrophone(page), sleep(2000)])
                } else {
                    await Promise.race([
                        deactivateMicrophone(page),
                        sleep(2000),
                    ])
                }
            } catch (e) {
                Logger.warn(
                    'Camera/mic setup failed, continuing:',
                    { error: e instanceof Error ? e.message : String(e) },
                )
            }
        }

        try {
            await typeBotName(page, GLOBAL.get().bot_name, 20)
            await clickWithInnerText(page, 'button', 'Join now', 20)
        } catch (e) {
            Logger.error(
                'Error during bot name typing or second "Join now" click:',
                { error: e },
            )
            throw new Error('RetryableError')
        }

        // Wait to be in the meeting
        Logger.info('Waiting to confirm meeting join...')
        let inMeeting = false

        while (!inMeeting) {
            // Check if we have been refused
            const botNotAccepted = await isBotNotAccepted(page)
            if (botNotAccepted) {
                GLOBAL.setError(MeetingEndReason.BotNotAccepted)
                throw new Error('Bot not accepted into Teams meeting')
            }

            // Check if we should cancel
            if (cancelCheck()) {
                GLOBAL.setError(MeetingEndReason.ApiRequest)
                throw new Error('API request to stop Teams recording')
            }

            // Check if we are in the meeting (multiple indicators)
            inMeeting = await isInTeamsMeeting(page)

            if (!inMeeting) {
                await sleep(1000)
            }
        }

        Logger.info('Successfully confirmed we are in the meeting')

        // 🎯 CRITICAL: Notify that join was successful (fixes waiting room timeout)
        onJoinSuccess()

        // Capture DOM state after successfully joining Teams meeting
        await htmlSnapshot.captureSnapshot(page, 'teams_join_meeting_success')

        // Check for "Continue without audio or video" that might appear AFTER joining (light interface)
        try {
            Logger.info(
                'Post-meeting check for "Continue without audio or video"...',
            )
            for (let i = 0; i < 5; i++) {
                if (cancelCheck?.()) break

                const found = await clickWithInnerText(
                    page,
                    'button',
                    'Continue without audio or video',
                    2,
                    true,
                )
                if (found) {
                    await sleep(1500) // Give time for interface to update
                    break
                }
                await sleep(800)
            }
        } catch (e) {
            Logger.warn(
                'Post-meeting "Continue without audio" check failed:',
                { error: e },
            )
        }

        // Once in the meeting, configure the view
        try {
            // Capture DOM state before configuring Teams view
            await htmlSnapshot.captureSnapshot(
                page,
                'teams_configure_view_start',
            )

            if (await clickWithInnerText(page, 'button', 'View', 10, false)) {
                if (GLOBAL.get().recording_mode !== 'gallery_view') {
                    await clickWithInnerText(page, 'button', 'View', 10)
                    await clickWithInnerText(page, 'div', 'Speaker', 20)
                }
            }
        } catch (e) {
            Logger.error('Error handling "View" or "Speaker" mode:', { error: e })
        }
    }

    async findEndMeeting(page: Page): Promise<boolean> {
        // Check if we're on a Microsoft login page
        if (await isOnMicrosoftLoginPage(page)) {
            return true
        }

        return await isRemovedFromTheMeeting(page)
    }

    async closeMeeting(page: Page): Promise<void> {
        Logger.withFunctionName('closeMeeting')
        Logger.info('Attempting to leave the meeting')
        try {
            // Try multiple approaches to find and click the leave button

            // Approach 1: Try to find by aria-label
            // const leaveButton = page.locator('button[aria-label="Leave (⌘+Shift+H)"], button[aria-label*="Leave"]')
            // if (await leaveButton.count() > 0) {
            //     await leaveButton.click()
            //     console.log('Clicked leave button by aria-label')
            //     return
            // }

            // // Approach 2: Try to find by data-tid attribute
            // const hangupButton = page.locator('button[data-tid="hangup-main-btn"]')
            // if (await hangupButton.count() > 0) {
            //     await hangupButton.click()
            //     console.log('Clicked leave button by data-tid')
            //     return
            // }

            // Approach 3: Try to find by text content
            if (await clickWithInnerText(page, 'button', 'Leave', 5, true)) {
                return
            }

            // Approach 4: Try to find by role and name
            const leaveByRole = page.getByRole('button', { name: 'Leave' })
            if ((await leaveByRole.count()) > 0) {
                await leaveByRole.click()
                return
            }

            Logger.warn('Could not find leave button, closing page instead')
        } catch (error) {
            Logger.error('Error while trying to leave meeting:', { error })
        }
    }
}

const INPUT_BOT = 'input[placeholder="Type your name"]'

async function clickWithInnerText(
    page: Page,
    htmlType: string,
    innerText: string,
    iterations: number,
    click: boolean = true,
    cancelCheck?: () => boolean,
): Promise<boolean> {
    Logger.withFunctionName('clickWithInnerText')
    let i = 0
    let continueButton = false

    if (!(await ensurePageLoaded(page))) {
        Logger.error('Page is not fully loaded at the start.')
        return false
    }

    while (
        !continueButton &&
        (iterations == null || i < iterations) &&
        !cancelCheck?.()
    ) {
        try {
            if (i % 5 === 0) {
                const isPageLoaded = await ensurePageLoaded(page)
                if (!isPageLoaded) {
                    Logger.warn('Page seems frozen or not responding.')
                    return false
                }
            }

            continueButton = await page.evaluate(
                ({ innerText, htmlType, i, click }) => {
                    let elements: Element[] = []
                    const iframes = document.querySelectorAll('iframe')

                    if (i % 2 === 0 && iframes.length > 0) {
                        const firstIframe = iframes[0]
                        try {
                            const docInIframe =
                                firstIframe.contentDocument ||
                                firstIframe.contentWindow?.document
                            if (docInIframe) {
                                elements = Array.from(
                                    docInIframe.querySelectorAll(htmlType),
                                )
                            }
                        } catch (e) {
                            Logger.warn('Iframe access error:', { error: e })
                        }
                    }

                    if (elements.length === 0) {
                        elements = Array.from(
                            document.querySelectorAll(htmlType),
                        )
                    }

                    for (const elem of elements) {
                        if (elem.textContent?.trim() === innerText) {
                            if (click) {
                                ; (elem as HTMLElement).click()
                            }
                            return true
                        }
                    }
                    return false
                },
                { innerText, htmlType, i, click },
            )
        } catch (e) {
            if (i === iterations - 1) {
                Logger.debug(`Error in clickWithInnerText (last attempt):`, { error: e })
            }
            continueButton = false
        }

        if (!continueButton) {
            await page.waitForTimeout(100 + i * 100)
        }

        // Only log if found or on final attempt
        if (continueButton || i === iterations - 1) {
            Logger.debug(
                `${innerText} ${click ? 'clicked' : 'found'} : ${continueButton}`,
            )
        }
        i++
    }
    return continueButton
}

async function typeBotName(
    page: Page,
    botName: string,
    maxAttempts: number,
): Promise<void> {
    Logger.withFunctionName('typeBotName')
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await page.waitForSelector(INPUT_BOT, { timeout: 1000 })
            const input = page.locator(INPUT_BOT)

            if ((await input.count()) > 0) {
                await input.focus()
                await input.fill(botName)

                // Verify the input value
                const currentValue = await input.inputValue()
                if (currentValue === botName) {
                    return
                }

                // If fill didn't work, try typing
                await input.clear()
                await page.keyboard.type(botName, { delay: 100 })

                if ((await input.inputValue()) === botName) {
                    return
                }
            }

            await page.waitForTimeout(500)
        } catch (e) {
            Logger.error(`Error typing bot name (attempt ${i + 1}):`, { error: e })
        }
    }
    throw new Error('Failed to type bot name')
}

async function checkPageForText(page: Page, text: string): Promise<boolean> {
    Logger.withFunctionName('checkPageForText')
    try {
        const content = await page.content()
        return content.includes(text)
    } catch (error) {
        Logger.error('Error checking page for text:', { error })
        return false
    }
}

async function isOnMicrosoftLoginPage(page: Page): Promise<boolean> {
    const currentUrl = await page.url()
    if (currentUrl.includes('login.microsoft')) {
        console.log('Detected Microsoft login page, login required')
        GLOBAL.setError(MeetingEndReason.LoginRequired)
        return true
    }
    return false
}

async function isRemovedFromTheMeeting(page: Page): Promise<boolean> {
    try {
        if (!(await ensurePageLoaded(page))) {
            return true
        }

        const raiseButton = page.locator(
            'button#raisehands-button:has-text("Raise")',
        )
        const buttonExists = (await raiseButton.count()) > 0

        if (!buttonExists) {
            Logger.info('no raise button found, Bot removed from the meeting')
            return true
        }
        return false
    } catch (error) {
        Logger.error('Error while checking meeting status:', { error })
        return false
    }
}

async function isBotNotAccepted(page: Page): Promise<boolean> {
    // Check if we're on a Microsoft login page
    if (await isOnMicrosoftLoginPage(page)) {
        return true
    }

    const deniedTexts = [
        'Sorry, but you were denied access to the meeting.',
        'Someone in the meeting should let you in soon',
        'Waiting to be admitted',
    ]

    for (const text of deniedTexts) {
        const found = await checkPageForText(page, text)
        if (found) {
            return true
        }
    }
    return false
}

async function handlePermissionDialog(page: Page): Promise<void> {
    Logger.withFunctionName('handlePermissionDialog')
    try {
        const okButton = page.locator('button:has-text("OK")')
        if ((await okButton.count()) > 0) {
            await okButton.click()
        } else {
            Logger.info('No permission dialog found')
        }
    } catch (error) {
        Logger.warn('Failed to handle permission dialog:', { error })
    }
}

async function activateCamera(page: Page): Promise<void> {
    Logger.withFunctionName('activateCamera')
    try {
        // Essayer d'abord l'interface normale de Teams
        const cameraOffText = page.locator('text="Your camera is turned off"')
        if ((await cameraOffText.count()) > 0) {
            const cameraButton = page.locator('button[title="Turn camera on"]')
            if ((await cameraButton.count()) > 0) {
                await cameraButton.click()
                await sleep(500)
                return
            } else {
                Logger.info(
                    'Camera button not found in normal interface, trying light interface',
                )
            }
        }

        // Essayer l'interface light de Teams
        const lightCameraButton = page.locator(
            '[data-tid="toggle-video"][aria-checked="false"], [aria-label="Camera"][aria-checked="false"]',
        )
        if ((await lightCameraButton.count()) > 0) {
            await lightCameraButton.click()
            await sleep(500)
            return
        } else {
            Logger.info(
                'Camera is already on or button not found in both interfaces',
            )
        }
    } catch (error) {
        Logger.error('Failed to activate camera:', { error })
    }
}

async function activateMicrophone(page: Page): Promise<void> {
    Logger.withFunctionName('activateMicrophone')
    try {
        const micOffText = page.locator('text="Your microphone is muted"')
        if ((await micOffText.count()) > 0) {
            const micButton = page.locator('button[title="Unmute"]')
            if ((await micButton.count()) > 0) {
                await micButton.click()
                await sleep(500)
            } else {
                Logger.info('Failed to find unmute button')
            }
        } else {
            Logger.info('Microphone is already on or text not found')
        }
    } catch (error) {
        Logger.warn('Failed to activate microphone:', { error })
    }
}

async function deactivateMicrophone(page: Page): Promise<void> {
    Logger.withFunctionName('deactivateMicrophone')
    try {
        const micOnText = page.locator('text="Your microphone is on"')
        if ((await micOnText.count()) > 0) {
            const micButton = page.locator('button[title="Mute"]')
            if ((await micButton.count()) > 0) {
                await micButton.click()
                await sleep(500)
            } else {
                Logger.info('Failed to find mute button')
            }
        } else {
            Logger.info('Microphone is already muted or text not found')
        }
    } catch (error) {
        Logger.warn('Failed to deactivate microphone:', { error })
    }
}

async function ensurePageLoaded(page: Page, timeout = 20000): Promise<boolean> {
    try {
        await page.waitForFunction(() => document.readyState === 'complete', {
            timeout: timeout,
        })
        return true
    } catch (error) {
        Logger.error('Failed to ensure page is loaded:', { error })
        throw new Error('RetryableError: Page load timeout')
    }
}

// New function to check if we are in the Teams meeting
async function isInTeamsMeeting(page: Page): Promise<boolean> {
    try {
        const indicators = [
            // The React button is a good indicator that we are in the meeting
            await clickWithInnerText(page, 'button', 'React', 1, false),

            // Le bouton Raise hand aussi
            await page
                .locator('button#raisehands-button:has-text("Raise")')
                .isVisible(),

            // La présence du chat
            await page
                .locator('button[aria-label*="chat"], button[title*="chat"]')
                .isVisible(),

            // L'absence des textes de waiting room
            !(await isBotNotAccepted(page)),

            // The absence of the Join now button (which only exists in the waiting room)
            !(await clickWithInnerText(page, 'button', 'Join now', 1, false)),
        ]

        const confirmedIndicators = indicators.filter(Boolean).length
        Logger.info(
            `Teams meeting presence indicators: ${confirmedIndicators}/5`,
        )

        return confirmedIndicators >= 3
    } catch (error) {
        Logger.error('Error checking if in Teams meeting:', { error })
        return false
    }
}
