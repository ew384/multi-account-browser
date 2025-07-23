#!/bin/bash 
API_BASE="http://localhost:3409"
COOKIE_FILE="/home/endian/.config/multi-account-browser/cookiesFile/1753175548839_3sqsl9dkmu7.json"
ACCOUNT_NAME="微信测试账号"
PLATFORM="wechat"
INITIAL_URL="https://channels.weixin.qq.com"
DISPLAY_DURATION=30000  # 30秒

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Background 模式 Tab 测试 ${NC}"

#1. 检查 API 服务器
echo -e "${BLUE}[1/6] 检查 API 服务器...${NC}"
if ! curl -s -f "$API_BASE/health" > /dev/null; then
    echo -e "${RED}❌ API 服务器未运行，请先执行: npm run dev:background${NC}"
    exit 1
fi
echo -e "${GREEN}✅ API服务器运行正常${NC}"

#2. 检查浏览器模式
echo -e "${BLUE}[2/6] 检查浏览器模式...${NC}"
MODE_RESPONSE=$(curl -s "$API_BASE/api/mode/status")
CURRENT_MODE=$(echo "$MODE_RESPONSE" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)
echo -e "${GREEN}✅ 当前模式: $CURRENT_MODE ${NC}"

#3. 创建 Tab
echo -e "${BLUE}[3/6] 创建 Tab...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/api/account/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"accountName\": \"$ACCOUNT_NAME\",
    \"platform\": \"$PLATFORM\",
    \"cookieFile\": \"$COOKIE_FILE\",
    \"initialUrl\": \"$INITIAL_URL\"
}")

echo "创建响应: $CREATE_RESPONSE"
if echo "$CREATE_RESPONSE" | grep -q '"success":true'; then
    TAB_ID=$(echo "$CREATE_RESPONSE" | grep -o '"tabId":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Tab 创建成功，ID: $TAB_ID ${NC}"
else
    echo -e "${RED}❌ Tab 创建失败 ${NC}"
    exit 1
fi

#4. 将 Tab 设为可见
echo -e "${BLUE}[4/6] 将 Tab 设为可见...${NC}"
VISIBLE_RESPONSE=$(curl -s -X POST "$API_BASE/api/tabs/$TAB_ID/make-visible")
if echo "$VISIBLE_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Tab 已设为可见${NC}"
else
    echo -e "${RED}❌ 设置可见失败: $VISIBLE_RESPONSE${NC}"
fi

#5. 显示窗口
echo -e "${BLUE}[5/6] 显示浏览器窗口...${NC}"
SHOW_RESPONSE=$(curl -s -X POST "$API_BASE/api/window/show")
if echo "$SHOW_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 窗口已显示${NC}"
else
    echo -e "${YELLOW}⚠️ 显示窗口: $SHOW_RESPONSE${NC}"
fi

#6. 等待30秒后隐藏
echo -e "${BLUE}[6/6] 保持可见30秒...${NC}"
for ((i=30; i>0; i--)); do
    printf "\r${YELLOW}⏰ 剩余时间: %02d 秒 ${NC}" $i
    sleep 1
done
printf "\n"

# 隐藏窗口
echo -e "${BLUE}隐藏窗口...${NC}"
HIDE_RESPONSE=$(curl -s -X POST "$API_BASE/api/window/hide")
if echo "$HIDE_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 窗口已隐藏${NC}"
else
    echo -e "${YELLOW}⚠️ 隐藏窗口: $HIDE_RESPONSE${NC}"
fi
