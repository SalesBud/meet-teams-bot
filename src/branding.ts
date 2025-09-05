import { spawn } from 'child_process'

import { SoundContext, VideoContext } from './media_context'
import Logger from './utils/DatadogLogger'

export type BrandingHandle = {
    wait: Promise<void>
    kill: () => void
}

export function generateBranding(
    botname: string,
    custom_branding_path?: string,
): BrandingHandle {
    Logger.withFunctionName('generateBranding')
    try {
        const command = (() => {
            return spawn(
                './generate_custom_branding.sh',
                [custom_branding_path],
                { env: { ...process.env }, cwd: process.cwd() },
            )
        })()
        command.stderr.addListener('data', (data) => {
            Logger.info(data.toString())
        })

        return {
            wait: new Promise<void>((res) => {
                command.on('close', () => {
                    res()
                })
            }),
            kill: () => {
                command.kill()
            },
        }
    } catch (e) {
        Logger.error('fail to generate branding ', { error: e })
        return null
    }
}

export function playBranding() {
    Logger.withFunctionName('playBranding')
    try {
        new VideoContext(0)
        VideoContext.instance.default()
    } catch (e) {
        Logger.error('fail to play video branding ', { error: e })
    }
}
