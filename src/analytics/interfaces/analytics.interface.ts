/**
 * UBI Query interface following UBI 1.3.0 schema
 * https://o19s.github.io/ubi/schema/1.3.0/query.request.schema.json
 */
export interface UbiQuery {
  application: string
  query_id: string
  client_id: string
  user_query: string
  timestamp: string
  query_attributes?: Record<string, any>
  object_id_field?: string
  query_response_id?: string
  query_response_hit_ids?: string[]
}

export interface UbiEvent {
  query_id: string
  action_name: string
  session_id?: string
  client_id: string
  timestamp: string
  event_attributes?: Record<string, any>
}

// Analytics response interfaces
export interface TopSearchResult {
  query: string
  count: number
  uniqueUsers: number
}

export interface PopularDocument {
  documentId: string
  clickCount: number
  uniqueUsers: number
}

export interface EventsByAction {
  action: string
  count: number
}

export interface SearchStatsResponse {
  totalQueries: number
  uniqueQueries: number
  totalEvents: number
  uniqueUsers: number
  topActions: EventsByAction[]
}
