# Analytics Goblin Architecture

## System Overview

```
┌─────────────────┐
│  Frontend App   │
│   (Browser)     │
└────────┬────────┘
         │ 1. Request session ID
         ▼
┌─────────────────────────────────┐
│      Analytics Goblin           │
│   GET /session/init             │
│   ?client_name=my-app           │
│   &client_version=1.0.0         │
└────────┬────────────────────────┘
         │ 2. Create session & client_id
         │    my-app@1.0.0@sess_abc123
         ▼
┌─────────────────┐
│  Redis Store    │
│ (Sessions)      │
│ sess:abc123     │
└─────────────────┘
         
         │ 3. User performs searches
         ▼
┌─────────────────┐
│   Search API    │
│ (with UBI)      │
└────────┬────────┘
         │ 4. OpenSearch UBI Plugin
         │    captures queries & events
         ▼
┌─────────────────┐
│   OpenSearch    │
│   (Storage)     │
│                 │
│ ubi_queries     │──── Query data
│ ubi_events      │──── User events
└────────┬────────┘
         │
         │ 5. Query analytics
         ▼
┌─────────────────┐
│ Analytics Goblin│
│  Analytics API  │
│                 │
│ GET /analytics/ │
│ - top-searches  │
│ - popular-docs  │
│ - events-by-    │
│   action        │
│ - stats         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Dashboard /   │
│   Clients       │
└─────────────────┘
```

## Component Breakdown

### 1. Session Management
- **Session Module**: Provides session IDs for tracking user behavior
- **Client Validation**: Validates client_name against whitelist
  - Env-based configuration: `ALLOWED_CLIENT_NAMES=my-app,another-app`
  - Alphanumeric + hyphens, 2-50 characters
- **Version Validation**: Semantic versioning format (e.g., `1.0.0`, `2.1.3-beta`)
- **Client ID Format**: `{client_name}@{client_version}@{session_id}`
- **Storage**: Redis-backed express-session
  - Rolling sessions (extends on activity)
  - Secure cookies in production
  - Prefix: `sess:`

### 2. Rate Limiting (Tiered)
Three layers of protection:

| Tier | Scope | Limit | Purpose |
|------|-------|-------|---------|
| Global | IP address | 20 req/min | Prevent abuse |
| Session | Session ID | 100 req/10min | Fair usage per user |
| Burst | IP address | 3 req/sec | Prevent rapid hammering |

- **Distributed Storage**: Redis-based throttler storage
- **Proxy Support**: Custom guard extracts real IP from `X-Forwarded-For`
- **Response Headers**: 
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

### 3. OpenSearch with UBI Plugin
- **UBI (User Behavior Insights)**: OpenSearch plugin that automatically captures:
  - **Queries**: `ubi_queries` index
    - `client_id`: Client identifier from session
    - `query_id`: Unique query identifier
    - `user_query`: The search query text
    - `timestamp`: When the query was executed
  - **Events**: `ubi_events` index
    - `query_id`: Links to originating query
    - `action_name`: Event type (click, scroll, etc.)
    - `event_attributes.object.object_id`: Document ID
    - `session_id`: Session identifier

- **Plugin Requirement**: Must have UBI plugin installed
  - Verified via health check: `/health/opensearch`
  - Plugin creates indices automatically

### 4. Analytics API
REST endpoints for querying UBI data:

| Endpoint | Purpose | Data Source |
|----------|---------|-------------|
| `GET /analytics/top-searches` | Most frequent queries | `ubi_queries` aggregation |
| `GET /analytics/popular-documents` | Most-clicked documents | `ubi_events` (action=click) |
| `GET /analytics/events-by-action` | Event counts by type | `ubi_events` aggregation |
| `GET /analytics/stats` | Overall statistics | Both indices |

### 5. Health Monitoring
- `GET /health` - Overall system health
- `GET /health/redis` - Session store connectivity & session count
- `GET /health/opensearch` - Cluster status & UBI plugin verification

