#!/bin/bash

echo "🔨 Building Multi-Account Browser..."

# 清理旧的构建文件
echo "🧹 Cleaning previous build..."
rm -rf dist/

# 编译TypeScript
echo "📦 Compiling TypeScript..."
npx tsc

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi

# 复制静态文件
echo "📁 Copying static files..."
cp -r src/renderer/*.html dist/renderer/
cp -r src/renderer/*.css dist/renderer/

echo "✅ Build completed successfully!"