# Frontend Implementation Guide

This guide provides step-by-step instructions for integrating Analytics Goblin into your frontend web application to track user search behavior using the OpenSearch UBI (User Behavior Insights) 1.3.0 specification.

## Overview

Analytics Goblin is a GDPR-compliant analytics service that:
- Generates session IDs for client-side storage (no cookies)
- Accepts client-side query submissions for third-party GraphQL searches
- Anonymizes IP addresses for privacy compliance
- Provides fire-and-forget telemetry endpoints

**Key Privacy Features:**
- ✅ No server-side sessions
- ✅ No cookies (localStorage only)
- ✅ IP anonymization (GDPR-compliant)
- ✅ Client controls session lifecycle
- ✅ Fire-and-forget submissions (no data returned to client)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Session Management](#session-management)
3. [Tracking Client-Side Searches](#tracking-client-side-searches)
4. [Batch Submissions](#batch-submissions)
5. [Complete Integration Example](#complete-integration-example)
6. [TypeScript Types](#typescript-types)
7. [Rate Limiting](#rate-limiting)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Prerequisites

### Environment Setup

Set the Analytics Goblin API base URL in your frontend environment:

```bash
# .env.local (Next.js, Vite, etc.)
VITE_ANALYTICS_API_URL=http://localhost:3001
# or
NEXT_PUBLIC_ANALYTICS_API_URL=http://localhost:3001
```

### Required Information

Before integrating, you need:
- **Client Name**: Your application identifier (alphanumeric + hyphens only)
- **Client Version**: Your app version in semver format (e.g., `1.0.0`)
- **Application Type**: One of `graphql-images`, `graphql-video`, `graphql-audio`

Your client name must be whitelisted in the Analytics Goblin service via the `ALLOWED_CLIENT_NAMES` environment variable.

---

## Session Management

### 1. Initialize Session on App Load

Create a session when your application loads. The session ID should be stored in `localStorage` and reused across page loads.

```typescript
// lib/analytics.ts
const ANALYTICS_API_URL = import.meta.env.VITE_ANALYTICS_API_URL;
const CLIENT_NAME = 'my-search-app';
const CLIENT_VERSION = '1.0.0';
const SESSION_STORAGE_KEY = 'analytics_session_id';
const CLIENT_ID_STORAGE_KEY = 'analytics_client_id';

interface SessionInitResponse {
  session_id: string;
  client_id: string;
}

async function initializeSession(): Promise<{ sessionId: string; clientId: string }> {
  // Check if session already exists
  const existingSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  const existingClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  
  if (existingSessionId && existingClientId) {
    return { sessionId: existingSessionId, clientId: existingClientId };
  }

  // Request new session from Analytics Goblin
  try {
    const response = await fetch(
      `${ANALYTICS_API_URL}/session/init?client_name=${CLIENT_NAME}&client_version=${CLIENT_VERSION}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Session init failed: ${response.status}`);
    }

    const data: SessionInitResponse = await response.json();
    
    // Store session ID and client ID in localStorage
    localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, data.client_id);
    
    return { sessionId: data.session_id, clientId: data.client_id };
  } catch (error) {
    console.error('Failed to initialize analytics session:', error);
    // Generate fallback IDs (still track locally even if API fails)
    const fallbackSessionId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fallbackClientId = `${CLIENT_NAME}@${CLIENT_VERSION}@${fallbackSessionId}`;
    localStorage.setItem(SESSION_STORAGE_KEY, fallbackSessionId);
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, fallbackClientId);
    return { sessionId: fallbackSessionId, clientId: fallbackClientId };
  }
}

// Initialize on app load
let session: { sessionId: string; clientId: string } | null = null;

export async function getSession(): Promise<{ sessionId: string; clientId: string }> {
  if (!session) {
    session = await initializeSession();
  }
  return session;
}

// Optional: Clear session (e.g., on logout or user request)
export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  session = null;
}
```

### 2. Call Session Init Early

Initialize the session as early as possible in your app lifecycle:

```typescript
// App.tsx (React)
import { useEffect } from 'react';
import { getSession } from './lib/analytics';

function App() {
  useEffect(() => {
    // Initialize session on mount
    getSession().catch(console.error);
  }, []);

  return <YourApp />;
}
```

```typescript
// main.ts (Vue)
import { getSession } from './lib/analytics';

// Initialize before mounting
getSession().then(() => {
  app.mount('#app');
});
```

---

## Tracking Client-Side Searches

### UBI 1.3.0 Query Submission

For client-side searches (e.g., GraphQL queries to third-party APIs), submit the query and results to Analytics Goblin after the search completes.

```typescript
// lib/analytics.ts

interface UbiQuery {
  application: string;
  query_id: string;
  client_id: string;
  user_query: string;
  timestamp?: string;
  query_response_id?: string;
  query_response_hit_ids?: string[];
  query_attributes?: Record<string, any>;
  object_id_field?: string;
}

export async function submitQuery(
  query: string,
  application: 'graphql-images' | 'graphql-video' | 'graphql-audio',
  results: { id: string }[],
  attributes?: Record<string, any>
): Promise<void> {
  try {
    const { clientId } = await getSession();
    
    const queryData: UbiQuery = {
      application,
      query_id: crypto.randomUUID(),
      client_id: clientId,
      user_query: query,
      timestamp: new Date().toISOString(),
      query_response_hit_ids: results.slice(0, 100).map(r => r.id),
      ...(attributes && { query_attributes: attributes })
    };

    // Fire-and-forget - don't wait for response
    fetch(`${ANALYTICS_API_URL}/analytics/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryData),
      keepalive: true // Ensure request completes even if page unloads
    }).catch(() => {
      // Silently fail - analytics shouldn't break user experience
    });
  } catch (error) {
    // Log error but don't throw - analytics is non-critical
    console.debug('Analytics submission failed:', error);
  }
}
```

### Example: Image Search Component

```typescript
// components/ImageSearch.tsx
import { submitQuery } from '../lib/analytics';

async function searchImages(query: string) {
  // Perform GraphQL search on third-party API
  const response = await fetch('https://third-party-api.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query SearchImages($query: String!) {
          images(query: $query, limit: 20) {
            id
            url
            title
          }
        }
      `,
      variables: { query }
    })
  });

  const { data } = await response.json();
  const results = data.images;

  // Submit to analytics (fire-and-forget)
  submitQuery(
    query,
    'graphql-images',
    results,
    {
      result_count: results.length,
      has_results: results.length > 0
    }
  );

  return results;
}
```

### Example: Video Search with Filters

```typescript
// components/VideoSearch.tsx
import { submitQuery } from '../lib/analytics';

async function searchVideos(
  query: string,
  filters: { duration?: string; quality?: string }
) {
  // Perform search
  const response = await fetchVideosFromAPI(query, filters);
  const results = response.videos;

  // Submit with filter metadata
  submitQuery(
    query,
    'graphql-video',
    results,
    {
      filters: Object.keys(filters),
      filter_count: Object.keys(filters).length,
      duration_filter: filters.duration,
      quality_filter: filters.quality,
      result_count: results.length
    }
  );

  return results;
}
```

---

## Batch Submissions

For better performance, accumulate queries and submit them in batches:

```typescript
// lib/analytics-queue.ts

class AnalyticsQueue {
  private queue: UbiQuery[] = [];
  private readonly batchSize = 10;
  private readonly flushInterval = 30000; // 30 seconds
  private flushTimer: number | null = null;

  constructor() {
    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  add(queryData: UbiQuery): void {
    this.queue.push(queryData);

    // Auto-flush when batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else {
      // Schedule flush
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = window.setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  flush(): void {
    if (this.queue.length === 0) return;

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const queries = [...this.queue];
    this.queue = [];

    // Send batch
    fetch(`${ANALYTICS_API_URL}/analytics/queries/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
      keepalive: true
    }).catch(() => {
      // Silently fail
    });
  }
}

