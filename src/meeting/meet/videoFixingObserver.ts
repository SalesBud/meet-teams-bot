import { Page } from '@playwright/test'
import { SpeakerData } from '../../types'
import {
    injectFixedVideoStyle,
    isScreenSharingActive,
    addFixedVideoClass,
    removeFixedVideoClass,
    removeAllFixedVideoClasses,
    fixingParticipantVideoElement,
} from './videoFixing'

export class VideoFixingObserver {
    private page: Page
    private isObserving: boolean = false
    private currentSpeakers: Map<string, boolean> = new Map()
    private participantVideoElements: Map<string, Element> = new Map()

    private readonly MUTATION_DEBOUNCE = 500 // ms
    private readonly CHECK_INTERVAL = 1000 // 1s

    constructor(page: Page) {
        this.page = page
    }

    /**
     * Inicia a observação de mudanças nos estados de isSpeaking
     */
    public async startObserving(): Promise<void> {
        if (this.isObserving) {
            console.warn('[VideoFixingObserver] Already observing')
            return
        }

        console.log('[VideoFixingObserver] Starting video fixing observation...')

        // Injeta o CSS necessário para a funcionalidade de fixação
        await injectFixedVideoStyle(this.page)

        // Expõe função para receber atualizações de mudanças nos speakers
        await this.page.exposeFunction(
            'onVideoFixingSpeakersChanged',
            async (speakers: SpeakerData[]) => {
                try {
                    await this.handleSpeakersChange(speakers)
                } catch (error) {
                    console.error('[VideoFixingObserver] Error handling speakers change:', error)
                }
            }
        )

        await this.page.evaluate(
            ({ mutationDebounce, checkInterval }) => {
                console.log('[VideoFixingObserver-Browser] Setting up video fixing observation')

                let mutationTimeout: any = null
                let periodicCheck: any = null
                let MUTATION_OBSERVER: MutationObserver | null = null

                const participantVideoMap = new Map<string, Element>()

                function findParticipantVideoElement(participantName: string): Element | null {
                    try {
                        const participantsList = document.querySelectorAll('div[data-participant-id]');
                        console.log(`[VideoFixingObserver-Browser] Participants list number: ${participantsList.length}`)
                        if (!participantsList) return null

                        for (const item of participantsList) {
                            const spans = item.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
                            console.log(`[VideoFixingObserver-Browser] Spans number: ${spans.length}`)
                            for (const span of spans) {
                                console.log(`[VideoFixingObserver-Browser] USER NAME Span: ${span?.textContent?.trim()}`)
                                if (span.textContent?.trim() === participantName) {
                                    console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
                                    return item
                                }
                            }
                            // const participant = Array.from(spans).find(span => span.textContent?.trim() === participantName)
                            // if (participant) {
                            //     return item
                            // const allVideos = document.querySelectorAll('video')

                            // for (const video of allVideos) {
                            //     const container = video.closest('[data-participant-id]')
                            //     if (container) {
                            //         const participantId = (item as HTMLElement).dataset.participantId
                            //         const videoParticipantId = container.getAttribute('data-participant-id')

                            //         if (participantId === videoParticipantId) {
                            //             console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
                            //             return video
                            //         }
                            //     }
                            // }
                            // }
                        }

                        return null;
                    } catch (error) {
                        console.error('[VideoFixingObserver-Browser] Error finding participant video:', error)
                        return null
                    }
                }

                async function updateParticipantVideoMapping() {
                    try {
                        const participantsList = document.querySelector("[aria-label='Participants']")
                        console.log(`[VideoFixingObserver-Browser] Participants list: ${participantsList}`)
                        if (!participantsList) return

                        const screenSharingActive = !!document.querySelector('.dzMPxf .z1gyye')
                        console.log(`[VideoFixingObserver-Browser] Screen sharing active: ${screenSharingActive}`)
                        if (!screenSharingActive) {
                            return
                        }

                        const participantItems = participantsList.querySelectorAll('[role="listitem"]')
                        console.log(`[VideoFixingObserver-Browser] Participant items: ${participantItems.length}`)

                        participantVideoMap.clear()

                        for (const item of participantItems) {
                            const ariaLabel = item.getAttribute('aria-label')?.trim()
                            if (ariaLabel) {
                                const videoElement = findParticipantVideoElement(ariaLabel)
                                console.log(`[VideoFixingObserver-Browser] Video element: ${videoElement}`)
                                if (videoElement) {
                                    participantVideoMap.set(ariaLabel, videoElement)
                                    await addFixedVideoClass(this.page, videoElement)
                                    // console.log(`[VideoFixingObserver-Browser] Mapped ${ariaLabel} to video element`)
                                }
                            }
                        }
                    } catch (error) {
                        console.error('[VideoFixingObserver-Browser] Error updating participant video mapping:', error)
                    }
                }

                function handleMutations() {
                    if (mutationTimeout !== null) {
                        clearTimeout(mutationTimeout)
                    }

                    mutationTimeout = setTimeout(() => {
                        console.log('[VideoFixingObserver-Browser] Processing mutations - updating video mapping')
                        updateParticipantVideoMapping()
                        mutationTimeout = null
                    }, mutationDebounce)
                }

                MUTATION_OBSERVER = new MutationObserver(handleMutations)

                MUTATION_OBSERVER.observe(document, {
                    attributes: true,
                    characterData: false,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['class', 'aria-label', 'src']
                })

                periodicCheck = setInterval(() => {
                    if (document.visibilityState !== 'hidden') {
                        updateParticipantVideoMapping()
                    }
                }, checkInterval)

                    ; (window as any).videoFixingObserverCleanup = () => {
                        console.log('[VideoFixingObserver-Browser] Cleaning up observer')
                        if (MUTATION_OBSERVER) {
                            MUTATION_OBSERVER.disconnect()
                        }
                        if (mutationTimeout) {
                            clearTimeout(mutationTimeout)
                        }
                        if (periodicCheck) {
                            clearInterval(periodicCheck)
                        }
                        participantVideoMap.clear()
                    }

                    ; (window as any).getParticipantVideoElement = (participantName: string) => {
                        return participantVideoMap.get(participantName) || findParticipantVideoElement(participantName)
                    }

                updateParticipantVideoMapping()
                console.log('[VideoFixingObserver-Browser] Video fixing observer setup complete')
            },
            {
                mutationDebounce: this.MUTATION_DEBOUNCE,
                checkInterval: this.CHECK_INTERVAL
            }
        )

        this.isObserving = true
        console.log('[VideoFixingObserver] ✅ Observer started successfully')
    }

