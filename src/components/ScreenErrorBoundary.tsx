import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'

type Props = { children: ReactNode }
type State = { error: Error | null }

// A failed lazy import otherwise unmounts the entire app. Keep recovery local
// to each screen so the shell and the recording draft remain available.
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Glog screen failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <section role="alert" className="mx-auto max-w-lg space-y-4 px-5 py-10">
      <p className="text-3xl font-bold tracking-tight">Glog</p>
      <h1 className="text-lg font-semibold">画面を表示できませんでした</h1>
      <p className="text-sm leading-relaxed text-muted">通信状況をご確認のうえ、再読み込みしてください。アプリの更新直後にも起こることがあります。</p>
      <Button onClick={() => window.location.reload()}>再読み込み</Button>
      <p className="text-xs text-muted">再読み込みすると、保存前の入力は失われる場合があります。</p>
    </section>
  }
}
