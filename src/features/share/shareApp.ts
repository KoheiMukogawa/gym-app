import { absoluteUrl } from '../../lib/site'
import { copyId } from '../admin/copyId'

/**
 * 友達に送る紹介ページのリンク。utm_source を付けるので、このリンクから登録した人は
 * 利用状況の「登録のきっかけ」に share として数えられる（attribution.ts）。
 */
export const SHARE_URL = `${absoluteUrl('/')}?utm_source=share`

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** 端末の共有シート（LINE・メッセージなど）で送る。共有シートがないPCなどではリンクをコピーする */
export async function shareApp(): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      // 文章は付けない。Macの「コピー」などはURLの直後に文章をつなげ、貼るとURLが壊れるため。
      // 送った先の見出しと画像は紹介ページのOGPから出る
      await navigator.share({ title: 'Glog', url: SHARE_URL })
      return 'shared'
    } catch (e) {
      // 共有シートを閉じただけなら何もしない。それ以外の失敗はコピーに切り替える
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyId(SHARE_URL)) ? 'copied' : 'failed'
}
