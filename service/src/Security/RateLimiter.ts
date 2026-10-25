interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process rate limiting, which is only correct because there is exactly one instance
 * (ADR-001 D2). It is a direct benefit of that decision: no Redis, no shared counter.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  public constructor(private readonly options: {max: number; windowMs: number}) {}

  public consume(key: string): boolean {
    const now = Date.now();

    if (this.buckets.size > 10_000) {
      this.sweep();
    }

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {count: 1, resetAt: now + this.options.windowMs});
      return true;
    }

    if (bucket.count >= this.options.max) {
      return false;
    }

    bucket.count += 1;

    return true;
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Expired buckets go, so the process does not keep every key it ever saw. */
  public sweep(): void {
    const now = Date.now();

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