export const analyticsQueue = new AnalyticsQueue();

// Modified submitQuery to use queue
export async function submitQueryBatched(
  query: string,
  application: 'graphql-images' | 'graphql-video' | 'graphql-audio',
  results: { id: string }[],
  attributes?: Record<string, any>
): Promise<void> {
  try {
    const { clientId } = await getSession();
    
    const queryData: UbiQuery = {
      application,
      query_id: crypto.randomUUID(),
      client_id: clientId,
      user_query: query,
      timestamp: new Date().toISOString(),
      query_response_hit_ids: results.slice(0, 100).map(r => r.id),
      ...(attributes && { query_attributes: attributes })
    };

    analyticsQueue.add(queryData);
  } catch (error) {
    console.debug('Analytics queuing failed:', error);
  }
}
```

---
### UBI Query Format (Backend Reference)

Your search backend should log queries to OpenSearch's `ubi_queries` index:

```json
{
  "query_id": "query-1699999999999",
  "user_query": "laptop recommendations",
  "client_id": "my-search-app@1.0.0@sess_abc123xyz",
  "timestamp": "2025-11-15T10:30:00.000Z",
  "query_response": {
    "hits": [
      {
        "doc_id": "doc-123",
        "position": 0
      }
    ]
  }
}
```

---

## Tracking User Events

### UBI Event Tracking

Track user interactions with search results (clicks, hovers, etc.) by sending events to OpenSearch UBI.

**Important:** Like queries, UBI events are typically logged via your **search backend** to maintain data consistency. The frontend sends event data to your backend, which logs to OpenSearch.

```typescript
// lib/analytics.ts
export interface UBIEvent {
  action_name: string;
  client_id: string;
  query_id?: string;
  timestamp: string;
  event_attributes: {
    object?: {
      object_id?: string;
      object_id_field?: string;
      description?: string;
    };
    position?: {
      ordinal?: number;
      x?: number;
      y?: number;
    };
  };
}

