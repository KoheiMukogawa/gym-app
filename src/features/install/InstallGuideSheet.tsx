import { useState, type ReactNode } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { hasInstallPrompt, promptInstall, type InstallEnv } from './installEnv'

// The iPhone share icon: a square with an arrow out of the top.
function ShareIcon() {
  return <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-[-4px] text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="共有">
    <path d="M12 3v12M8 7l4-4 4 4" /><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
}

function Steps({ items }: { items: ReactNode[] }) {
  return <ol className="space-y-3">{items.map((item, index) => <li key={index} className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{index + 1}</span>
    <span className="min-w-0 pt-0.5">{item}</span>
  </li>)}</ol>
}

// On iPhone the home screen app keeps its own sign-in, separate from the browser.
const openAndSignIn = <>ホーム画面の<strong>Glogのアイコン</strong>から開きます。ログイン画面が出たら、同じメールアドレスでログインしてください</>
const addSteps = (where: ReactNode) => [
  <>{where}の共有ボタン <ShareIcon /> をタップ<span className="mt-1 block text-xs text-muted">見当たらないときは「…」をタップすると出てきます</span></>,
  <>メニューの下のほうにある<strong>「ホーム画面に追加」</strong>を選び、右上の<strong>「追加」</strong>をタップ</>,
  openAndSignIn,
]

function Body({ env, onAdded }: { env: InstallEnv; onAdded: () => void }) {
  const [copied, setCopied] = useState(false)
  const [installing, setInstalling] = useState(false)
  if (env === 'ios-safari') return <Steps items={addSteps('画面の下（または上）')} />
  if (env === 'ios-other') return <>
    <Steps items={addSteps('アドレスバー')} />
    <p className="text-xs leading-relaxed text-muted">見つからないときは、Safariでこのページを開いてから追加してください。</p>
  </>
  if (env === 'line' || env === 'in-app') {
    const url = window.location.origin + '/login'
    return <>
      <p className="text-sm leading-relaxed">このアプリの中の画面からは追加できません。まず<strong>Safari</strong>（Androidではいつものブラウザー）で開いてください。</p>
      {env === 'line'
        // LINE opens links with this parameter in the phone's default browser.
        ? <a href={url + '?openExternalBrowser=1'} className="flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-4 font-semibold text-white">ブラウザーで開く</a>
        : <p className="text-sm leading-relaxed text-muted">画面の「…」メニューから「ブラウザで開く」や「Safariで開く」を選んでください。</p>}
      <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => undefined) }}>
        {copied ? 'コピーしました' : 'URLをコピー'}
      </Button>
      <p className="text-xs leading-relaxed text-muted">開いたらログインし、メニューの「ホーム画面に追加」から手順を確認できます。</p>
    </>
  }
  // Android
  return <>
    {hasInstallPrompt() && <Button disabled={installing} onClick={() => { setInstalling(true); void promptInstall().then((added) => { if (added) onAdded() }).finally(() => setInstalling(false)) }}>ホーム画面に追加</Button>}
    {hasInstallPrompt() && <p className="text-xs text-muted">うまくいかないときは、次の手順で追加できます。</p>}
    <Steps items={[
      <>右上のメニュー（︙）から<strong>「ホーム画面に追加」</strong>または<strong>「アプリをインストール」</strong>を選ぶ</>,
      <>ホーム画面の<strong>Glogのアイコン</strong>から開きます</>,
    ]} />
  </>
}

export function InstallGuideSheet({ env, onClose }: { env: InstallEnv; onClose: () => void }) {
  return <BottomSheet title="ホーム画面に追加しましょう" description="アイコンから1タップで開けて、ジムですぐ記録を始められます。" onDismiss={onClose}>
    <div className="space-y-4 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <Body env={env} onAdded={onClose} />
      <Button variant="ghost" onClick={onClose}>あとで</Button>
    </div>
  </BottomSheet>
}
