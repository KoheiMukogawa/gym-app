import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown'
import privacy from './privacy-policy.md?raw'
import terms from './terms-of-service.md?raw'

describe('parseMarkdown', () => {
  it('reads headings and keeps line breaks inside a paragraph', () => {
    expect(parseMarkdown('# 題\n\n## 第1条\n\nGlog運営事務局\n連絡先: a@example.com')).toEqual([
      { type: 'heading', level: 1, text: ['題'] },
      { type: 'heading', level: 2, text: ['第1条'] },
      { type: 'paragraph', lines: [['Glog運営事務局'], ['連絡先: a@example.com']] },
    ])
  })

  it('reads bold text inside a line', () => {
    expect(parseMarkdown('前 **太字** 後')).toEqual([
      { type: 'paragraph', lines: [['前 ', { bold: '太字' }, ' 後']] },
    ])
  })

  it('reads bulleted and numbered lists', () => {
    expect(parseMarkdown('- 一\n- **二**\n\n1. いち\n2. に')).toEqual([
      { type: 'list', ordered: false, items: [['一'], [{ bold: '二' }]] },
      { type: 'list', ordered: true, items: [['いち'], ['に']] },
    ])
  })

  it('reads a table without its separator row', () => {
    expect(parseMarkdown('| A | B |\n|---|---|\n| 1 | **2** |')).toEqual([
      { type: 'table', header: [['A'], ['B']], rows: [[['1'], [{ bold: '2' }]]] },
    ])
  })

  it('leaves no unfilled placeholders or raw markdown in the published texts', () => {
    for (const source of [privacy, terms]) {
      expect(source).not.toMatch(/【要/)
      const text = JSON.stringify(parseMarkdown(source))
      expect(text).not.toMatch(/\*\*|^#|\|---/)
      // A list or table written without a blank line before it would show up as plain paragraph text.
      for (const block of parseMarkdown(source)) {
        if (block.type !== 'paragraph') continue
        for (const line of block.lines) expect(String(line[0])).not.toMatch(/^(- |\d+\. |\|)/)
      }
    }
  })
})
