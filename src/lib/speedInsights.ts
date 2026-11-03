import type { SpeedInsights } from '@vercel/speed-insights/react'
import type { ComponentProps } from 'react'

type BeforeSend = NonNullable<ComponentProps<typeof SpeedInsights>['beforeSend']>
type VitalEvent = Parameters<BeforeSend>[0]

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** /history/<workout id> → /history/:id. Speed Insights groups the measurements by this route. */
export function routeOf(pathname: string): string {
  return pathname.split('/').map((part) => (ID.test(part) ? ':id' : part)).join('/') || '/'
}

/**
 * 表示の速さ（Core Web Vitals）だけを Vercel に送る。記録や体重のIDを含まないよう、
 * URLはIDを :id に置き換え、クエリ（?date= など）と # 以降を落とす。
 */
export const beforeSend: BeforeSend = (event: VitalEvent) => {
  const url = new URL(event.url, window.location.origin)
  const route = routeOf(url.pathname)
  return { ...event, url: url.origin + route, route }
}
