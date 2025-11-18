# Analytics Goblin 📊👹

A NestJS-based session management and analytics microservice for tracking user behavior using OpenSearch with UBI (User Behavior Insights).

## Features

- **Session Management** - Provides session IDs for frontend tracking with client validation
- **Two-Tier Rate Limiting** - IP-based rate limiting with GDPR-compliant anonymization
- **UBI Analytics** - Query analytics from OpenSearch UBI plugin (queries and events)
- **Health Monitoring** - Service health checks for Redis sessions and OpenSearch UBI plugin
- **Client Validation** - Environment-based whitelist for allowed clients
- **Secure Sessions** - Redis-backed session storage with rolling expiration

## Architecture

```
Frontend → Session Init → Search API (with UBI) → OpenSearch UBI Plugin
                                                         ↓
                                                   ubi_queries
                                                   ubi_events
                                                         ↓
                                               Analytics Goblin API
```

1. Frontend requests session ID from Analytics Goblin
2. Frontend includes client_id in search requests to Search API
3. OpenSearch UBI plugin captures queries and events automatically
4. Analytics Goblin provides aggregated analytics from UBI indices

## Prerequisites

- Node.js 18+ or 20+
- Redis 7.x (for session storage)
- OpenSearch 2.x with UBI plugin installed

### Installing OpenSearch UBI Plugin

The UBI plugin must be installed on your OpenSearch cluster:

```bash
# Download and install the UBI plugin
bin/opensearch-plugin install https://github.com/opensearch-project/user-behavior-insights/releases/download/latest/opensearch-ubi-plugin.zip

# Restart OpenSearch
systemctl restart opensearch
```

Verify installation via health check: `GET /health/opensearch`

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
# Redis (Rate Limiter Storage Only - No Sessions)
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
ALLOWED_CLIENT_NAMES=my-app,frontend-app,mobile-app

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

### Session Management

#### Initialize Session

Request a new session ID for tracking user behavior (GDPR-friendly - no server-side storage):

```bash
GET /session/init?client_name=my-app&client_version=1.0.0
```

**Query Parameters:**
- `client_name` (required): Alphanumeric + hyphens, 2-50 chars, must be in whitelist
- `client_version` (required): Semantic version format (e.g., `1.0.0`, `2.1.3-beta`)

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "my-app@1.0.0@550e8400-e29b-41d4-a716-446655440000"
}
```

**Important - GDPR Compliance:**
- ✅ No cookies set (no `Set-Cookie` header)
- ✅ No server-side session storage
- ✅ Frontend stores `session_id` in localStorage
- ✅ No personal data collected or stored
- ✅ IPs anonymized before rate limiting

**Rate Limits:**
- Global: 20 requests/minute per IP (anonymized)
- Burst: 3 requests/second per IP (anonymized)

**Response Headers:**
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 19
X-RateLimit-Reset: 1234567890
```

### Health Checks

```bash
# Overall health
GET /health

# Redis health (rate limiter storage)
GET /health/redis

# OpenSearch health (UBI plugin verification)
GET /health/opensearch
```

**Example Response:**
```json
{
  "status": "ok",
  "info": {
    "redis": {
      "status": "up"
    },
    "opensearch": {
      "status": "up",
      "ubiPluginInstalled": true
    }
  }
}
```

### Analytics Endpoints

All analytics endpoints require `start` and `end` query parameters (ISO 8601 format).

#### Top Searches

Get most frequent search queries:

```bash
GET /analytics/top-searches?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z&limit=10
```

**Response:**
```json
[
  {
    "query": "nestjs tutorial",
    "count": 1250,
    "uniqueUsers": 850
  }
]
```

#### Popular Documents

Find most-clicked documents:

```bash
GET /analytics/popular-documents?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z&limit=10
```

**Response:**
```json
[
  {
    "documentId": "doc-12345",
    "clickCount": 3500,
    "uniqueUsers": 2100
  }
]
```

#### Events by Action

Get event counts grouped by action type:

```bash
GET /analytics/events-by-action?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z
```

**Response:**
```json
[
  {
    "action": "click",
    "count": 15000
  },
  {
    "action": "scroll",
    "count": 8500
  }
]
```

#### Overall Statistics

Get summary statistics across all UBI data:

```bash
GET /analytics/stats?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z
```

**Response:**
```json
{
  "totalQueries": 50000,
  "uniqueQueries": 12000,
  "totalEvents": 75000,
  "uniqueUsers": 8500,
  "topActions": [
    { "action": "click", "count": 45000 },
    { "action": "scroll", "count": 20000 }
  ]
}
```

## Frontend Integration

### Step 1: Initialize Session

When your frontend application loads (GDPR-friendly, no cookies):

```javascript
// Initialize session - no cookies, all client-side
const response = await fetch(
  'http://localhost:3001/session/init?client_name=my-app&client_version=1.0.0'
  // Note: NO credentials option needed - no cookies!
);

const { session_id, client_id } = await response.json();

// Store ONLY in localStorage (client-side, not tracked by server)
localStorage.setItem('sessionId', session_id);
localStorage.setItem('clientId', client_id);

// GDPR: User controls this data, can clear localStorage anytime
```

### Step 2: Include client_id in Search Requests

When making search requests to your Search API:

```javascript
const clientId = localStorage.getItem('clientId');

const searchResponse = await fetch('http://your-search-api/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'user search query',
    client_id: clientId  // UBI plugin will track this
  })
});
```

### Step 3: Track Events (Optional)

If your Search API supports UBI event tracking:

```javascript
// Track document click
await fetch('http://your-search-api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query_id: 'query-123',  // From search response
    action_name: 'click',
    event_attributes: {
      object: {
        object_id: 'doc-12345'
      }
    }
  })
});
```

## Rate Limiting

