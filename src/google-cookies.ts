import { CookieJar } from 'tough-cookie'
import { isGoogleHost } from './platforms'

function allowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.port && !parsed.username && !parsed.password && isGoogleHost(parsed.hostname)
  } catch { return false }
}

/** One in-memory Google session per plugin instance. */
export class GoogleCookieStore {
  private readonly jar = new CookieJar()
  private closed = false

  constructor(header: string) {
    // A copied Cookie header lacks domain/path metadata. Seed Google-domain cookies;
    // __Host- cookies must remain host-only. Set-Cookie updates use their real scope.
    for (const pair of header.split(';')) {
      const index = pair.indexOf('=')
      if (index < 1) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n\0]/.test(value)) continue
      this.jar.setCookieSync(`${name}=${value}; Path=/; Secure${name.startsWith('__Host-') ? '' : '; Domain=google.com'}`,
        'https://www.google.com/', { ignoreError: true })
    }
  }

  header(url: string): string {
    return !this.closed && allowed(url) ? this.jar.getCookieStringSync(url) : ''
  }

  update(url: string, headers: Headers): number {
    if (this.closed || !allowed(url)) return 0
    let count = 0
    for (const raw of headers.getSetCookie?.() || []) {
      if (this.jar.setCookieSync(raw, url, { ignoreError: true })) count++
    }
    return count
  }

  clear() {
    this.closed = true
    this.jar.removeAllCookiesSync()
  }
}
