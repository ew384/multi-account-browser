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

  curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1753768107720",
    "script": "(async function() { try { console.log("开始填写短标题、描述和标签..."); const title = "测试标题"; const tags = ["标签1", "标签2"]; const description = title; const wujieApp = document.querySelector("wujie-app"); if (!wujieApp || !wujieApp.shadowRoot) { return { success: false, error: "未找到Shadow DOM" }; } const shadowDoc = wujieApp.shadowRoot; const allInputs = shadowDoc.querySelectorAll("input[type=text], div[contenteditable], textarea"); let shortTitleInput = null; let descriptionEditor = null; for (let i = 0; i < allInputs.length; i++) { const input = allInputs[i]; const placeholder = input.placeholder || input.getAttribute("data-placeholder") || ""; if (placeholder.includes("6-16") || placeholder.includes("短标题") || placeholder.includes("标题")) { shortTitleInput = input; } else if (placeholder.includes("添加描述") || placeholder.includes("描述")) { descriptionEditor = input; } } if (shortTitleInput) { let finalTitle = title; if (finalTitle.length < 6) { const spacesToAdd = 6 - finalTitle.length; finalTitle = finalTitle + " ".repeat(spacesToAdd); console.log("短标题不足6字符，已补充空格:", finalTitle); } shortTitleInput.scrollIntoView({ behavior: "smooth", block: "center" }); shortTitleInput.click(); shortTitleInput.focus(); await new Promise(resolve => setTimeout(resolve, 200)); if (shortTitleInput.tagName === "INPUT") { shortTitleInput.value = ""; shortTitleInput.value = finalTitle; shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); shortTitleInput.dispatchEvent(new Event("change", { bubbles: true })); } else { shortTitleInput.innerText = ""; shortTitleInput.textContent = finalTitle; shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); } } if (descriptionEditor) { descriptionEditor.scrollIntoView({ behavior: "smooth", block: "center" }); descriptionEditor.click(); descriptionEditor.focus(); await new Promise(resolve => setTimeout(resolve, 200)); const contentWithTags = description + " " + tags.map(tag => "#" + tag).join(" "); if (descriptionEditor.tagName === "INPUT") { descriptionEditor.value = ""; descriptionEditor.value = contentWithTags; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); descriptionEditor.dispatchEvent(new Event("change", { bubbles: true })); } else { descriptionEditor.innerText = ""; descriptionEditor.textContent = contentWithTags; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); } } return { success: true }; } catch (error) { return { success: false, error: error.message }; } })()"
    }'

curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1753770533600",
    "script": "(async function() { try { console.log(\"开始点击发表按钮...\"); const wujieApp = document.querySelector(\"wujie-app\"); if (!wujieApp || !wujieApp.shadowRoot) { return { success: false, error: \"未找到Shadow DOM\" }; } const shadowDoc = wujieApp.shadowRoot; const buttons = shadowDoc.querySelectorAll(\"button\"); console.log(\"找到按钮总数:\", buttons.length); let publishButton = null; for (const button of buttons) { const buttonText = button.textContent.trim(); console.log(\"检查按钮:\", { text: buttonText, disabled: button.disabled, className: button.className.includes(\"disabled\") }); if (buttonText.includes(\"发表\") && !button.disabled && !button.className.includes(\"weui-desktop-btn_disabled\")) { publishButton = button; console.log(\"找到可点击的发表按钮!\"); break; } } if (!publishButton) { console.log(\"未找到可点击的发表按钮\"); return { success: false, error: \"发表按钮未找到或不可点击\" }; } console.log(\"准备点击发表按钮...\"); publishButton.scrollIntoView({ behavior: \"smooth\", block: \"center\" }); await new Promise(resolve => setTimeout(resolve, 500)); publishButton.focus(); await new Promise(resolve => setTimeout(resolve, 200)); publishButton.click(); console.log(\"✅ 发表按钮已点击\"); await new Promise(resolve => setTimeout(resolve, 1000)); return { success: true, buttonText: publishButton.textContent.trim(), buttonClass: publishButton.className }; } catch (error) { console.error(\"点击发表按钮失败:\", error); return { success: false, error: error.message, stack: error.stack }; } })()"
  }'

curl -X POST http://localhost:3409/api/messages/sync \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountName": "endian", 
    "cookieFile": "wechat_endian_1753944885403.json"
  }'

  检查自动创建的状态
bash# 查看调度器状态（会显示实际创建的 tabId）
curl -X GET http://localhost:3409/api/messages/scheduler/status

# 查看所有 headless tabs（message tab 是 headless 的）
curl -X GET http://localhost:3409/api/tabs/headless