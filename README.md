# Analytics Goblin 📊👹

A NestJS-based telemetry service for tracking client-side search behavior using OpenSearch with UBI (User Behavior Insights) 1.3.0 specification.

## Features

- **Session Management** - GDPR-friendly session IDs for client-side storage (no cookies)
- **Client-Side Query Submission** - Fire-and-forget endpoints for GraphQL search telemetry
- **UBI 1.3.0 Compliant** - Follows official OpenSearch User Behavior Insights schema
- **Two-Tier Rate Limiting** - IP-based rate limiting with GDPR-compliant anonymization
- **Health Monitoring** - Simple health check endpoint
- **Client Validation** - Environment-based whitelist for allowed clients and applications
- **Batch Support** - Efficient batch submission for multiple queries

## Architecture

```
Frontend → Session Init → Analytics Goblin (session_id, client_id)
         ↓
Third-Party GraphQL Search (images/video/audio)
         ↓
Submit Query + Results → Analytics Goblin → OpenSearch ubi_queries
```

1. Frontend requests session ID from Analytics Goblin (client-side storage)
2. Frontend performs searches on third-party GraphQL APIs
3. Frontend submits query + results to Analytics Goblin (fire-and-forget)
4. Analytics Goblin writes to OpenSearch `ubi_queries` index following UBI 1.3.0 schema

## Prerequisites

- Node.js 18+ or 20+
- Redis 7.x (for rate limiting storage)
- OpenSearch 2.x (for storing UBI query data)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key configuration:

```bash
# Redis (Rate Limiter Storage Only)
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenSearch
OPENSEARCH_HOST=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin

# Proxy Configuration
TRUST_PROXY=false             # true behind reverse proxy

# Rate Limiting (GDPR-compliant with IP anonymization)
THROTTLE_GLOBAL_LIMIT=20      # req/min per anonymized IP
THROTTLE_BURST_LIMIT=3        # req/sec per anonymized IP

# Client Validation
ALLOWED_CLIENT_NAMES=web,mobile-ios,mobile-android

# Application Types (for GraphQL searches)
ALLOWED_APPLICATIONS=graphql-images,graphql-video,graphql-audio

# Query Limits
MAX_QUERY_LENGTH=5000
MAX_BATCH_SIZE=50
MAX_QUERY_RESPONSE_HITS=100
BULK_CHUNK_SIZE=20

# Application
PORT=3001

# GDPR: No server-side sessions, IPs anonymized, no cookies
```

### 3. Start Infrastructure (Optional)

Use Docker Compose for local development:

```bash
docker-compose up -d
```

This starts:
- Redis on port 6379
- OpenSearch on port 9200
- OpenSearch Dashboards on port 5601

### 4. Run the Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## API Endpoints

### Health Check

Simple health check (does not test dependencies):

```bash
GET /health
```

**Response:**
```
OK
```

### Session Management

#### Initialize Session

Request a new session ID for tracking user behavior (GDPR-friendly - no server-side storage):

```bash
# Anonymous session (no wallet)
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: wuzzy-web" \
  -H "X-Client-Version: 1.0.0"

# Session with wallet (opt-in analytics)
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: wuzzy-web" \
  -H "X-Client-Version: 1.0.0" \
  -H "X-Wallet-Address: abc123xyz789..."
```

**Required Headers:**
- `X-Client-Name`: Alphanumeric + hyphens, 2-50 chars, must be in whitelist
- `X-Client-Version`: Semantic version format (e.g., `1.0.0`, `2.1.3-beta`)

**Optional Headers:**
- `X-Wallet-Address`: Arweave wallet address (opt-in for wallet-linked analytics)

**Response (without wallet):**
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

#### Update Session with Wallet

Add wallet to existing session (for users who sign in after browsing):

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

Client should append `client_id` suffix to their stored client_id.

**GDPR Compliance:**
- ✅ No cookies set
- ✅ Session IDs stored in Redis with auto-expiration (24h)
- ✅ Wallet tracking is opt-in only
- ✅ Frontend stores in localStorage
- ✅ IPs anonymized for rate limiting

### Analytics Submission (UBI 1.3.0)

#### Submit Mixed Analytics Batch

Fire-and-forget endpoint for submitting queries and events together:

