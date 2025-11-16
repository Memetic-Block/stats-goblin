# Local Development Guide

Quick setup guide for running Analytics Goblin locally.

## Prerequisites

- Node.js 18+ or 20+
- Docker and Docker Compose (for infrastructure)
- Git

## Important: UBI Plugin Required

This service requires the **OpenSearch User Behavior Insights (UBI) plugin** to be installed on your OpenSearch cluster. The plugin automatically captures queries and events in `ubi_queries` and `ubi_events` indices.

## Initial Setup

### 1. Clone and Install

```bash
cd analytics-goblin
npm install
```

### 2. Start Infrastructure

```bash
# Start Redis and OpenSearch
docker-compose up -d

# Check services are running
docker-compose ps

# View logs
docker-compose logs -f
```

This starts:
- **Redis** on `localhost:6379`
- **OpenSearch** on `localhost:9200`
- **OpenSearch Dashboards** on `localhost:5601`

### 3. Configure Environment

```bash
cp .env.example .env
```

Default `.env` for local development:
```bash
# Redis (Rate Limiter Storage Only)
REDIS_MODE=standalone
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenSearch (with UBI plugin)
OPENSEARCH_HOST=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin

# Application
PORT=3001
CORS_ALLOWED_ORIGIN=*

# Rate Limiting (IP anonymization enabled)
THROTTLE_GLOBAL_LIMIT=20
THROTTLE_BURST_LIMIT=3

# Client Validation
ALLOWED_CLIENT_NAMES=web,mobile-ios,mobile-android

# GDPR: No server-side sessions, IPs anonymized
```

### 4. Run the Application

```bash
# Development mode with hot-reload
npm run start:dev

# The application will start on http://localhost:3001
```

You should see:
```
[Nest] INFO [NestApplication] Nest application successfully started
[Nest] INFO [OpenSearchService] Connected to OpenSearch cluster: docker-cluster
Analytics Goblin running on port 3001
GDPR Mode: Client-side sessions, anonymized IPs, no tracking
```

## Verify Setup

### Check Health

```bash
curl http://localhost:3001/health
```

Expected response:
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
        "completed": 0,
        "failed": 0
      }
    },
    "opensearch": {
      "status": "up",
      "details": {
        "clusterName": "docker-cluster",
        "clusterStatus": "green",
        "numberOfNodes": 1,
        "activeShards": 0
      }
    }
  }
}
```

### Check OpenSearch Directly

```bash
# Cluster health
curl http://localhost:9200/_cluster/health

# List indices
curl http://localhost:9200/_cat/indices?v
```

### Check OpenSearch UBI Plugin

```bash
# Check if UBI plugin is installed
curl http://localhost:9200/_cat/plugins

# Should show: opensearch-ubi

# Check UBI indices
curl http://localhost:9200/_cat/indices?v | grep ubi
```

### Check Redis (Rate Limiter)

```bash
# Connect to Redis CLI in Docker
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Check rate limiter keys (anonymized IPs)
redis> KEYS throttler:*
redis> exit
```

## Testing the UBI Integration

### 1. Install UBI Plugin (if not already installed)

```bash
# Inside OpenSearch container or on your OpenSearch server
bin/opensearch-plugin install https://github.com/opensearch-project/user-behavior-insights/releases/download/latest/opensearch-ubi-plugin.zip

# Restart OpenSearch
docker-compose restart opensearch
```

### 2. Verify UBI Plugin

```bash
curl http://localhost:9200/_cat/plugins
# Should show: opensearch-ubi

curl http://localhost:3001/health/opensearch
# Should show: "ubiPluginInstalled": true
```

### 3. Test Session Initialization

```bash
curl "http://localhost:3001/session/init?client_name=web&client_version=1.0.0"

