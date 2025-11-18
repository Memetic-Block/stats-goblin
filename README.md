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
GET /session/init?client_name=web&client_version=1.0.0
```

**Query Parameters:**
- `client_name` (required): Alphanumeric + hyphens, 2-50 chars, must be in whitelist
- `client_version` (required): Semantic version format (e.g., `1.0.0`, `2.1.3-beta`)

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000"
}
```

**GDPR Compliance:**
- ✅ No cookies set
- ✅ No server-side session storage
- ✅ Frontend stores in localStorage
- ✅ IPs anonymized before rate limiting

### Query Submission (UBI 1.3.0)

#### Submit Single Query

Fire-and-forget endpoint for submitting search queries and results:

```bash
POST /analytics/queries
Content-Type: application/json

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
```

**Response:**
```
200 OK
```

**Rate Limit:** 100 requests/minute per anonymized IP

#### Submit Batch Queries

Submit multiple queries in a single request:

```bash
POST /analytics/queries/batch
Content-Type: application/json

{
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
      "query_response_hit_ids": ["vid-201", "vid-202"]
    }
  ]
}
```

**Response:**
```
200 OK
```

**Rate Limit:** 10 requests/minute per anonymized IP

**UBI 1.3.0 Schema Fields:**
- `application` (required): One of `graphql-images`, `graphql-video`, `graphql-audio`
- `query_id` (required): Unique query identifier (UUID recommended)
- `client_id` (required): From session init
- `user_query` (required): Search query text (max 5000 chars)
- `timestamp` (optional): UTC ISO 8601 with Z suffix (auto-generated if missing)
- `query_response_hit_ids` (optional): Array of result IDs (max 100)
- `query_attributes` (optional): Additional metadata
- `object_id_field` (optional): Field name for object IDs
- `query_response_id` (optional): Response identifier

## Frontend Integration

### Quick Example

```javascript
// 1. Initialize session
const { session_id, client_id } = await fetch(
  'http://localhost:3001/session/init?client_name=web&client_version=1.0.0'
).then(r => r.json());

localStorage.setItem('sessionId', session_id);
localStorage.setItem('clientId', client_id);

// 2. Perform GraphQL search on third-party API
const results = await searchThirdPartyAPI('kubernetes tutorial');

// 3. Submit to Analytics Goblin (fire-and-forget)
fetch('http://localhost:3001/analytics/queries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    application: 'graphql-images',
    query_id: crypto.randomUUID(),
    client_id: localStorage.getItem('clientId'),
    user_query: 'kubernetes tutorial',
    timestamp: new Date().toISOString(),
    query_response_hit_ids: results.map(r => r.id)
  }),
  keepalive: true
}).catch(() => {}); // Silently fail - analytics shouldn't break UX
```

See `docs/frontend-implementation.md` for complete integration guide.

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
