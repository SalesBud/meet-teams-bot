import { Page } from '@playwright/test'
import { SpeakerData } from '../../types'
import {
    isScreenSharingActive,
    removeAllFixedVideoClasses,
    fixingParticipantVideoElement,
} from './videoFixing'

export class VideoFixingObserver {
    private page: Page
    private lastSpeakerName: string = ''

    constructor(page: Page) {
        this.page = page
    }

    private async handleSpeakersChange(speakers: SpeakerData[]): Promise<void> {
        try {
            const someoneSpeaking = speakers.find(speaker => speaker.isSpeaking)
            if (someoneSpeaking?.name && someoneSpeaking?.name !== this.lastSpeakerName) {
                this.lastSpeakerName = someoneSpeaking?.name;
            }

            const screenSharingActive = await isScreenSharingActive(this.page)
            if (!screenSharingActive) {
                await removeAllFixedVideoClasses(this.page)
                return
            }
            try {
                if (this.lastSpeakerName) {
                    await fixingParticipantVideoElement(this.page, this.lastSpeakerName)
                } else {
                    await removeAllFixedVideoClasses(this.page)
                }
            } catch (classError) {
                console.warn('[VideoFixingObserver] Error applying/removing fixed classes: ', classError)
            }

        } catch (error) {
            console.warn('[VideoFixingObserver] Error handling speakers change: ', error)
        }
    }

    public async onSpeakersChanged(speakers: SpeakerData[]): Promise<void> {
        await this.handleSpeakersChange(speakers)
    }
}
