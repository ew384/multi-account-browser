## 正常模式
npm start

## headless 模式
npm run start:headless

## background 模式  
npm run start:background

## 生产环境正常模式
npm run start:production
## 开发模式启动
npm run dev

## 开发模式 headless
npm run dev:headless

## 开发模式 background
npm run dev:background

## 如何彻底退出 background 模式的应用
方法1: 托盘右键菜单 → 退出应用
方法2: API 调用
curl -X POST http://localhost:3409/api/app/quit
