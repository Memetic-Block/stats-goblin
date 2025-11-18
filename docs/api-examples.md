# Analytics Goblin - API Examples

Complete examples for interacting with the Analytics Goblin API.

## Base URL

```
http://localhost:3001
```

## GDPR Compliance

- **No cookies**: This service does not set any cookies
- **Client-side sessions**: Frontend manages session_id in localStorage
- **IP anonymization**: IPs are anonymized before rate limiting
- **No personal data**: No personal information stored on server

## Authentication

Currently no authentication required. See `docs/future-improvements.md` for planned security enhancements.

## Health Check

### Simple Health Check

```bash
curl http://localhost:3001/health
```

Response:
```
OK
```

This endpoint simply returns "OK" if the service is reachable. It does not check external dependencies.

## Session Management

### Initialize Session

Get a session ID for frontend tracking (GDPR-friendly, no cookies):

```bash
# Anonymous session
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: web" \
  -H "X-Client-Version: 1.0.0"

# Session with wallet (opt-in)
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: web" \
  -H "X-Client-Version: 1.0.0" \
  -H "X-Wallet-Address: abc123xyz789..."
```

**Response (anonymous):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (with wallet):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000@abc123xy",
  "wallet_address": "abc123xyz789..."
}
```

**Important:** No `Set-Cookie` header. Frontend stores `session_id` in localStorage.

### Update Session with Wallet

Add wallet to existing session (when user signs in after browsing):

```bash
curl -X PUT http://localhost:3001/session/update \
  -H "X-Session-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"wallet_address": "abc123xyz789..."}'
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "@abc123xy",
  "wallet_address": "abc123xyz789..."
}
```

**Usage:** Append the returned `client_id` to your existing stored client_id:
```javascript
const currentClientId = localStorage.getItem('clientId');
const updatedClientId = currentClientId + response.client_id;
localStorage.setItem('clientId', updatedClientId);
```

**Wallet Tracking:**
- Wallet addresses stored in Redis (24h TTL)
- Automatically added to `query_attributes` in UBI data
- Opt-in only (user must provide wallet)
- Can be added retroactively via `/session/update`

## Analytics Submission (UBI 1.3.0)

Analytics Goblin accepts client-side analytics submissions following the UBI (User Behavior Insights) 1.3.0 schema. This is designed for applications that perform searches on third-party APIs (e.g., GraphQL endpoints) where the backend doesn't control the search API.

### Submit Mixed Analytics Batch

Fire-and-forget endpoint that accepts both queries and events in a single batch. Returns `200 OK` immediately. Processing happens asynchronously.

```bash
curl -X POST http://localhost:3001/analytics/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "application": "graphql-images",
        "query_id": "550e8400-e29b-41d4-a716-446655440000",
        "client_id": "web@1.0.0@123e4567-e89b-12d3-a456-426614174000",
        "user_query": "kubernetes deployment guide",
        "timestamp": "2025-11-17T10:30:00.000Z",
        "query_response_id": "resp-123456",
        "query_response_hit_ids": ["img-001", "img-002", "img-003"],
        "query_attributes": {
          "filters": ["type:tutorial", "difficulty:beginner"],
          "sort": "relevance"
        }
      }
    ],
    "events": [
      {
        "query_id": "550e8400-e29b-41d4-a716-446655440000",
        "action_name": "click",
        "client_id": "web@1.0.0@123e4567-e89b-12d3-a456-426614174000",
        "timestamp": "2025-11-17T10:30:15.000Z",
        "event_attributes": {
          "object": {
            "object_id": "img-001",
            "object_id_field": "image_id"
          },
          "position": {
            "ordinal": 1
          }
        }
      }
    ]
  }'
