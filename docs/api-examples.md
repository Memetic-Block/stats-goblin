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
curl "http://localhost:3001/session/init?client_name=web&client_version=1.0.0"
```

Response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000"
}
```

**Important:** No `Set-Cookie` header. Frontend stores `session_id` in localStorage.

**Frontend Integration:**
```javascript
const response = await fetch(
  'http://localhost:3001/session/init?client_name=web&client_version=1.0.0'
);
const { session_id, client_id } = await response.json();

// Store in localStorage (client-side only)
localStorage.setItem('sessionId', session_id);
localStorage.setItem('clientId', client_id);
```

## Query Submission (UBI 1.3.0)

Analytics Goblin accepts client-side query submissions following the UBI (User Behavior Insights) 1.3.0 schema. This is designed for applications that perform searches on third-party APIs (e.g., GraphQL endpoints) where the backend doesn't control the search API.

### Submit Single Query

Fire-and-forget endpoint that returns `200 OK` immediately. Processing happens asynchronously.

```bash
curl -X POST http://localhost:3001/analytics/queries \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

Response:
```
200 OK
```

**UBI 1.3.0 Schema Fields:**

- `application` (required): Application identifier. Allowed values: `graphql-images`, `graphql-video`, `graphql-audio`
- `query_id` (required): Unique identifier for the query (UUID recommended)
- `client_id` (required): Client identifier from session init
- `user_query` (required): The search query as entered by the user
- `timestamp` (optional): UTC timestamp in ISO 8601 format with `Z` suffix. Auto-generated if not provided
- `query_response_id` (optional): Identifier for the search response
- `query_response_hit_ids` (optional): Array of document IDs returned by the search, in order
- `query_attributes` (optional): Additional query metadata (filters, sort, etc.)
- `object_id_field` (optional): Field name containing object IDs

### Submit Batch Queries

Submit multiple queries at once for better efficiency:

```bash
curl -X POST http://localhost:3001/analytics/queries/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "application": "graphql-images",
        "query_id": "query-001",
        "client_id": "web@1.0.0@123e4567-e89b-12d3-a456-426614174000",
        "user_query": "docker compose examples",
        "timestamp": "2025-11-17T10:30:00.000Z",
        "query_response_hit_ids": ["img-101", "img-102"]
      },
      {
        "application": "graphql-video",
        "query_id": "query-002",
        "client_id": "web@1.0.0@123e4567-e89b-12d3-a456-426614174000",
        "user_query": "nestjs tutorial",
        "timestamp": "2025-11-17T10:31:00.000Z",
        "query_response_hit_ids": ["vid-201", "vid-202", "vid-203"]
      }
    ]
  }'
```

Response:
```
200 OK
```

**Batch Limits:**
- Maximum 50 queries per batch
- Maximum 5000 characters per `user_query`
- Maximum 100 items in `query_response_hit_ids` array

### Example: GraphQL Image Search

```javascript
// After performing a GraphQL search on a third-party API
async function submitSearchAnalytics(query, results) {
  const sessionId = localStorage.getItem('sessionId');
  const clientId = localStorage.getItem('clientId');
  
  const queryData = {
    application: 'graphql-images',
    query_id: crypto.randomUUID(),
    client_id: clientId,
    user_query: query,
    timestamp: new Date().toISOString(),
    query_response_hit_ids: results.map(r => r.id),
    query_attributes: {
      filters: results.filters || [],
      result_count: results.length
    }
  };
  
  // Fire-and-forget - don't wait for response
  fetch('http://localhost:3001/analytics/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryData)
  }).catch(() => {
    // Silently fail - analytics shouldn't break user experience
  });
}
```

### Example: Video Search with Batch

```javascript
// Accumulate queries and submit in batches
class AnalyticsQueue {
  constructor() {
    this.queue = [];
    this.batchSize = 10;
  }
  
  add(query, results) {
    const clientId = localStorage.getItem('clientId');
    
    this.queue.push({
      application: 'graphql-video',
      query_id: crypto.randomUUID(),
      client_id: clientId,
      user_query: query,
      timestamp: new Date().toISOString(),
      query_response_hit_ids: results.slice(0, 100).map(r => r.id)
    });
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }
  
  flush() {
    if (this.queue.length === 0) return;
    
    fetch('http://localhost:3001/analytics/queries/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: this.queue })
    }).catch(() => {});
    
    this.queue = [];
  }
}

const analytics = new AnalyticsQueue();
// Flush on page unload
window.addEventListener('beforeunload', () => analytics.flush());
```

## Rate Limiting

GDPR-compliant rate limiting with IP anonymization:

**Query Submission:**
- Individual queries: 100 requests/minute per anonymized IP
- Batch queries: 10 requests/minute per anonymized IP
- Burst: 3 requests/second per anonymized IP

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
  "message": "ThrottlerException: Too Many Requests"
}
```

## Configuration

### Environment Variables

- `ALLOWED_APPLICATIONS`: Comma-separated list of allowed application names (default: `graphql-images,graphql-video,graphql-audio`)
- `MAX_QUERY_LENGTH`: Maximum length of `user_query` field (default: `5000`)
- `MAX_BATCH_SIZE`: Maximum queries per batch (default: `50`)
- `MAX_QUERY_RESPONSE_HITS`: Maximum items in `query_response_hit_ids` (default: `100`)
- `BULK_CHUNK_SIZE`: OpenSearch bulk indexing chunk size (default: `20`)

## CORS Configuration

CORS is configured via the `CORS_ALLOWED_ORIGIN` environment variable. By default, it allows all origins (`*`).

For production, set specific origins:

```bash
CORS_ALLOWED_ORIGIN=https://dashboard.example.com
```
