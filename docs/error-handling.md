# Error Handling Guide for Frontend Clients

## Overview

The Analytics Goblin API returns structured error responses that help clients determine what action to take when errors occur. This document explains the error response format and provides guidance on handling different error scenarios.

## Error Response Format

All error responses follow this structure:

```typescript
{
  statusCode: number        // HTTP status code
  message: string | string[] // Human-readable error message(s)
  error: string             // Error name (e.g., "Bad Request")
  errorCode?: string        // Machine-readable error code
  action?: string           // Recommended action for the client
  retry?: boolean           // Whether the request should be retried
}
```

## Error Codes

### Session-Related Errors

| Error Code | Status | Action | Description |
|------------|--------|--------|-------------|
| `INVALID_SESSION` | 401 | `REQUEST_NEW_SESSION` | Session ID is invalid or not found |
| `EXPIRED_SESSION` | 400 | `REQUEST_NEW_SESSION` | Session has expired (24h TTL) |

### Validation Errors

| Error Code | Status | Action | Description |
|------------|--------|--------|-------------|
| `VALIDATION_ERROR` | 400 | `FIX_DATA` | Request data failed validation |
| `INVALID_CLIENT_NAME` | 400 | `FIX_DATA` | Client name not in allowed list |

### Rate Limiting

| Error Code | Status | Action | Description |
|------------|--------|--------|-------------|
| `RATE_LIMIT_EXCEEDED` | 429 | `RETRY_LATER` | Too many requests, back off |

### Server Errors

| Error Code | Status | Action | Description |
|------------|--------|--------|-------------|
| `INTERNAL_ERROR` | 500 | `RETRY_LATER` | Unexpected server error |

## Actions

The `action` field tells clients what to do next:

### `REQUEST_NEW_SESSION`
The client's session is invalid or expired. The client should:
1. Call `GET /session/init` to get a new session
2. Store the new `session_id` and `client_id` in localStorage
3. Retry the original request with the new credentials

**Example:**
```typescript
if (error.action === 'REQUEST_NEW_SESSION') {
  const newSession = await fetch('/session/init', {
    headers: {
      'X-Client-Name': 'my-app',
      'X-Client-Version': '1.0.0'
    }
  }).then(r => r.json())
  
  localStorage.setItem('session_id', newSession.session_id)
  localStorage.setItem('client_id', newSession.client_id)
  
  // Retry original request
  return retryRequest()
}
```

### `FIX_DATA`
The request data is malformed or invalid. The client should:
1. Log the error for debugging
2. Fix the data issue in the code
3. Do NOT retry automatically (it will fail again)

**Example:**
```typescript
if (error.action === 'FIX_DATA') {
  console.error('Validation error:', error.message)
  // Log to error tracking service
  trackError('validation_error', error)
  // Drop the request, don't retry
  return
}
```

### `RETRY_LATER`
Temporary server issue or rate limiting. The client should:
1. Use exponential backoff
2. Retry the request after a delay
3. Give up after max retries

**Example:**
```typescript
if (error.action === 'RETRY_LATER' && retryCount < 3) {
  const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
  await new Promise(resolve => setTimeout(resolve, delay))
  return retryRequest(retryCount + 1)
}
```

### `CONTACT_SUPPORT`
Unrecoverable error. The client should:
1. Log the error
2. Show user-friendly error message
3. Provide support contact information

## Client Implementation Example

### Session Validation on Analytics Submission

The analytics batch endpoint (`POST /analytics/batch`) has two layers of validation:

#### 1. **Batch Session Validation** (Synchronous)
The endpoint validates that at least one session in the batch exists in Redis:

- **All sessions invalid/expired**: Returns `401 Unauthorized` with `EXPIRED_SESSION` error code
- **At least one valid session**: Accepts the batch for processing

**Error response when all sessions are expired:**
```json
{
  "statusCode": 401,
  "message": "All sessions in batch are invalid or expired",
  "error": "Unauthorized",
  "errorCode": "EXPIRED_SESSION",
  "action": "REQUEST_NEW_SESSION",
  "retry": false
}
```

**Client should:**
- Request a new session via `GET /session/init`
- Store the new session credentials
- Retry the batch with updated `client_id` values

**Note:** If Redis is unavailable during validation, this check will fail and return the same error (all sessions appear expired). The client behavior is the same: request a new session and retry.

#### 2. **Individual Item Validation** (Asynchronous, Fire-and-Forget)
After the batch is accepted, each item is validated individually:

- **Invalid sessions**: Events/queries are silently dropped (logged server-side)
- **Valid sessions**: Data is processed and indexed
- **Response**: Already returned `200 OK` before validation starts

This means clients won't receive error responses for individual invalid sessions within accepted batches. Instead, clients should:

1. **Proactively refresh sessions** before the 24h TTL expires
2. **Monitor for silent failures** by checking if data appears in analytics
3. **Implement client-side session tracking** to request new sessions when needed

### Recommended Client-Side Session Management

