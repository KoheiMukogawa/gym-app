import { CalculatorsPage } from './CalculatorsPage'
import { DotsPage } from './DotsPage'
import { OneRepMaxPage } from './OneRepMaxPage'

/** Path → page, shared by the app router and the build-time prerender. */
export function PublicPageContent({ path, signedIn }: { path: string; signedIn: boolean }) {
  switch (path) {
    case '/calculators': return <CalculatorsPage />
    case '/calculators/1rm': return <OneRepMaxPage signedIn={signedIn} />
    case '/calculators/dots': return <DotsPage signedIn={signedIn} />
    default: return null
  }
}
