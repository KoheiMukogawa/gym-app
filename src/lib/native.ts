import { SITE_URL } from './site'

// iPhoneアプリ版（Capacitor、`vite build --mode native`）のときだけ true。
// ビルド時に決まるので、Web版のバンドルからはアプリ版だけの分岐が消える。
export const IS_NATIVE = import.meta.env.MODE === 'native'

// メールのリンクなど、アプリの外で開くURLの起点。
// アプリ版の住所（capacitor://localhost）はSafariで開けないので、公開中のWeb版を使う。
export function linkOrigin(): string {
  return IS_NATIVE ? SITE_URL : window.location.origin
}
