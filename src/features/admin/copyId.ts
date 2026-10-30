/** 画面ID・ボタンIDをクリップボードに写す。使えない環境（古いブラウザー・権限なし）では選択してコピーする方法に切り替える。 */
export async function copyId(id: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(id)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = id
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
    }
  }
}
