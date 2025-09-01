import { Page } from '@playwright/test'

/**
 * Injeta o CSS necessário para fixar o vídeo do participante que está falando
 * quando há compartilhamento de tela ativo
 */
export async function injectFixedVideoStyle(page: Page): Promise<void> {
    const className = 'fixed-speaker-video'
    const styleId = 'fixed-speaker-video-style'

    await page.evaluate(
        ({ className, styleId }) => {
            // Verifica se o estilo já existe para não criar duplicado
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

/**
 * Detecta se há um compartilhamento de tela ativo na reunião
 */
export async function isScreenSharingActive(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        // Verifica se existe o elemento que indica compartilhamento de tela ativo
        return !!document.querySelector('.dzMPxf .z1gyye')
    })
}

/**
 * Adiciona a classe CSS de fixação ao elemento de vídeo do participante
 */
export async function addFixedVideoClass(page: Page, participantElement: any): Promise<void> {
    await page.evaluate(
        (element) => {
            if (element && !element.classList.contains('fixed-speaker-video')) {
                element.classList.add('fixed-speaker-video')
                console.log('[VideoFixing] Classe fixed-speaker-video adicionada ao participante que está falando')
            }
        },
        participantElement
    )
}


export async function fixingParticipantVideoElement(page: Page, participantName: string): Promise<void> {
    const result = await page.evaluate(
        (participantName) => {
            const participantsList = document.querySelectorAll('div[data-participant-id]');
            console.log(`[VideoFixingObserver-Browser] Participants list number: ${participantsList.length}`)
            if (!participantsList) return { success: false }

            for (const item of participantsList) {
                const spans = item.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
                console.log(`[VideoFixingObserver-Browser] Spans number: ${spans.length}`)
                for (const span of spans) {
                    console.log(`[VideoFixingObserver-Browser] USER NAME Span: ${span?.textContent?.trim()}`)
                    if (span.textContent?.trim() === participantName) {
                        console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
                        item.classList.add('fixed-speaker-video')
                        return { success: true }
                    }
                }
            }
            return { success: false }
        },
        participantName
    )
    console.log(`[VideoFixing] Fixed participant video element: ${result.success}`)
}

/**
 * Remove a classe CSS de fixação do elemento de vídeo do participante
 */
export async function removeFixedVideoClass(page: Page, participantElement: any): Promise<void> {
    await page.evaluate(
        (element) => {
            if (element && element.classList.contains('fixed-speaker-video')) {
                element.classList.remove('fixed-speaker-video')
                console.log('[VideoFixing] Classe fixed-speaker-video removida do participante')
            }
        },
        participantElement
    )
}

/**
 * Remove a classe de fixação de todos os participantes para reverter ao layout padrão
 */
export async function removeAllFixedVideoClasses(page: Page): Promise<void> {
    await page.evaluate(() => {
        const fixedElements = document.querySelectorAll('.fixed-speaker-video')
        fixedElements.forEach((element) => {
            element.classList.remove('fixed-speaker-video');
            (element as HTMLElement).style.opacity = '0';
        })
        if (fixedElements.length > 0) {
            console.log(`[VideoFixing] Classe fixed-speaker-video removida de ${fixedElements.length} elemento(s)`)
        }
    })
}

/**
 * Função principal que implementa a lógica de fixação do vídeo
 * Deve ser chamada no loop do observer para cada participante
 */
export async function handleVideoFixing(
    page: Page,
    participantElement: any,
    isSpeaking: boolean,
    participantName: string
): Promise<void> {
    try {
        // Primeiro, verifica se há compartilhamento de tela ativo
        const screenSharingActive = await isScreenSharingActive(page)

        if (screenSharingActive) {
            console.log('[VideoFixing] Compartilhamento de tela detectado')

            if (isSpeaking) {
                console.log(`[VideoFixing] ${participantName} está falando - fixando vídeo`)
                await addFixedVideoClass(page, participantElement)
            } else {
                // Remove a classe se o participante não estiver mais falando
                await removeFixedVideoClass(page, participantElement)
            }
        } else {
            // Se não há compartilhamento de tela, remove todas as classes de fixação
            await removeAllFixedVideoClasses(page)
        }
    } catch (error) {
        console.error('[VideoFixing] Erro ao processar fixação do vídeo:', error)
    }
}
