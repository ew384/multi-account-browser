# 启动 background 模式
#npm run dev:background

# 临时显示10秒
curl -X POST http://localhost:3409/api/window/show-temp -d '{"duration":10000}'

curl -X POST http://localhost:3409/api/tabs/wechat-1755868201268/make-visible
curl -X POST http://localhost:3409/api/tabs/xiaohongshu-1754981039318/make-headless
# 获取有效账号列表
curl -X GET http://localhost:3409/getValidAccounts

# 获取当前模式
curl -X GET http://localhost:3409/api/info
curl -X GET http://localhost:3409/api/tabs/headless
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
curl -X POST http://localhost:3409/api/account/execute \
 -H "Content-Type: application/json" \
 -d '{
   "tabId": "wechat-1754629838194",
   "script": "(function() { try { console.log('\''🔍 开始检测视频上传状态...'\''); const wujieApp = document.querySelector('\''wujie-app'\''); if (!wujieApp || !wujieApp.shadowRoot) { console.log('\''❌ 未找到Shadow DOM'\''); return { error: '\''未找到Shadow DOM'\'' }; } const shadowDoc = wujieApp.shadowRoot; const buttons = shadowDoc.querySelectorAll('\''button'\''); let publishButton = null; for (const btn of buttons) { const buttonText = btn.textContent.trim(); if (buttonText.includes('\''发表'\'')) { publishButton = { found: true, disabled: btn.disabled || btn.className.includes('\''weui-desktop-btn_disabled'\''), buttonText: buttonText, className: btn.className }; break; } } if (!publishButton) { publishButton = { found: false, disabled: true }; } const hasDeleteBtn = !!shadowDoc.querySelector('\''.delete-btn, [class*=\"delete\"]'\''); let isCancelUploadGone = true; const cancelElements = shadowDoc.querySelectorAll('\''.media-opr .finder-tag-wrap .tag-inner'\''); for (const el of cancelElements) { if (el.textContent && el.textContent.includes('\''取消上传'\'')) { isCancelUploadGone = false; console.log('\''⚠️ 发现\"取消上传\"按钮，视频仍在上传中'\''); break; } } const canPublish = publishButton.found && !publishButton.disabled && hasDeleteBtn && isCancelUploadGone; const result = { publishButton: publishButton, hasDeleteBtn: hasDeleteBtn, isCancelUploadGone: isCancelUploadGone, canPublish: canPublish }; console.log('\''📊 检测结果:'\'', result); if (canPublish) { console.log('\''✅ 视频上传完成，可以发布！'\''); } else { console.log('\''⏳ 视频仍在上传中或条件不满足'\''); if (!publishButton.found) console.log('\''  - 未找到发表按钮'\''); if (publishButton.disabled) console.log('\''  - 发表按钮被禁用'\''); if (!hasDeleteBtn) console.log('\''  - 删除按钮不存在'\''); if (!isCancelUploadGone) console.log('\''  - \"取消上传\"按钮仍存在'\''); } return result; } catch (error) { console.error('\''❌ 检测脚本执行失败:'\'', error); return { error: error.message }; } })()"
 }'
curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "endian",
    "platform": "wechat",
    "cookieFile": "wechat_endian_1755920783264.json",
    "initialUrl": "https://channels.weixin.qq.com/platform/private_msg"
  }'
curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "阿拉蕾宝宝",
    "platform": "douyin",
    "cookieFile": "douyin_阿拉蕾宝宝_1756007952308.json",
    "initialUrl": "https://creator.douyin.com/creator-micro/content/upload"
  }'
curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "剑桥学妹爱学习",
    "platform": "xiaohongshu",
    "cookieFile": "xiaohongshu_小红薯_3319_1755528071619.json",
    "initialUrl": "https://www.xiaohongshu.com/login"
  }'

curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "小红薯_3319",
    "platform": "xiaohongshu",
    "cookieFile": "xiaohongshu_小红薯_3319_1755528071619.json",
    "initialUrl": "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video"
  }'  
curl -X POST http://localhost:3409/api/account/save-cookies \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "xiaohongshu-1755510076733",
    "cookieFile": "xiaohongshu_3319-home.json"
  }'
curl -X POST http://localhost:3409/api/account/execute \
-H "Content-Type: application/json" \
-d '{
  "tabId": "wechat-1755942784577",
  "script": ""  }'


curl -X POST http://localhost:3409/validateAccount \
-H "Content-Type: application/json" \
-d '{
    "accounName": "阿拉蕾宝宝",
    "platform": "douyin",
    "cookieFile": "douyin_阿拉蕾宝宝_1756007952308.json"
  }'
系统级别操作

更新账号Cookie
curl -X POST http://localhost:3409/api/messages/accounts/update-cookie \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountId": "endian",
    "newCookieFile": "wechat_endian_1754030000000.json"
  }'
状态查询

手动同步消息
curl -X POST http://localhost:3409/api/messages/sync \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountName": "endian", 
    "cookieFile": "wechat_endian_1755588156865.json"
  }'
curl -X POST http://localhost:3409/api/message-automation/monitoring/start \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "douyin",
    "accountId": "小红美国留学留下", 
    "cookieFile": "douyin_小红美国留学留下_1755960977081.json",
    "headless": false
  }'
  # 一步到位启动

curl -X POST http://localhost:3409/api/message-automation/monitoring/batch-start \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {
        "platform": "wechat",
        "accountId": "endian",
        "cookieFile": "wechat_endian_1755683789469.json"
      }
    ],
    "withSync": true
  }'