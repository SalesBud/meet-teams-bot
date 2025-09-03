import { Page } from '@playwright/test'
import { SpeakerData } from '../../types'
import {
    isScreenSharingActive,
    removeAllFixedVideoClasses,
    fixingParticipantVideoElement,
} from './videoFixing'

export class ScreenSharingObserver {
    private page: Page
    private isObserving: boolean = false
    private checkInterval: number = 500 // Check every 0.5 second
    private intervalId: NodeJS.Timeout | null = null
    private lastScreenSharingState: boolean = false
    private onScreenSharingChange: (isActive: boolean) => void

    constructor(page: Page, onScreenSharingChange: (isActive: boolean) => void) {
        this.page = page
        this.onScreenSharingChange = onScreenSharingChange
    }

    public async startObserving(): Promise<void> {
        if (this.isObserving) {
            return
        }

        this.isObserving = true
        console.log('[ScreenSharingObserver] Starting screen sharing observation...')

        await this.checkScreenSharingState()

        this.intervalId = setInterval(async () => {
            await this.checkScreenSharingState()
        }, this.checkInterval)
    }

    public stopObserving(): void {
        if (!this.isObserving) {
            return
        }

        this.isObserving = false
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        console.log('[ScreenSharingObserver] Stopped observing')
    }

    private async checkScreenSharingState(): Promise<void> {
        try {
            const isActive = await isScreenSharingActive(this.page)
            
            if (isActive !== this.lastScreenSharingState) {
                console.log(`[ScreenSharingObserver] Screen sharing state changed: ${isActive}`)
                this.lastScreenSharingState = isActive
                this.onScreenSharingChange(isActive)
            }
        } catch (error) {
            this.stopObserving()
        }
    }
}

export class VideoFixingObserver {
    private page: Page
    private activeSpeakerName: string = ''
    private screenSharingObserver: ScreenSharingObserver

    constructor(page: Page) {
        this.page = page
        this.screenSharingObserver = new ScreenSharingObserver(page, this.handleScreenSharingChange.bind(this))
    }

    private async handleScreenSharingChange(isActive: boolean): Promise<void> {
        console.log('[VideoFixingObserver] Handling screen sharing change: ', isActive)
        if (isActive) {
            await this.handleSpeakersChange([], true)
        }
    }

    public async startObserving(): Promise<void> {
        await this.screenSharingObserver.startObserving()
    }

    public stopObserving(): void {
        this.screenSharingObserver.stopObserving()
    }

    private async handleSpeakersChange(speakers: SpeakerData[], screenSharingActive: boolean): Promise<void> {
        try {
            const someoneSpeaking = speakers.find(speaker => speaker.isSpeaking)
            let lastSpeakerName: string = ''
            if (someoneSpeaking?.name && someoneSpeaking?.name !== this.activeSpeakerName) {
                lastSpeakerName = this.activeSpeakerName
                this.activeSpeakerName = someoneSpeaking?.name;
            }

            if (!screenSharingActive) {
                await removeAllFixedVideoClasses(this.page)
                return
            }
            try {
                if (this.activeSpeakerName) {
                    await fixingParticipantVideoElement(this.page, this.activeSpeakerName, lastSpeakerName)
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
        if (!this.screenSharingObserver['isObserving']) {
            await this.startObserving()
        }

        const screenSharingStatus = await isScreenSharingActive(this.page)
        await this.handleSpeakersChange(speakers, screenSharingStatus)
    }
}
