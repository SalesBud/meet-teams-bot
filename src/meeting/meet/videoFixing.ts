import { Page } from '@playwright/test'

export async function injectFixedVideoStyle(page: Page): Promise<void> {
    const className = 'fixed-speaker-video'
    const styleId = 'fixed-speaker-video-style'

    await page.evaluate(
        ({ className, styleId }) => {
            if (!document.getElementById(styleId)) {
                const styleElement = document.createElement('style')
                styleElement.id = styleId
                styleElement.textContent = `
                    .${className} {
                        position: fixed !important;
                        top: 20px !important;
                        right: 20px !important;
                        z-index: 9999999 !important;
                        width: 202px !important;
                        height: 114px !important;
                        border: 5px solidrgb(186, 8, 174) !important;
                        border-radius: 8px !important;
                        opacity: 1 !important;
                        background: rgb(70, 70, 70) !important;
                    }
                `
                document.head.appendChild(styleElement)
                console.log('[VideoFixing] Estilo para vídeo fixo criado')
            } else {
                console.log('[VideoFixing] Estilo para vídeo fixo já existe')
            }
        },
        { className, styleId }
    )
}

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
                            tile.style.removeProperty('left')
                            tile.classList.add('fixed-speaker-video')
                            return { success: true, error: null }
                        }
                    }
                }
            } catch (e) {
                return { success: false, error: e }
            }
            return { success: false, error: null }
        },
        participantName
    )
    console.log(`[VideoFixing] Fixed participant ${participantName} video element: Success: ${result.success} - Error: ${result.error}`)
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
