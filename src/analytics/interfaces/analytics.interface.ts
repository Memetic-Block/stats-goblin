// UBI Query tracking interfaces
export interface UbiQuery {
  query_id: string
  client_id: string
  user_query: string
  timestamp: string
  query_response_id?: string
}

export interface UbiEvent {
  query_id: string
  action_name: string
  session_id?: string
  client_id: string
  timestamp: string
  event_attributes?: {
    object?: {
      object_id: string
      object_id_field?: string
    }
    position?: {
      ordinal?: number
    }
  }
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
