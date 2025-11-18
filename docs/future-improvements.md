# Future Improvements

This document tracks potential enhancements and features for future releases of the Analytics Goblin service.

## 1. Enhanced UBI Analytics

**Priority:** High  
**Effort:** Medium

Leverage UBI data for deeper insights into user search behavior.

### Features
- **Query Refinement Patterns**: Track how users refine searches within a session
- **Click-Through Rate (CTR)**: Measure document relevance based on click positions
- **Dwell Time Tracking**: Analyze time spent on clicked documents (via frontend events)
- **Abandoned Searches**: Identify queries where users don't click any results
- **Session Flow Analysis**: Visualize common search paths and journeys
- **Document Popularity Trends**: Track trending documents over time

### Implementation
- Extend analytics endpoints with session-based query aggregations
- Add time-series analysis for trend detection
- Create visualization endpoints for session flow diagrams
- Implement funnel analysis for search-to-click conversion
- Add cohort analysis comparing client versions

### Benefits
- Data-driven search relevance improvements
- Identify content gaps from abandoned searches
- Optimize search UI based on user behavior patterns

---

## 2. Prometheus Integration

**Priority:** High  
**Effort:** Medium

Add Prometheus metrics exporter for real-time operational monitoring.

### Metrics to Track
- **Counters:** 
  - Total sessions initialized
  - Total UBI queries logged
  - Total UBI events by action type (click, scroll, etc.)
  - Rate limit hits (429 responses)
  - IP anonymization operations
- **Histograms:**
  - API response times per endpoint
  - UBI query aggregation latency
  - Session initialization latency
- **Gauges:**
  - Active rate limiter entries in Redis
  - OpenSearch connection pool size
  - Current UBI index sizes

### Implementation
- Install `@nestjs/prometheus` and `prom-client`
- Create `PrometheusModule` with custom metrics
- Expose `/metrics` endpoint
- Track GDPR compliance metrics (anonymization effectiveness)
- Add Grafana dashboard templates

### Alert Rules (with AlertManager)
- Rate limit threshold breaches
- OpenSearch health degradation
- Spike in 429/500 errors
- Redis connection failures

---

## 3. Advanced Session Analytics

**Priority:** Medium  
**Effort:** Medium-High

Since sessions are client-side, add opt-in session analysis features that respect privacy.

### Features
- **Session Duration Analysis**: How long users engage with search
- **Multi-Device Session Linking**: Link sessions across devices (opt-in, no PII)
- **Search Intent Classification**: Categorize queries by intent (navigational, informational, transactional)
- **Cohort Analysis**: Compare behavior across client versions and time periods
- **Query Auto-Correction Suggestions**: Analyze patterns to suggest corrections

### Privacy Considerations
- All session analytics remain aggregated and anonymized
- No PII linkage even with multi-device tracking
- Users can clear localStorage anytime to reset session
- Data export API for GDPR compliance (user requests their data)
- Configurable retention periods per data type

### Implementation
- Add optional device fingerprinting (hash-based, no storage)
- Implement query clustering for intent classification
- Create cohort definition and comparison APIs
- Build privacy-preserving session linking (hash-based)

---

## 4. API Authentication & Enhanced Rate Limiting

**Priority:** Medium  
**Effort:** Medium

### JWT-Based Authentication
- Optional API key system for analytics endpoints
- Role-based access control (RBAC) for different client types
- Separate public (session init) vs. protected (analytics) endpoints

### Enhanced Rate Limiting
- **Per-Client Rate Limits**: Configurable limits per client_name
- **Trusted Client Exemptions**: Whitelist for monitoring/admin tools
- **Burst Allowances**: Higher short-term limits for trusted clients
- **Geographic Rate Limiting**: Different limits by region (GDPR-compliant)

### Implementation
- Add `@nestjs/jwt` for token management
- Create authentication guard for analytics endpoints
- Extend ThrottlerModule with client-based tiers
- Add admin endpoints for API key management
- Implement rate limit bypass header for internal services

---

## 5. Data Retention & ILM Policies

**Priority:** Medium  
**Effort:** Low-Medium

### OpenSearch Index Lifecycle Management
Configure ILM policies for UBI indices to manage costs and compliance:

- **Hot tier**: Last 7 days (high-performance SSDs, fast queries)
- **Warm tier**: 8-30 days (standard storage, slower queries acceptable)
- **Cold tier**: 31-90 days (compressed, searchable snapshots)
- **Delete**: >90 days (configurable via environment variables)

### GDPR-Compliant Deletion
- Automated deletion of old UBI data per retention policy
- Manual deletion API for "right to be forgotten" requests
- Audit logging of all deletion operations

### Implementation
- Create ILM policy templates for `ubi_queries` and `ubi_events`
- Apply policies during index initialization
- Add configuration via `UBI_RETENTION_DAYS` environment variable
- Document retention compliance in README
- Add health check for ILM policy status

---

## 6. GDPR & Privacy Enhancements

