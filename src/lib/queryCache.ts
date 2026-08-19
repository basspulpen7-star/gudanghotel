/**
 * Lightweight Client-Side In-Memory Cache for Supabase Free Tier Optimization
 * Features:
 * - Time-To-Live (TTL) expiry per query key
 * - Concurrent In-flight Request Deduplication (prevents cache stampede)
 * - Key & Prefix Invalidation
 * - Dev-mode Supabase Request Monitoring
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

let totalNetworkRequests = 0;
let totalCacheHits = 0;

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
   * Fetch with cache and in-flight request deduplication:
   * 1. Returns cached data if fresh
   * 2. If already in-flight, reuses the pending Promise
   * 3. Otherwise executes fetcher, caches result, and resolves all waiters
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
        totalCacheHits++;
        if (import.meta.env.DEV) {
          console.log(`%c[SUPABASE CACHE HIT]%c ${key} (Total Hits: ${totalCacheHits})`, 'color: #10B981; font-weight: bold;', 'color: inherit;');
        }
        return cached;
      }
    }

    // Check if an identical request is already in flight (Request Deduplication)
    if (inFlightRequests.has(key)) {
      if (import.meta.env.DEV) {
        console.log(`%c[SUPABASE IN-FLIGHT JOIN]%c ${key}`, 'color: #3B82F6; font-weight: bold;', 'color: inherit;');
      }
      return inFlightRequests.get(key) as Promise<T>;
    }

    // Execute network request
    const promise = (async () => {
      try {
        totalNetworkRequests++;
        if (import.meta.env.DEV) {
          console.log(`%c[SUPABASE NETWORK CALL]%c ${key} (Total Requests: ${totalNetworkRequests})`, 'color: #F59E0B; font-weight: bold;', 'color: inherit;');
        }
        const freshData = await fetcher();
        this.set<T>(key, freshData, ttlMs);
        return freshData;
      } finally {
        inFlightRequests.delete(key);
      }
    })();

    inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Invalidate specific cache key or prefix pattern, or all if omitted
   */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
      this.clear();
      return;
    }

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
    inFlightRequests.clear();
  }

  /**
   * Get stats for debugging and performance monitoring
   */
  getStats() {
    const totalCalls = totalCacheHits + totalNetworkRequests;
    const hitRate = totalCalls > 0 ? ((totalCacheHits / totalCalls) * 100).toFixed(1) : '0.0';
    return {
      cachedEntries: memoryCache.size,
      cachedKeysCount: memoryCache.size,
      inFlightRequests: inFlightRequests.size,
      totalHits: totalCacheHits,
      totalNetworkRequests,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Persistent cache in localStorage for static/master data with TTL
   */
  getPersistent<T>(key: string): T | null {
    try {
      const stored = localStorage.getItem(`gudang_alia_cache_${key}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp > parsed.ttlMs) {
        localStorage.removeItem(`gudang_alia_cache_${key}`);
        return null;
      }
      return parsed.data as T;
    } catch {
      return null;
    }
  }

  setPersistent<T>(key: string, data: T, ttlMs: number = 300000): void {
    try {
      localStorage.setItem(`gudang_alia_cache_${key}`, JSON.stringify({
        data,
        timestamp: Date.now(),
        ttlMs
      }));
    } catch {
      // Ignore quota errors
    }
  }
}

export const queryCache = new QueryCache();

