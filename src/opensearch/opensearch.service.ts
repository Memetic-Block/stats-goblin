import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@opensearch-project/opensearch'

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name)
  private client: Client

  constructor(private configService: ConfigService) {
    const config = this.configService.get('opensearch')

    const clientConfig: any = {
      node: config.node
    }

    if (config.username && config.password) {
      clientConfig.auth = {
        username: config.username,
        password: config.password
      }
    }

    if (config.ssl) {
      clientConfig.ssl = config.ssl
    }

    this.client = new Client(clientConfig)
  }

  async onModuleInit() {
    try {
      const health = await this.client.cluster.health()
      this.logger.log(
        `Connected to OpenSearch cluster: ${health.body.cluster_name}`
      )
      
      // Check if UBI plugin is installed
      const ubiPluginInstalled = await this.checkUbiPlugin()
      if (ubiPluginInstalled) {
        this.logger.log('UBI plugin detected and ready')
      } else {
        this.logger.warn('UBI plugin not detected - please install the OpenSearch UBI plugin')
      }
    } catch (error) {
      this.logger.error('Failed to connect to OpenSearch', error)
    }
  }

  /**
   * Check if the UBI plugin is installed
   */
  async checkUbiPlugin(): Promise<boolean> {
    try {
      const response = await this.client.cat.plugins({ format: 'json' })
      const plugins = response.body as Array<{ component: string }>
      return plugins.some(p => p.component && p.component.includes('ubi'))
    } catch (error) {
      this.logger.error('Failed to check UBI plugin status', error)
      return false
    }
  }

  /**
   * Query the ubi_queries index
   */
  async queryUbiQueries(params: any) {
    return this.client.search({
      index: 'ubi_queries',
      ...params
    })
  }

  /**
   * Query the ubi_events index
   */
  async queryUbiEvents(params: any) {
    return this.client.search({
      index: 'ubi_events',
      ...params
    })
  }

  /**
   * Generic search method for custom queries
   */
  async search(params: any) {
    return this.client.search(params)
  }

  /**
   * Get the OpenSearch client for advanced operations
   */
  getClient(): Client {
    return this.client
  }

  /**
   * Check cluster health
   */
  async getClusterHealth() {
    return this.client.cluster.health()
  }
}
