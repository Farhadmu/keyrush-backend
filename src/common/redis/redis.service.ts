import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  // Ephemeral in-memory store fallback ONLY for local development / single-instance testing
  private memoryCache: Map<string, { value: string; expiresAt?: number }> = new Map();
  private memoryHashes: Map<string, Map<string, string>> = new Map();
  private memorySets: Map<string, Set<string>> = new Map();

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const isProduction = process.env.NODE_ENV === 'production';

    if (redisUrl || redisHost) {
      try {
        const options = redisUrl
          ? redisUrl
          : {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD || undefined,
              maxRetriesPerRequest: 2,
              retryStrategy: (times: number) => {
                if (times > 3) {
                  if (isProduction) {
                    this.logger.error('CRITICAL: Redis connection failed in production! Application cannot continue.');
                    return null;
                  }
                  this.logger.warn('[Redis] Connection unsuccessful, running in memory-cached fallback mode for dev.');
                  return null;
                }
                return 1000;
              },
            };

        this.client = new Redis(options as any);

        this.client.on('connect', () => {
          this.isConnected = true;
          this.logger.log('✅ [Redis] Connected successfully to Redis cluster/instance.');
        });

        this.client.on('error', (err) => {
          this.isConnected = false;
          if (isProduction) {
            this.logger.error(`CRITICAL [Redis Production Error] ${err.message}`);
          } else {
            this.logger.warn(`[Redis Notice] ${err.message} - local dev fallback active.`);
          }
        });
      } catch (err: any) {
        if (isProduction) {
          throw new Error(`Production startup failed: Redis required but initialization failed: ${err.message}`);
        }
        this.logger.warn(`[Redis Initialization] ${err.message} - fallback active.`);
      }
    } else {
      if (isProduction) {
        throw new Error('Production startup failed: REDIS_URL or REDIS_HOST must be provided in production mode.');
      }
      this.logger.log('[Redis] No REDIS_URL/REDIS_HOST provided. Operating in high-performance in-memory mode for development.');
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  getStatus(): { connected: boolean; mode: 'REDIS_CLUSTER' | 'IN_MEMORY_FALLBACK' } {
    return {
      connected: this.isConnected,
      mode: this.isConnected ? 'REDIS_CLUSTER' : 'IN_MEMORY_FALLBACK',
    };
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const item = this.memoryCache.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }
    this.memoryCache.delete(key);
    this.memoryHashes.delete(key);
    this.memorySets.delete(key);
  }

  // -------------------------------------------------------------
  // Distributed Locks (SET NX EX)
  // -------------------------------------------------------------
  async acquireLock(lockKey: string, ttlMs: number = 5000): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        const result = await this.client.set(lockKey, 'LOCKED', 'PX', ttlMs, 'NX');
        return result === 'OK';
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    // In-memory atomic lock check
    const existing = this.memoryCache.get(lockKey);
    const now = Date.now();
    if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
      return false; // already locked
    }
    this.memoryCache.set(lockKey, { value: 'LOCKED', expiresAt: now + ttlMs });
    return true;
  }

  async releaseLock(lockKey: string): Promise<void> {
    await this.del(lockKey);
  }

  // -------------------------------------------------------------
  // Hash Operations (Room Participants & State)
  // -------------------------------------------------------------
  async hset(key: string, field: string, value: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.hset(key, field, value);
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    if (!this.memoryHashes.has(key)) {
      this.memoryHashes.set(key, new Map());
    }
    this.memoryHashes.get(key)!.set(field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.hget(key, field);
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const hash = this.memoryHashes.get(key);
    return hash ? hash.get(field) || null : null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.hgetall(key);
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const hash = this.memoryHashes.get(key);
    const result: Record<string, string> = {};
    if (hash) {
      hash.forEach((val, f) => {
        result[f] = val;
      });
    }
    return result;
  }

  async hdel(key: string, field: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.hdel(key, field);
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const hash = this.memoryHashes.get(key);
    if (hash) {
      hash.delete(field);
    }
  }

  // -------------------------------------------------------------
  // Set Operations (Active Room IDs)
  // -------------------------------------------------------------
  async sadd(key: string, member: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.sadd(key, member);
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    if (!this.memorySets.has(key)) {
      this.memorySets.set(key, new Set());
    }
    this.memorySets.get(key)!.add(member);
  }

  async srem(key: string, member: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.srem(key, member);
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const set = this.memorySets.get(key);
    if (set) {
      set.delete(member);
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.smembers(key);
      } catch (e) {
        if (process.env.NODE_ENV === 'production') throw e;
      }
    }

    const set = this.memorySets.get(key);
    return set ? Array.from(set) : [];
  }
}