## Data Flow

### Session Initialization
```
Frontend → GET /session/init
              ?client_name=my-app
              &client_version=1.0.0
                    ↓
         Validate client_name (whitelist)
                    ↓
         Validate client_version (semver)
                    ↓
         Create express-session
                    ↓
         Store in Redis (sess:abc123)
                    ↓
         Construct client_id:
         my-app@1.0.0@sess_abc123
                    ↓
         Return { sessionId, clientId }
```

### Search & Event Tracking (External)
```
User Search → Search API with UBI
                    ↓
         OpenSearch UBI Plugin intercepts
                    ↓
         Write to ubi_queries index
         (includes client_id from request)
                    ↓
         User clicks result
                    ↓
         Write to ubi_events index
         (includes query_id, action, object_id)
```

### Analytics Query
```
Client Request → Analytics Controller
                       ↓
                Analytics Service
                       ↓
         Query ubi_queries/ubi_events
         with date range filter
                       ↓
         Aggregate results
         (top searches, popular docs, etc.)
                       ↓
         Transform and return JSON
```

## Configuration Management

### NestJS Config Modules

```
src/config/
  ├── redis.config.ts      - Redis connection & session store
  ├── opensearch.config.ts - OpenSearch client config
  └── app.config.ts        - App settings, session, throttle, whitelist
```

All configs use environment variables with validation:
- Type-safe configuration objects
- Registered globally with `ConfigModule`
- Injected via dependency injection

### Key Environment Variables

```bash
# Session Management
SESSION_SECRET=your-secret-key-here
SESSION_MAX_AGE_MS=86400000  # 24 hours
SESSION_SECURE=false          # true in production
TRUST_PROXY=false             # true behind reverse proxy

# Rate Limiting
THROTTLE_GLOBAL_LIMIT=20      # req/min per IP
THROTTLE_SESSION_LIMIT=100    # req/10min per session
THROTTLE_BURST_LIMIT=3        # req/sec per IP

# Client Validation
ALLOWED_CLIENT_NAMES=my-app,frontend,mobile-app

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenSearch
OPENSEARCH_HOST=http://localhost:9200
```

## Scalability Patterns

### Horizontal Scaling
Run multiple Analytics Goblin instances:
```bash
# Instance 1
PORT=3001 npm run start:prod

# Instance 2  
PORT=3002 npm run start:prod

# Instance N
PORT=300N npm run start:prod
```

All instances consume from same BullMQ queue:
- Jobs distributed automatically
- No duplicate processing (job locking)
- Linear scaling with worker count

### Vertical Scaling
- Increase Redis memory for more sessions
- Add more CPU/RAM to OpenSearch nodes
- Optimize index shard allocation

## Resilience & Reliability

### Graceful Degradation
- Analytics API continues if OpenSearch temporarily unavailable
- Session creation continues if Redis connection recovers
- Health checks detect partial failures

### Error Handling
```
Session Init Error
      ↓
Validate client_name/version
      ↓
[Invalid] → 400 Bad Request
[Valid but Redis down] → 503 Service Unavailable
      ↓
Create session in Redis
      ↓
Return session ID & client_id
```

### Rate Limiting Behavior
```
Request arrives
      ↓
Check global IP limit (20/min)
      ↓ [exceeded]
429 Too Many Requests
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1234567890
      ↓ [ok]
Check session limit (100/10min)
      ↓ [exceeded]
429 Too Many Requests
      ↓ [ok]
Check burst limit (3/sec)
      ↓ [ok]
Process request
```

### Data Durability
- Sessions: Redis persistence (AOF/RDB)
- OpenSearch: Replica shards
- UBI indices managed by plugin

## Security Considerations

### Current Implementation
- Client validation via whitelist (env-based)
- Semantic version format validation
- Three-tier rate limiting
- Secure cookies in production
- Proxy trust for real IP extraction
- CORS configured via environment variable
- OpenSearch basic auth support

