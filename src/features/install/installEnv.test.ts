import { describe, expect, it } from 'vitest'
import { canGuideInstall, detectInstallEnv } from './installEnv'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1'
const IPHONE_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0'
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

describe('detectInstallEnv', () => {
  it('tells iPhone browsers apart', () => {
    expect(detectInstallEnv(IPHONE_SAFARI, false)).toBe('ios-safari')
    expect(detectInstallEnv(IPHONE_CHROME, false)).toBe('ios-other')
    expect(detectInstallEnv(IPAD, false, 5)).toBe('ios-safari')
  })
  it('spots in-app browsers, where pages cannot be added', () => {
    expect(detectInstallEnv(IPHONE_LINE, false)).toBe('line')
    expect(detectInstallEnv(IPHONE_INSTAGRAM, false)).toBe('in-app')
  })
  it('knows Android and PCs', () => {
    expect(detectInstallEnv(ANDROID, false)).toBe('android')
    expect(detectInstallEnv(PC, false)).toBe('desktop')
    expect(detectInstallEnv(IPAD, false, 0)).toBe('desktop')
  })
  it('offers no guide from the home screen icon or on a PC', () => {
    expect(detectInstallEnv(IPHONE_SAFARI, true)).toBe('installed')
    expect(canGuideInstall('installed')).toBe(false)
    expect(canGuideInstall('desktop')).toBe(false)
    expect(canGuideInstall('line')).toBe(true)
  })
})
