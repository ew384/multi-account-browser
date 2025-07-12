#!/bin/bash

echo "🚀 Starting Multi-Account Browser in development mode..."

# 确保依赖已安装
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# 设置开发环境变量
export NODE_ENV=development

# 启动开发模式
echo "🔥 Starting development server..."
npm run dev