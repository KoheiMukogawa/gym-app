import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

/**
 * 内容に合わせて高さが伸びる入力欄。1行に収まらない長さでも全文が見え、改行もできる。
 * iOSはフォーカス時に16px未満の入力欄で画面を拡大するため、文字サイズは index.css で16px以上に揃えている。
 */
export function AutoGrowTextarea({
  value,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 一度 auto に戻さないと、文字を消したときに高さが縮まない
    el.style.height = 'auto'
    // box-sizing: border-box では height に枠線も含まれる。scrollHeight は枠線を
    // 含まないため、足しておかないと最終行がわずかに隠れる。
    const style = getComputedStyle(el)
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
    el.style.height = `${el.scrollHeight + border}px`
  }, [value])
  return <textarea ref={ref} rows={1} value={value} className={`resize-none overflow-hidden ${className}`} {...props} />
}