**Priority:** Medium  
**Effort:** Medium

### Enhanced Anonymization
- **Geographic Precision Control**: Configurable IP anonymization levels (city, region, country)
- **Query Sanitization**: Detect and redact PII in query strings (emails, phone numbers)
- **User-Agent Normalization**: Hash user agents to prevent fingerprinting

### Data Subject Rights
- **Right to Access**: API endpoint for users to retrieve their session data
- **Right to Deletion**: Delete all data associated with a session_id
- **Right to Portability**: Export user data in JSON format
- **Consent Management**: Track user consent preferences per session

### Compliance Reporting
- Generate GDPR compliance reports (data types, retention, anonymization)
- Audit log for all data access and deletion requests
- Privacy impact assessment documentation

### Implementation
- Add PII detection library (e.g., CommonRegex)
- Create `PrivacyService` for data subject rights APIs
- Implement consent tracking in session metadata
- Add compliance reporting endpoints for admins

---

## 7. Performance Optimizations

**Priority:** Medium  
**Effort:** Low-Medium

### Pre-Aggregation
- Scheduled jobs to compute hourly/daily UBI rollups
- Store common analytics queries as materialized views in OpenSearch
- Reduce query latency for dashboard APIs from seconds to milliseconds

### Caching Layer
- Redis cache for frequently accessed analytics (top queries, popular documents)
- Cache invalidation on new UBI data arrival
- Configurable TTL per endpoint type
- Cache warming during off-peak hours

### Query Optimization
- Add OpenSearch query hints for better aggregation performance
- Optimize bucket sizes for time-based aggregations
- Implement query result pagination for large datasets
- Use composite aggregations for deep pagination

### Implementation
- Add cron jobs for pre-aggregation (e.g., via `@nestjs/schedule`)
- Extend RedisModule for analytics caching (separate from rate limiter)
- Add cache hit/miss metrics to Prometheus
- Benchmark and document performance improvements

---

## 8. Real-Time Analytics Dashboard

**Priority:** Low  
**Effort:** High

### WebSocket Streaming
- Live UBI events feed for real-time monitoring
- Streaming query trends (top queries updating every few seconds)
- Real-time click heatmaps for search results
- Session activity visualization

### Event-Driven Architecture
- Publish UBI events to message queue (Kafka/RabbitMQ) for downstream consumers
- Support multiple event subscribers (ML pipelines, real-time dashboards)
- Enable real-time ML model scoring for query classification

### Implementation
- Add WebSocket gateway with `@nestjs/websockets`
- Create event streaming endpoints with Server-Sent Events (SSE)
- Implement backpressure handling for high-volume streams
- Add authentication for WebSocket connections

### Use Cases
- Operations team monitoring search health
- Content teams seeing trending searches in real-time
- ML teams testing models on live data

---

## 9. Observability Enhancements

**Priority:** Medium  
**Effort:** Low-Medium

### Distributed Tracing
- OpenTelemetry integration for end-to-end request tracing
- Trace requests from frontend → API → OpenSearch
- Identify bottlenecks across the stack
- Correlate UBI events with API traces

### Structured Logging
- Winston or Pino with JSON formatting
- Correlation IDs across all log entries (trace context)
- Log sampling for high-traffic endpoints
- Integration with log aggregation (CloudWatch, Datadog, Grafana Loki)

### Custom Dashboards
- Pre-built Grafana dashboards for:
  - UBI query volume and trends
  - Session initialization rates
  - Rate limiting effectiveness
  - OpenSearch cluster health
- OpenSearch Dashboards visualizations for UBI data
- Embedded analytics widgets for admin panels

### Implementation
- Add `@opentelemetry/api` and `@opentelemetry/sdk-node`
- Configure trace exporters (Jaeger, Zipkin, or cloud providers)
- Add correlation ID middleware
- Create dashboard JSON templates in `dashboards/` directory

---

## 10. Machine Learning Insights

**Priority:** Low  
**Effort:** High

### Anomaly Detection
- Train models to detect unusual search patterns (bot traffic, attacks)
- Flag potential scraping attempts based on behavior
- Identify emerging topics or trending searches
- Alert on sudden changes in click-through rates

### Query Intent Classification
- Categorize queries by intent using NLP (navigational, informational, transactional)
- Track intent distribution over time
- Optimize search experience per intent type
- Auto-tag queries for downstream analysis

### Search Quality Scoring
- ML model to predict query satisfaction from UBI events
- Identify low-quality search results needing improvement
- A/B test search ranking changes with statistical significance

### Implementation
- Add Python ML service (separate microservice or AWS Lambda)
- Export UBI data to ML pipelines (feature engineering)
- Integrate model predictions back into OpenSearch
- Create feedback loop for model retraining

---

## Contributing

If you'd like to work on any of these improvements, please:
1. Open an issue to discuss the implementation approach
2. Reference this document in your PR description
3. Update this doc to mark items as "In Progress" or "Completed"