    /**
     * Para a observação
     */
    public stopObserving(): void {
        if (!this.isObserving) {
            return
        }

        console.log('[VideoFixingObserver] Stopping observation...')

        this.page
            ?.evaluate(() => {
                if ((window as any).videoFixingObserverCleanup) {
                    ; (window as any).videoFixingObserverCleanup()
                }
            })
            .catch((e) => console.error('[VideoFixingObserver] Error cleaning up:', e))

        this.currentSpeakers.clear()
        this.participantVideoElements.clear()
        this.isObserving = false
        console.log('[VideoFixingObserver] ✅ Observer stopped')
    }

    /**
     * Processa mudanças no estado dos speakers
     */
    private async handleSpeakersChange(speakers: SpeakerData[]): Promise<void> {
        try {
            console.log(`[VideoFixingObserver] Processing speakers change: ${speakers.length} speakers`)

            const screenSharingActive = await isScreenSharingActive(this.page)

            if (!screenSharingActive) {
                console.log('[VideoFixingObserver] Screen sharing not active, removing fixed classes')
                await removeAllFixedVideoClasses(this.page)
                this.currentSpeakers.clear()
                return
            }

            console.log('[VideoFixingObserver] Screen sharing detected, processing video fixing')

            const someoneSpeaking = speakers.find(speaker => speaker.isSpeaking)

            console.log(`[VideoFixingObserver] Participant speaking: ${someoneSpeaking?.name} - ${someoneSpeaking?.id}`)

            try {
                if (someoneSpeaking?.name) {
                    console.log('[VideoFixingObserver] Applying fixed class to video elements')
                    await this.applyFixedClassToVideos(someoneSpeaking?.name)
                } else {
                    console.log('[VideoFixingObserver] Removing fixed class from all video elements')
                    await removeAllFixedVideoClasses(this.page)
                }
            } catch (classError) {
                console.error('[VideoFixingObserver] Error applying/removing fixed classes:', classError)
            }

        } catch (error) {
            console.error('[VideoFixingObserver] Error handling speakers change:', error)
        }
    }

