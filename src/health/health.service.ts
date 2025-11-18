import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from 'redis'
import { OpenSearchService } from '../opensearch/opensearch.service'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  services: {
    redis: ServiceStatus
    opensearch: ServiceStatus
  }
}

export interface ServiceStatus {
  status: 'up' | 'down'
  message?: string
  details?: any
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)

  constructor(
    private readonly openSearchService: OpenSearchService,
    private readonly configService: ConfigService
  ) {}

  async checkHealth(): Promise<HealthStatus> {
    const [redis, opensearch] = await Promise.all([
      this.checkRedis(),
      this.checkOpenSearch()
    ])

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (redis.status === 'down' && opensearch.status === 'down') {
      overallStatus = 'unhealthy'
    } else if (redis.status === 'down' || opensearch.status === 'down') {
      overallStatus = 'degraded'
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        redis,
        opensearch
      }
    }
  }

  async checkRedis(): Promise<ServiceStatus> {
    try {
      const redisClient = createClient({
        socket: {
          host: this.configService.get('redis.host'),
          port: this.configService.get('redis.port')
        }
      })

      await redisClient.connect()
      await redisClient.ping()
      
      // Get info about sessions
      const keys = await redisClient.keys('sess:*')
      await redisClient.quit()

      return {
        status: 'up',
        details: {
          sessionCount: keys.length,
          type: 'session-store'
        }
      }
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`)
      return {
        status: 'down',
        message: error.message
      }
    }
  }

  async checkOpenSearch(): Promise<ServiceStatus> {
    try {
      const client = this.openSearchService.getClient()
      const health = await client.cluster.health()
      
      // Check if UBI plugin is installed
      const ubiInstalled = await this.openSearchService.checkUbiPlugin()

      return {
        status: 'up',
        details: {
          clusterName: health.body.cluster_name,
          clusterStatus: health.body.status,
          numberOfNodes: health.body.number_of_nodes,
          activeShards: health.body.active_shards,
          ubiPluginInstalled: ubiInstalled
        }
      }
    } catch (error) {
      this.logger.error(`OpenSearch health check failed: ${error.message}`)
      return {
        status: 'down',
        message: error.message
      }
    }
  }
}