### Planned Enhancements (see future-improvements.md)
- JWT-based API authentication
- Role-based access control for analytics endpoints
- PII detection in UBI data
- Audit logging for session creation

## Performance Optimization

### Query Optimization
- UBI plugin handles indexing automatically
- Aggregations on keyword fields (client_id, query_id)
- Date range filters on timestamp fields
- Efficient nested queries for events

### Session Optimization
- Redis-backed session storage
- Rolling sessions extend on activity
- Configurable session TTL

### Future Optimizations
- Pre-computed rollups (hourly/daily analytics)
- Redis caching layer for hot analytics queries
- Query result pagination
- OpenSearch query cache enablement

## Monitoring Metrics

### Operational Metrics
- Session creation rate (sessions/minute)
- Active session count (Redis keys)
- Rate limit hit rate (429 responses %)
- OpenSearch query latency
- UBI plugin health status

### Business Metrics
- Search volume trends (from ubi_queries)
- Event distribution by action (from ubi_events)
- Popular documents (click events)
- Unique users/sessions over time

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | NestJS | 11.x |
| Language | TypeScript | 5.7 |
| Sessions | express-session | 1.18.x |
| Session Store | connect-redis | 9.x |
| Rate Limiting | @nestjs/throttler | 6.4.x |
| Cache/Session Store | Redis | 7.x |
| Search Engine | OpenSearch | 2.x |
| UBI Plugin | OpenSearch UBI | Latest |
| Validation | class-validator | 0.14.x |
| Runtime | Node.js | 18+ or 20+ |

## Directory Structure

```
analytics-goblin/
├── src/
│   ├── analytics/          # Analytics API endpoints
│   │   ├── analytics.controller.ts
│   │   ├── analytics.service.ts
│   │   ├── analytics.module.ts
│   │   └── interfaces/
│   │       └── analytics.interface.ts  # UBI data types
│   ├── session/            # Session management
│   │   ├── session.controller.ts
│   │   ├── session.service.ts
│   │   ├── session.module.ts
│   │   └── dto/
│   │       └── init-session.dto.ts     # Validation
│   ├── health/             # Health checks
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── health.module.ts
│   ├── opensearch/         # OpenSearch client
│   │   ├── opensearch.service.ts       # UBI queries
│   │   └── opensearch.module.ts
│   ├── config/             # Configuration
│   │   ├── app.config.ts               # Session, throttle, whitelist
│   │   ├── redis.config.ts             # Redis connection
│   │   └── opensearch.config.ts
│   ├── common/             # Shared utilities
│   │   └── guards/
│   │       └── throttler-proxy.guard.ts  # Real IP extraction
│   ├── app.module.ts       # Root module
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── main.ts             # Bootstrap with session config
├── docs/
│   ├── architecture.md     # This file
│   ├── api-examples.md     # API usage examples
│   └── local-development.md
└── test/
    └── app.e2e-spec.ts
```

## Key Differences from Original Design

### Removed Components
- ❌ BullMQ queue consumer
- ❌ Metrics indexing service
- ❌ Custom index templates
- ❌ Daily index rollover
- ❌ Zero-results tracking (now in UBI)
- ❌ Performance trends (now in UBI)

### New Components
- ✅ Session management module
- ✅ Client validation with whitelist
- ✅ Three-tier rate limiting
- ✅ UBI-based analytics
- ✅ OpenSearch UBI plugin integration
- ✅ Redis session store

### Changed Behavior
- **Before**: Search API → BullMQ → Consumer → OpenSearch
- **After**: Frontend → Session Init → Search API (with UBI) → OpenSearch UBI Plugin

## Related Documentation
- [API Examples](./api-examples.md) - Usage examples for all endpoints
- [Local Development](./local-development.md) - Setup and testing
- [Future Improvements](./future-improvements.md) - Roadmap

