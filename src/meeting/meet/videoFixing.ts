import { Page } from '@playwright/test'

export async function isScreenSharingActive(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        return !!document.querySelector('.dzMPxf .z1gyye')
    })
}

export async function fixingParticipantVideoElement(page: Page, participantName: string, lastSpeakerName: string): Promise<void> {
    const result = await page.evaluate(
        (args: string[]) => {
            const [participantName, lastSpeakerName] = args;
            let message = ''
            try {
                const tiles = document.querySelectorAll('.dkjMxf')
                for (const tile of Array.from(tiles)) {
                    const spans = tile.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
                    for (const span of spans) {
                        if (span.textContent?.trim() === participantName && tile instanceof HTMLElement) {
                            if (tile.classList.contains('fixed-speaker-video')) {
                                message = `\n Video element already fixed for ${participantName}`;
                                break;
                            }
                            tile.style.removeProperty('left')
                            tile.classList.add('fixed-speaker-video')
                            message = `\n Video element fixed for ${participantName}`;
                            break;
                        }
                        else if (span.textContent?.trim() === lastSpeakerName && tile instanceof HTMLElement) {
                            tile.classList.remove('fixed-speaker-video')
                            message = `\n Video element removed from participant ${lastSpeakerName}`;
                            break;
                        }
                    }
                }
                return { success: true, message: message }
            } catch (e) {
                return { success: false, message: `Error fixing video element for ${participantName}: ${e}` }
            }
        },
        [participantName, lastSpeakerName]
    ) as { success: boolean; message: string }
    console.log(`[VideoFixing] Fixed participant ${participantName} video element: Success: ${result.success} - message: ${result.message}`)
}

export async function removeAllFixedVideoClasses(page: Page): Promise<void> {
    await page.evaluate(() => {
        const fixedElements = document.querySelectorAll('.fixed-speaker-video')
        fixedElements.forEach((element) => {
            element.classList.remove('fixed-speaker-video');
            (element as HTMLElement).style.opacity = '0';
        })
        if (fixedElements.length > 0) {
        }
    })
}
