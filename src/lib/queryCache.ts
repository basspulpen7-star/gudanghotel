/**
 * Lightweight Client-Side In-Memory Cache for Supabase Free Tier Optimization
 * Reduces duplicate requests, eliminates refetching on navigation, and saves quota.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export class QueryCache {
  /**
   * Get cached data if it exists and has not expired
   */
  get<T>(key: string): T | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttlMs;
    if (isExpired) {
      memoryCache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with a specified TTL in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs
    });
  }

  /**
   * Fetch with cache: returns cached data if available, otherwise executes fetcher and caches result
   */
  async fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 60000,
    forceRefresh: boolean = false
  ): Promise<T> {
    if (!forceRefresh) {
      const cached = this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    const freshData = await fetcher();
    this.set<T>(key, freshData, ttlMs);
    return freshData;
  }

  /**
   * Invalidate specific cache key or prefix pattern
   */
  invalidate(keyOrPrefix: string): void {
    if (memoryCache.has(keyOrPrefix)) {
      memoryCache.delete(keyOrPrefix);
      return;
    }

    for (const key of memoryCache.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        memoryCache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    memoryCache.clear();
  }
}

export const queryCache = new QueryCache();
