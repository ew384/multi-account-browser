#!/bin/bash
curl -X POST "http://localhost:3409/api/account/set-electron-file-interceptor" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "wechat-1755242214291",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "filename": "test.png"
  }'