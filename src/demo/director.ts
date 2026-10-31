// 紹介ページのスクロールに合わせて、見本のアプリ（/demo）を動かす。
// 画面のスクロールはページのスクロールと連動し、入力の説明では本物の部品を順に操作して見せる。
// 操作は画面の文字や読み上げ名で部品を探す（アプリの見た目を直しても、名前が同じなら動き続ける）。

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// 新しい説明に移ったら、前の説明の操作は途中でやめる
let run = 0
// 記録を足す操作は、ページを開いている間に1回だけ（戻ってくるたびにセットが増えないように）
const played = new Set<string>()
// 最後に受け取ったスクロールの位置。画面の読み込みより先に届いたときは、読み込み後にもう一度当てる
let last: { chapter: string; value: number } | null = null

async function find<T extends Element>(lookup: () => T | null | undefined, id: number, timeout = 4000): Promise<T | null> {
  for (let waited = 0; waited < timeout; waited += 100) {
    if (id !== run) return null
    const found = lookup()
    if (found) return found
    await sleep(100)
  }
  return null
}

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)
const byLabel = <T extends Element>(label: string) => document.querySelector<T>(`[aria-label="${label}"]`)

function key(target: Element, name: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
}

/** 空にしてから1文字ずつ打つ（Reactの入力欄にも届くように、値を書き換えてから input を送る） */
async function type(input: HTMLInputElement, text: string, id: number) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  if (input.value !== '') { setValue.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })) }
  for (const char of text) {
    if (id !== run) return
    setValue.call(input, input.value + char)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(160)
  }
}

/** 操作している指の位置を、半透明の丸で見せる */
function finger(x: number, y: number) {
  const dot = document.createElement('div')
  dot.setAttribute('aria-hidden', 'true')
  Object.assign(dot.style, {
    position: 'fixed', zIndex: '9999', width: '46px', height: '46px', marginLeft: '-23px', marginTop: '-23px', borderRadius: '50%',
    background: 'rgba(255,255,255,.28)', border: '2px solid rgba(255,255,255,.75)', boxShadow: '0 0 18px rgba(0,0,0,.4)',
    pointerEvents: 'none', transition: 'opacity 220ms ease, transform 220ms ease', left: `${x}px`, top: `${y}px`,
  })
  document.body.appendChild(dot)
  return {
    move(nx: number, ny: number) { dot.style.left = `${nx}px`; dot.style.top = `${ny}px` },
    async lift() { dot.style.opacity = '0'; dot.style.transform = 'scale(1.3)'; await sleep(240); dot.remove() },
  }
}

function pointer(target: Element, type: string, id: number, x: number, y: number) {
  target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }))
}

/** 回数のダイヤルを光る枠で囲み、「過去の記録から」と添える */
function highlight(target: Element, label: string) {
  const box = target.getBoundingClientRect()
  const ring = document.createElement('div')
  ring.setAttribute('aria-hidden', 'true')
  Object.assign(ring.style, {
    position: 'fixed', zIndex: '9998', left: `${box.left - 4}px`, top: `${box.top - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px`,
    borderRadius: '16px', border: '2px solid #E8412F', boxShadow: '0 0 24px rgba(232,65,47,.45)', pointerEvents: 'none', opacity: '0', transition: 'opacity 300ms ease',
  })
  const tag = document.createElement('div')
  tag.textContent = label
  Object.assign(tag.style, {
    position: 'absolute', left: '50%', top: '-14px', transform: 'translateX(-50%)', padding: '3px 10px', borderRadius: '999px',
    background: '#E8412F', color: '#fff', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
  })
  ring.appendChild(tag)
  document.body.appendChild(ring)
  requestAnimationFrame(() => { ring.style.opacity = '1' })
  return async () => { ring.style.opacity = '0'; await sleep(320); ring.remove() }
}

/** ダイヤルの説明：重量を回すと、過去の記録から計算した最大回数が回数のダイヤルに入る → セット完了 */
async function showDial(id: number) {
  const weight = await find(() => byLabel<HTMLElement>('重量'), id)
  const reps = byLabel<HTMLElement>('回数')
  if (!weight || !reps) return
  await sleep(600)
  const hide = highlight(reps, '過去の記録から')
  try {
    // 100kg → 120kg（2.5kg刻みで8段）。回数は 6 → 1 回へ自動で減る
    for (let i = 0; i < 8 && id === run; i++) { key(weight, 'ArrowUp'); await sleep(520) }
    await sleep(700)
    for (let i = 0; i < 6 && id === run; i++) { key(weight, 'ArrowDown'); await sleep(360) }
  } finally {
    await hide()
  }
  if (played.has('dial') || id !== run) return
  await sleep(500)
  played.add('dial')
  button('セット完了')?.click()
}

