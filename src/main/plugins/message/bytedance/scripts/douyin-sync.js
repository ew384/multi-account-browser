// src/main/plugins/message/bytedance/scripts/douyin-sync.js
// 抖音创作者中心私信数据同步脚本
(async function extractDouyinPrivateMessages() {
    console.log('🚀 开始提取抖音私信数据...');
    
    // ========== 工具函数 ==========
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function generateUserId(name, avatar) {
        const str = name + avatar;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString();
    }
    
    function parseDouyinTime(timeText) {
        console.log('解析时间:', timeText);
        
        // 处理格式：07-30
        const monthDayMatch = timeText.match(/(\d{1,2})-(\d{1,2})/);
        if (monthDayMatch) {
            const [_, month, day] = monthDayMatch;
            const currentYear = new Date().getFullYear();
            return new Date(currentYear, parseInt(month) - 1, parseInt(day));
        }
        
        // 处理格式：2025-5-29 18:22
        const fullTimeMatch = timeText.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (fullTimeMatch) {
            const [_, year, month, day, hour, minute] = fullTimeMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
        }
        
        if (timeText.includes('刚刚')) return new Date();
        if (timeText.includes('分钟前')) {
            const minutes = parseInt(timeText.match(/(\d+)分钟前/)?.[1] || '0');
            return new Date(Date.now() - minutes * 60000);
        }
        if (timeText.includes('小时前')) {
            const hours = parseInt(timeText.match(/(\d+)小时前/)?.[1] || '0');
            return new Date(Date.now() - hours * 3600000);
        }
        
        return new Date();
    }

    function tryAccessCrossOriginIframe() {
        console.log('🔓 尝试访问跨域iframe...');
        
        const iframes = document.querySelectorAll('iframe');
        console.log(`找到 ${iframes.length} 个iframe`);
        
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            console.log(`  iframe ${i + 1}: ${iframe.src}`);
            
            try {
                // 🔥 尝试通过Electron的webSecurity=false访问
                if (iframe.contentDocument) {
                    console.log('✅ 成功访问iframe.contentDocument');
                    const chatContainer = iframe.contentDocument.querySelector('.box-content-jSgLQF');
                    const chatItems = iframe.contentDocument.querySelectorAll('.box-item-dSA1TJ');
                    
                    if (chatContainer || chatItems.length > 0) {
                        console.log('🎯 在iframe中找到聊天内容!');
                        return {
                            success: true,
                            iframe: iframe,
                            document: iframe.contentDocument,
                            chatContainer: chatContainer,
                            chatItems: chatItems
                        };
                    }
                }
                
                if (iframe.contentWindow && iframe.contentWindow.document) {
                    console.log('✅ 成功访问iframe.contentWindow.document');
                    const chatContainer = iframe.contentWindow.document.querySelector('.box-content-jSgLQF');
                    const chatItems = iframe.contentWindow.document.querySelectorAll('.box-item-dSA1TJ');
                    
                    if (chatContainer || chatItems.length > 0) {
                        console.log('🎯 在iframe中找到聊天内容!');
                        return {
                            success: true,
                            iframe: iframe,
                            document: iframe.contentWindow.document,
                            chatContainer: chatContainer,
                            chatItems: chatItems
                        };
                    }
                }
                
            } catch (accessError) {
                console.log(`❌ iframe ${i + 1} 访问失败:`, accessError.message);
                continue;
            }
        }
        
        return { success: false, error: '无法访问任何iframe' };
    }

    function extractIframeChatData(iframeDoc, chatItems) {
        console.log('📱 从iframe中提取聊天数据...');
        const messages = [];
        let currentTime = null;
        
        console.log(`找到 ${chatItems.length} 个聊天项`);
        
        for (let index = 0; index < chatItems.length; index++) {
            const item = chatItems[index];
            try {
                // 检查是否是时间项
                if (item.classList.contains('time-Za5gKL')) {
                    const timeText = item.textContent.trim();
                    currentTime = parseDouyinTime(timeText);
                    console.log(`  时间标记: ${timeText} -> ${currentTime}`);
                    continue;
                }
                
                // 检查是否是系统提示
                if (item.classList.contains('tip-UHY3WL')) {
                    const tipText = item.textContent.trim();
                    console.log(`  系统提示: ${tipText}`);
                    messages.push({
                        type: 'system',
                        text: tipText,
                        sender: 'system',
                        timestamp: currentTime ? currentTime.toISOString() : new Date().toISOString()
                    });
                    continue;
                }
                
                // 检查是否是普通消息
                const messageElement = item.querySelector('.text-item-message-YBtflz');
                if (messageElement) {
                    // 判断发送者（简化版本）
                    const isMe = item.classList.contains('is-me-TJHr4A') || 
                               item.querySelector('.is-me-TJHr4A');
                    const sender = isMe ? 'me' : 'user';
                    
                    // 处理文本和表情
                    const emojiImages = messageElement.querySelectorAll('img');
                    let messageText = messageElement.textContent.trim();
                    let images = [];
                    
                    if (emojiImages.length > 0) {
                        emojiImages.forEach(img => {
                            images.push(img.src);
                        });
                        console.log(`  消息 ${index}: ${sender} - "${messageText}" + ${images.length}个表情`);
                    } else {
                        console.log(`  消息 ${index}: ${sender} - "${messageText.substring(0, 50)}..."`);
                    }
                    
                    if (messageText || images.length > 0) {
                        messages.push({
                            sender: sender,
                            text: messageText,
                            images: images.length > 0 ? images : undefined,
                            type: images.length > 0 ? (messageText ? 'mixed' : 'image') : 'text',
                            timestamp: currentTime ? currentTime.toISOString() : new Date().toISOString()
                        });
                    }
                }
                
                // 检查视频消息
                const awemeCover = item.querySelector('.aweme-cover-uU1vtp');
                if (awemeCover) {
                    const coverImage = awemeCover.querySelector('img');
                    const authorName = awemeCover.querySelector('.aweme-author-name-m8uoXU');
                    
                    if (coverImage) {
                        const sender = 'user'; // 简化处理
                        const videoInfo = authorName ? authorName.textContent.trim() : '视频内容';
                        
                        console.log(`  视频消息 ${index}: ${sender} - 视频来自 ${videoInfo}`);
                        
                        messages.push({
                            sender: sender,
                            text: `[视频] ${videoInfo}`,
                            images: [coverImage.src],
                            type: 'video',
                            timestamp: currentTime ? currentTime.toISOString() : new Date().toISOString()
                        });
                    }
                }
                
            } catch (error) {
                console.warn(`解析聊天项 ${index} 时出错:`, error);
                continue;
            }
        }
        
        return messages;
    }

    function extractUserListInfo() {
        console.log('📋 提取用户列表信息...');
        const users = [];
        
        // 查找用户列表容器
        const userListContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
        if (!userListContainer) {
            console.error('❌ 未找到用户列表容器');
            return [];
        }
        
        // 获取所有用户项
        const userItems = userListContainer.querySelectorAll('li.semi-list-item');
        console.log(`找到 ${userItems.length} 个用户项`);
        
        for (let index = 0; index < userItems.length; index++) {
            const item = userItems[index];
            try {
                // 提取用户基本信息
                const nameElement = item.querySelector('.item-header-name-vL_79m');
                const userName = nameElement ? nameElement.textContent.trim() : `用户${index + 1}`;
                
                const avatarElement = item.querySelector('.semi-avatar img');
                const userAvatar = avatarElement ? avatarElement.src : '';
                
                const timeElement = item.querySelector('.item-header-time-DORpXQ');
                const timeText = timeElement ? timeElement.textContent.trim() : '';
                const sessionTime = parseDouyinTime(timeText);
                
                // 提取最后一条消息预览
                const previewElement = item.querySelector('.text-whxV9A');
                const lastMessagePreview = previewElement ? previewElement.textContent.trim() : '';
                
                console.log(`  用户 ${index + 1}: ${userName}, 时间: ${timeText}, 预览: ${lastMessagePreview.substring(0, 30)}...`);
                
                users.push({
                    element: item,
                    user_id: generateUserId(userName, userAvatar),
                    name: userName,
                    avatar: userAvatar,
                    session_time: sessionTime,
                    last_message_preview: lastMessagePreview,
                    index: index
                });
                
            } catch (error) {
                console.warn(`解析用户 ${index + 1} 信息时出错:`, error);
                continue;
            }
        }
        
        return users;
    }

    // ========== 主执行逻辑 ==========
    try {
        const result = {
            timestamp: new Date().toISOString(),
            users: []
        };
        
        console.log('📋 1. 提取用户列表...');
        const userList = extractUserListInfo();
        
        if (userList.length === 0) {
            console.log('✅ 该账号暂无私信用户');
            return {
                timestamp: new Date().toISOString(),
                users: [],
                message: '该账号暂无私信用户'
            };
        }
        
        console.log(`📊 找到 ${userList.length} 个用户`);
        
        // 🔥 2. 尝试通过Electron特权访问iframe获取详细聊天记录
        console.log('🔓 2. 尝试获取详细聊天记录...');
        const iframeAccess = tryAccessCrossOriginIframe();
        
        if (iframeAccess.success) {
            console.log('🎉 成功突破跨域限制，可以获取详细聊天记录!');
            
            // 🔥 逐个处理用户获取详细聊天记录
            for (let i = 0; i < Math.min(userList.length, 3); i++) { // 限制前3个用户
                const user = userList[i];
                console.log(`💬 处理第 ${i + 1}/${userList.length} 个用户: ${user.name}`);
                
                try {
                    // 点击用户
                    console.log('🖱️ 点击用户...');
                    user.element.click();
                    await delay(2000);
                    
                    // 从iframe中提取消息
                    const chatItems = iframeAccess.document.querySelectorAll('.box-item-dSA1TJ');
                    if (chatItems.length > 0) {
                        const detailedMessages = extractIframeChatData(iframeAccess.document, chatItems);
                        
                        const userData = {
                            user_id: user.user_id,
                            name: user.name,
                            avatar: user.avatar,
                            session_time: user.session_time ? user.session_time.toISOString() : null,
                            last_message_preview: user.last_message_preview,
                            messages: detailedMessages
                        };
                        
                        result.users.push(userData);
                        console.log(`  ✅ ${user.name}: 提取到 ${detailedMessages.length} 条详细消息`);
                    } else {
                        // 没有详细消息，使用预览
                        const basicMessages = user.last_message_preview ? [{
                            sender: 'user',
                            text: user.last_message_preview,
                            type: 'text',
                            timestamp: user.session_time ? user.session_time.toISOString() : new Date().toISOString()
                        }] : [];
                        
                        const userData = {
                            user_id: user.user_id,
                            name: user.name,
                            avatar: user.avatar,
                            session_time: user.session_time ? user.session_time.toISOString() : null,
                            last_message_preview: user.last_message_preview,
                            messages: basicMessages
                        };
                        
                        result.users.push(userData);
                        console.log(`  ⚠️ ${user.name}: 仅获取到预览消息`);
                    }
                    
                } catch (error) {
                    console.error(`处理用户 ${user.name} 时出错:`, error);
                    continue;
                }
            }
            
        } else {
            console.log('⚠️ 无法访问iframe，使用基础模式（仅预览消息）');
            
            // 🔥 3. 基础模式：只提取预览消息
            for (const user of userList) {
                const messages = user.last_message_preview ? [{
                    sender: 'user',
                    text: user.last_message_preview,
                    type: 'text',
                    timestamp: user.session_time ? user.session_time.toISOString() : new Date().toISOString()
                }] : [];
                
                const userData = {
                    user_id: user.user_id,
                    name: user.name,
                    avatar: user.avatar,
                    session_time: user.session_time ? user.session_time.toISOString() : null,
                    last_message_preview: user.last_message_preview,
                    messages: messages
                };
                
                result.users.push(userData);
            }
        }
        
        console.log('🎉 抖音私信数据提取完成！');
        console.log(`共处理 ${result.users.length} 个用户`);
        
        // 输出结果
        console.log('📊 提取结果:');
        console.log(JSON.stringify(result, null, 2));
        
        // 保存到全局变量
        window.douyinMessagesData = result;
        console.log('💾 数据已保存到 window.douyinMessagesData');
        
        return result;
        
    } catch (error) {
        console.error('❌ 脚本执行出错:', error);
        return {
            timestamp: new Date().toISOString(),
            users: [],
            message: '脚本执行异常: ' + error.message
        };
    }
})();