import { beforeEach, describe, expect, it } from 'vitest'
import { readFirstTouch, rememberFirstTouch, signupAttribution } from './attribution'

function at(url: string): Location {
  return new URL(url) as unknown as Location
}

describe('first-touch attribution', () => {
  beforeEach(() => localStorage.clear())

  it('keeps only the first page and an external referrer host', () => {
    rememberFirstTouch('calc-1rm', at('https://glog.example/calculators/1rm'), 'https://www.google.com/search?q=1rm')
    rememberFirstTouch('landing', at('https://glog.example/'), '')
    expect(readFirstTouch()).toMatchObject({ source: 'calc-1rm', path: '/calculators/1rm', referrer: 'www.google.com' })
  })

  it('prefers utm_source and drops same-site referrers', () => {
    rememberFirstTouch('landing', at('https://glog.example/?utm_source=x'), 'https://glog.example/calculators')
    expect(readFirstTouch()).toMatchObject({ source: 'x', referrer: null })
  })

  it('turns the touch into sign-up metadata, or nothing when absent', () => {
    expect(signupAttribution()).toEqual({})
    rememberFirstTouch('calc-dots', at('https://glog.example/calculators/dots'), '')
    expect(signupAttribution()).toEqual({ signup_source: 'calc-dots', signup_path: '/calculators/dots' })
  })
})
