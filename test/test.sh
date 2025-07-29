# 启动 background 模式
#npm run dev:background

# 临时显示10秒
curl -X POST http://localhost:3409/api/window/show-temp -d '{"duration":10000}'

# 获取有效账号列表
curl -X GET http://localhost:3409/getValidAccounts

# 获取当前模式
curl -X GET http://localhost:3409/api/info

# 获取账号信息
curl -X POST http://localhost:3409/api/automation/get-account-info \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1753676959567",
    "platform": "wechat"
  }'

# 执行脚本
curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1753676959567",
    "script": "function extractWechatFinderInfo() { try { const avatarImg = document.querySelector(\".finder-info-container .avatar\"); const avatar = avatarImg ? avatarImg.src : null; const accountNameEl = document.querySelector(\".finder-nickname\"); const accountName = accountNameEl ? accountNameEl.textContent.trim() : null; const accountIdEl = document.querySelector(\".finder-uniq-id\"); const accountId = accountIdEl ? accountIdEl.textContent.trim() : null; const infoNums = document.querySelectorAll(\".finder-info-num\"); let videosCount = null; let followersCount = null; if (infoNums.length >= 2) { videosCount = infoNums[0].textContent.trim(); followersCount = infoNums[1].textContent.trim(); } function parseNumber(value) { if (!value) return 0; const cleanValue = value.toString().replace(/[^\\d.万千]/g, \"\"); if (cleanValue.includes(\"万\")) { return Math.floor(parseFloat(cleanValue) * 10000); } else if (cleanValue.includes(\"千\")) { return Math.floor(parseFloat(cleanValue) * 1000); } return parseInt(cleanValue) || 0; } const normalizedData = { platform: \"wechat_finder\", accountName: accountName, accountId: accountId, followersCount: parseNumber(followersCount), videosCount: parseNumber(videosCount), avatar: avatar, bio: null, extractedAt: new Date().toISOString() }; console.log(\"提取的原始数据:\", { accountName, accountId, avatar, videosCount, followersCount }); console.log(\"标准化后的数据:\", normalizedData); return normalizedData; } catch (error) { console.error(\"提取数据时出错:\", error); return null; } } const result = extractWechatFinderInfo(); result;"
  }'

curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "endian",
    "platform": "wechat",
    "cookieFile": "wechat_endian_1753752408469.json",
    "initialUrl": "https://channels.weixin.qq.com"
  }'