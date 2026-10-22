import sharp from 'sharp'
import { h } from 'koishi'
import type { Session } from 'koishi'
import type { ImageInput } from './types'
import type { Network } from './network'
import { SearchError } from './errors'

export function imageSource(content: string | h[] | undefined): string | undefined {
  if (!content) return
  const element = h.select(typeof content === 'string' ? h.parse(content) : content, 'img')[0]
  return element?.attrs.src || element?.attrs.url
}

export function sessionImage(session: Session, argument?: string): string | undefined {
  return imageSource(argument) || imageSource(session.elements) || imageSource(session.content)
    || imageSource(session.quote?.elements) || imageSource(session.quote?.content)
    || (/^https?:\/\/\S+$/i.test(argument?.trim() || '') ? argument!.trim() : undefined)
}

export async function resolveSessionImage(session: Session, argument?: string): Promise<string | undefined> {
  const source = sessionImage(session, argument)
  if (source) return source
  const elements = session.elements?.length ? session.elements : h.parse(session.content || '')
  const quote = h.select(elements, 'quote')[0]
  const messageId = session.quote?.id || session.quote?.messageId || quote?.attrs.id
  if (!messageId || !session.channelId || typeof session.bot?.getMessage !== 'function') return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const message = await Promise.race([
      session.bot.getMessage(session.channelId, String(messageId)),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 5000) }),
    ])
    return imageSource(message?.elements) || imageSource(message?.content)
  } catch { return undefined }
  finally { clearTimeout(timer) }
}

export async function loadImage(source: string, network: Network, maxMB: number): Promise<ImageInput> {
  const limit = Math.floor(maxMB * 1024 * 1024)
  let data: Buffer
  let sourceUrl: string | undefined
  const inline = /^(?:data:image\/(?:png|jpe?g|webp|gif);base64,|base64:\/\/)([A-Za-z0-9+/=\r\n]+)$/i.exec(source)
  if (inline) {
    if (inline[1].length > Math.ceil(limit / 3) * 4 + 16) throw new SearchError('IMAGE_SIZE', `图片超过 ${maxMB} MB，请发送较小的图片。`)
    data = Buffer.from(inline[1], 'base64')
  } else {
    if (!/^https?:\/\//i.test(source)) throw new SearchError('IMAGE_TYPE', '无法读取这张图片，请直接发送图片或公开图片网址。')
    const response = await network.publicGet(source, limit)
    data = response.data
    sourceUrl = response.url
  }
  if (!data.length || data.length > limit) throw new SearchError('IMAGE_SIZE', `图片为空或超过 ${maxMB} MB，请重新发送。`)
  // Decode with a pixel limit. SVG input is rejected, preventing external-resource surprises.
  try {
    const metadata = await sharp(data, { limitInputPixels: 40_000_000, animated: false }).metadata()
    if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format || '')) throw new Error('format')
  } catch { throw new SearchError('IMAGE_TYPE', '图片格式无法读取或尺寸过大，请改用 JPEG、PNG 或 WebP 图片。') }
  return { data, sourceUrl }
}

export async function uploadImage(input: ImageInput): Promise<Buffer> {
  // The Image API accepts at most 500 KB. Reserve margin and strip metadata.
  for (const [size, quality] of [[1600, 82], [1280, 72], [960, 62], [640, 50]]) {
    const data = await sharp(input.data, { limitInputPixels: 40_000_000, animated: false })
      .rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
    if (data.length <= 490_000) return data
  }
  throw new SearchError('IMAGE_SIZE', '图片无法压缩到搜索接口要求的大小，请裁剪或缩小图片后重试。')
}