/** 一覧の説明：表が3行になるまで、行を足して重量と回数を1文字ずつ打つ */
async function showList(id: number) {
  if (played.has('list')) return
  const add = await find(() => button('セットを追加'), id)
  if (!add) return
  await sleep(600)
  played.add('list')
  const weights = () => [...document.querySelectorAll<HTMLInputElement>('input[aria-label$="セット目の重さ"]')]
  const typed = [['140', '3'], ['145', '2'], ['150', '1']]
  for (let turn = 0; turn < typed.length && weights().filter((input) => input.value !== '').length < 3 && id === run; turn++) {
    // 空いた行があればそこに、なければ行を足して打つ
    let empty = weights().find((input) => input.value === '')
    if (!empty) {
      const before = weights().length
      add.click()
      empty = (await find(() => (weights().length > before ? weights().at(-1) : null), id)) ?? undefined
    }
    if (!empty) return
    const row = weights().indexOf(empty) + 1
    await sleep(300)
    await type(empty, typed[turn][0], id)
    await sleep(200)
    const reps = byLabel<HTMLInputElement>(`${row}セット目の回数`)
    if (reps) await type(reps, typed[turn][1], id)
    await sleep(500)
  }
}

/** グラフの説明：全期間の成長曲線 → 2本指で最近に寄る → 点を押してその日の記録を出す */
async function showGraph(id: number) {
  const chart = await find(() => document.querySelector('[data-testid="trend-chart"]'), id)
  if (!chart) return
  // 最初から全期間の成長曲線が出ている（ExerciseTrendChart）。線を描き終えるまで見せる
  await sleep(2300)
  if (id !== run) return
  // 右端（最近）に寄せたまま、左の指だけを広げる（最近の数ヶ月が大きく出る）
  let box = chart.getBoundingClientRect()
  const cy = box.top + box.height * 0.5, right = box.right - 14, start = right - 40, end = box.left + box.width * 0.3
  const a = finger(start, cy), b = finger(right, cy)
  pointer(chart, 'pointerdown', 1, start, cy)
  pointer(chart, 'pointerdown', 2, right, cy)
  for (let step = 1; step <= 24 && id === run; step++) {
    const left = start + (end - start) * (step / 24)
    a.move(left, cy)
    pointer(chart, 'pointermove', 1, left, cy)
    pointer(chart, 'pointermove', 2, right, cy)
    await sleep(40)
  }
  const cx = (end + right) / 2
  pointer(chart, 'pointerup', 1, cx, cy)
  pointer(chart, 'pointerup', 2, cx, cy)
  await Promise.all([a.lift(), b.lift()])
  // 操作の直後のタップは日を選ばないので、少し待つ
  await sleep(1300)
  if (id !== run) return
  box = chart.getBoundingClientRect()
  const tx = box.left + box.width * 0.62, ty = box.top + box.height * 0.45
  const tap = finger(tx, ty)
  const surface = chart.querySelector('.recharts-wrapper') ?? chart
  // グラフは指の位置を次の描画で読むので、押す前に少し待つ
  for (const type of ['mousemove', 'mousedown', 'mouseup', 'click']) {
    surface.dispatchEvent(new MouseEvent(type, { clientX: tx, clientY: ty, bubbles: true, cancelable: true }))
    await sleep(60)
  }
  await sleep(200)
  await tap.lift()
  const details = await find(() => byLabel('選択日の種目の記録'), id, 2500)
  await sleep(400)
  if (id !== run) return
  ;(details ?? chart).scrollIntoView({ behavior: 'smooth', block: details ? 'center' : 'start' })
}

/** 説明に移ったとき（スマホの画面が切り替わった後）に1回流す操作 */
export async function play(chapter: string) {
  const id = ++run
  void sleep(700).then(() => { if (id === run && last?.chapter === chapter) progress(chapter, last.value) })
  if (chapter === 'dial') {
    await showDial(id)
  } else if (chapter === 'list') {
    await showList(id)
  } else if (chapter === 'graph') {
    await showGraph(id)
  } else if (chapter === 'export') {
    if (played.has('export')) return
    const create = await find(() => button('Markdownを作成'), id)
    if (!create) return
    await sleep(700)
    played.add('export')
    create.click()
  }
}

/** 説明の中でどこまでスクロールしたか（0〜1）。画面をその分だけ下へ送る */
export function progress(chapter: string, value: number) {
  last = { chapter, value }
  const eased = value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2
  if (chapter === 'ranking') {
    // 並べ方を順に切り替える（BIG3合計 → 今月の伸び → DOTS）
    const tab = value < 0.4 ? 'BIG3合計' : value < 0.7 ? '今月の伸び' : 'DOTS'
    const target = button(tab)
    if (target && target.getAttribute('aria-pressed') !== 'true') target.click()
    return
  }
  // グラフは操作を流して見せるので、スクロールでは動かさない
  if (!['big3', 'export', 'body', 'hero'].includes(chapter)) return
  const scroller = document.scrollingElement
  if (!scroller) return
  scroller.scrollTop = Math.max(0, scroller.scrollHeight - window.innerHeight) * eased
}

/** 画面を移るときは、前の操作を止めて一番上から見せる */
export function reset() {
  run++
  document.scrollingElement?.scrollTo(0, 0)
}
