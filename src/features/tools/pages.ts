import { absoluteUrl } from '../../lib/site'

// Every public, indexable page outside the app. The prerender step, the sitemap, the Vercel
// rewrites and the in-app routes all read this list, so a page cannot be half-published.
export type Faq = readonly (readonly [question: string, answer: string])[]

export type PublicPage = {
  path: string
  /** Value for <title>. Includes the brand. */
  title: string
  description: string
  /** Last time the content (not the code) changed. Shown on the page and in the sitemap. */
  updated: string
  breadcrumbs: readonly { name: string; path: string }[]
  faq?: Faq
  /** Present when the page is a usable tool (WebApplication structured data). */
  tool?: { name: string }
}

const HOME = { name: 'Glog', path: '/' }
const CALCULATORS = { name: '計算ツール', path: '/calculators' }

export const ONE_RM_FAQ: Faq = [
  ['推定1RMとは何ですか？', '1回だけ挙げられる最大重量（1RM）を、実際に挙げた重量と回数から推定した値です。最大重量に挑戦しなくても、今の筋力の目安や伸びを比べられます。'],
  ['どの計算式を使っていますか？', 'Brzycki式（1RM = 重量 × 36 ÷ (37 − 回数)）です。Glogアプリの記録・グラフ・ランキングも同じ式で計算しています。'],
  ['11回以上の記録で計算できないのはなぜですか？', '回数が多いほど推定の誤差が大きくなるためです。Glogでは1〜10回のセットだけを推定1RMに使っています。'],
  ['推定1RMは実際の1RMと同じですか？', '同じではありません。種目・フォーム・疲労・筋持久力の個人差で前後します。トレーニング重量を決める目安としてお使いください。'],
]

export const DOTS_FAQ: Faq = [
  ['DOTSとは何ですか？', '体重の違いを補正して、パワーリフティングの筋力を比べるためのスコアです。挙上重量 × 500 を体重の4次多項式で割って求めます。'],
  ['どの重量を入れればよいですか？', 'スクワット・ベンチプレス・デッドリフトの合計（トータル）を入れます。大会記録のほか、各種目の1RMや推定1RMの合計でも目安として使えます。'],
  ['体重が範囲外のときはどうなりますか？', '係数の有効範囲（男性用40〜210kg、女性用40〜150kg）に収めて計算します。Glogのランキングと同じ扱いです。'],
  ['レベルの目安は公式のものですか？', 'いいえ。DOTSに公式のレベル区分はありません。表示しているレベルはGlog独自の目安です。'],
]

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: '/calculators',
    title: '筋トレ計算ツール（1RM・DOTS）| Glog',
    description: '筋トレの重量と回数から推定1RMを、体重とBIG3トータルからDOTSスコアを無料で計算。計算式と根拠つき。',
    updated: '2026-10-07',
    breadcrumbs: [HOME, CALCULATORS],
  },
  {
    path: '/calculators/1rm',
    title: '1RM計算 — 重量と回数から最大挙上重量を推定 | Glog',
    description: '挙げた重量と回数（1〜10回）から推定1RMを計算。Brzycki式を使い、1RMの何%で何回挙がるかの換算表と体重比も表示します。無料・登録不要。',
    updated: '2026-10-07',
    breadcrumbs: [HOME, CALCULATORS, { name: '1RM計算', path: '/calculators/1rm' }],
    faq: ONE_RM_FAQ,
    tool: { name: '1RM計算' },
  },
  {
    path: '/calculators/dots',
    title: 'DOTS計算 — 体重とBIG3トータルからスコアを算出 | Glog',
    description: '性別・体重・BIG3トータルからDOTSスコアを計算し、スコアの目安を表示。OpenPowerliftingと同じ係数を使います。無料・登録不要。',
    updated: '2026-10-07',
    breadcrumbs: [HOME, CALCULATORS, { name: 'DOTS計算', path: '/calculators/dots' }],
    faq: DOTS_FAQ,
    tool: { name: 'DOTS計算' },
  },
]

export function publicPage(path: string): PublicPage | undefined {
  return PUBLIC_PAGES.find((page) => page.path === path)
}

/** Schema.org data that describes only what the page visibly shows. */
export function structuredData(page: PublicPage): object[] {
  const data: object[] = [{
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: page.breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, name: crumb.name, item: absoluteUrl(crumb.path),
    })),
  }]
  if (page.tool) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: page.tool.name,
      url: absoluteUrl(page.path),
      description: page.description,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Any',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
      dateModified: page.updated,
      publisher: { '@type': 'Organization', name: 'Glog', url: absoluteUrl('/') },
    })
  }
  if (page.faq) {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([question, answer]) => ({
        '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    })
  }
  return data
}
