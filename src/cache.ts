export class ExpiringCache<T> {
  private entries = new Map<string, { value: T; expires: number }>()
  constructor(private readonly capacity: number, private readonly ttl: number) {}
  get(key: string): T | undefined {
    const item = this.entries.get(key)
    if (!item) return
    this.entries.delete(key)
    if (item.expires <= Date.now()) return
    this.entries.set(key, item)
    return item.value
  }
  set(key: string, value: T): void {
    if (this.ttl <= 0) return
    this.entries.delete(key)
    this.entries.set(key, { value, expires: Date.now() + this.ttl })
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
  }
  clear(): void { this.entries.clear() }
}
