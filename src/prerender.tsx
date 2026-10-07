// Build-time entry (vite build --ssr). scripts/prerender.mjs renders each public page to static
// HTML so search engines and AI crawlers that do not run JavaScript still read the content.
// Nothing here may import Supabase: the pages must render without a session.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { PublicPageContent } from './features/tools/PublicPages'
import { PUBLIC_PAGES, structuredData, type PublicPage } from './features/tools/pages'
import { absoluteUrl, SITE_URL } from './lib/site'

export { PUBLIC_PAGES, SITE_URL }

export function renderPage(path: string): string {
  return renderToString(<StaticRouter location={path}><PublicPageContent path={path} signedIn={false} /></StaticRouter>)
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Head tags for one page. JSON-LD escapes "<" so content can never close the script tag. */
export function headTags(page: PublicPage): string {
  const url = absoluteUrl(page.path)
  const title = escapeAttr(page.title)
  const description = escapeAttr(page.description)
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    ...structuredData(page).map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ')
}
