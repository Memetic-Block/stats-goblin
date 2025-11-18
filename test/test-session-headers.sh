#!/bin/bash
# Test session init with headers

echo "Testing session init with headers..."
curl -X GET http://localhost:3001/session/init \
  -H "X-Client-Name: wuzzy-web" \
  -H "X-Client-Version: 1.0.0" \
  -w "\nHTTP Status: %{http_code}\n"

echo -e "\n---"
echo "Testing missing headers (should fail)..."
curl -X GET http://localhost:3001/session/init \
  -w "\nHTTP Status: %{http_code}\n"
