import { describe, expect, it } from 'vitest'
import { buttonIdFor } from './buttonIds'

describe('button IDs', () => {
  it('keeps the same ID for an explicit action key and separates screens or repeated actions', () => {
    expect(buttonIdFor('REC-02', 'toggle-dial')).toBe(buttonIdFor('REC-02', ' TOGGLE-DIAL '))
    expect(buttonIdFor('REC-02', 'toggle-dial')).not.toBe(buttonIdFor('REC-01', 'toggle-dial'))
    expect(buttonIdFor('REC-02', 'retry', 2)).toBe(`${buttonIdFor('REC-02', 'retry')}-2`)
  })
})