export async function trackEvent(
  actionName: string,
  queryId?: string,
  attributes: UBIEvent['event_attributes'] = {}
): Promise<void> {
  const sessionId = await getSessionId();
  const clientId = buildClientId(sessionId);

  const event: UBIEvent = {
    action_name: actionName,
    client_id: clientId,
    query_id: queryId,
    timestamp: new Date().toISOString(),
    event_attributes: attributes,
  };

  try {
    // Send to YOUR backend to log in OpenSearch UBI
    await fetch('https://your-search-api.com/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}
```

### Common Event Examples

```typescript
// Track result click
function trackResultClick(docId: string, position: number, queryId: string) {
  trackEvent('result_click', queryId, {
    object: {
      object_id: docId,
      object_id_field: '_id',
      description: 'User clicked search result',
    },
    position: {
      ordinal: position,
    },
  });
}

// Track hover/dwell time
function trackResultHover(docId: string, position: number, queryId: string) {
  trackEvent('result_hover', queryId, {
    object: {
      object_id: docId,
      object_id_field: '_id',
    },
    position: {
      ordinal: position,
    },
  });
}

// Track scroll depth
function trackScrollDepth(depth: number) {
  trackEvent('scroll', undefined, {
    position: {
      y: depth,
    },
  });
}

// Track filter application
function trackFilterApplied(filterName: string, filterValue: string) {
  trackEvent('filter_applied', undefined, {
    object: {
      description: `${filterName}: ${filterValue}`,
    },
  });
}
```

### React Component Example

```typescript
// SearchResult.tsx
import { trackResultClick } from '../lib/analytics';

interface SearchResultProps {
  doc: SearchDocument;
  position: number;
  queryId: string;
}

function SearchResult({ doc, position, queryId }: SearchResultProps) {
  const handleClick = () => {
    trackResultClick(doc.id, position, queryId);
    // Navigate to result...
  };

  return (
    <div onClick={handleClick}>
      <h3>{doc.title}</h3>
      <p>{doc.description}</p>
    </div>
  );
}
```

---

## Complete Integration Example

Here's a full example showing session init, search tracking, and event tracking:

```typescript
// lib/analytics.ts
const ANALYTICS_API_URL = import.meta.env.VITE_ANALYTICS_API_URL;
const CLIENT_NAME = 'my-search-app';
const CLIENT_VERSION = '1.0.0';
const SESSION_STORAGE_KEY = 'analytics_session_id';

class AnalyticsService {
  private sessionId: string | null = null;

  async initialize(): Promise<void> {
    this.sessionId = await this.initSession();
  }

  private async initSession(): Promise<string> {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    try {
      const response = await fetch(
        `${ANALYTICS_API_URL}/session/init?client_name=${CLIENT_NAME}&client_version=${CLIENT_VERSION}`
      );
      const data = await response.json();
      localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
      return data.session_id;
    } catch (error) {
      console.error('Session init failed:', error);
      const fallback = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(SESSION_STORAGE_KEY, fallback);
      return fallback;
    }
  }

  getClientId(): string {
    if (!this.sessionId) {
      throw new Error('Analytics not initialized');
    }
    return `${CLIENT_NAME}@${CLIENT_VERSION}@${this.sessionId}`;
  }

  async trackEvent(actionName: string, queryId?: string, attributes = {}): Promise<void> {
    const event = {
      action_name: actionName,
      client_id: this.getClientId(),
      query_id: queryId,
      timestamp: new Date().toISOString(),
      event_attributes: attributes,
    };

    // Send to your backend
    await fetch('https://your-search-api.com/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(console.error);
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.sessionId = null;
  }
}

export const analytics = new AnalyticsService();
```

```typescript
// App.tsx
import { useEffect } from 'react';
import { analytics } from './lib/analytics';

function App() {
  useEffect(() => {
    analytics.initialize();
  }, []);

  return <YourApp />;
}
```

```typescript
// SearchPage.tsx
import { useState } from 'react';
import { analytics } from '../lib/analytics';

function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [queryId, setQueryId] = useState('');

  const handleSearch = async () => {
    const currentQueryId = `query-${Date.now()}`;
    setQueryId(currentQueryId);

    const response = await fetch('https://your-search-api.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        client_id: analytics.getClientId(),
        query_id: currentQueryId,
      }),
    });

    const data = await response.json();
    setResults(data.results);
  };

  const handleResultClick = (docId: string, position: number) => {
    analytics.trackEvent('result_click', queryId, {
      object: { object_id: docId, object_id_field: '_id' },
      position: { ordinal: position },
    });
  };

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      {results.map((result, idx) => (
        <div key={result.id} onClick={() => handleResultClick(result.id, idx)}>
          <h3>{result.title}</h3>
        </div>
      ))}
    </div>
  );
}
```

---

## TypeScript Types

```typescript
// types/analytics.ts
export interface SessionInitResponse {
  session_id: string;
  client_id: string;
  message: string;
}

