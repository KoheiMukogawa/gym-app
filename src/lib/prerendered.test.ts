import { describe, expect, it } from 'vitest'
import { finishPrerenderHandOff, prerenderedField, prerenderedPath } from './prerendered'

describe('prerendered page hand-off', () => {
  it('reads what was typed into the static page until the app takes over', () => {
    document.body.innerHTML = '<div id="root" data-prerendered="/calculators/dots"><input name="total"><input type="radio" name="f" value="male" checked><input type="radio" name="f" value="female"></div>'
    const root = document.getElementById('root')!
    root.querySelector<HTMLInputElement>('input[name="total"]')!.value = '450'
    root.querySelector<HTMLInputElement>('input[value="female"]')!.checked = true
    expect(prerenderedPath()).toBe('/calculators/dots')
    expect(prerenderedField('total')).toBe('450')
    expect(prerenderedField('f')).toBe('female')
    expect(prerenderedField('missing')).toBe('')

    finishPrerenderHandOff()
    expect(prerenderedPath()).toBeNull()
    expect(prerenderedField('total')).toBe('')
  })
})
