import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OpenSearchService } from '../opensearch/opensearch.service'
import { RedisService } from '../redis/redis.service'
import {
  TopSearchResult,
  PopularDocument,
  EventsByAction,
  SearchStatsResponse,
  UbiQuery,
  UbiEvent
} from './interfaces/analytics.interface'
import { SubmitQueryDto } from './dto/submit-query.dto'
import { SubmitEventDto } from './dto/submit-event.dto'
import { SubmitAnalyticsBatchDto } from './dto/submit-analytics-batch.dto'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('AnalyticsService')
  private readonly CLIENT_ID_REGEX = /^[a-zA-Z0-9-]+@\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?@[0-9a-f-]{36}$/
  private readonly allowedApplications: string[]

  constructor(
    private readonly openSearchService: OpenSearchService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
  ) {
    this.allowedApplications = this.configService.get<string[]>('app.analytics.allowedApplications', [])
  }

  /**
   * Check if Redis is healthy and responsive
   * Used by controller to determine if batch can be accepted
   */
  async checkRedisHealth(): Promise<boolean> {
    return this.redisService.isHealthy()
  }

  /**
   * Validate that at least one session in the batch exists in Redis
   * Throws UnauthorizedException if all sessions are invalid/expired
   * Used for early validation before accepting batch
   */
  async validateSessionsInBatch(dto: SubmitAnalyticsBatchDto): Promise<void> {
    const queries = dto.queries || []
    const events = dto.events || []
    
    // Extract all unique client_ids from batch
    const clientIds = new Set<string>()
    queries.forEach(q => q.client_id && clientIds.add(q.client_id))
    events.forEach(e => e.client_id && clientIds.add(e.client_id))
    
    if (clientIds.size === 0) {
      // No client_ids provided, will fail validation later but don't block
      return
    }
    
    // Extract session IDs and validate at least one exists
    const sessionIds = Array.from(clientIds)
      .map(clientId => this.extractSessionId(clientId))
      .filter((sessionId): sessionId is string => sessionId !== null)
    
    if (sessionIds.length === 0) {
      // No valid session IDs could be extracted
      return
    }
    
    // Check if at least one session exists in Redis
    const validationResults = await Promise.all(
      sessionIds.map(sessionId => this.redisService.isValidSession(sessionId))
    )
    
    const hasAnyValidSession = validationResults.some(isValid => isValid)
    
    if (!hasAnyValidSession) {
      // All sessions are invalid/expired
      const { UnauthorizedException } = require('@nestjs/common')
      const { ErrorCode, ErrorAction } = require('../common/dto/error-response.dto')
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'All sessions in batch are invalid or expired',
        error: 'Unauthorized',
        errorCode: ErrorCode.EXPIRED_SESSION,
        action: ErrorAction.REQUEST_NEW_SESSION,
        retry: false
      })
    }
  }

  /**
   * Extract session ID from client_id format: 
   * - clientName@version@sessionId
   * - clientName@version@sessionId@walletAddress
   */
  private extractSessionId(clientId: string): string | null {
    const parts = clientId.split('@')
    // Session ID is always the 3rd part (index 2), regardless of wallet suffix
    return parts.length >= 3 ? parts[2] : null
  }

  /**
   * Validates and transforms a query DTO to UbiQuery format
   * Returns null if validation fails
   * Enriches with wallet address from Redis if user opted in
   */
  private async validateAndTransformQuery(dto: SubmitQueryDto): Promise<UbiQuery | null> {
    // Validate required fields
    if (!dto.user_query || !dto.query_id || !dto.client_id || !dto.application) {
      this.logger.debug(
        `Missing required fields - query_id: ${dto.query_id}, client_id: ${dto.client_id}, application: ${dto.application}, has_user_query: ${!!dto.user_query}`
      )
      return null
    }

    // Validate application against allowed list
    if (!this.allowedApplications.includes(dto.application)) {
      this.logger.debug(
        `Invalid application - query_id: ${dto.query_id}, application: ${dto.application}`
      )
      return null
    }

    // Validate client_id format (supports wallet suffix)
    // Standard: clientName@version@uuid
    // With wallet: clientName@version@uuid@walletPrefix
    const CLIENT_ID_REGEX = /^[a-zA-Z0-9-]+@\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?@[0-9a-f-]{36}(@[a-zA-Z0-9]+)?$/
    if (!CLIENT_ID_REGEX.test(dto.client_id)) {
      this.logger.warn(
        `Invalid client_id format - query_id: ${dto.query_id}, client_id: ${dto.client_id}`
      )
      return null
    }

    // Extract and validate session ID from client_id
    const sessionId = this.extractSessionId(dto.client_id)
    if (!sessionId) {
      this.logger.warn(
        `Could not extract session_id from client_id - query_id: ${dto.query_id}, client_id: ${dto.client_id}`
      )
      return null
    }

    // Validate session exists in Redis
    const isValid = await this.redisService.isValidSession(sessionId)
    if (!isValid) {
      this.logger.warn(
        `Invalid or expired session (not found in Redis) - query_id: ${dto.query_id}, session_id: ${sessionId}`
      )
      return null
    }

    // Check if user has wallet associated (opted in)
    const walletAddress = await this.redisService.getWalletForSession(sessionId)

    // Generate UTC timestamp if missing
    const timestamp = dto.timestamp || new Date().toISOString()

    // Build query attributes, merging wallet if available
    const queryAttributes = { ...(dto.query_attributes || {}) }
    if (walletAddress) {
      queryAttributes.wallet_address = walletAddress
      queryAttributes.wallet_opted_in = true
    }

    // Transform to UbiQuery
    return {
      application: dto.application,
      query_id: dto.query_id,
      client_id: dto.client_id,
      user_query: dto.user_query,
      timestamp,
      ...(Object.keys(queryAttributes).length > 0 && { query_attributes: queryAttributes }),
      ...(dto.object_id_field && { object_id_field: dto.object_id_field }),
      ...(dto.query_response_id && { query_response_id: dto.query_response_id }),
      ...(dto.query_response_hit_ids && { query_response_hit_ids: dto.query_response_hit_ids })
    }
  }

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
   * Validates and transforms an event DTO to UbiEvent format
   * Returns null if validation fails
   * Enriches with wallet address from Redis if user opted in
   */
  private async validateAndTransformEvent(dto: SubmitEventDto): Promise<UbiEvent | null> {
    // Validate required fields
    if (!dto.action_name || !dto.query_id || !dto.client_id) {
      this.logger.debug(
        `Missing required event fields - query_id: ${dto.query_id}, action_name: ${dto.action_name}, client_id: ${dto.client_id}`
      )
      return null
    }

    // Validate client_id format (supports wallet suffix)
    const CLIENT_ID_REGEX = /^[a-zA-Z0-9-]+@\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?@[0-9a-f-]{36}(@[a-zA-Z0-9]+)?$/
    if (!CLIENT_ID_REGEX.test(dto.client_id)) {
      this.logger.warn(
        `Invalid client_id format for event - query_id: ${dto.query_id}, client_id: ${dto.client_id}`
      )
      return null
    }

    // Extract and validate session ID from client_id
    const sessionId = this.extractSessionId(dto.client_id)
    if (!sessionId) {
      this.logger.warn(
        `Could not extract session_id from client_id for event - query_id: ${dto.query_id}, client_id: ${dto.client_id}`
      )
      return null
    }

    // Validate session exists in Redis
    const isValid = await this.redisService.isValidSession(sessionId)
    if (!isValid) {
      this.logger.warn(
        `Invalid or expired session for event (not found in Redis) - query_id: ${dto.query_id}, session_id: ${sessionId}`
      )
      return null
    }

    // Check if user has wallet associated (opted in)
    const walletAddress = await this.redisService.getWalletForSession(sessionId)

    // Generate UTC timestamp if missing
    const timestamp = dto.timestamp || new Date().toISOString()

    // Build event attributes, merging wallet if available
    const eventAttributes = { ...(dto.event_attributes || {}) }
    if (walletAddress) {
      eventAttributes.wallet_address = walletAddress
      eventAttributes.wallet_opted_in = true
    }

    // Transform to UbiEvent
    return {
      query_id: dto.query_id,
      action_name: dto.action_name,
      client_id: dto.client_id,
      timestamp,
      ...(Object.keys(eventAttributes).length > 0 && { event_attributes: eventAttributes })
    }
  }

  /**
   * Submit mixed analytics batch (queries and events) to UBI (fire-and-forget)
   * Validates all items first, then bulk indexes valid ones by type
   */
  submitBatch(dto: SubmitAnalyticsBatchDto): void {
    setImmediate(async () => {
      try {
        const bulkChunkSize = this.configService.get<number>('app.analytics.bulkChunkSize', 20)
        
        const queries = dto.queries || []
        const events = dto.events || []
        
        // Validate and transform queries
        const queryValidationPromises = queries.map(queryDto => this.validateAndTransformQuery(queryDto))
        const queryResults = await Promise.all(queryValidationPromises)
        const validQueries = queryResults.filter((query): query is UbiQuery => query !== null)
        
        // Log query validation failures
        const failedQueries = queries.length - validQueries.length
        if (failedQueries > 0) {
          this.logger.warn(
            `Query validation: ${failedQueries}/${queries.length} queries failed validation`
          )
        }

        // Validate and transform events
        const eventValidationPromises = events.map(eventDto => this.validateAndTransformEvent(eventDto))
        const eventResults = await Promise.all(eventValidationPromises)
        const validEvents = eventResults.filter((event): event is UbiEvent => event !== null)
        
        // Log event validation failures
        const failedEvents = events.length - validEvents.length
        if (failedEvents > 0) {
          this.logger.warn(
            `Event validation: ${failedEvents}/${events.length} events failed validation`
          )
        }

        // Bulk index valid queries
        if (validQueries.length > 0) {
          await this.openSearchService.bulkIndexQueries(validQueries, bulkChunkSize)
        }

        // Bulk index valid events
        if (validEvents.length > 0) {
          await this.openSearchService.bulkIndexEvents(validEvents, bulkChunkSize)
        }

        // Log summary
        if (queries.length > 0 || events.length > 0) {
          this.logger.log(
            `Batch processed: ${validQueries.length}/${queries.length} queries, ${validEvents.length}/${events.length} events`
          )
        }
      } catch (error: any) {
        this.logger.error(
          `Error processing analytics batch submission: ${error.message}`
        )
      }
    })
  }

  // ========================================
  // DEPRECATED: Separate query submission methods
  // Preserved for reference but should not be used
  // ========================================

  /**
   * @deprecated Use submitBatch instead
   * Submit a single query to UBI (fire-and-forget)
   * Validation and indexing happen asynchronously
   */
  submitQuery(dto: SubmitQueryDto): void {
    setImmediate(async () => {
      try {
        const ubiQuery = await this.validateAndTransformQuery(dto)
        if (!ubiQuery) {
          return
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
   * @deprecated Use submitBatch instead
   * Submit multiple queries in batch to UBI (fire-and-forget)
   * Validates all queries first, then bulk indexes valid ones
   */
  submitQueriesBatch(dto: any): void {
    setImmediate(async () => {
      try {
        const bulkChunkSize = this.configService.get<number>('app.analytics.bulkChunkSize', 20)
        
        // Validate and transform all queries (now async)
        const validationPromises = dto.queries.map((queryDto: SubmitQueryDto) => this.validateAndTransformQuery(queryDto))
        const validationResults = await Promise.all(validationPromises)
        const validQueries = validationResults.filter((query): query is UbiQuery => query !== null)

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
