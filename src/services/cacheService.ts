import { env } from "../config/env";
import { getRedisClient, isRedisConnected } from "../cache/redisClient";

interface CacheEntry {
  value: Buffer;
  expiresAt: number;
}

class InMemoryCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly store = new Map<string, CacheEntry>();

  constructor(ttlMs = 60_000, maxEntries = 1000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): Buffer | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: Buffer): void {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }
}

export class RenderCache {
  private readonly ttlSeconds: number;
  private readonly memoryCache: InMemoryCache;

  constructor(ttlSeconds = 60, maxEntries = 1000) {
    this.ttlSeconds = ttlSeconds;
    this.memoryCache = new InMemoryCache(ttlSeconds * 1000, maxEntries);
  }

  async get(key: string): Promise<Buffer | undefined> {
    if (env.REDIS_ENABLED && isRedisConnected()) {
      const redis = getRedisClient();
      if (redis) {
        try {
          const encoded = await redis.get(`map:${key}`);
          if (encoded) {
            return Buffer.from(encoded, "base64");
          }
        } catch (error) {
          console.error("Redis get failed, falling back to memory cache:", error);
        }
      }
    }

    return this.memoryCache.get(key);
  }

  async set(key: string, value: Buffer): Promise<void> {
    if (env.REDIS_ENABLED && isRedisConnected()) {
      const redis = getRedisClient();
      if (redis) {
        try {
          await redis.set(`map:${key}`, value.toString("base64"), { EX: this.ttlSeconds });
          return;
        } catch (error) {
          console.error("Redis set failed, falling back to memory cache:", error);
        }
      }
    }

    this.memoryCache.set(key, value);
  }

  getBackendName(): "redis" | "memory" {
    if (env.REDIS_ENABLED && isRedisConnected()) {
      return "redis";
    }

    return "memory";
  }
}

export const renderCache = new RenderCache();

export function createRenderCacheKey(params: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
}): string {
  return `${params.lat}|${params.lng}|${params.zoom}|${params.width}|${params.height}`;
}
