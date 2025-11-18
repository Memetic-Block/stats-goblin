import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OpenSearchService } from '../opensearch/opensearch.service'
import {
  TopSearchResult,
  PopularDocument,
  EventsByAction,
  SearchStatsResponse,
  UbiQuery
} from './interfaces/analytics.interface'
import { SubmitQueryDto } from './dto/submit-query.dto'
import { SubmitQueriesBatchDto } from './dto/submit-queries-batch.dto'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('AnalyticsService')
  private readonly CLIENT_ID_REGEX = /^[a-zA-Z0-9-]+@\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?@[0-9a-f-]{36}$/

  constructor(
    private readonly openSearchService: OpenSearchService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Get top searches from UBI queries index
   */
  async getTopSearches(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<TopSearchResult[]> {
    const result = await this.openSearchService.queryUbiQueries({
      body: {
        size: 0,
        query: {
          range: {
            timestamp: {
              gte: startDate,
              lte: endDate
            }
          }
        },
        aggs: {
          top_queries: {
            terms: {
              field: 'user_query.keyword',
              size: limit
            },
            aggs: {
              unique_users: {
                cardinality: {
                  field: 'client_id.keyword'
                }
              }
            }
          }
        }
      }
    })

    return (result.body.aggregations as any).top_queries.buckets.map(
      (bucket: any) => ({
        query: bucket.key,
        count: bucket.doc_count,
        uniqueUsers: bucket.unique_users.value
      })
    )
  }

  /**
   * Get popular documents from UBI events (click events)
   */
  async getPopularDocuments(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<PopularDocument[]> {
    const result = await this.openSearchService.queryUbiEvents({
      body: {
        size: 0,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startDate,
                    lte: endDate
                  }
                }
              },
              {
                term: {
                  action_name: 'click'
                }
              }
            ]
          }
        },
        aggs: {
          popular_docs: {
            terms: {
              field: 'event_attributes.object.object_id.keyword',
              size: limit
            },
            aggs: {
              unique_users: {
                cardinality: {
                  field: 'client_id.keyword'
                }
              }
            }
          }
        }
      }
    })

    return (result.body.aggregations as any).popular_docs.buckets.map(
      (bucket: any) => ({
        documentId: bucket.key,
        clickCount: bucket.doc_count,
        uniqueUsers: bucket.unique_users.value
      })
    )
  }

  /**
   * Get events grouped by action type
   */
  async getEventsByAction(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<EventsByAction[]> {
    const result = await this.openSearchService.queryUbiEvents({
      body: {
        size: 0,
        query: {
          range: {
            timestamp: {
              gte: startDate,
              lte: endDate
            }
          }
        },
        aggs: {
          actions: {
            terms: {
              field: 'action_name.keyword',
              size: limit
            }
          }
        }
      }
    })

    return (result.body.aggregations as any).actions.buckets.map(
      (bucket: any) => ({
        action: bucket.key,
        count: bucket.doc_count
      })
    )
  }

  /**
   * Get overall statistics from UBI data
   */
  async getStats(
    startDate: string,
    endDate: string
  ): Promise<SearchStatsResponse> {
    const [queriesResult, eventsResult] = await Promise.all([
      this.openSearchService.queryUbiQueries({
        body: {
          size: 0,
          query: {
            range: {
              timestamp: {
                gte: startDate,
                lte: endDate
              }
            }
          },
          aggs: {
            total_queries: {
              value_count: {
                field: 'query_id.keyword'
              }
            },
            unique_queries: {
              cardinality: {
                field: 'user_query.keyword'
              }
            },
            unique_users: {
              cardinality: {
                field: 'client_id.keyword'
              }
            }
          }
        }
      }),
      this.openSearchService.queryUbiEvents({
        body: {
          size: 0,
          query: {
            range: {
              timestamp: {
                gte: startDate,
                lte: endDate
              }
            }
          },
          aggs: {
            total_events: {
              value_count: {
                field: 'query_id.keyword'
              }
            },
            top_actions: {
              terms: {
                field: 'action_name.keyword',
                size: 5
              }
            }
          }
        }
      })
    ])

    const queriesAggs = queriesResult.body.aggregations as any
    const eventsAggs = eventsResult.body.aggregations as any

    return {
      totalQueries: queriesAggs.total_queries.value,
      uniqueQueries: queriesAggs.unique_queries.value,
      totalEvents: eventsAggs.total_events.value,
      uniqueUsers: queriesAggs.unique_users.value,
      topActions: eventsAggs.top_actions.buckets.map((bucket: any) => ({
        action: bucket.key,
        count: bucket.doc_count
      }))
    }
  }

  /**
   * Submit a single query to UBI (fire-and-forget)
   * Validation and indexing happen asynchronously
   */
  submitQuery(dto: SubmitQueryDto): void {
    setImmediate(async () => {
      try {
        // Validate required fields
        if (!dto.user_query || !dto.query_id || !dto.client_id || !dto.application) {
          this.logger.debug(
            `Missing required fields - query_id: ${dto.query_id}, client_id: ${dto.client_id}, application: ${dto.application}, has_user_query: ${!!dto.user_query}`
          )
          return
        }

        // Validate application against allowed list
        const allowedApplications = this.configService.get<string[]>('app.analytics.allowedApplications', [])
        if (!allowedApplications.includes(dto.application)) {
          this.logger.debug(
            `Invalid application - query_id: ${dto.query_id}, application: ${dto.application}`
          )
          return
        }

        // Validate client_id format (log warning but continue)
        if (!this.CLIENT_ID_REGEX.test(dto.client_id)) {
          this.logger.debug(
            `Invalid client_id format - query_id: ${dto.query_id}, client_id: ${dto.client_id}`
          )
        }

        // Generate UTC timestamp if missing
        const timestamp = dto.timestamp || new Date().toISOString()

        // Transform to UbiQuery
        const ubiQuery: UbiQuery = {
          application: dto.application,
          query_id: dto.query_id,
          client_id: dto.client_id,
          user_query: dto.user_query,
          timestamp,
          ...(dto.query_attributes && { query_attributes: dto.query_attributes }),
          ...(dto.object_id_field && { object_id_field: dto.object_id_field }),
          ...(dto.query_response_id && { query_response_id: dto.query_response_id }),
          ...(dto.query_response_hit_ids && { query_response_hit_ids: dto.query_response_hit_ids })
        }

        // Index the query
        await this.openSearchService.indexQuery(ubiQuery)
      } catch (error: any) {
        this.logger.error(
          `Error processing query submission - query_id: ${dto.query_id}, error: ${error.message}`
        )
      }
    })
  }

  /**
   * Submit multiple queries in batch to UBI (fire-and-forget)
   * Validates all queries first, then bulk indexes valid ones
   */
  submitQueriesBatch(dto: SubmitQueriesBatchDto): void {
    setImmediate(async () => {
      try {
        const allowedApplications = this.configService.get<string[]>('app.analytics.allowedApplications', [])
        const bulkChunkSize = this.configService.get<number>('app.analytics.bulkChunkSize', 20)
        const validQueries: UbiQuery[] = []

        // Validate each query and collect valid ones
        for (const queryDto of dto.queries) {
          // Check required fields
          if (!queryDto.user_query || !queryDto.query_id || !queryDto.client_id || !queryDto.application) {
            this.logger.debug(
              `Skipping query with missing fields - query_id: ${queryDto.query_id}`
            )
            continue
          }

          // Validate application
          if (!allowedApplications.includes(queryDto.application)) {
            this.logger.debug(
              `Skipping query with invalid application - query_id: ${queryDto.query_id}, application: ${queryDto.application}`
            )
            continue
          }

          // Validate client_id format (log but continue)
          if (!this.CLIENT_ID_REGEX.test(queryDto.client_id)) {
            this.logger.debug(
              `Invalid client_id format in batch - query_id: ${queryDto.query_id}, client_id: ${queryDto.client_id}`
            )
          }

          // Generate UTC timestamp if missing
          const timestamp = queryDto.timestamp || new Date().toISOString()

          // Transform to UbiQuery
          const ubiQuery: UbiQuery = {
            application: queryDto.application,
            query_id: queryDto.query_id,
            client_id: queryDto.client_id,
            user_query: queryDto.user_query,
            timestamp,
            ...(queryDto.query_attributes && { query_attributes: queryDto.query_attributes }),
            ...(queryDto.object_id_field && { object_id_field: queryDto.object_id_field }),
            ...(queryDto.query_response_id && { query_response_id: queryDto.query_response_id }),
            ...(queryDto.query_response_hit_ids && { query_response_hit_ids: queryDto.query_response_hit_ids })
          }

          validQueries.push(ubiQuery)
        }

        // Log warning if no valid queries found
        if (validQueries.length === 0) {
          this.logger.warn(
            `Batch submission resulted in 0 valid queries out of ${dto.queries.length} submitted`
          )
          return
        }

        // Bulk index valid queries
        await this.openSearchService.bulkIndexQueries(validQueries, bulkChunkSize)
        
        this.logger.debug(
          `Batch processed: ${validQueries.length} valid queries out of ${dto.queries.length} submitted`
        )
      } catch (error: any) {
        this.logger.error(
          `Error processing batch submission: ${error.message}`
        )
      }
    })
  }
}