```bash
POST /analytics/batch
Content-Type: application/json

{
  "queries": [
    {
      "application": "graphql-images",
      "query_id": "550e8400-e29b-41d4-a716-446655440000",
      "client_id": "web@1.0.0@123e4567-e89b-12d3-a456-426614174000",
      "user_query": "kubernetes deployment guide",
      "timestamp": "2025-11-17T10:30:00.000Z",
      "query_response_hit_ids": ["img-001", "img-002", "img-003"],
      "query_attributes": {
        "filters": ["type:tutorial"],
        "result_count": 3
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
}
```

**Response:**
```
200 OK
```

**Rate Limit:** 100 requests/minute average (200 burst) per anonymized IP (configured in Traefik)

**UBI 1.3.0 Query Schema Fields:**
- `application` (required): One of `graphql-images`, `graphql-video`, `graphql-audio`
- `query_id` (required): Unique query identifier (UUID recommended)
- `client_id` (required): From session init
- `user_query` (required): Search query text (max 5000 chars)
- `timestamp` (optional): UTC ISO 8601 with Z suffix (auto-generated if missing)
- `query_response_hit_ids` (optional): Array of result IDs (max 100)
- `query_attributes` (optional): Additional metadata (wallet auto-added if opted in)
- `object_id_field` (optional): Field name for object IDs
- `query_response_id` (optional): Response identifier

**UBI 1.3.0 Event Schema Fields:**
- `query_id` (required): Associated query identifier
- `action_name` (required): Event type (e.g., "click", "hover", "add_to_cart")
- `client_id` (required): From session init
- `timestamp` (optional): UTC ISO 8601 with Z suffix (auto-generated if missing)
- `event_attributes` (optional): Event metadata (object, position, etc., wallet auto-added if opted in)

## Frontend Integration

### Quick Example

```javascript
// 1. Initialize session
const { session_id, client_id } = await fetch(
  'http://localhost:3001/session/init',
  {
    headers: {
      'X-Client-Name': 'web',
      'X-Client-Version': '1.0.0'
    }
  }
).then(r => r.json());

localStorage.setItem('sessionId', session_id);
localStorage.setItem('clientId', client_id);

// 2. Perform GraphQL search on third-party API
const results = await searchThirdPartyAPI('kubernetes tutorial');

// 3. Track search and clicks together
const queryId = crypto.randomUUID();
const events = [];

// User clicks on first result
events.push({
  query_id: queryId,
  action_name: 'click',
  client_id: localStorage.getItem('clientId'),
  timestamp: new Date().toISOString(),
  event_attributes: {
    object: {
      object_id: results[0].id,
      object_id_field: 'image_id'
    },
    position: { ordinal: 1 }
  }
});

// Submit query + events together
fetch('http://localhost:3001/analytics/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    queries: [{
      application: 'graphql-images',
      query_id: queryId,
      client_id: localStorage.getItem('clientId'),
      user_query: 'kubernetes tutorial',
      timestamp: new Date().toISOString(),
      query_response_hit_ids: results.map(r => r.id)
    }],
    events
  }),
  keepalive: true
}).catch(() => {}); // Silently fail - analytics shouldn't break UX
```

See `docs/frontend-implementation.md` for complete integration guide.

## Rate Limiting

GDPR-compliant rate limiting with IP anonymization (configured in Traefik):

**Analytics Submission:**
- 100 requests/minute average per anonymized IP
- Burst: 200 requests
- Period: 1 minute

**IP Anonymization (GDPR Compliant):**
- IPv4: Last octet removed (`192.168.1.123` → `192.168.1.0`)
- IPv6: Last 4 segments removed (`2001:db8::1234` → `2001:db8::`)
- No personal data stored in rate limiting

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

**429 Response:**
```json
{
  "statusCode": 429,
  "message": "Too Many Requests"
}
```
```

## Client Validation

Only whitelisted clients can initialize sessions:

**.env Configuration:**
```bash
ALLOWED_CLIENT_NAMES=my-app,frontend-app,mobile-app
```

**Validation Rules:**
- `client_name`: 2-50 characters, alphanumeric + hyphens only
- `client_version`: Semantic versioning format (e.g., `1.0.0`, `2.1.3-beta`, max 20 chars)
- Must be in whitelist

**Validation Errors:**
```json
{
  "statusCode": 400
}
```

## UBI Integration

### What is UBI?

User Behavior Insights (UBI) is an OpenSearch plugin that automatically captures:
- **Queries** (`ubi_queries` index): Search queries with client_id, timestamp, query text
- **Events** (`ubi_events` index): User actions like clicks, scrolls, with query_id linkage

### UBI Plugin Installation

```bash
# On your OpenSearch cluster
bin/opensearch-plugin install https://github.com/opensearch-project/user-behavior-insights/releases/download/latest/opensearch-ubi-plugin.zip

