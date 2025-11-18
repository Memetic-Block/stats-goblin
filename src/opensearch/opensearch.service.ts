import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@opensearch-project/opensearch'
import { UbiQuery, UbiEvent } from '../analytics/interfaces/analytics.interface'

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

  /**
   * Index a single query document to ubi_queries
   * Uses create operation to prevent duplicates (409 conflicts are silently handled)
   */
  async indexQuery(document: UbiQuery): Promise<void> {
    try {
      await this.client.index({
        index: 'ubi_queries',
        id: document.query_id,
        body: document,
        refresh: false,
        op_type: 'create'
      })
    } catch (error: any) {
      // Silently handle duplicate query_id (409 conflict)
      if (error?.meta?.statusCode === 409) {
        this.logger.debug(
          `Duplicate query_id: ${document.query_id}, client_id: ${document.client_id}, application: ${document.application}`
        )
        return
      }
      
      // Log other errors with metadata only
      this.logger.error(
        `Failed to index query - query_id: ${document.query_id}, client_id: ${document.client_id}, application: ${document.application}, error: ${error.message}`
      )
    }
  }

  /**
   * Bulk index multiple query documents to ubi_queries
   * Processes documents in chunks to avoid OpenSearch bulk request size limits
   */
  async bulkIndexQueries(documents: UbiQuery[], chunkSize: number): Promise<void> {
    // Split documents into chunks
    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents.slice(i, i + chunkSize)
      
      try {
        // Build bulk operations
        const operations = chunk.flatMap(doc => [
          { create: { _index: 'ubi_queries', _id: doc.query_id } },
          doc
        ])

        const response = await this.client.bulk({
          body: operations,
          refresh: false
        })

        // Log errors from bulk response
        if (response.body.errors) {
          const erroredDocs = response.body.items
            .filter((item: any) => item.create?.error)
            .map((item: any) => ({
              query_id: item.create._id,
              error: item.create.error.reason || 'Unknown error'
            }))

          if (erroredDocs.length > 0) {
            this.logger.error(
              `Bulk indexing errors (chunk ${i / chunkSize + 1}): ${JSON.stringify(erroredDocs)}`
            )
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to bulk index chunk ${i / chunkSize + 1} (${chunk.length} documents): ${error.message}`
        )
      }
    }
  }

  /**
   * Index a single event document to ubi_events
   * Uses index operation (not create) as events can have duplicate action tracking
   */
  async indexEvent(document: UbiEvent): Promise<void> {
    try {
      await this.client.index({
        index: 'ubi_events',
        body: document,
        refresh: false
      })
    } catch (error: any) {
      // Log errors with metadata only
      this.logger.error(
        `Failed to index event - query_id: ${document.query_id}, action_name: ${document.action_name}, client_id: ${document.client_id}, error: ${error.message}`
      )
    }
  }

  /**
   * Bulk index multiple event documents to ubi_events
   * Processes documents in chunks to avoid OpenSearch bulk request size limits
   */
  async bulkIndexEvents(documents: UbiEvent[], chunkSize: number): Promise<void> {
    // Split documents into chunks
    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents.slice(i, i + chunkSize)
      
      try {
        // Build bulk operations (use index not create - events can be duplicate actions)
        const operations = chunk.flatMap(doc => [
          { index: { _index: 'ubi_events' } },
          doc
        ])

        const response = await this.client.bulk({
          body: operations,
          refresh: false
        })

        // Log errors from bulk response
        if (response.body.errors) {
          const erroredDocs = response.body.items
            .filter((item: any) => item.index?.error)
            .map((item: any) => ({
              error: item.index.error.reason || 'Unknown error'
            }))

          if (erroredDocs.length > 0) {
            this.logger.error(
              `Bulk event indexing errors (chunk ${i / chunkSize + 1}): ${JSON.stringify(erroredDocs)}`
            )
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to bulk index events chunk ${i / chunkSize + 1} (${chunk.length} documents): ${error.message}`
        )
      }
    }
  }
}