    private async applyFixedClassToVideos(participantName: string): Promise<void> {
        // function findParticipantVideoElement(participantName: string): Element | null {
        //     try {
        //         const participantsList = document.querySelectorAll('div[data-participant-id]');
        //         console.log(`[VideoFixingObserver-Browser] Participants list number: ${participantsList.length}`)
        //         if (!participantsList) return null

        //         for (const item of participantsList) {
        //             const spans = item.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
        //             console.log(`[VideoFixingObserver-Browser] Spans number: ${spans.length}`)
        //             for (const span of spans) {
        //                 console.log(`[VideoFixingObserver-Browser] USER NAME Span: ${span?.textContent?.trim()}`)
        //                 if (span.textContent?.trim() === participantName) {
        //                     console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
        //                     return item
        //                 }
        //             }
        //             // const participant = Array.from(spans).find(span => span.textContent?.trim() === participantName)
        //             // if (participant) {
        //             //     return item
        //             // const allVideos = document.querySelectorAll('video')

        //             // for (const video of allVideos) {
        //             //     const container = video.closest('[data-participant-id]')
        //             //     if (container) {
        //             //         const participantId = (item as HTMLElement).dataset.participantId
        //             //         const videoParticipantId = container.getAttribute('data-participant-id')

        //             //         if (participantId === videoParticipantId) {
        //             //             console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
        //             //             return video
        //             //         }
        //             //     }
        //             // }
        //             // }
        //         }

        //         return null;
        //     } catch (error) {
        //         console.error('[VideoFixingObserver-Browser] Error finding participant video:', error)
        //         return null
        //     }
        // }


        try {
            const screenSharingActive = await isScreenSharingActive(this.page)
            console.log(`[VideoFixingObserver-Browser] Screen sharing active: ${screenSharingActive}`)
            if (!screenSharingActive) {
                return
            }
            await fixingParticipantVideoElement(this.page, participantName)

            // const videoElement = findParticipantVideoElement(participantName)
            // console.log(`[VideoFixingObserver-Browser] Video element: ${videoElement}`)
            // if (videoElement) {
            //     await addFixedVideoClass(this.page, videoElement)
            //     console.log(`[VideoFixingObserver-Browser] Mapped ${participantName} to video element`)
            // }
        } catch (error) {
            console.error('[VideoFixingObserver-Browser] Error updating participant video mapping:', error)
        }

    }

    // private async applyFixedClassToVideos(participantName: string, participantId: string): Promise<void> {
    //     try {
    //         console.log(`[VideoFixingObserver] Starting to apply fixed classes to participant ${participantName}`)

    //         const result = await this.page.evaluate(
    //             function (params) {
    //                 const { name, id } = params;
    //                 try {
    //                     // function findParticipantVideoElement(participantName: string, partId: string): Record<string, any> {
    //                     //     const result: Record<string, any> = {}
    //                     //     try {
    //                     //         let itemParticipant = null;
    //                     //         // if (partId) {
    //                     //         const participantsList = document.querySelectorAll('.dkjMxf');
    //                     //         if (!participantsList) {
    //                     //             result.success = false
    //                     //             result.message = 'No participants list found'
    //                     //             return result
    //                     //         }

    //                     //         const participants: Record<string, any>[] = [{ participants: participantsList.length }];
    //                     //         for (const item of participantsList) {
    //                     //             const dataParticipant = item.querySelector('[data-participant-id]')
    //                     //             const dataParticipantId = dataParticipant?.getAttribute('data-participant-id')
    //                     //             itemParticipant = dataParticipantId;
    //                     //             if (dataParticipantId === partId) {
    //                     //                 dataParticipant?.classList.add('fixed-speaker-video')
    //                     //                 result.success = true
    //                     //                 result.message = 'Participant found with data-participant-id'
    //                     //                 result.videoElement = dataParticipant
    //                     //                 return result
    //                     //             }
    //                     //             participants.push({
    //                     //                 dataParticipantId: dataParticipantId,
    //                     //                 success: false,
    //                     //                 partId



    //                     //             })
    //                     //         }



    //                     //         // const allVideos = document.querySelectorAll('video')

    //                     //         let videoResult: Record<string, any> = {}
    //                     //         // let count = 0
    //                     //         // let videosLength = allVideos.length

    //                     //         // for (const video of allVideos) {
    //                     //         //     const container = video.closest('[data-participant-id]')
    //                     //         //     if (!container) {
    //                     //         //         videoResult.container.success = false
    //                     //         //         videoResult.container.message = 'No container found from video element for participant ' + participantName
    //                     //         //         continue
    //                     //         //     }
    //                     //         //     const participantId = itemParticipant ? (itemParticipant as HTMLElement)?.dataset?.participantId : ''
    //                     //         //     const videoParticipantId = container.getAttribute('data-participant-id')

    //                     //         //     // if (![participantId, partId].includes(videoParticipantId)) {
    //                     //         //     if (['spaces/o-eCC678VFMB/devices/337', 'spaces/o-eCC678VFMB/devices/338', 'spaces/o-eCC678VFMB/devices/339', 'spaces/o-eCC678VFMB/devices/340',].includes(videoParticipantId)) {
    //                     //         //         videoResult.success = true
    //                     //         //         videoResult.message = 'Video found for participant ' + participantName
    //                     //         //         videoResult.videoElement = video
    //                     //         //         return videoResult
    //                     //         //     }
    //                     //         //     videoResult[participantName + ' - ' + count] = {
    //                     //         //         success: false,
    //                     //         //         message: 'No video element found for participant ' + participantName,
    //                     //         //         participantItem: itemParticipant,
    //                     //         //         participantId: participantId,
    //                     //         //         videoParticipantId: videoParticipantId,
    //                     //         //         partId: partId,
    //                     //         //         videosLength: videosLength
    //                     //         //     }
    //                     //         //     count++
    //                     //         //     continue
    //                     //         // }

