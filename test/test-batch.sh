#!/bin/bash
# Test the new unified batch endpoint

echo "Testing POST /analytics/batch with mixed queries and events..."
curl -X POST http://localhost:3001/analytics/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "application": "graphql-images",
        "query_id": "test-query-001",
        "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000",
        "user_query": "test search",
        "timestamp": "2025-01-17T10:30:00.000Z"
      }
    ],
    "events": [
      {
        "query_id": "test-query-001",
        "action_name": "click",
        "client_id": "web@1.0.0@550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2025-01-17T10:30:15.000Z",
        "event_attributes": {
          "object": {
            "object_id": "img-001"
          },
          "position": {
            "ordinal": 1
          }
        }
      }
    ]
  }'

echo -e "\n\nExpected response: 200 OK"
