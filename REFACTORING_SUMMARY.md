# Analytics Module Refactoring Summary

## Overview

Refactored the analytics module from separate query/event endpoints to a unified batch endpoint that accepts mixed analytics data (queries + events together).

## Changes Made

### New Files Created

1. **`src/analytics/dto/submit-event.dto.ts`**
   - New DTO for UBI 1.3.0 event submission
   - Validates: `query_id`, `action_name`, `client_id`, `timestamp`, `event_attributes`
   - Optional fields with proper validation (ISO timestamp format, max lengths)

2. **`src/analytics/dto/submit-analytics-batch.dto.ts`**
   - Unified batch DTO accepting both queries and events
   - Supports up to 100 queries per batch
   - Supports up to 100 events per batch
   - Both arrays are optional (can submit only queries, only events, or both)

### Modified Files

1. **`src/analytics/analytics.controller.ts`**
   - **REMOVED**: `POST /analytics/queries` (single query endpoint)
   - **REMOVED**: `POST /analytics/queries/batch` (queries-only batch endpoint)
   - **ADDED**: `POST /analytics/batch` (unified mixed batch endpoint)
   - Old endpoints commented out for reference

2. **`src/analytics/analytics.service.ts`**
   - **ADDED**: `validateAndTransformEvent()` - validates events with session/wallet enrichment
   - **ADDED**: `submitBatch()` - processes mixed batches of queries and events
   - **DEPRECATED**: `submitQuery()` and `submitQueriesBatch()` (preserved but marked deprecated)
   - Event validation includes session checking and wallet auto-enrichment (same as queries)

3. **`src/analytics/interfaces/analytics.interface.ts`**
   - **CHANGED**: `UbiEvent.event_attributes` from strict type to `Record<string, any>`
   - More flexible to support wallet enrichment and custom event metadata

4. **`src/opensearch/opensearch.service.ts`**
   - **ADDED**: `indexEvent()` - index single event to `ubi_events` index
   - **ADDED**: `bulkIndexEvents()` - bulk index events in chunks
   - Events use `index` operation (not `create`) as duplicate actions are allowed
   - Uses same chunking strategy as queries (configurable via `BULK_CHUNK_SIZE`)

### Documentation Updates

1. **`docs/api-examples.md`**
   - Replaced separate query/event examples with unified batch examples
   - Added complete JavaScript example showing query + event tracking together
   - Updated rate limiting info (Traefik-based, not in-app)
   - Updated batch limits (100 queries + 100 events)

2. **`README.md`**
   - Updated API endpoint documentation to show unified batch endpoint
   - Added event schema fields to main documentation
   - Updated quick start example to show query + event submission
   - Clarified rate limiting is Traefik-based

## API Changes

### Old API (Deprecated)

```bash
# Separate endpoints for queries and events
POST /analytics/queries          # Single query
POST /analytics/queries/batch    # Batch queries only
POST /analytics/events           # Would have been needed
POST /analytics/events/batch     # Would have been needed
```

### New API

```bash
# Single unified endpoint for all analytics
POST /analytics/batch
{
  "queries": [...],  // Optional: 0-100 queries
  "events": [...]    // Optional: 0-100 events
}
```

## Benefits

1. **Simplified API Surface**
   - Single endpoint instead of 4+ endpoints
   - Cleaner client code

2. **Better Performance**
   - Submit queries + events together (fewer HTTP requests)
   - Single validation pass for related data

3. **Improved UX**
   - Track search + clicks in same submission
   - Natural grouping of related analytics events

4. **Maintained Features**
   - Fire-and-forget pattern preserved
   - Session validation for both queries and events
   - Wallet auto-enrichment for both types
   - Bulk indexing with chunking
   - Same error handling and logging

## Migration Guide for Clients

### Before (Old API)

```javascript
// Submit query
fetch('/analytics/queries', {
  method: 'POST',
  body: JSON.stringify({ /* query */ })
});

// Later, submit events separately
fetch('/analytics/events', {
  method: 'POST',
  body: JSON.stringify({ /* event */ })
});
```

### After (New API)

```javascript
// Submit query + events together
fetch('/analytics/batch', {
  method: 'POST',
  body: JSON.stringify({
    queries: [{ /* query */ }],
    events: [{ /* event */ }]
  })
});
```

## Backwards Compatibility

- Old endpoints (`POST /analytics/queries`, `POST /analytics/queries/batch`) are **commented out** in the controller
- Service methods marked as `@deprecated` but still functional
- Can be re-enabled if needed by uncommenting controller code
- Recommended to migrate to new unified endpoint

## Testing Recommendations

1. **Unit Tests**: Validate event DTO validation logic
2. **Integration Tests**: Test mixed batches (queries only, events only, both)
3. **E2E Tests**: Verify OpenSearch indexing for both ubi_queries and ubi_events
4. **Load Tests**: Confirm bulk indexing performance with mixed batches

## Environment Variables (Unchanged)

- `BULK_CHUNK_SIZE`: Still controls chunking for both queries and events (default: 20)
- `MAX_BATCH_SIZE`: Now applies to queries + events separately (100 each)
- All other config unchanged

## Production Deployment Notes

- No database migrations needed
- No Redis schema changes
- OpenSearch indices (`ubi_queries`, `ubi_events`) unchanged
- Rate limiting still handled by Traefik
- Session validation logic unchanged
