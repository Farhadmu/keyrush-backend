import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  // Ephemeral in-memory store fallback when Redis is not deployed
  private memoryCache: Map<string, { value: string; expiresAt?: number }> = new Map();

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;

    if (redisUrl || redisHost) {
      try {
        const options = redisUrl
          ? redisUrl
          : {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD || undefined,
              maxRetriesPerRequest: 1,
              retryStrategy: (times: number) => {
                if (times > 3) {
                  this.logger.warn('[Redis] Connection unsuccessful, running in memory-cached fallback mode.');
                  return null; // Stop retrying and remain in memory fallback
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
          // Log only once as warning, avoid crashing the process
          this.logger.warn(`[Redis Notice] ${err.message} - fallback active.`);
        });
      } catch (err: any) {
        this.logger.warn(`[Redis Initialization] ${err.message} - fallback active.`);
      }
    } else {
      this.logger.log('[Redis] No REDIS_URL/REDIS_HOST provided. Operating in high-performance in-memory mode.');
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
        // Fall through to memoryCache
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
        // Fall through to memoryCache
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryCache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (e) {}
    }
    this.memoryCache.delete(key);
  }
}
