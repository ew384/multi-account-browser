# 启动 background 模式
#npm run dev:background

# 临时显示10秒
curl -X POST http://localhost:3409/api/window/show-temp -d '{"duration":10000}'

curl -X POST http://localhost:3409/api/tabs/xiaohongshu-1754981039318/make-visible
curl -X POST http://localhost:3409/api/tabs/xiaohongshu-1754981039318/make-headless
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
curl -X POST http://localhost:3409/api/account/execute \
 -H "Content-Type: application/json" \
 -d '{
   "tabId": "wechat-1754629838194",
   "script": "(function() { try { console.log('\''🔍 开始检测视频上传状态...'\''); const wujieApp = document.querySelector('\''wujie-app'\''); if (!wujieApp || !wujieApp.shadowRoot) { console.log('\''❌ 未找到Shadow DOM'\''); return { error: '\''未找到Shadow DOM'\'' }; } const shadowDoc = wujieApp.shadowRoot; const buttons = shadowDoc.querySelectorAll('\''button'\''); let publishButton = null; for (const btn of buttons) { const buttonText = btn.textContent.trim(); if (buttonText.includes('\''发表'\'')) { publishButton = { found: true, disabled: btn.disabled || btn.className.includes('\''weui-desktop-btn_disabled'\''), buttonText: buttonText, className: btn.className }; break; } } if (!publishButton) { publishButton = { found: false, disabled: true }; } const hasDeleteBtn = !!shadowDoc.querySelector('\''.delete-btn, [class*=\"delete\"]'\''); let isCancelUploadGone = true; const cancelElements = shadowDoc.querySelectorAll('\''.media-opr .finder-tag-wrap .tag-inner'\''); for (const el of cancelElements) { if (el.textContent && el.textContent.includes('\''取消上传'\'')) { isCancelUploadGone = false; console.log('\''⚠️ 发现\"取消上传\"按钮，视频仍在上传中'\''); break; } } const canPublish = publishButton.found && !publishButton.disabled && hasDeleteBtn && isCancelUploadGone; const result = { publishButton: publishButton, hasDeleteBtn: hasDeleteBtn, isCancelUploadGone: isCancelUploadGone, canPublish: canPublish }; console.log('\''📊 检测结果:'\'', result); if (canPublish) { console.log('\''✅ 视频上传完成，可以发布！'\''); } else { console.log('\''⏳ 视频仍在上传中或条件不满足'\''); if (!publishButton.found) console.log('\''  - 未找到发表按钮'\''); if (publishButton.disabled) console.log('\''  - 发表按钮被禁用'\''); if (!hasDeleteBtn) console.log('\''  - 删除按钮不存在'\''); if (!isCancelUploadGone) console.log('\''  - \"取消上传\"按钮仍存在'\''); } return result; } catch (error) { console.error('\''❌ 检测脚本执行失败:'\'', error); return { error: error.message }; } })()"
 }'

curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "Andy0919",
    "platform": "douyin",
    "cookieFile": "douyin_Andy0919_1754628224627.json",
    "initialUrl": "https://creator.douyin.com/creator-micro/content/upload"
  }'
curl -X POST http://localhost:3409/api/account/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "小红薯_3319",
    "platform": "xiaohongshu",
    "cookieFile": "xiaohongshu_小红薯_3319_1754986751107.json",
    "initialUrl": "https://creator.xiaohongshu.com/"
  }'
curl -X POST http://localhost:3409/api/account/execute \
-H "Content-Type: application/json" \
-d '{
  "tabId": "douyin-1754966921207",
  "script": "(function(){var bodyText=document.body?document.body.textContent:"";return{currentUrl:window.location.href,pageTitle:document.title,bodyTextLength:bodyText.length,bodyTextPreview:bodyText.substring(0,300),hasPhoneLogin:bodyText.includes("手机号登录"),hasQRLogin:bodyText.includes("扫码登录"),hasPleaseLogin:bodyText.includes("请登录"),originalResult:!(bodyText.includes("手机号登录")||bodyText.includes("扫码登录")||bodyText.includes("请登录")),hasLogin:bodyText.includes("登录"),hasAccount:bodyText.includes("账号"),hasAuth:bodyText.includes("认证")||bodyText.includes("授权"),readyState:document.readyState,hasBody:!!document.body,bodyChildrenCount:document.body?document.body.children.length:0}})()"
  }'

curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1754808787624",
    "script": "(async function() { try { console.log(\"🔥 开始设置具体时间: 8月11日13:00\"); const wujieApp = document.querySelector(\"wujie-app\"); if (!wujieApp || !wujieApp.shadowRoot) { throw new Error(\"未找到Shadow DOM\"); } const shadowDoc = wujieApp.shadowRoot; const timeSection = shadowDoc.querySelector(\".post-time-wrap\"); if (!timeSection) { throw new Error(\"未找到定时发表区域\"); } const scheduledRadio = timeSection.querySelector(\"input[type=\\\"radio\\\"][value=\\\"1\\\"]\"); if (!scheduledRadio || !scheduledRadio.checked) { scheduledRadio.click(); await new Promise(resolve => setTimeout(resolve, 500)); console.log(\"✅ 已激活定时发布\"); } await new Promise(resolve => setTimeout(resolve, 1000)); console.log(\"查找时间设置区域...\"); const allDivs = shadowDoc.querySelectorAll(\"div\"); const timeRelatedDivs = Array.from(allDivs).filter(div => { const text = div.textContent; return text && (text.includes(\"2025年\") || text.includes(\"08月\") || text.includes(\"时间\") || text.includes(\"小时\") || text.includes(\"分钟\")); }); console.log(\"时间相关区域数量:\", timeRelatedDivs.length); timeRelatedDivs.forEach((div, index) => { console.log(\"时间区域\", index, \":\", { className: div.className, textContent: div.textContent.trim().substring(0, 100) }); }); const dateTimePicker = shadowDoc.querySelector(\".weui-desktop-picker__date-time\"); console.log(\"日期时间选择器:\", dateTimePicker); if (dateTimePicker) { const dateInput = dateTimePicker.querySelector(\"input\"); console.log(\"日期输入框:\", dateInput); if (dateInput) { dateInput.click(); console.log(\"✅ 已点击日期输入框\"); await new Promise(resolve => setTimeout(resolve, 1500)); const dayLinks = shadowDoc.querySelectorAll(\"a[href=\\\"javascript:;\\\"]\"); console.log(\"日期链接数量:\", dayLinks.length); const day11Link = Array.from(dayLinks).find(link => link.textContent.trim() === \"11\" && !link.classList.contains(\"weui-desktop-picker__disabled\") && !link.classList.contains(\"weui-desktop-picker__faded\")); console.log(\"11日链接:\", day11Link); if (day11Link) { day11Link.click(); console.log(\"✅ 已选择11日\"); await new Promise(resolve => setTimeout(resolve, 500)); } const timeInput = shadowDoc.querySelector(\".weui-desktop-picker__time input\"); console.log(\"时间输入框:\", timeInput); if (timeInput) { timeInput.click(); await new Promise(resolve => setTimeout(resolve, 500)); const hourList = shadowDoc.querySelector(\".weui-desktop-picker__time__hour\"); const minuteList = shadowDoc.querySelector(\".weui-desktop-picker__time__minute\"); console.log(\"小时列表:\", hourList); console.log(\"分钟列表:\", minuteList); if (hourList) { const hourItems = hourList.querySelectorAll(\"li\"); if (hourItems[13]) { hourItems[13].click(); console.log(\"✅ 已设置小时: 13\"); await new Promise(resolve => setTimeout(resolve, 300)); } } if (minuteList) { const minuteItems = minuteList.querySelectorAll(\"li\"); if (minuteItems[0]) { minuteItems[0].click(); console.log(\"✅ 已设置分钟: 00\"); await new Promise(resolve => setTimeout(resolve, 300)); } } console.log(\"✅ 时间设置完成: 8月11日13:00\"); return { success: true, message: \"时间设置成功: 8月11日13:00\" }; } else { throw new Error(\"未找到时间输入框\"); } } else { throw new Error(\"未找到日期输入框\"); } } else { throw new Error(\"激活定时后未找到时间选择器\"); } } catch (e) { console.error(\"❌ 时间设置失败:\", e); return { success: false, error: e.message }; } })()"
  }'

系统级别操作
启动完整消息系统
curl -X POST http://localhost:3409/api/messages/scheduler/system/start \
  -H "Content-Type: application/json"
停止整个调度系统
curl -X POST http://localhost:3409/api/messages/scheduler/system/stop \
  -H "Content-Type: application/json"
重新加载所有有效账号
curl -X POST http://localhost:3409/api/messages/scheduler/system/reload \
  -H "Content-Type: application/json"
单个账号管理
停止指定账号调度
curl -X POST http://localhost:3409/api/messages/scheduler/account/stop \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountId": "endian"
  }'
更新账号Cookie
curl -X POST http://localhost:3409/api/messages/accounts/update-cookie \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountId": "endian",
    "newCookieFile": "wechat_endian_1754030000000.json"
  }'