export interface UBIEvent {
  action_name: string;
  client_id: string;
  query_id?: string;
  timestamp: string;
  event_attributes: {
    object?: {
      object_id?: string;
      object_id_field?: string;
      description?: string;
    };
    position?: {
      ordinal?: number;
      x?: number;
      y?: number;
    };
  };
}

export interface TopSearchQuery {
  query: string;
  count: number;
}

export interface PopularDocument {
  doc_id: string;
  click_count: number;
}

export interface EventsByAction {
  action_name: string;
  event_count: number;
}

export interface AnalyticsResponse<T> {
  data: T[];
  count: number;
  time_range?: {
    from: string;
    to: string;
  };
}
```

---

## Rate Limiting

Analytics Goblin implements two-tier rate limiting based on anonymized IP addresses:

- **Global Tier**: 20 requests per minute per IP
- **Burst Tier**: 3 requests per second per IP

### Handling Rate Limits

```typescript
async function initializeSession(): Promise<string> {
  try {
    const response = await fetch(/* ... */);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      console.warn(`Rate limited. Retry after ${retryAfter} seconds`);
      
      // Use fallback session
      const fallback = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(SESSION_STORAGE_KEY, fallback);
      return fallback;
    }

    // ... normal flow
  } catch (error) {
    // Handle network errors
  }
}
```

### Best Practices to Avoid Rate Limits

1. **Cache Session ID**: Always check `localStorage` before requesting a new session
2. **Debounce Events**: Don't track every keystroke or mouse movement
3. **Batch Events**: Consider batching multiple events if tracking frequently
4. **Retry with Backoff**: Implement exponential backoff for retries

```typescript
// Debounce example for search-as-you-type
import { debounce } from 'lodash';

