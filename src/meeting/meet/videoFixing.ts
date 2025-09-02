import { Page } from '@playwright/test'

export async function isScreenSharingActive(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        return !!document.querySelector('.dzMPxf .z1gyye')
    })
}

export async function fixingParticipantVideoElement(page: Page, participantName: string): Promise<void> {
    const result = await page.evaluate(
        (participantName) => {
            try {
                const tiles = document.querySelectorAll('.dkjMxf')
                for (const tile of Array.from(tiles)) {
                    const spans = tile.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
                    for (const span of spans) {
                        if (span.textContent?.trim() === participantName && tile instanceof HTMLElement) {
                            if (tile.classList.contains('fixed-speaker-video')) {
                                return { success: true, message: `Video element already fixed for ${participantName}` }
                            }
                            tile.style.removeProperty('left')
                            tile.classList.add('fixed-speaker-video')
                            return { success: true, message: `Video element fixed for ${participantName}` }
                        }
                    }
                }
                return { success: false, message: `Video element not found for ${participantName}` }
            } catch (e) {
                return { success: false, message: `Error fixing video element for ${participantName}: ${e}` }
            }
        },
        participantName
    )
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
