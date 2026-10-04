// A reader for the small Markdown subset the legal texts use: headings, paragraphs,
// lists, tables and bold. The texts are ours, so nothing here is HTML or user input.
export type Inline = string | { bold: string }
export type Block =
  | { type: 'heading'; level: 1 | 2; text: Inline[] }
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }

function inline(text: string): Inline[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((part) => part.startsWith('**') && part.endsWith('**') ? { bold: part.slice(2, -2) } : part)
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => inline(cell.trim()))
const BULLET = /^- /
const NUMBER = /^\d+\. /

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  // Blocks are separated by blank lines; each group is one heading, list, table or paragraph.
  for (const group of source.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = group.split('\n').filter((line) => line.trim() !== '')
    if (lines.length === 0) continue
    const first = lines[0]
    const heading = /^(#{1,2}) (.*)$/.exec(first)
    if (heading && lines.length === 1) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2, text: inline(heading[2]) })
    } else if (lines.every((line) => BULLET.test(line)) || lines.every((line) => NUMBER.test(line))) {
      const ordered = NUMBER.test(first)
      blocks.push({ type: 'list', ordered, items: lines.map((line) => inline(line.replace(ordered ? NUMBER : BULLET, ''))) })
    } else if (lines.every((line) => line.trim().startsWith('|'))) {
      const [header, , ...rows] = lines
      blocks.push({ type: 'table', header: cells(header), rows: rows.map(cells) })
    } else {
      blocks.push({ type: 'paragraph', lines: lines.map(inline) })
    }
  }
  return blocks
}