The service implements GDPR-compliant rate limiting with IP anonymization:

| Tier | Scope | Limit | Window | Purpose |
|------|-------|-------|--------|---------|
| Global | Anonymized IP | 20 req | 1 minute | Prevent abuse |
| Burst | Anonymized IP | 3 req | 1 second | Prevent hammering |

**IP Anonymization (GDPR Compliant):**
- IPv4: Last octet removed (`192.168.1.123` → `192.168.1.0`)
- IPv6: Last 4 segments removed (`2001:db8::1234` → `2001:db8::`)
- No personal data stored in rate limiting

**Rate Limit Headers:**
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1234567890
```

**429 Response:**
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
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
  "statusCode": 400,
  "message": [
    "client_name must be in the allowed list",
    "client_version must be a valid semantic version"
  ]
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
curl -X GET \
  'http://localhost:3001/session/init?client_name=test-app&client_version=1.0.0'

# Returns:
# {
#   "session_id": "550e8400-e29b-41d4-a716-446655440000",
#   "client_id": "test-app@1.0.0@550e8400-e29b-41d4-a716-446655440000"
# }
# Note: No Set-Cookie header (GDPR-friendly)

# 2. Make analytics request (no session needed)
curl -X GET \
  'http://localhost:3001/analytics/top-searches?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z&limit=10'
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

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | NestJS | 11.x |
| Language | TypeScript | 5.7 |
| Rate Limiting | @nestjs/throttler | 6.4.x |
| Validation | class-validator | 0.14.x |
| Rate Limiter Storage | Redis | 7.x |
| Search Engine | OpenSearch | 2.x |
| UBI Plugin | OpenSearch UBI | Latest |

## Related Documentation

- [Architecture Overview](./docs/architecture.md) - System design and data flow
- [API Examples](./docs/api-examples.md) - Detailed API usage examples
- [Local Development](./docs/local-development.md) - Development setup and testing
- [Future Improvements](./docs/future-improvements.md) - Roadmap and planned features

## License

MIT
  ]
  timestamp: string         // ISO 8601 timestamp
  userAgent?: string        // Client user agent
}
```

## Configuration

### Environment Variables

#### Redis Configuration

**Standalone Mode:**
```bash
REDIS_MODE=standalone
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Sentinel Mode (Production):**
```bash
REDIS_MODE=sentinel
REDIS_MASTER_NAME=mymaster
REDIS_SENTINEL_1_HOST=sentinel1
REDIS_SENTINEL_1_PORT=26379
REDIS_SENTINEL_2_HOST=sentinel2
REDIS_SENTINEL_2_PORT=26379
REDIS_SENTINEL_3_HOST=sentinel3
REDIS_SENTINEL_3_PORT=26379
```

#### OpenSearch Configuration

```bash
OPENSEARCH_HOST=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin

# Optional TLS
OPENSEARCH_USE_TLS=false
OPENSEARCH_SSL_VERIFY=true
```

#### Application Configuration

```bash
PORT=3001
CORS_ALLOWED_ORIGIN=*
QUEUE_NAME=search-metrics
METRICS_INDEX_PREFIX=search-metrics
METRICS_RETENTION_DAYS=30
```

### Index Management

Indices are created with the pattern: `search-metrics-YYYY-MM-DD`

The service automatically:
- Creates daily indices
- Applies index templates with optimized mappings
- Supports nested document structures for hit arrays

To manually manage retention, query OpenSearch directly or implement ILM policies.

## Development

```bash
# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Lint code
npm run lint

# Format code
npm run format
```

## Production Deployment

### Recommended Setup

1. **Redis Sentinel** - Use Redis Sentinel cluster for high availability
2. **OpenSearch Cluster** - Multi-node cluster with replicas
3. **Horizontal Scaling** - Run multiple Stats Goblin instances as BullMQ workers
4. **Monitoring** - Monitor queue depth, processing lag, and error rates
5. **Alerts** - See `docs/future-improvements.md` for alerting strategies

### Performance Tuning

- **Worker Concurrency**: Configure BullMQ concurrency based on CPU/memory
- **Batch Indexing**: Consider bulk indexing for high-throughput scenarios
- **Index Shards**: Adjust shard count based on data volume
- **Query Caching**: Enable OpenSearch query cache for analytics endpoints

## Monitoring

### Key Metrics to Track

- **Queue Depth**: Check `/health/redis` for waiting jobs
- **Processing Rate**: Jobs processed per minute
- **Error Rate**: Failed jobs in queue
- **OpenSearch Health**: Cluster status and shard allocation
- **API Latency**: Response times for analytics endpoints

### Health Check Integration

Integrate health endpoints with:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring systems (Datadog, New Relic, etc.)

## Troubleshooting

### Queue Not Processing

1. Check Redis connectivity: `GET /health/redis`
2. Verify queue name matches producer configuration
3. Check worker logs for errors
4. Verify BullMQ connection settings

### OpenSearch Indexing Failures

1. Check OpenSearch health: `GET /health/opensearch`
2. Verify credentials and permissions
3. Check disk space on OpenSearch nodes
4. Review index template mapping conflicts

### Analytics Queries Slow

1. Add more replica shards for read capacity
2. Implement pre-aggregation (see future improvements)
3. Reduce query time range
4. Enable OpenSearch query cache

## Future Improvements

See [`docs/future-improvements.md`](./docs/future-improvements.md) for planned enhancements:

- Prometheus metrics exporter
- AlertManager integration
- Advanced ML-based analytics
- Real-time streaming dashboards
- Multi-tenancy support

## Tests

### Spec Tests
```bash
$ npm run test
```

### e2e tests
```bash
$ npm run test:e2e
```

### Test Coverage
```bash
# test coverage
$ npm run test:cov
```

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.