    //                     //         return { success: false, message: 'No video element found for participant ' + participantName, participant: itemParticipant, videoResult: videoResult, participants }
    //                     //     } catch (error) {
    //                     //         console.error('[VideoFixingObserver-Browser] Error finding participant video:', error)
    //                     //         return { success: false, message: 'Error finding participant video: ' + error }
    //                     //     }
    //                     // }
    //                     function findParticipantVideoElement(participantName: string): Element | null {
    //                         try {
    //                             const participantsList = document.querySelectorAll('div[data-participant-id]');
    //                             console.log(`[VideoFixingObserver-Browser] Participants list: ${participantsList}`)
    //                             if (!participantsList) return null

    //                             for (const item of participantsList) {
    //                                 const spans = item.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
    //                                 console.log(`[VideoFixingObserver-Browser] Spans: ${spans.length}`)
    //                                 for (const span of spans) {
    //                                     console.log(`[VideoFixingObserver-Browser] Span: ${span?.textContent?.trim()}`)
    //                                     if (span.textContent?.trim() === participantName) {
    //                                         console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
    //                                         return item
    //                                     }
    //                                 }
    //                             }

    //                             return null
    //                         } catch (error) {
    //                             console.error('[VideoFixingObserver-Browser] Error finding participant video:', error)
    //                             return null
    //                         }
    //                     }

    //                     const styleElement = document.getElementById('fixed-speaker-video-style')
    //                     if (!styleElement) {
    //                         console.error('[VideoFixingObserver-Browser] CSS style not found! Cannot apply fixed classes.')
    //                         return { success: false, error: 'CSS style not injected' }
    //                     }

    //                     const result: Record<string, any> = findParticipantVideoElement(name)
    //                     // if (!result?.success) {
    //                     //     return result
    //                     // }


    //                     // const videoElement = result.videoElement
    //                     const videoElement = result
    //                     if (videoElement && !videoElement.classList.contains('fixed-speaker-video')) {
    //                         videoElement.classList.add('fixed-speaker-video')
    //                         console.log(`[VideoFixingObserver-Browser] Adding fixed class to video element for participant ${participantName}`)
    //                         return { success: true, message: 'Fixed class ADDED to video element' }
    //                     } else if (videoElement) {
    //                         videoElement.classList.remove('fixed-speaker-video')
    //                         console.log(`[VideoFixingObserver-Browser] Removing fixed class from video element for participant ${participantName}`)
    //                         return { success: true, message: 'Fixed class REMOVED from video element' }
    //                     }

    //                     return { success: true, message: 'No video element found for participant ' + name, videoResult: result }

    //                 } catch (videoError) {
    //                     console.error(`[VideoFixingObserver-Browser] Error processing video: ${videoError instanceof Error ? videoError.message : String(videoError)}`)
    //                 }
    //                 return { success: true }
    //             }, { name: participantName, id: participantId })

    //         console.log('[VideoFixingObserver] Result: ', result)
    //     } catch (error) {
    //         console.error('[VideoFixingObserver] Error in applyFixedClassToVideos: ', error)
    //     }
    // }

    // private findParticipantVideoElement(participantName: string): Element | null {
    //     try {
    //         const participantsList = document.querySelectorAll('div[data-participant-id]');
    //         if (!participantsList) return null

    //         for (const item of participantsList) {
    //             const spans = item.querySelectorAll('.XEazBc .notranslate, .urlhDe .notranslate');
    //             const participant = Array.from(spans).find(span => span.textContent?.trim() === participantName)
    //             if (participant) {
    //                 const allVideos = document.querySelectorAll('video')

    //                 for (const video of allVideos) {
    //                     const container = video.closest('[data-participant-id]')
    //                     if (container) {
    //                         const participantId = (item as HTMLElement).dataset.participantId
    //                         const videoParticipantId = container.getAttribute('data-participant-id')

    //                         if (participantId === videoParticipantId) {
    //                             console.log(`[VideoFixingObserver-Browser] Found video for participant ${participantName}`)
    //                             return video
    //                         }
    //                     }
    //                 }
    //             }
    //         }

    //         return null;
    //     } catch (error) {
    //         console.error('[VideoFixingObserver-Browser] Error finding participant video:', error)
    //         return null
    //     }
    // }
    /**
     * Método público para ser chamado quando há mudanças nos speakers
     * Este método deve ser chamado pelo MeetSpeakersObserver
     */
    public async onSpeakersChanged(speakers: SpeakerData[]): Promise<void> {
        await this.handleSpeakersChange(speakers)
    }
}
