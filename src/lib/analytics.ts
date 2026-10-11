// Client-side events, only for what the database cannot see: visits and actions before
// sign-up. Workouts, sets, PRs and retention are counted from the tables themselves
// (see docs/growth-architecture.md), so they are deliberately not sent from here.
//
// No vendor is wired yet. setAnalyticsSink() is the single hook to connect one later.
export type AnalyticsEvent =
  | { name: 'landing_view' }
  | { name: 'calculator_used'; calculator: '1rm' | 'dots' }
  | { name: 'signup_started'; source: string | null }
  | { name: 'signup_completed'; source: string | null }
  | { name: 'share_opened'; target: string }
  | { name: 'share_completed'; target: string }
  | { name: 'app_install_prompt_viewed' }

type Sink = (event: AnalyticsEvent) => void

let sink: Sink | null = import.meta.env.DEV ? (event) => console.debug('[analytics]', event) : null

export function setAnalyticsSink(next: Sink | null): void {
  sink = next
}

export function track(event: AnalyticsEvent): void {
  try {
    sink?.(event)
  } catch {
    // Measurement must never break the app.
  }
}
