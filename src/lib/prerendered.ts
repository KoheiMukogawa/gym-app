// A public page arrives as static HTML (scripts/prerender.mjs) inside #root[data-prerendered].
// main.tsx loads that page's code before the first render, so React replaces the static markup
// in one commit without a spinner in between. Until then the static page stays usable, and
// whatever was typed into it is picked up by the first render (prerenderedField).

function staticRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('#root[data-prerendered]')
}

export function prerenderedPath(): string | null {
  return staticRoot()?.dataset.prerendered ?? null
}

/** Called after the first commit: later renders must not read the app's own inputs. */
export function finishPrerenderHandOff(): void {
  staticRoot()?.removeAttribute('data-prerendered')
}

/** The value typed into the static page before the app started, or ''. */
export function prerenderedField(name: string): string {
  const root = staticRoot()
  if (!root) return ''
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input')].filter((input) => input.name === name)
  if (inputs.length === 0) return ''
  if (inputs[0].type === 'radio') return inputs.find((input) => input.checked)?.value ?? ''
  return inputs[0].value
}
