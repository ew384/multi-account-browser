// 微信视频号助手私信提取脚本
(async function extractPrivateMessages() {
    console.log('🚀 开始提取私信数据...');
    
    // 获取正确的document对象（从iframe中）
    function getCorrectDocument() {
        const iframes = document.querySelectorAll('iframe');
        for (let iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc) {
                    // 检查是否包含私信内容
                    const privateElements = iframeDoc.querySelectorAll('.private-msg-list');
                    if (privateElements.length > 0) {
                        console.log('✅ 找到包含私信内容的iframe');
                        return {
                            doc: iframeDoc,
                            win: iframe.contentWindow
                        };
                    }
                }
            } catch (error) {
                continue;
            }
        }
        console.log('⚠️ 未找到包含私信内容的iframe，使用主document');
        return {
            doc: document,
            win: window
        };
    }
    
    // 工具函数：等待元素出现
    function waitForElement(doc, selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = doc.querySelector(selector);
            if (element) return resolve(element);
            
            const observer = new MutationObserver(() => {
                const element = doc.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });
            
            observer.observe(doc.body, {
                childList: true,
                subtree: true
            });
            
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }
    
    // 工具函数：滚动对话区域以触发图片懒加载
    function scrollToLoadImages(doc) {
        return new Promise(async (resolve) => {
            const conversationContainer = doc.querySelector('.session-content-wrapper') || doc.querySelector('.scroll-list') || doc.body;
            
            if (!conversationContainer) {
                resolve();
                return;
            }
            
            // 获取所有图片容器
            const imageContainers = doc.querySelectorAll('.image-wrapper');
            if (imageContainers.length === 0) {
                resolve();
                return;
            }
            
            console.log(`  - 发现 ${imageContainers.length} 个图片容器，开始滚动加载...`);
            
            // 先滚动到顶部
            conversationContainer.scrollTop = 0;
            await delay(500);
            
            // 逐步滚动，确保每个图片都进入视野
            const containerHeight = conversationContainer.clientHeight;
            const scrollHeight = conversationContainer.scrollHeight;
            const scrollStep = containerHeight / 2; // 每次滚动半屏
            
            for (let scrollPos = 0; scrollPos <= scrollHeight; scrollPos += scrollStep) {
                conversationContainer.scrollTop = scrollPos;
                await delay(800); // 给图片加载时间
                
                // 检查当前视野内的图片是否开始加载
                const visibleImages = Array.from(imageContainers).filter(container => {
                    const rect = container.getBoundingClientRect();
                    const containerRect = conversationContainer.getBoundingClientRect();
                    return rect.top >= containerRect.top && rect.bottom <= containerRect.bottom + 200; // 给一些缓冲
                });
                
                if (visibleImages.length > 0) {
                    console.log(`    - 第${Math.floor(scrollPos/scrollStep)+1}屏: 发现 ${visibleImages.length} 个可见图片`);
                }
            }
            
            // 滚动到底部，确保最后的图片也被加载
            conversationContainer.scrollTop = scrollHeight;
            await delay(1000);
            
            // 再回到顶部，为后续处理做准备
            conversationContainer.scrollTop = 0;
            await delay(500);
            
            console.log(`  - 滚动完成，等待图片加载...`);
            resolve();
        });
    }
    
    // 工具函数：等待图片加载完成
    function waitForImagesLoaded(doc, timeout = 10000) {
        return new Promise((resolve) => {
            const images = doc.querySelectorAll('.msg-img');
            if (images.length === 0) {
                resolve();
                return;
            }
            
            let loadedCount = 0;
            let totalImages = images.length;
            
            console.log(`  - 等待 ${totalImages} 张图片加载...`);
            
            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= totalImages) {
                    resolve();
                }
            };
            
            images.forEach((img, index) => {
                if (img.complete && img.src && img.src !== 'data:image/png;base64,') {
                    // 图片已经加载完成
                    checkAllLoaded();
                } else if (img.src && img.src !== 'data:image/png;base64,') {
                    // 等待图片加载
                    img.onload = checkAllLoaded;
                    img.onerror = checkAllLoaded; // 即使加载失败也继续
                } else {
                    // 空图片或无效src
                    checkAllLoaded();
                }
            });
            
            // 设置超时，避免无限等待
            setTimeout(() => {
                console.log(`  - 图片加载超时，继续处理...`);
                resolve();
            }, timeout);
        });
    }
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function generateUserId(name, avatar) {
        const str = name + avatar;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString();
    }
    // 🔥 新增：时间提取函数
    function parseWechatTime(timeText) {
        const match = timeText.match(/(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
        if (match) {
            const [_, month, day, hour, minute] = match;
            const currentYear = new Date().getFullYear();
            return new Date(currentYear, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
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

    function extractSessionTime(userElement) {
        const dateElement = userElement.querySelector('.date');
        if (dateElement) {
            const timeText = dateElement.textContent.trim();
            return parseWechatTime(timeText);
        }
        return null;
    }    
    // 工具函数：判断发送者
    function getSender(messageElement, docContext) {
        // 方法1: 检查当前元素的类名
        if (messageElement.classList.contains('content-left')) {
            return 'user';
        }
        if (messageElement.classList.contains('content-right')) {
            return 'me';
        }
        
        // 方法2: 检查父元素链
        let currentElement = messageElement;
        while (currentElement && currentElement !== docContext.body) {
            if (currentElement.classList.contains('content-left')) {
                return 'user';
            }
            if (currentElement.classList.contains('content-right')) {
                return 'me';
            }
            currentElement = currentElement.parentElement;
        }
        
        // 方法3: 检查子元素
        const contentLeft = messageElement.querySelector('.content-left');
        const contentRight = messageElement.querySelector('.content-right');
        if (contentLeft) return 'user';
        if (contentRight) return 'me';
        
        // 方法4: 检查bubble类名
        const bubbleLeft = messageElement.querySelector('.bubble-left');
        const bubbleRight = messageElement.querySelector('.bubble-right');
        if (bubbleLeft) return 'user';
        if (bubbleRight) return 'me';
        
        // 方法5: 通过closest检查（备用）
        try {
            if (messageElement.closest('.content-left')) {
                return 'user';
            } else if (messageElement.closest('.content-right')) {
                return 'me';
            }
        } catch (e) {
            console.warn('closest方法失败:', e);
        }
        
        return 'unknown';
    }
    
    try {
        // 获取正确的document对象
        const { doc, win } = getCorrectDocument();
        
        const result = {
            timestamp: new Date().toISOString(),
            users: []
        };
        
        console.log('📋 1. 检查私信标签状态...');
        
        // 1. 检查是否已经在私信标签页
        const currentTab = doc.querySelector('li.weui-desktop-tab__nav_current a');
        if (currentTab && currentTab.textContent.trim() === '私信') {
            console.log('✅ 已在私信标签页');
        } else {
            // 寻找私信标签进行切换
            const allTabs = doc.querySelectorAll('li.weui-desktop-tab__nav a');
            let privateMessageTab = null;
            
            for (const tab of allTabs) {
                if (tab.textContent.trim() === '私信') {
                    privateMessageTab = tab;
                    break;
                }
            }
            
            if (!privateMessageTab) {
                // 调试信息
                console.error('找到的所有标签:', 
                    Array.from(allTabs).map(el => ({
                        text: el.textContent.trim(),
                        classes: el.parentElement.className,
                        href: el.href
                    }))
                );
                throw new Error('未找到私信标签');
            }
            
            console.log('找到私信标签，点击切换...');
            privateMessageTab.click();
            await delay(1000); // 等待标签页切换
        }
        
        console.log('👥 2. 检查是否有私信用户...');

        // 2. 首先检查是否有用户列表容器
        const userListContainer = doc.querySelector('.private-msg-list') || doc.querySelector('.session-list-wrapper');
        if (!userListContainer) {
            console.log('⚠️ 未找到用户列表容器，可能页面还未加载完成');
            // 等待一下再检查
            await delay(2000);
            const retryContainer = doc.querySelector('.private-msg-list') || doc.querySelector('.session-list-wrapper');
            if (!retryContainer) {
                console.log('❌ 确认无法找到用户列表容器');
                return {
                    timestamp: new Date().toISOString(),
                    users: [],
                    message: '无法找到私信用户列表容器'
                };
            }
        }

        // 3. 检查是否有用户元素
        let userElements = doc.querySelectorAll('.session-wrap');

        // 如果没有找到用户，等待一下再试
        if (userElements.length === 0) {
            console.log('🔍 首次检查未发现用户，等待加载...');
            await delay(3000);
            userElements = doc.querySelectorAll('.session-wrap');
        }

        console.log(`找到 ${userElements.length} 个用户`);

        if (userElements.length === 0) {
            console.log('✅ 该账号暂无私信用户');
            return {
                timestamp: new Date().toISOString(),
                users: [],
                message: '该账号暂无私信用户'
            };
        }
        console.log(`找到 ${userElements.length} 个用户`);
        
        if (userElements.length === 0) {
            console.log('⚠️ 没有找到私信用户');
            return result;
        }
        
        // 4. 逐个处理用户
        for (let i = 0; i < userElements.length; i++) {
            const userElement = userElements[i];
            console.log(`💬 正在处理第 ${i + 1}/${userElements.length} 个用户...`);
            
            try {
                // 获取用户基本信息
                const nameElement = userElement.querySelector('.name');
                const avatarElement = userElement.querySelector('.feed-img');
                
                if (!nameElement || !avatarElement) {
                    console.warn(`用户 ${i + 1} 信息不完整，跳过`);
                    continue;
                }
                
                const userName = nameElement.textContent.trim();
                const userAvatar = avatarElement.src;
                // 🔥 新增：提取会话时间
                const sessionTime = extractSessionTime(userElement);
                console.log(`  - 用户名: ${userName}`);
                console.log(`  - 会话时间: ${sessionTime ? sessionTime.toLocaleString('zh-CN') : '未知'}`);
                // 点击用户
                userElement.click();
                await delay(1500); // 等待对话内容加载
                
                // 等待对话内容出现
                await waitForElement(doc, '.session-content-wrapper', 3000);
                
                // 滚动对话区域以触发图片懒加载
                console.log(`  - 开始滚动加载图片...`);
                await scrollToLoadImages(doc);
                
                // 等待图片加载完成
                await waitForImagesLoaded(doc, 5000);
                console.log(`  - 图片处理完成`);
                
                // 解析对话内容
                const messages = [];
                
                // 获取所有消息容器 - 更准确的选择器
                const allMessageContainers = doc.querySelectorAll('.text-wrapper, .image-wrapper');
                
                console.log(`  - 找到 ${allMessageContainers.length} 个消息容器`);
                
                // 按DOM顺序处理每个消息容器
                allMessageContainers.forEach((container, index) => {
                    try {
                        const sender = getSender(container, doc);
                        
                        // 处理文字消息（包括emoji）
                        if (container.classList.contains('text-wrapper')) {
                            const messageElement = container.querySelector('.message-plain');
                            if (messageElement) {
                                // 检查是否包含emoji图片
                                const emojiImages = messageElement.querySelectorAll('.we-emoji');
                                let text = '';
                                
                                if (emojiImages.length > 0) {
                                    // 如果包含emoji，提取alt属性作为文本
                                    const textNodes = [];
                                    
                                    // 遍历所有子节点
                                    messageElement.childNodes.forEach(node => {
                                        if (node.nodeType === Node.TEXT_NODE) {
                                            // 文本节点
                                            const nodeText = node.textContent.trim();
                                            if (nodeText) textNodes.push(nodeText);
                                        } else if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('we-emoji')) {
                                            // emoji图片节点
                                            const alt = node.getAttribute('alt') || '';
                                            if (alt) textNodes.push(alt);
                                        }
                                    });
                                    
                                    text = textNodes.join('');
                                } else {
                                    // 普通文本
                                    text = messageElement.textContent.trim();
                                }
                                
                                if (text) {
                                    messages.push({
                                        sender: sender,
                                        text: text
                                    });
                                    console.log(`    消息 ${index + 1}: ${sender} - "${text.substring(0, 20)}..."`);
                                }
                            }
                        }
                        
                        // 处理图片消息
                        if (container.classList.contains('image-wrapper')) {
                            const imageElement = container.querySelector('.msg-img');
                            if (imageElement && imageElement.src && 
                                imageElement.src !== 'data:image/png;base64,' && 
                                imageElement.complete) {
                                messages.push({
                                    sender: sender,
                                    images: [imageElement.src]
                                });
                                console.log(`    消息 ${index + 1}: ${sender} - [图片: ${imageElement.src.substring(0, 50)}...]`);
                            } else if (imageElement && imageElement.src) {
                                console.warn(`    消息 ${index + 1}: 图片未完全加载 - ${imageElement.src.substring(0, 50)}...`);
                            }
                        }
                        
                    } catch (error) {
                        console.warn(`解析消息 ${index + 1} 时出错:`, error);
                    }
                });
                
                // 添加用户数据
                const userData = {
                    user_id: generateUserId(userName, userAvatar),
                    name: userName,
                    avatar: userAvatar,
                    session_time: sessionTime ? sessionTime.toISOString() : null,
                    messages: messages
                };
                
                result.users.push(userData);
                console.log(`  ✅ 提取到 ${messages.length} 条消息，会话时间: ${sessionTime ? sessionTime.toLocaleString('zh-CN') : '未知'}`);
                
            } catch (error) {
                console.error(`处理用户 ${i + 1} 时出错:`, error);
                continue;
            }
        }
        
        console.log('🎉 提取完成！');
        console.log(`共处理 ${result.users.length} 个用户`);
        
        // 输出结果
        console.log('📊 提取结果:');
        console.log(JSON.stringify(result, null, 2));
        
        // 将结果存储到全局变量方便复制
        window.privateMessagesData = result;
        console.log('💾 数据已保存到 window.privateMessagesData，可以通过 copy(window.privateMessagesData) 复制到剪贴板');
        
        return result;
        
    } catch (error) {
        console.error('❌ 脚本执行出错:', error);
        throw error;
    }
})();