```

Response:
```
200 OK
```

**UBI 1.3.0 Query Schema Fields:**

- `application` (required): Application identifier. Allowed values: `graphql-images`, `graphql-video`, `graphql-audio`
- `query_id` (required): Unique identifier for the query (UUID recommended)
- `client_id` (required): Client identifier from session init
- `user_query` (required): The search query as entered by the user
- `timestamp` (optional): UTC timestamp in ISO 8601 format with `Z` suffix. Auto-generated if not provided
- `query_response_id` (optional): Identifier for the search response
- `query_response_hit_ids` (optional): Array of document IDs returned by the search, in order
- `query_attributes` (optional): Additional query metadata (filters, sort, etc.)
- `object_id_field` (optional): Field name containing object IDs

**UBI 1.3.0 Event Schema Fields:**

- `query_id` (required): Query this event is associated with
- `action_name` (required): Type of action (e.g., "click", "hover", "add_to_cart")
- `client_id` (required): Client identifier from session init
- `timestamp` (optional): UTC timestamp in ISO 8601 format with `Z` suffix. Auto-generated if not provided
- `event_attributes` (optional): Event-specific metadata (object clicked, position, etc.)

**Batch Limits:**
- Maximum 100 queries per batch
- Maximum 100 events per batch
- Maximum 5000 characters per `user_query`
- Maximum 100 items in `query_response_hit_ids` array

### Example: GraphQL Image Search with Click Tracking

```javascript
// After performing a GraphQL search on a third-party API
class AnalyticsTracker {
  constructor() {
    this.pendingQueries = [];
    this.pendingEvents = [];
    this.maxBatchSize = 50;
  }
  
  async trackSearch(query, results) {
    const sessionId = localStorage.getItem('sessionId');
    const clientId = localStorage.getItem('clientId');
    const queryId = crypto.randomUUID();
    
    this.pendingQueries.push({
      application: 'graphql-images',
      query_id: queryId,
      client_id: clientId,
      user_query: query,
      timestamp: new Date().toISOString(),
      query_response_hit_ids: results.map(r => r.id),
      query_attributes: {
        filters: results.filters || [],
        result_count: results.length
      }
    });
    
    // Store queryId for later event tracking
    return queryId;
  }
  
  trackClick(queryId, objectId, position) {
    const clientId = localStorage.getItem('clientId');
    
    this.pendingEvents.push({
      query_id: queryId,
      action_name: 'click',
      client_id: clientId,
      timestamp: new Date().toISOString(),
      event_attributes: {
        object: {
          object_id: objectId,
          object_id_field: 'image_id'
        },
        position: {
          ordinal: position
        }
      }
    });
    
    if (this.pendingQueries.length + this.pendingEvents.length >= this.maxBatchSize) {
      this.flush();
    }
  }
  
  flush() {
    if (this.pendingQueries.length === 0 && this.pendingEvents.length === 0) return;
    
    fetch('http://localhost:3001/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: this.pendingQueries,
        events: this.pendingEvents
      })
    }).catch(() => {
      // Silently fail - analytics shouldn't break user experience
    });
    
    this.pendingQueries = [];
    this.pendingEvents = [];
  }
}

const analytics = new AnalyticsTracker();

// Usage in search component
async function handleSearch(query) {
  const results = await searchGraphQL(query);
  const queryId = await analytics.trackSearch(query, results);
  
  // Store queryId for click tracking
  displayResults(results, queryId);
}

// Usage in result click handler
function handleResultClick(imageId, position, queryId) {
  analytics.trackClick(queryId, imageId, position);
  // ... rest of click handling
}

// Flush on page unload
window.addEventListener('beforeunload', () => analytics.flush());
```

## Rate Limiting

GDPR-compliant rate limiting with IP anonymization (configured in Traefik):

**Analytics Submission:**
- 100 requests/minute average per anonymized IP
- Burst: 200 requests
- Period: 1 minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

429 response when exceeded:
```json
{
  "statusCode": 429,
  "message": "Too Many Requests"
}
```

## Configuration

### Environment Variables

- `ALLOWED_APPLICATIONS`: Comma-separated list of allowed application names (default: `graphql-images,graphql-video,graphql-audio`)
- `MAX_QUERY_LENGTH`: Maximum length of `user_query` field (default: `5000`)
- `MAX_BATCH_SIZE`: Maximum analytics items per batch (queries + events) (default: `100`)
- `MAX_QUERY_RESPONSE_HITS`: Maximum items in `query_response_hit_ids` (default: `100`)
- `BULK_CHUNK_SIZE`: OpenSearch bulk indexing chunk size (default: `20`)
- `REDIS_HOST`: Redis host for session validation (default: `localhost`)
- `REDIS_PORT`: Redis port (default: `6379`)
- `SESSION_TTL_SECONDS`: Session expiration in Redis (default: `86400` - 24 hours)

## CORS Configuration

CORS is configured via the `CORS_ALLOWED_ORIGIN` environment variable. By default, it allows all origins (`*`).

For production, set specific origins:

```bash
CORS_ALLOWED_ORIGIN=https://dashboard.example.com
```
