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

## Health Check Examples

### Overall System Health

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "info": {
    "redis": {
      "status": "up"
    },
    "opensearch": {
      "status": "up",
      "ubiPluginInstalled": true,
      "clusterName": "docker-cluster",
      "clusterStatus": "green"
    }
  }
}
```

### Check Individual Services

```bash
# Redis only
curl http://localhost:3001/health/redis

# OpenSearch only
curl http://localhost:3001/health/opensearch
```

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

## Analytics Examples

All analytics endpoints query UBI data and accept date ranges in ISO 8601 format.

### Example: Last 7 Days

```bash
START_DATE=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)
END_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Top searches from last 7 days
curl "http://localhost:3001/analytics/top-searches?start=${START_DATE}&end=${END_DATE}&limit=20"
```

### Top Searches

```bash
curl "http://localhost:3001/analytics/top-searches?start=2025-11-01T00:00:00Z&end=2025-11-14T23:59:59Z&limit=10"
```

Response:
```json
[
  {
    "query": "kubernetes deployment",
    "count": 1523,
    "uniqueUsers": 842
  },
  {
    "query": "docker compose tutorial",
    "count": 987,
    "uniqueUsers": 654
  }
]
```

### Popular Documents

Find which documents users click most frequently (from UBI events):

```bash
curl "http://localhost:3001/analytics/popular-documents?start=2025-11-01T00:00:00Z&end=2025-11-14T23:59:59Z&limit=10"
```

Response:
```json
[
  {
    "documentId": "doc-12345",
    "clickCount": 4532,
    "uniqueUsers": 2891
  },
  {
    "documentId": "doc-67890",
    "clickCount": 3421,
    "uniqueUsers": 2103
  }
]
```

### Events by Action

Analyze user behavior events by action type:

```bash
curl "http://localhost:3001/analytics/events-by-action?start=2025-11-01T00:00:00Z&end=2025-11-14T23:59:59Z"
```

Response:
```json
[
  {
    "action": "click",
    "count": 45230
  },
  {
    "action": "scroll",
    "count": 12890
  },
  {
    "action": "hover",
    "count": 8340
  }
]

### Search Statistics Summary

Get aggregated stats for a time period:

```bash
curl "http://localhost:3001/analytics/stats?start=2025-11-01T00:00:00Z&end=2025-11-14T23:59:59Z"
```

Response:
```json
{
  "totalQueries": 125340,
  "uniqueQueries": 8234,
  "totalEvents": 67890,
  "uniqueUsers": 4521,
  "topActions": [
    { "action": "click", "count": 45000 },
    { "action": "scroll", "count": 12000 }
  ]
}
```

## Advanced Query Examples

### Last 24 Hours Activity

```bash
curl "http://localhost:3001/analytics/stats?start=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)&end=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### This Month's Top Searches

```bash
MONTH_START="2025-11-01T00:00:00Z"
MONTH_END="2025-11-30T23:59:59Z"

curl "http://localhost:3001/analytics/top-searches?start=${MONTH_START}&end=${MONTH_END}&limit=50"
```

### Most Clicked Documents

```bash
curl "http://localhost:3001/analytics/popular-documents?start=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)&end=$(date -u +%Y-%m-%dT%H:%M:%SZ)&limit=20"
```

## Integration Examples

### Shell Script

```bash
#!/bin/bash

# Daily UBI analytics report
YESTERDAY=$(date -u -d '1 day ago' +%Y-%m-%dT00:00:00Z)
TODAY=$(date -u +%Y-%m-%dT00:00:00Z)

echo "=== Daily UBI Analytics Report ==="
echo ""
echo "Top 10 Searches:"
curl -s "http://localhost:3001/analytics/top-searches?start=${YESTERDAY}&end=${TODAY}&limit=10" | jq '.'

echo ""
echo "Popular Documents (by clicks):"
curl -s "http://localhost:3001/analytics/popular-documents?start=${YESTERDAY}&end=${TODAY}&limit=5" | jq '.'

echo ""
echo "Events by Action:"
curl -s "http://localhost:3001/analytics/events-by-action?start=${YESTERDAY}&end=${TODAY}" | jq '.'

echo ""
echo "Overall Stats:"
curl -s "http://localhost:3001/analytics/stats?start=${YESTERDAY}&end=${TODAY}" | jq '.'
```

### Python Client

```python
import requests
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3001"

def get_top_searches(days=7, limit=10):
    end = datetime.utcnow()
    start = end - timedelta(days=days)
    
    params = {
        'start': start.isoformat() + 'Z',
        'end': end.isoformat() + 'Z',
        'limit': limit
    }
    
    response = requests.get(f"{BASE_URL}/analytics/top-searches", params=params)
    return response.json()

def check_health():
    response = requests.get(f"{BASE_URL}/health")
    health = response.json()
    return health['status'] == 'healthy'

# Usage
if check_health():
    top_searches = get_top_searches(days=7, limit=20)
    for search in top_searches:
        print(f"{search['query']}: {search['count']} searches")
```

### JavaScript/Node.js Client

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function getSearchStats(startDate, endDate) {
  const { data } = await axios.get(`${BASE_URL}/analytics/stats`, {
    params: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    }
  });
  return data;
}

async function getPerformanceTrends(hours = 24) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  
  const { data } = await axios.get(`${BASE_URL}/analytics/performance-trends`, {
    params: {
      start: start.toISOString(),
      end: end.toISOString(),
      interval: '1h'
    }
  });
  return data;
}

// Usage
(async () => {
  const stats = await getSearchStats(
    new Date('2025-11-01'),
    new Date('2025-11-14')
  );
  console.log('Search Stats:', stats);
  
  const trends = await getPerformanceTrends(24);
  console.log('24h Performance:', trends);
})();
```

## Error Handling

### Invalid Date Range

```bash
curl "http://localhost:3001/analytics/stats?start=invalid&end=also-invalid"
```

The API will return appropriate HTTP error codes:
- `400 Bad Request` - Invalid date format or missing required parameters
- `500 Internal Server Error` - OpenSearch or system errors

### Service Degradation

If OpenSearch is down, analytics endpoints will fail, but the health endpoint will still respond:

```json
{
  "status": "degraded",
  "timestamp": "2025-11-14T10:30:00.000Z",
  "services": {
    "redis": {
      "status": "up"
    },
    "opensearch": {
      "status": "down",
      "message": "Connection refused"
    }
  }
}
```

## Rate Limiting

GDPR-compliant rate limiting with IP anonymization:
- Global: 20 requests/minute per anonymized IP
- Burst: 3 requests/second per anonymized IP

Rate limit headers:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1234567890
```

429 response when exceeded:
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

## CORS Configuration

CORS is configured via the `CORS_ALLOWED_ORIGIN` environment variable. By default, it allows all origins (`*`).

For production, set specific origins:

```bash
CORS_ALLOWED_ORIGIN=https://dashboard.example.com
```
