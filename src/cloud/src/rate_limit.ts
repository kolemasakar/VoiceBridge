export class FixedWindowRateLimiter {
  private readonly entries = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMilliseconds = 60000
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStartedAt >= this.windowMilliseconds) {
      this.entries.set(key, { count: 1, windowStartedAt: now });
      return true;
    }

    if (entry.count >= this.limit) {
      return false;
    }

    entry.count += 1;
    return true;
  }
}
