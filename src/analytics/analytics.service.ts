import { Injectable, Logger } from '@nestjs/common'
import { OpenSearchService } from '../opensearch/opensearch.service'
import {
  TopSearchResult,
  PopularDocument,
  EventsByAction,
  SearchStatsResponse
} from './interfaces/analytics.interface'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private readonly openSearchService: OpenSearchService) {}

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
}
