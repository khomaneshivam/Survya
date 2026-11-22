/**
 * Master Data Cache Service (O(1) In-Memory LRU Cache)
 * Caches compiled master dictionaries (list, byId, byCode) with 5-minute TTL.
 */

const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class MasterCacheService {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  _getKey(tenantId, masterType) {
    return `tenant:${tenantId}:${String(masterType).toLowerCase()}`;
  }

  get(tenantId, masterType) {
    const key = this._getKey(tenantId, masterType);
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Refresh LRU order (delete & re-set)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;
    return entry.data;
  }

  set(tenantId, masterType, data, ttlMs = CACHE_TTL_MS) {
    const key = this._getKey(tenantId, masterType);

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Evict oldest entry (first item in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now()
    });
  }

  invalidateTenantMasters(tenantId, masterType = null) {
    if (masterType) {
      const key = this._getKey(tenantId, masterType);
      this.cache.delete(key);
    } else {
      const prefix = `tenant:${tenantId}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_ENTRIES,
      ...this.stats
    };
  }
}

module.exports = new MasterCacheService();