```typescript
class SessionManager {
  private sessionId: string | null = null
  private clientId: string | null = null
  private sessionCreatedAt: number = 0
  private readonly SESSION_TTL = 23 * 60 * 60 * 1000 // 23 hours (refresh before 24h expiry)

  async ensureValidSession(): Promise<void> {
    const now = Date.now()
    
    // Check if session exists and hasn't expired
    if (this.sessionId && (now - this.sessionCreatedAt) < this.SESSION_TTL) {
      return // Session is still valid
    }

    // Request new session
    await this.requestNewSession()
  }

  async requestNewSession(): Promise<void> {
    const response = await fetch('/session/init', {
      headers: {
        'X-Client-Name': 'my-app',
        'X-Client-Version': '1.0.0'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      if (error.action === 'FIX_DATA') {
        throw new Error('Invalid client configuration: ' + error.message)
      }
      throw new Error('Failed to initialize session')
    }

    const session = await response.json()
    this.sessionId = session.session_id
    this.clientId = session.client_id
    this.sessionCreatedAt = Date.now()

    // Persist to localStorage
    localStorage.setItem('session_id', this.sessionId)
    localStorage.setItem('client_id', this.clientId)
    localStorage.setItem('session_created_at', this.sessionCreatedAt.toString())
  }

  getClientId(): string {
    return this.clientId || ''
  }
}

// Usage in analytics submission
const sessionManager = new SessionManager()

async function submitAnalytics(queries: any[], events: any[]) {
  // Ensure session is valid before submitting
  await sessionManager.ensureValidSession()
  
  const clientId = sessionManager.getClientId()

  // Add client_id to all queries and events
  const enrichedQueries = queries.map(q => ({ ...q, client_id: clientId }))
  const enrichedEvents = events.map(e => ({ ...e, client_id: clientId }))

  // Submit batch with retry logic for Redis outages
  let retryCount = 0
  const maxRetries = 3
  
  while (retryCount < maxRetries) {
    try {
      const response = await fetch('/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: enrichedQueries,
          events: enrichedEvents
        })
      })
      
      if (response.ok) {
        return // Success
      }
      
      // Handle structured error response
      const error = await response.json()
      
      if (error.errorCode === 'EXPIRED_SESSION') {
        if (error.action === 'REQUEST_NEW_SESSION') {
          // All sessions expired, get new session and retry
          await sessionManager.requestNewSession()
          // Update client_id in batch data
          const newClientId = sessionManager.getClientId()
          enrichedQueries = queries.map(q => ({ ...q, client_id: newClientId }))
          enrichedEvents = events.map(e => ({ ...e, client_id: newClientId }))
          continue // Retry with new session
        }
      }
      
      // Other error, log and give up
      console.error('Analytics submission failed:', error)
      return
      
    } catch (error) {
      console.error('Network error submitting analytics:', error)
      return
    }
  }
}
```

## Error Response Examples

### Invalid Session
```json
{
  "statusCode": 401,
  "message": "Invalid or expired session",
  "error": "Unauthorized",
  "errorCode": "INVALID_SESSION",
  "action": "REQUEST_NEW_SESSION",
  "retry": false
}
```

### Validation Error
```json
{
  "statusCode": 400,
  "message": [
    "client_name must contain only alphanumeric characters and hyphens",
    "client_version must be in semver format"
  ],
  "error": "Bad Request",
  "errorCode": "VALIDATION_ERROR",
  "action": "FIX_DATA",
  "retry": false
}
```

### Rate Limit
```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Too Many Requests",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "action": "RETRY_LATER",
  "retry": true
}
```

### Service Unavailable (Redis Down)
```json
{
  "statusCode": 503,
  "message": "Session validation service is temporarily unavailable. Please retry later.",
  "error": "Service Unavailable",
  "errorCode": "EXPIRED_SESSION",
  "action": "RETRY_LATER",
  "retry": true
}
```

## Best Practices

1. **Always check the `action` field** to determine how to handle errors
2. **Implement exponential backoff** for Redis outages (`RETRY_LATER` with `retry: true`)
3. **Queue analytics locally** during service outages to avoid data loss
4. **Use exponential backoff** for retries when `retry: true`
5. **Log validation errors** for debugging but don't retry
6. **Proactively refresh sessions** before they expire
7. **Implement client-side session tracking** to minimize silent failures
8. **Monitor analytics data** to detect session validation issues
9. **Set max retry limits** to avoid infinite loops
10. **Track error rates** in your monitoring system
11. **Handle 503 Service Unavailable** specifically for Redis outages

## Migration from Silent Failures

If you're currently handling the analytics endpoint as pure fire-and-forget, consider:

1. Adding session expiry tracking client-side
2. Implementing automatic session refresh
3. Adding telemetry to detect when sessions expire unexpectedly
4. Periodically validating that analytics data is being indexed

The session endpoints (`/session/init` and `/session/update`) will always return structured error responses, so implement proper error handling there first.
