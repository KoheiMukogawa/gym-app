import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { parseMarkdown, type Block, type Inline } from './markdown'
import privacy from './privacy-policy.md?raw'
import terms from './terms-of-service.md?raw'

function Text({ parts }: { parts: Inline[] }) {
  return <>{parts.map((part, i) => typeof part === 'string' ? part : <strong key={i} className="font-semibold text-fg">{part.bold}</strong>)}</>
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      return block.level === 1
        ? <h1 className="text-2xl font-semibold text-fg"><Text parts={block.text} /></h1>
        : <h2 className="pt-4 text-lg font-semibold text-fg"><Text parts={block.text} /></h2>
    case 'paragraph':
      return <p>{block.lines.map((line, i) => <span key={i}>{i > 0 && <br />}<Text parts={line} /></span>)}</p>
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return <List className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {block.items.map((item, i) => <li key={i}><Text parts={item} /></li>)}
      </List>
    }
    case 'table':
      // Tables scroll sideways on narrow phones instead of widening the page.
      return <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
          <thead><tr>{block.header.map((cell, i) => <th key={i} className="border-b border-border p-2 font-semibold text-fg"><Text parts={cell} /></th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className="border-b border-border p-2 align-top"><Text parts={cell} /></td>)}</tr>)}</tbody>
        </table>
      </div>
  }
}

function LegalPage({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return <main className="mx-auto max-w-lg px-6 pb-12">
    <Link to="/" aria-label="Glog トップへ" className="flex min-h-20 items-center text-3xl font-bold tracking-tight">Glog</Link>
    <article className="space-y-4 text-sm leading-relaxed text-muted">
      {blocks.map((block, i) => <BlockView key={i} block={block} />)}
    </article>
  </main>
}

export function PrivacyPage() { return <LegalPage source={privacy} /> }
export function TermsPage() { return <LegalPage source={terms} /> }