# Returns:
# {
#   "session_id": "550e8400-e29b-41d4-a716-446655440000",
#   "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000"
# }
# Note: No cookies set
```

### 4. Simulate UBI Data (via your Search API)

Your search API (with UBI plugin) should send queries with the client_id:

```javascript
// Example: Your search API code
POST /your-index/_search
{
  "ext": {
    "ubi": {
      "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "query": {
    "match": { "content": "nestjs tutorial" }
  }
}
```

The UBI plugin will automatically populate `ubi_queries` and `ubi_events` indices.

### 5. Query UBI Data

```bash
# Check if UBI indices exist
curl "http://localhost:9200/_cat/indices?v" | grep ubi

# Query ubi_queries index
curl "http://localhost:9200/ubi_queries/_search?pretty&size=5"

# Query ubi_events index
curl "http://localhost:9200/ubi_events/_search?pretty&size=5"

# Query via Analytics API
START=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl "http://localhost:3001/analytics/top-searches?start=${START}&end=${END}"
curl "http://localhost:3001/analytics/popular-documents?start=${START}&end=${END}"
curl "http://localhost:3001/analytics/events-by-action?start=${START}&end=${END}"
```

## Development Workflow

### Hot Reload

The app runs in watch mode with `npm run start:dev`. Changes to TypeScript files will trigger automatic recompilation and restart.

### Debugging

#### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug NestJS",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "start:debug"],
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Run with F5 or from Debug panel.

#### Manual Debug

```bash
npm run start:debug
```

Then attach debugger to `localhost:9229`.

### Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

### Linting and Formatting

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix

# Format code
npm run format
```

## Common Tasks

### Clear UBI Data

```bash
# Delete UBI indices (will be recreated by UBI plugin)
curl -X DELETE "http://localhost:9200/ubi_queries"
curl -X DELETE "http://localhost:9200/ubi_events"

# Clear Redis rate limiter data
docker exec -it $(docker ps -q -f name=redis) redis-cli FLUSHALL
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>

# Or use different port
PORT=3002 npm run start:dev
```

### OpenSearch Connection Refused

```bash
# Check if OpenSearch is running
docker ps | grep opensearch

# View OpenSearch logs
docker logs $(docker ps -q -f name=opensearch)

# Restart OpenSearch
docker-compose restart opensearch
```

### Redis Connection Errors

```bash
# Check Redis status
docker ps | grep redis

# Test connection
docker exec -it $(docker ps -q -f name=redis) redis-cli ping

# Should return: PONG
```

### Build Errors

```bash
# Clean build artifacts
rm -rf dist/

# Clean node_modules and reinstall
rm -rf node_modules/
npm install

# Rebuild
npm run build
```

### TypeScript Errors

```bash
# Check TypeScript configuration
npx tsc --noEmit

# View detailed errors
npm run build -- --verbose
```

## Production Build

```bash
# Build for production
npm run build

# Run production build
npm run start:prod
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `REDIS_MODE` | `standalone` | Redis mode: `standalone` or `sentinel` |
| `REDIS_HOST` | `localhost` | Redis host (standalone mode) |
| `REDIS_PORT` | `6379` | Redis port (standalone mode) |
| `OPENSEARCH_HOST` | `http://localhost:9200` | OpenSearch endpoint |
| `OPENSEARCH_USERNAME` | - | OpenSearch username |
| `OPENSEARCH_PASSWORD` | - | OpenSearch password |
| `THROTTLE_GLOBAL_LIMIT` | `20` | Requests/min per anonymized IP |
| `THROTTLE_BURST_LIMIT` | `3` | Requests/sec per anonymized IP |
| `ALLOWED_CLIENT_NAMES` | - | Comma-separated whitelist |
| `CORS_ALLOWED_ORIGIN` | `*` | CORS allowed origins |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-For headers |

## Next Steps

- Read [API Examples](./api-examples.md) for query examples
- Review [Architecture](./architecture.md) for system design
- Check [Future Improvements](./future-improvements.md) for roadmap
