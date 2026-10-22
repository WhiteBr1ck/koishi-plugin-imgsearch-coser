export class SearchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'SearchError'
  }
}

export function userError(error: unknown): string {
  if (error instanceof SearchError) return error.message
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || (error as { code?: string }).code === 'ETIMEDOUT')) {
    return '搜索超时，请稍后重试。'
  }
  // Never expose request URLs, cookies, API keys or upstream response bodies.
  return '请求失败，请检查所选接口和 Koishi 网络代理配置后重试。'
}