# Restart OpenSearch
systemctl restart opensearch
```

### Verifying UBI Plugin

```bash
# Check health endpoint
curl http://localhost:3001/health/opensearch

# Or check OpenSearch directly
curl http://localhost:9200/_cat/plugins
```

Should show: `opensearch-ubi` plugin installed

## Production Deployment

### Environment Variables

```bash
# Session Security
SESSION_SECRET=use-strong-random-string-in-production
SESSION_SECURE=true                # Requires HTTPS
TRUST_PROXY=true                   # Behind nginx/load balancer

# Redis (Session Store)
REDIS_HOST=redis.example.com
REDIS_PORT=6379

# OpenSearch
OPENSEARCH_HOST=https://opensearch.example.com:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=secure-password

# Rate Limiting
THROTTLE_GLOBAL_LIMIT=20
THROTTLE_SESSION_LIMIT=100
THROTTLE_BURST_LIMIT=3

# Client Whitelist
ALLOWED_CLIENT_NAMES=production-app,mobile-app
```

### Reverse Proxy Configuration

When deploying behind nginx or a load balancer:

**nginx.conf:**
```nginx
location / {
    proxy_pass http://localhost:3001;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
}
```

**Application:**
```bash
TRUST_PROXY=true  # Enables app.set('trust proxy', 1)
```

### Session Cookie Security

In production with HTTPS:

```bash
SESSION_SECURE=true       # Cookies only sent over HTTPS
SESSION_MAX_AGE_MS=86400000  # 24 hour session lifetime
```

## Development

### Local Testing

```bash
# Start dependencies
docker-compose up -d

# Run tests
npm test

# Run with hot reload
npm run start:dev
```

### Testing Session Flow

```bash
# 1. Initialize session (no cookies, client-side only)
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: wuzzy-web" \
  -H "X-Client-Version: 1.0.0"

# Returns:
# {
#   "session_id": "550e8400-e29b-41d4-a716-446655440000",
#   "client_id": "test-app@1.0.0@550e8400-e29b-41d4-a716-446655440000"
# }
# Note: No Set-Cookie header (GDPR-friendly)
```

### Testing Rate Limits

```bash
# Trigger global rate limit (20/min)
for i in {1..25}; do
  curl -X GET 'http://localhost:3001/session/init?client_name=test-app&client_version=1.0.0'
done

# Expected: 429 Too Many Requests after 20 requests
```

## Architecture

For detailed architecture documentation, see [docs/architecture.md](./docs/architecture.md).

**Key Components:**
- **Session Module**: Client validation and session ID generation (client-side storage)
- **Throttler Module**: Two-tier rate limiting with IP anonymization
- **Analytics Module**: UBI data aggregation and querying
- **Health Module**: Redis rate limiter and OpenSearch UBI plugin health checks

## GDPR Compliance

This service implements a **low-risk, privacy-first** approach to analytics:

### ✅ What We Do
- **No Server-Side Sessions**: Frontend stores `session_id` in localStorage
- **No Cookies**: No `Set-Cookie` headers, no tracking cookies
- **IP Anonymization**: IPs anonymized before rate limiting storage
  - IPv4: `192.168.1.123` → `192.168.1.0`
  - IPv6: `2001:db8::1234` → `2001:db8::`
- **Client Control**: Users can clear localStorage anytime
- **Minimal Data**: Only collect what's needed for UBI analytics

### ⚠️ What You Still Need
- **Privacy Policy**: Document UBI data collection in OpenSearch
- **Data Retention**: Configure ILM policy for `ubi_queries` and `ubi_events` indices
- **User Rights**: Implement data export/deletion if required by your jurisdiction

### 🔒 Why This Approach
- **Reduced Legal Risk**: No personal data stored on this service
- **User Control**: Session data managed entirely by frontend
- **Simplified Compliance**: No consent banners needed for this service
- **Still Functional**: UBI analytics work without server-side tracking

## Related Documentation

- [Architecture Overview](./docs/architecture.md) - System design and data flow
- [API Examples](./docs/api-examples.md) - Detailed API usage examples
- [Local Development](./docs/local-development.md) - Development setup and testing
- [Future Improvements](./docs/future-improvements.md) - Roadmap and planned features

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.
