import { Page } from '@playwright/test'
import { SpeakerData } from '../../types'
import {
    isScreenSharingActive,
    removeAllFixedVideoClasses,
    fixingParticipantVideoElement,
} from './videoFixing'

export class VideoFixingObserver {
    private page: Page
    private isObserving: boolean = false
    private currentSpeakers: Map<string, boolean> = new Map()
    private participantVideoElements: Map<string, Element> = new Map()

    constructor(page: Page) {
        this.page = page
    }

    private async handleSpeakersChange(speakers: SpeakerData[]): Promise<void> {
        try {
            const screenSharingActive = await isScreenSharingActive(this.page)

            if (!screenSharingActive) {
                await removeAllFixedVideoClasses(this.page)
                this.currentSpeakers.clear()
                return
            }
            const someoneSpeaking = speakers.find(speaker => speaker.isSpeaking)
            try {
                if (someoneSpeaking?.name) {
                    await fixingParticipantVideoElement(this.page, someoneSpeaking?.name)
                } else {
                    await removeAllFixedVideoClasses(this.page)
                }
            } catch (classError) {
                console.error('[VideoFixingObserver] Error applying/removing fixed classes:', classError)
            }

        } catch (error) {
            console.error('[VideoFixingObserver] Error handling speakers change:', error)
        }
    }

    public async onSpeakersChanged(speakers: SpeakerData[]): Promise<void> {
        await this.handleSpeakersChange(speakers)
    }
}
