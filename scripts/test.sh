#!/bin/bash

echo "🧪 Running Multi-Account Browser tests..."

# 编译TypeScript（如果需要）
if [ ! -d "dist" ]; then
    echo "📦 Building project first..."
    ./scripts/build.sh
fi

echo "🔍 Running isolation tests..."
npm run test:isolation

echo "🌐 Running API tests..."
# 注意：需要先启动应用才能运行API测试
echo "⚠️  Make sure the application is running before API tests"
npm run test:api

echo "✅ All tests completed!"