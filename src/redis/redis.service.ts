import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const mode = this.configService.get('redis.mode', 'standalone')

    if (mode === 'sentinel') {
      const sentinels = this.configService.get('redis.sentinels', [])
      const masterName = this.configService.get('redis.masterName', 'mymaster')

      this.client = new Redis({
        sentinels,
        name: masterName,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000)
          return delay
        }
      })

      this.logger.log(`Connected to Redis Sentinel: ${masterName}`)
    } else {
      const host = this.configService.get('redis.host', 'localhost')
      const port = this.configService.get('redis.port', 6379)

      this.client = new Redis({
        host,
        port,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000)
          return delay
        }
      })

      this.logger.log(`Connected to Redis: ${host}:${port}`)
    }

    this.client.on('error', (err) => {
      this.logger.error('Redis error:', err)
    })
  }

  async onModuleDestroy() {
    await this.client.quit()
    this.logger.log('Redis connection closed')
  }

  getClient(): Redis {
    return this.client
  }

  /**
   * Check if Redis is healthy and responsive
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch (error) {
      this.logger.error('Redis health check failed:', error)
      return false
    }
  }

  /**
   * Store session ID with TTL (default 24 hours)
   */
  async storeSession(sessionId: string, ttlSeconds: number = 86400): Promise<void> {
    await this.client.setex(`session:${sessionId}`, ttlSeconds, '1')
  }

  /**
   * Check if session ID is valid
   */
  async isValidSession(sessionId: string): Promise<boolean> {
    const exists = await this.client.exists(`session:${sessionId}`)
    return exists === 1
  }

  /**
   * Extend session TTL (refresh on activity)
   */
  async refreshSession(sessionId: string, ttlSeconds: number = 86400): Promise<void> {
    await this.client.expire(`session:${sessionId}`, ttlSeconds)
  }

  /**
   * Invalidate/delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`)
  }

  /**
   * Store wallet address associated with session (optional)
   */
  async storeWalletForSession(sessionId: string, walletAddress: string, ttlSeconds: number = 86400): Promise<void> {
    await this.client.setex(`session:wallet:${sessionId}`, ttlSeconds, walletAddress)
  }

  /**
   * Get wallet address for session (returns null if not set)
   */
  async getWalletForSession(sessionId: string): Promise<string | null> {
    return await this.client.get(`session:wallet:${sessionId}`)
  }

  /**
   * Delete wallet association for session
   */
  async deleteWalletForSession(sessionId: string): Promise<void> {
    await this.client.del(`session:wallet:${sessionId}`)
  }
}