const debouncedSearch = debounce(async (query: string) => {
  await performSearch(query);
}, 500); // Wait 500ms after user stops typing
```

---

## Error Handling

### Graceful Degradation

Your app should continue to work even if Analytics Goblin is unavailable:

```typescript
async function trackEvent(action: string, ...args): Promise<void> {
  try {
    await analytics.trackEvent(action, ...args);
  } catch (error) {
    // Log error but don't break user experience
    console.warn('Analytics tracking failed:', error);
  }
}
```

### Validation Errors

Handle validation errors from the session init endpoint:

```typescript
async function initializeSession(): Promise<string> {
  try {
    const response = await fetch(/* ... */);

    if (response.status === 400) {
      const error = await response.json();
      console.error('Validation error:', error.message);
      
      if (error.message.includes('client_name')) {
        console.error('Client name not whitelisted or invalid format');
      }
      
      // Use fallback
      return generateFallbackSession();
    }

    // ... normal flow
  } catch (error) {
    return generateFallbackSession();
  }
}
```

---

## Best Practices

### 1. Privacy & GDPR Compliance

- ✅ **No Cookies**: Session stored in `localStorage` only
- ✅ **Clear Instructions**: Inform users they can clear `localStorage` anytime
- ✅ **No PII**: Never send personally identifiable information in queries or events
- ✅ **Session Control**: Provide UI for users to reset their session

```typescript
// Privacy-friendly: Clear session on logout
function handleLogout() {
  analytics.clearSession();
  // ... rest of logout logic
}
```

### 2. Performance Optimization

- **Lazy Load**: Only initialize analytics when needed
- **Async/Non-Blocking**: Never block UI for analytics calls
- **Debounce**: Limit event frequency for high-volume interactions

```typescript
// Lazy initialization
let analyticsInitialized = false;

async function ensureAnalytics() {
  if (!analyticsInitialized) {
    await analytics.initialize();
    analyticsInitialized = true;
  }
}

// Call before first use
await ensureAnalytics();
analytics.trackEvent('page_view');
```

### 3. Testing

```typescript
// Mock analytics in tests
vi.mock('./lib/analytics', () => ({
  analytics: {
    initialize: vi.fn(),
    trackEvent: vi.fn(),
    getClientId: vi.fn(() => 'test-client@1.0.0@test-session'),
    clearSession: vi.fn(),
  },
}));

// Test session initialization
it('initializes session on mount', async () => {
  render(<App />);
  await waitFor(() => {
    expect(analytics.initialize).toHaveBeenCalled();
  });
});
```

### 4. Monitoring

Track analytics health in your application:

```typescript
// Monitor analytics availability
async function checkAnalyticsHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Periodically check (optional)
setInterval(async () => {
  const isHealthy = await checkAnalyticsHealth();
  if (!isHealthy) {
    console.warn('Analytics service unavailable');
  }
}, 60000); // Check every minute
```

### 5. Client ID Format

Always follow the client_id format expected by UBI:

```
{client_name}@{client_version}@{session_id}
```

Example: `my-search-app@1.0.0@sess_1699999999999_abc123`

### 6. Event Naming Conventions

Use consistent, descriptive event names:

```typescript
// Good
trackEvent('result_click', queryId, { ... });
trackEvent('filter_applied', queryId, { ... });
trackEvent('page_scroll', undefined, { ... });

// Avoid
trackEvent('click', queryId, { ... }); // Too generic
trackEvent('user_clicked_result', queryId, { ... }); // Redundant
```

---

## Troubleshooting

### Session Not Persisting

**Problem**: New session created on every page load  
**Solution**: Verify `localStorage` is not being cleared

```typescript
// Check if localStorage is available
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
```

### Client Name Not Whitelisted

**Problem**: 400 error with "client_name not allowed"  
**Solution**: Contact Analytics Goblin admin to add your client name to `ALLOWED_CLIENT_NAMES`

### CORS Errors

**Problem**: CORS policy blocking requests  
**Solution**: Ensure Analytics Goblin has your domain in `CORS_ORIGINS` environment variable

```bash
# Analytics Goblin .env
CORS_ORIGINS=https://your-app.com,http://localhost:3000
```

---

## Additional Resources

- [OpenSearch UBI Specification](https://github.com/o19s/opensearch-ubi)
- [Analytics Goblin API Documentation](./api-examples.md)
- [Analytics Goblin Architecture](./architecture.md)
- [Local Development Setup](./local-development.md)

---

## Support

For issues or questions:
1. Check the [API Examples](./api-examples.md) for request/response formats
2. Review [Architecture Documentation](./architecture.md) for system design
3. Open an issue in the Analytics Goblin repository