状态查询
查询调度器状态
curl -X GET "http://localhost:3409/api/messages/scheduler/status"
查询引擎状态
curl -X GET "http://localhost:3409/api/messages/engine/status"
查询消息统计
curl -X GET "http://localhost:3409/api/messages/statistics"
查询未读消息数
curl -X GET "http://localhost:3409/api/messages/unread-count"
其他相关操作
查看所有有效账号
curl -X GET "http://localhost:3409/getValidAccounts"
查看Tab状态
curl -X GET "http://localhost:3409/api/tabs/headless"
手动同步消息（测试用）
curl -X POST http://localhost:3409/api/messages/sync \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "wechat",
    "accountName": "endian",
    "cookieFile": "wechat_endian_1754026928851.json"
  }'
推荐的操作流程
1. 启动完整系统
curl -X POST http://localhost:3409/api/messages/scheduler/system/start
2. 检查系统状态
curl -X GET "http://localhost:3409/api/messages/engine/status"
3. 查看Tab是否创建
curl -X GET "http://localhost:3409/api/tabs/headless"
4. 如果需要停止系统
curl -X POST http://localhost:3409/api/messages/scheduler/system/stop

curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId":"wechat-1754031322868",
    "script":"(async function(){function getCorrectDocument(){const iframes=document.querySelectorAll('iframe');for(let iframe of iframes){try{const iframeDoc=iframe.contentDocument||iframe.contentWindow.document;if(iframeDoc){const privateElements=iframeDoc.querySelectorAll('.private-msg-list');if(privateElements.length>0){console.log('✅ 找到包含私信内容的iframe');return{doc:iframeDoc,win:iframe.contentWindow}}}}catch(error){continue}}console.log('⚠️ 未找到包含私信内容的iframe，使用主document');return{doc:document,win:window}}function waitForElement(doc,selector,timeout=5000){return new Promise((resolve,reject)=>{const element=doc.querySelector(selector);if(element)return resolve(element);const observer=new MutationObserver(()=>{const element=doc.querySelector(selector);if(element){observer.disconnect();resolve(element)}});observer.observe(doc.body,{childList:true,subtree:true});setTimeout(()=>{observer.disconnect();reject(new Error(`Element ${selector} not found within ${timeout}ms`))},timeout)})}function scrollToLoadImages(doc){return new Promise(async(resolve)=>{const conversationContainer=doc.querySelector('.session-content-wrapper')||doc.querySelector('.scroll-list')||doc.body;if(!conversationContainer){resolve();return}const imageContainers=doc.querySelectorAll('.image-wrapper');if(imageContainers.length===0){resolve();return}console.log(`- 发现 ${imageContainers.length} 个图片容器，开始滚动加载...`);conversationContainer.scrollTop=0;await delay(500);const containerHeight=conversationContainer.clientHeight;const scrollHeight=conversationContainer.scrollHeight;const scrollStep=containerHeight/2;for(let scrollPos=0;scrollPos<=scrollHeight;scrollPos+=scrollStep){conversationContainer.scrollTop=scrollPos;await delay(800)}conversationContainer.scrollTop=scrollHeight;await delay(1000);conversationContainer.scrollTop=0;await delay(500);console.log('- 滚动完成，等待图片加载...');resolve()})}function waitForImagesLoaded(doc,timeout=10000){return new Promise((resolve)=>{const images=doc.querySelectorAll('.msg-img');if(images.length===0){resolve();return}let loadedCount=0;let totalImages=images.length;console.log(`- 等待 ${totalImages} 张图片加载...`);const checkAllLoaded=()=>{loadedCount++;if(loadedCount>=totalImages){resolve()}};images.forEach((img,index)=>{if(img.complete&&img.src&&img.src!=='data:image/png;base64,'){checkAllLoaded()}else if(img.src&&img.src!=='data:image/png;base64,'){img.onload=checkAllLoaded;img.onerror=checkAllLoaded}else{checkAllLoaded()}});setTimeout(()=>{console.log('- 图片加载超时，继续处理...');resolve()},timeout)})}function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}function generateUserId(name,avatar){const str=name+avatar;let hash=0;for(let i=0;i<str.length;i++){const char=str.charCodeAt(i);hash=((hash<<5)-hash)+char;hash=hash&hash}return Math.abs(hash).toString()}function getSender(messageElement,docContext){if(messageElement.classList.contains('content-left')){return'user'}if(messageElement.classList.contains('content-right')){return'me'}let currentElement=messageElement;while(currentElement&&currentElement!==docContext.body){if(currentElement.classList.contains('content-left')){return'user'}if(currentElement.classList.contains('content-right')){return'me'}currentElement=currentElement.parentElement}const contentLeft=messageElement.querySelector('.content-left');const contentRight=messageElement.querySelector('.content-right');if(contentLeft)return'user';if(contentRight)return'me';const bubbleLeft=messageElement.querySelector('.bubble-left');const bubbleRight=messageElement.querySelector('.bubble-right');if(bubbleLeft)return'user';if(bubbleRight)return'me';try{if(messageElement.closest('.content-left')){return'user'}else if(messageElement.closest('.content-right')){return'me'}}catch(e){console.warn('closest方法失败:',e)}return'unknown'}try{const{doc,win}=getCorrectDocument();const result={timestamp:new Date().toISOString(),users:[]};console.log('📋 1. 检查私信标签状态...');const currentTab=doc.querySelector('li.weui-desktop-tab__nav_current a');if(currentTab&&currentTab.textContent.trim()==='私信'){console.log('✅ 已在私信标签页')}else{const allTabs=doc.querySelectorAll('li.weui-desktop-tab__nav a');let privateMessageTab=null;for(const tab of allTabs){if(tab.textContent.trim()==='私信'){privateMessageTab=tab;break}}if(!privateMessageTab){console.error('找到的所有标签:',Array.from(allTabs).map(el=>({text:el.textContent.trim(),classes:el.parentElement.className,href:el.href})));throw new Error('未找到私信标签')}console.log('找到私信标签，点击切换...');privateMessageTab.click();await delay(1000)}console.log('👥 2. 等待用户列表加载...');await waitForElement(doc,'.session-wrap');await delay(1000);const userElements=doc.querySelectorAll('.session-wrap');console.log(`找到 ${userElements.length} 个用户`);if(userElements.length===0){console.log('⚠️ 没有找到私信用户');return result}for(let i=0;i<userElements.length;i++){const userElement=userElements[i];console.log(`💬 正在处理第 ${i+1}/${userElements.length} 个用户...`);try{const nameElement=userElement.querySelector('.name');const avatarElement=userElement.querySelector('.feed-img');if(!nameElement||!avatarElement){console.warn(`用户 ${i+1} 信息不完整，跳过`);continue}const userName=nameElement.textContent.trim();const userAvatar=avatarElement.src;console.log('- 用户名:',userName);userElement.click();await delay(1500);await waitForElement(doc,'.session-content-wrapper',3000);console.log('- 开始滚动加载图片...');await scrollToLoadImages(doc);await waitForImagesLoaded(doc,5000);console.log('- 图片处理完成');const messages=[];const allMessageContainers=doc.querySelectorAll('.text-wrapper, .image-wrapper');console.log(`- 找到 ${allMessageContainers.length} 个消息容器`);allMessageContainers.forEach((container,index)=>{try{const sender=getSender(container,doc);if(container.classList.contains('text-wrapper')){const messageElement=container.querySelector('.message-plain');if(messageElement){const emojiImages=messageElement.querySelectorAll('.we-emoji');let text='';if(emojiImages.length>0){const textNodes=[];messageElement.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE){const nodeText=node.textContent.trim();if(nodeText)textNodes.push(nodeText)}else if(node.nodeType===Node.ELEMENT_NODE&&node.classList.contains('we-emoji')){const alt=node.getAttribute('alt')||'';if(alt)textNodes.push(alt)}});text=textNodes.join('')}else{text=messageElement.textContent.trim()}if(text){messages.push({sender:sender,text:text});console.log(`消息 ${index+1}: ${sender} - ${text.substring(0,20)}...`)}}}if(container.classList.contains('image-wrapper')){const imageElement=container.querySelector('.msg-img');if(imageElement&&imageElement.src&&imageElement.src!=='data:image/png;base64,'&&imageElement.complete){messages.push({sender:sender,images:[imageElement.src]});console.log(`消息 ${index+1}: ${sender} - [图片: ${imageElement.src.substring(0,50)}...]`)}else if(imageElement&&imageElement.src){console.warn(`消息 ${index+1}: 图片未完全加载 - ${imageElement.src.substring(0,50)}...`)}}}catch(error){console.warn(`解析消息 ${index+1} 时出错:`,error)}});const userData={user_id:generateUserId(userName,userAvatar),name:userName,avatar:userAvatar,messages:messages};result.users.push(userData);console.log(`✅ 提取到 ${messages.length} 条消息`)}catch(error){console.error(`处理用户 ${i+1} 时出错:`,error);continue}}console.log('🎉 提取完成！');console.log(`共处理 ${result.users.length} 个用户`);window.privateMessagesData=result;return result}catch(error){console.error('❌ 脚本执行出错:',error);throw error}})()"
    }'

  curl -X POST http://localhost:3409/api/account/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "wechat-1754038082338",
    "script": "(async function(){function getCorrectDocument(){const iframes=document.querySelectorAll("iframe");for(let iframe of iframes){try{const iframeDoc=iframe.contentDocument||iframe.contentWindow.document;if(iframeDoc){const privateElements=iframeDoc.querySelectorAll(".private-msg-list");if(privateElements.length>0){return{doc:iframeDoc,win:iframe.contentWindow}}}}catch(error){continue}}return{doc:document,win:window}}function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}function generateUserId(name,avatar){const str=name+avatar;let hash=0;for(let i=0;i<str.length;i++){const char=str.charCodeAt(i);hash=((hash<<5)-hash)+char;hash=hash&hash}return Math.abs(hash).toString()}function getSender(messageElement,docContext){if(messageElement.classList.contains("content-left")){return"user"}if(messageElement.classList.contains("content-right")){return"me"}let currentElement=messageElement;while(currentElement&&currentElement!==docContext.body){if(currentElement.classList.contains("content-left")){return"user"}if(currentElement.classList.contains("content-right")){return"me"}currentElement=currentElement.parentElement}const contentLeft=messageElement.querySelector(".content-left");const contentRight=messageElement.querySelector(".content-right");if(contentLeft)return"user";if(contentRight)return"me";try{if(messageElement.closest(".content-left")){return"user"}else if(messageElement.closest(".content-right")){return"me"}}catch(e){}return"unknown"}try{const{doc,win}=getCorrectDocument();const result={timestamp:new Date().toISOString(),users:[]};const currentTab=doc.querySelector("li.weui-desktop-tab__nav_current a");if(currentTab&&currentTab.textContent.trim()==="私信"){console.log("✅ 已在私信标签页")}else{const allTabs=doc.querySelectorAll("li.weui-desktop-tab__nav a");let privateMessageTab=null;for(const tab of allTabs){if(tab.textContent.trim()==="私信"){privateMessageTab=tab;break}}if(!privateMessageTab){const tabTexts=Array.from(allTabs).map(t=>t.textContent.trim());throw new Error("未找到私信标签，找到的标签："+JSON.stringify(tabTexts))}privateMessageTab.click();await delay(2000)}await delay(1000);const userElements=doc.querySelectorAll(".session-wrap");console.log("找到用户数量:",userElements.length);if(userElements.length===0){return result}for(let i=0;i<userElements.length;i++){const userElement=userElements[i];try{const nameElement=userElement.querySelector(".name");const avatarElement=userElement.querySelector(".feed-img");if(!nameElement){continue}const userName=nameElement.textContent.trim();const userAvatar=avatarElement?avatarElement.src:"";console.log("处理用户:",userName);userElement.click();await delay(2000);const messages=[];const allMessageContainers=doc.querySelectorAll(".text-wrapper, .image-wrapper");console.log("消息容器数量:",allMessageContainers.length);allMessageContainers.forEach((container,index)=>{try{const sender=getSender(container,doc);if(container.classList.contains("text-wrapper")){const messageElement=container.querySelector(".message-plain");if(messageElement){const emojiImages=messageElement.querySelectorAll(".we-emoji");let text="";if(emojiImages.length>0){const textNodes=[];messageElement.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE){const nodeText=node.textContent.trim();if(nodeText)textNodes.push(nodeText)}else if(node.nodeType===Node.ELEMENT_NODE&&node.classList.contains("we-emoji")){const alt=node.getAttribute("alt")||"";if(alt)textNodes.push(alt)}});text=textNodes.join("")}else{text=messageElement.textContent.trim()}if(text){messages.push({sender:sender,text:text})}}}if(container.classList.contains("image-wrapper")){const imageElement=container.querySelector(".msg-img");if(imageElement&&imageElement.src&&imageElement.src!=="data:image/png;base64,"&&imageElement.complete){messages.push({sender:sender,images:[imageElement.src]})}}}catch(error){}});const userData={user_id:generateUserId(userName,userAvatar),name:userName,avatar:userAvatar,messages:messages};result.users.push(userData);console.log("用户处理完成:",userName,"消息数:",messages.length)}catch(error){console.error("处理用户出错:",error);continue}}console.log("脚本执行完成，用户数:",result.users.length);window.privateMessagesData=result;return result}catch(error){console.error("脚本执行出错:",error);throw error}})()"  
    }'