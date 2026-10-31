/**
 * 紹介ページのスマホの中で動かす、見本のアプリ（/demo を iframe で開く）。
 * 本物の画面をそのまま使うので、アプリの見た目を直せば紹介ページも同じになる。
 * データはサーバーに取りに行かず、ある利用者の DEMO_TODAY 時点の記録を返す（src/demo/）。
 * このファイルは main.tsx の最初に読み込み、時計を止めてから他のモジュールを動かす。
 */
export const DEMO_PATH = '/demo'
export const IS_DEMO = typeof window !== 'undefined' && window.location.pathname === DEMO_PATH
export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3e0'
/** 見本のBIG3の種目のID（紹介ページから種目のグラフを開くのに使う） */
export const DEMO_EXERCISES = { squat: 'demo-squat', bench: 'demo-bench', deadlift: 'demo-deadlift' } as const
/** 見本の「今日」。ベンチプレス・デッドリフトなどを記録した、その月で一番内容の多い日にしておく */
export const DEMO_TODAY = '2026-10-27'
/** 見本の「今」。記録した日の夜にしておく */
export const DEMO_NOW = `${DEMO_TODAY}T20:00:00+09:00`

// iframe の中だけで時計を止める（進み方はそのまま）。紹介ページ側の時計は変わらない
if (IS_DEMO) {
  const RealDate = Date
  const offset = RealDate.parse(DEMO_NOW) - RealDate.now()
  // Date() を関数として呼んだとき・引数ありの new Date(...) も本物と同じに振る舞わせる
  const DemoDate = function (this: unknown, ...args: unknown[]) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString()
    return Reflect.construct(RealDate, args.length ? args : [RealDate.now() + offset], new.target)
  } as unknown as DateConstructor & { now: () => number }
  Object.setPrototypeOf(DemoDate, RealDate)
  Object.defineProperty(DemoDate, 'prototype', { value: RealDate.prototype })
  DemoDate.now = () => RealDate.now() + offset
  globalThis.Date = DemoDate

  // 端末の保存場所も iframe の中だけのものにする（紹介ページと同じ保存場所を共有しないため。
  // 見本で記録した下書きや設定は、ページを閉じれば消える）
  const memory = new Map<string, string>()
  const storage: Storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, String(value)) },
    removeItem: (key) => { memory.delete(key) },
    clear: () => memory.clear(),
    key: (index) => [...memory.keys()][index] ?? null,
    get length() { return memory.size },
  }
  try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }) } catch { /* 差し替えられないブラウザーではそのまま */ }

  // 記録画面は、その日まだやっていないスクワットを選んだところから見せる
  // （ダイヤルで1セット、一覧で2セット足して、一覧の表が3行になる）
  storage.setItem(`glog:log-input-mode:${DEMO_USER_ID}`, 'dial')
  storage.setItem(`gym-app.draft.${DEMO_USER_ID}`, JSON.stringify({
    state: { currentExerciseId: DEMO_EXERCISES.squat, weight_kg: 130, reps: 5, sets: [] },
    workoutId: null, status: {}, userId: DEMO_USER_ID, date: new Date().toLocaleDateString('sv-SE'),
  }))

  // 見本の中ではスクロールバーを出さない（縮めて表示するので、太く目立つ）
  const style = document.createElement('style')
  style.textContent = 'html, * { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }'
  document.head.appendChild(style)
}

/** 紹介ページから見本の画面を切り替える（postMessage で送る）。mode があれば記録の入れ方も変える。
 * chapter は紹介ページの説明。切り替えた後にその説明の操作を流す（src/demo/director.ts） */
export type DemoNavigateMessage = { type: 'glog-demo-navigate'; path: string; mode?: 'dial' | 'list'; chapter?: string }
/** 説明の中でどこまでスクロールしたか（0〜1） */
export type DemoProgressMessage = { type: 'glog-demo-progress'; chapter: string; progress: number }
export const isDemoProgressMessage = (data: unknown): data is DemoProgressMessage =>
  typeof data === 'object' && data !== null && (data as DemoProgressMessage).type === 'glog-demo-progress'
    && typeof (data as DemoProgressMessage).chapter === 'string' && typeof (data as DemoProgressMessage).progress === 'number'
export const isDemoNavigateMessage = (data: unknown): data is DemoNavigateMessage =>
  typeof data === 'object' && data !== null && (data as DemoNavigateMessage).type === 'glog-demo-navigate'
    && typeof (data as DemoNavigateMessage).path === 'string' && (data as DemoNavigateMessage).path.startsWith('/')

/** 見本のアプリが画面の切り替えを受け取れるようになった知らせ（iframe から紹介ページへ） */
export const DEMO_READY = { type: 'glog-demo-ready' } as const
export const isDemoReadyMessage = (data: unknown) =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === DEMO_READY.type
