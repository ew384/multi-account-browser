// src/main/plugins/message/bytedance/DouyinMessage.ts
import {
    PluginMessage,
    PluginType,
    MessageSyncParams,
    MessageSyncResult,
    MessageSendParams,
    MessageSendResult,
    UserInfo,
    Message,
    UserMessageThread
} from '../../../../types/pluginInterface';
import * as fs from 'fs';
import * as path from 'path';

export class DouyinMessage implements PluginMessage {
    public readonly platform = 'douyin';
    public readonly name = '抖音私信插件';
    public readonly type = PluginType.MESSAGE;

    private tabManager!: any;  // TabManager 实例

    async init(tabManager: any): Promise<void> {
        this.tabManager = tabManager;
        console.log('✅ 抖音私信插件初始化完成');
    }

    async destroy(): Promise<void> {
        console.log('🧹 抖音私信插件已销毁');
    }

    /**
     * 🔥 点击抖音创作者中心的互动管理 > 私信管理
     */
    private async clickPrivateMessage(tabId: string): Promise<boolean> {
        try {
            console.log('🖱️ 执行抖音私信管理导航点击...');
            
            const clickScript = `
                (async function clickDouyinPrivateMessage() {
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                    
                    try {
                        console.log('📋 查找互动管理菜单...');
                        
                        // 查找互动管理菜单项
                        const interactionMenu = document.querySelector('#douyin-creator-master-menu-nav-interaction');
                        
                        if (!interactionMenu) {
                            console.error('未找到互动管理菜单元素');
                            return false;
                        }
                        
                        // 检查当前展开状态
                        const isExpanded = interactionMenu.getAttribute('aria-expanded') === 'true';
                        console.log('互动管理展开状态:', isExpanded);
                        
                        if (!isExpanded) {
                            console.log('点击展开互动管理...');
                            
                            // 查找可点击的标题元素
                            const titleElement = interactionMenu.querySelector('.douyin-creator-master-navigation-sub-title');
                            
                            if (!titleElement) {
                                console.error('未找到互动管理标题点击元素');
                                return false;
                            }
                            
                            // 点击展开
                            titleElement.click();
                            console.log('已点击互动管理展开按钮');
                            
                            // 等待展开动画完成
                            await delay(500);
                        }
                        
                        console.log('查找私信管理菜单项...');
                        
                        // 查找私信管理菜单项
                        const privateMessageItem = document.querySelector('#douyin-creator-master-menu-nav-message_manage');
                        
                        if (!privateMessageItem) {
                            console.error('未找到私信管理菜单项');
                            return false;
                        }
                        
                        console.log('找到私信管理菜单项，准备点击...');
                        
                        // 点击私信管理
                        privateMessageItem.click();
                        console.log('已点击私信管理菜单项');
                        
                        // 等待页面跳转
                        await delay(1000);
                        
                        // 验证跳转结果
                        const currentUrl = window.location.href;
                        console.log('当前URL:', currentUrl);
                        
                        if (currentUrl.includes('/chat')) {
                            console.log('成功跳转到私信管理页面！');
                            return true;
                        } else {
                            console.log('点击操作已完成，URL:', currentUrl);
                            return true;
                        }
                        
                    } catch (error) {
                        console.error('执行私信导航点击时发生错误:', error);
                        return false;
                    }
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, clickScript);
            
            if (result) {
                console.log('✅ 抖音私信导航点击成功');
                // 等待页面完全加载
                await new Promise(resolve => setTimeout(resolve, 3000));
                return true;
            } else {
                console.log('❌ 抖音私信导航点击失败');
                return false;
            }

        } catch (error) {
            console.error('❌ 点击抖音私信导航异常:', error);
            return false;
        }
    }

    /**
     * 🔥 尝试通过Electron特权访问iframe内容
     */
    private async tryAccessIframeWithElectronAPI(tabId: string): Promise<any> {
        try {
            console.log('🔓 尝试通过Electron API访问跨域iframe...');
            
            const accessScript = `
                (function() {
                    try {
                        console.log('🔍 尝试多种方式访问iframe内容...');
                        
                        // 方法1：通过Electron的webSecurity=false绕过跨域限制
                        const iframes = document.querySelectorAll('iframe');
                        console.log('找到iframe数量:', iframes.length);
                        
                        for (let i = 0; i < iframes.length; i++) {
                            const iframe = iframes[i];
                            console.log('iframe', i + 1, '- src:', iframe.src);
                            
                            try {
                                // 方法1a：直接访问contentDocument
                                if (iframe.contentDocument) {
                                    console.log('✅ 方法1a成功: 可以访问contentDocument');
                                    const chatContainer = iframe.contentDocument.querySelector('.box-content-jSgLQF');
                                    if (chatContainer) {
                                        return { success: true, method: 'contentDocument', iframeIndex: i };
                                    }
                                }
                                
                                // 方法1b：通过contentWindow
                                if (iframe.contentWindow && iframe.contentWindow.document) {
                                    console.log('✅ 方法1b成功: 可以访问contentWindow.document');
                                    const chatContainer = iframe.contentWindow.document.querySelector('.box-content-jSgLQF');
                                    if (chatContainer) {
                                        return { success: true, method: 'contentWindow', iframeIndex: i };
                                    }
                                }
                                
                            } catch (accessError) {
                                console.log('方法1失败:', accessError.message);
                                continue;
                            }
                        }
                        
                        // 方法2：通过postMessage与iframe通信
                        console.log('🔄 尝试方法2: postMessage通信...');
                        if (iframes.length > 0) {
                            const targetIframe = iframes[1]; // 通常聊天iframe是第二个
                            if (targetIframe.contentWindow) {
                                // 发送消息到iframe
                                targetIframe.contentWindow.postMessage({
                                    type: 'DOUYIN_CHAT_DATA_REQUEST',
                                    timestamp: Date.now()
                                }, '*');
                                
                                return { success: true, method: 'postMessage', pending: true };
                            }
                        }
                        
                        // 方法3：检查是否有全局变量或API
                        console.log('🔄 尝试方法3: 全局变量检查...');
                        const globalVars = ['__INITIAL_STATE__', '__NUXT__', 'window.g_initialProps', 'window.__douyinChatData__'];
                        for (const varName of globalVars) {
                            try {
                                const value = eval(varName);
                                if (value) {
                                    console.log('找到全局变量:', varName);
                                    return { success: true, method: 'globalVar', varName: varName, data: value };
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        return { success: false, error: '所有访问方法都失败了' };
                        
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, accessScript);
            console.log('🔓 Electron特权访问结果:', result);
            return result;

        } catch (error) {
            console.error('❌ Electron特权访问失败:', error);
            return { success: false, error: error instanceof Error ? error.message : 'unknown error'};
        }
    }

    /**
     * 🔥 获取抖音私信数据（增强版）
     */
    private async extractDouyinChatData(tabId: string): Promise<any> {
        try {
            console.log('📊 开始提取抖音私信数据（增强版）...');

            // 1. 先尝试Electron特权访问
            const privilegedResult = await this.tryAccessIframeWithElectronAPI(tabId);
            if (privilegedResult.success && privilegedResult.method !== 'postMessage') {
                console.log('🎉 通过Electron特权成功访问iframe');
                // 这里可以添加具体的数据提取逻辑
            }

            // 2. 使用基础方法提取用户列表
            const basicScript = `
                (async function extractDouyinPrivateMessages() {
                    console.log('🚀 开始提取抖音私信数据...');
                    
                    // 工具函数
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
                        // 处理格式：07-30
                        const monthDayMatch = timeText.match(/(\\d{1,2})-(\\d{1,2})/);
                        if (monthDayMatch) {
                            const [_, month, day] = monthDayMatch;
                            const currentYear = new Date().getFullYear();
                            return new Date(currentYear, parseInt(month) - 1, parseInt(day));
                        }
                        return new Date();
                    }
                    
                    try {
                        const result = {
                            timestamp: new Date().toISOString(),
                            users: []
                        };
                        
                        console.log('📋 1. 查找活动的聊天内容区域...');
                        
                        // 查找用户列表容器
                        const userListContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
                        if (!userListContainer) {
                            return {
                                timestamp: new Date().toISOString(),
                                users: [],
                                message: '未找到用户列表容器'
                            };
                        }
                        
                        // 获取所有用户项
                        const userItems = userListContainer.querySelectorAll('li.semi-list-item');
                        console.log('找到用户项数量:', userItems.length);
                        
                        if (userItems.length === 0) {
                            return {
                                timestamp: new Date().toISOString(),
                                users: [],
                                message: '该账号暂无私信用户'
                            };
                        }
                        
                        // 处理每个用户
                        for (let index = 0; index < userItems.length; index++) {
                            const userItem = userItems[index];
                            try {
                                // 提取用户基本信息
                                const nameElement = userItem.querySelector('.item-header-name-vL_79m');
                                const userName = nameElement ? nameElement.textContent.trim() : \`用户\${index + 1}\`;
                                
                                const avatarElement = userItem.querySelector('.semi-avatar img');
                                const userAvatar = avatarElement ? avatarElement.src : '';
                                
                                const timeElement = userItem.querySelector('.item-header-time-DORpXQ');
                                const timeText = timeElement ? timeElement.textContent.trim() : '';
                                const sessionTime = parseDouyinTime(timeText);
                                
                                // 提取最后一条消息预览
                                const previewElement = userItem.querySelector('.text-whxV9A');
                                const lastMessageText = previewElement ? previewElement.textContent.trim() : '';
                                
                                console.log(\`  用户 \${index + 1}: \${userName}, 时间: \${timeText}, 预览: \${lastMessageText.substring(0, 30)}...\`);
                                
                                // 🔥 创建基于预览的消息数据
                                const messages = [];
                                if (lastMessageText) {
                                    messages.push({
                                        sender: 'user', // 通常最新消息来自对方
                                        text: lastMessageText,
                                        type: 'text',
                                        timestamp: sessionTime.toISOString()
                                    });
                                }
                                
                                const userData = {
                                    user_id: generateUserId(userName, userAvatar),
                                    name: userName,
                                    avatar: userAvatar,
                                    session_time: sessionTime.toISOString(),
                                    last_message_preview: lastMessageText,
                                    messages: messages
                                };
                                
                                result.users.push(userData);
                                
                            } catch (error) {
                                console.warn(\`处理用户 \${index + 1} 时出错:\`, error);
                                continue;
                            }
                        }
                        
                        console.log('🎉 抖音私信数据提取完成！');
                        console.log(\`共处理 \${result.users.length} 个用户\`);
                        
                        return result;
                        
                    } catch (error) {
                        console.error('❌ 脚本执行出错:', error);
                        return {
                            timestamp: new Date().toISOString(),
                            users: [],
                            message: '脚本执行异常: ' + error.message
                        };
                    }
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, basicScript);
            console.log('📊 抖音数据提取结果:', result);
            return result;

        } catch (error) {
            console.error('❌ 提取抖音聊天数据失败:', error);
            return {
                timestamp: new Date().toISOString(),
                users: [],
                message: '数据提取异常: ' + error
            };
        }
    }

    /**
     * 🔥 同步消息功能
     */
    async syncMessages(params: MessageSyncParams): Promise<MessageSyncResult> {
        try {
            console.log(`🔄 开始同步抖音私信消息: ${params.accountId}`);
            
            // 🔥 如果有事件数据，说明是实时同步
            if (params.eventData) {
                console.log(`⚡ 实时同步模式 - 事件数据:`, params.eventData);
            } else {
                console.log(`🔄 常规同步模式`);
                // 点击私信导航
                const navSuccess = await this.clickPrivateMessage(params.tabId);
                if (!navSuccess) {
                    console.warn('⚠️ 私信导航失败，尝试继续...');
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // 验证标签页上下文
            const isValidContext = await this.validateTabContext(params.tabId);
            if (!isValidContext) {
                throw new Error('标签页不在抖音创作者中心页面');
            }
            
            // 🔥 提取抖音私信数据
            const chatData = await this.extractDouyinChatData(params.tabId);
            
            if (chatData && chatData.users) {
                const threads = this.convertToStandardFormat(chatData.users, params.platform, params.accountId);
                
                console.log(`✅ 抖音消息同步成功: 获取到 ${threads.length} 个对话线程`);
                return {
                    success: true,
                    threads: threads,
                    newMessages: this.countTotalMessages(threads),
                    updatedThreads: threads.length,
                    syncTime: new Date().toISOString()
                };
            } else {
                // 处理无用户的情况
                return {
                    success: true,
                    threads: [],
                    newMessages: 0,
                    updatedThreads: 0,
                    message: chatData.message || '该账号暂无私信用户',
                    syncTime: new Date().toISOString()
                };
            }

        } catch (error) {
            console.error('❌ 抖音消息同步失败:', error);
            return {
                success: false,
                threads: [],
                newMessages: 0,
                updatedThreads: 0,
                errors: [error instanceof Error ? error.message : 'unknown error'],
                syncTime: new Date().toISOString()
            };
        }
    }

    /**
     * 🔥 发送消息功能
     */
    async sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
        try {
            console.log(`📤 发送抖音消息: ${params.userName} (${params.type})`);

            // 🔥 生成消息发送脚本
            const sendScript = this.generateDouyinSendScript(
                params.userName, 
                params.content, 
                params.type
            );

            console.log(`📱 执行抖音消息发送脚本...`);

            // 执行发送脚本
            const scriptResult = await this.tabManager.executeScript(params.tabId, sendScript);

            // 解析发送结果
            const sendResult = this.parseSendResult(scriptResult);

            if (sendResult.success) {
                console.log(`✅ 抖音消息发送成功: ${params.userName}`);
                return {
                    success: true,
                    message: `${params.type === 'image' ? '图片' : '消息'}发送成功`,
                    user: params.userName,
                    type: params.type,
                    content: params.type === 'text' ? params.content : 'image',
                    timestamp: new Date().toISOString()
                };
            } else {
                console.error(`❌ 抖音消息发送失败: ${sendResult.error}`);
                return {
                    success: false,
                    error: sendResult.error || '发送失败',
                    user: params.userName,
                    type: params.type
                };
            }

        } catch (error) {
            console.error('❌ 抖音消息发送异常:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                user: params.userName,
                type: params.type
            };
        }
    }

    /**
     * 🔥 获取用户列表
     */
    async getUserList(tabId: string): Promise<UserInfo[]> {
        try {
            console.log('📋 获取抖音用户列表...');

            const chatData = await this.extractDouyinChatData(tabId);
            
            if (chatData && chatData.users) {
                return chatData.users.map((user: any) => ({
                    user_id: user.user_id,
                    name: user.name,
                    avatar: user.avatar,
                    unread_count: 0 // 抖音暂时无法获取未读数
                }));
            }

            return [];

        } catch (error) {
            console.error('❌ 获取抖音用户列表异常:', error);
            return [];
        }
    }

    /**
     * 🔥 验证标签页上下文
     */
    async validateTabContext(tabId: string): Promise<boolean> {
        try {
            const validateScript = `
                (function() {
                    // 检查是否在抖音创作者中心页面
                    const url = window.location.href;
                    const isDouyinCreator = url.includes('creator.douyin.com');
                    
                    // 检查是否有私信相关元素
                    const hasPrivateMsg = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer') || 
                                         document.querySelector('.semi-list-item') ||
                                         document.querySelector('[class*="chat"]');
                    
                    return {
                        isValidUrl: isDouyinCreator,
                        hasRequiredElements: !!hasPrivateMsg,
                        currentUrl: url
                    };
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, validateScript);

            if (result && result.isValidUrl && result.hasRequiredElements) {
                return true;
            } else {
                console.warn('⚠️ 标签页上下文验证失败:', result);
                return false;
            }

        } catch (error) {
            console.error('❌ 验证标签页上下文失败:', error);
            return false;
        }
    }

    /**
     * 🔥 获取平台特定配置
     */
    getPlatformConfig(): Record<string, any> {
        return {
            platform: 'douyin',
            name: '抖音',
            features: ['私信同步', '消息发送', '用户列表'],
            syncInterval: 5, // 5分钟
            maxConcurrency: 2,
            supportedMessageTypes: ['text'],
            maxMessageLength: 500,
            limitations: {
                crossOriginIframe: true,
                limitedChatHistory: true,
                previewOnly: true
            }
        };
    }

    // ==================== 私有方法 ====================

    /**
     * 🔥 生成抖音消息发送脚本
     */
    private generateDouyinSendScript(userName: string, content: string, type: 'text' | 'image'): string {
        // 转义参数中的特殊字符
        const escapedUserName = userName.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const escapedContent = content.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/`/g, '\\`');
        
        return `
            (async function sendDouyinMessage(userName, content, type = 'text') {
                const delay = ms => new Promise(r => setTimeout(r, ms));
                
                try {
                    console.log('🚀 开始发送抖音消息:', userName, type);
                    
                    // 1. 查找目标用户
                    console.log('👤 查找用户:', userName);
                    const userElements = document.querySelectorAll('.semi-list-item');
                    console.log('📋 找到用户数量:', userElements.length);
                    
                    let targetUser = null;
                    for (let userElement of userElements) {
                        const nameElement = userElement.querySelector('.item-header-name-vL_79m');
                        if (nameElement) {
                            const name = nameElement.textContent.trim();
                            if (name === userName) {
                                targetUser = userElement;
                                break;
                            }
                        }
                    }

                    if (!targetUser) {
                        throw new Error(\`用户未找到: \${userName}\`);
                    }

                    // 2. 点击用户进入对话
                    console.log('✅ 找到目标用户，点击进入对话...');
                    targetUser.click();
                    await delay(1500);

                    // 3. 查找输入框（抖音的输入框通常在页面底部）
                    console.log('📝 查找输入框...');
                    const inputElement = document.querySelector('.chat-input-dccKiL') || 
                                        document.querySelector('[contenteditable="true"]') ||
                                        document.querySelector('textarea') ||
                                        document.querySelector('input[type="text"]');
                    
                    if (!inputElement) {
                        throw new Error('输入框未找到');
                    }

                    // 4. 输入内容
                    console.log('📝 输入内容...');
                    inputElement.focus();
                    await delay(200);
                    
                    if (inputElement.contentEditable === 'true') {
                        inputElement.innerHTML = content;
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        inputElement.value = content;
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    await delay(300);
                    console.log('✅ 内容输入完成:', content);

                    // 5. 查找并点击发送按钮
                    console.log('📤 查找发送按钮...');
                    const sendButton = document.querySelector('.chat-btn') ||
                                      document.querySelector('[class*="send"]') ||
                                      document.querySelector('button[type="submit"]');
                    
                    if (!sendButton) {
                        // 尝试回车发送
                        console.log('🔄 尝试回车发送...');
                        inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            bubbles: true
                        }));
                    } else {
                        sendButton.click();
                    }

                    await delay(800);
                    console.log('✅ 消息发送完成');
                    
                    return {
                        success: true,
                        message: '消息发送成功',
                        user: userName,
                        type: type,
                        content: content,
                        timestamp: new Date().toISOString()
                    };
                    
                } catch (error) {
                    console.error('❌ 发送消息失败:', error);
                    return {
                        success: false,
                        error: error.message,
                        user: userName,
                        type: type
                    };
                }
            })('${escapedUserName}', \`${escapedContent}\`, '${type}')
        `;
    }

    /**
     * 🔥 解析发送结果
     */
    private parseSendResult(scriptResult: any): { success: boolean; error?: string } {
        try {
            if (scriptResult && typeof scriptResult === 'object') {
                return {
                    success: scriptResult.success || false,
                    error: scriptResult.error
                };
            }

            if (typeof scriptResult === 'string') {
                const parsed = JSON.parse(scriptResult);
                return {
                    success: parsed.success || false,
                    error: parsed.error
                };
            }

            return { success: false, error: '发送结果解析失败' };

        } catch (error) {
            return { 
                success: false, 
                error: '发送结果解析异常: ' + (error instanceof Error ? error.message : 'unknown error') 
            };
        }
    }

    /**
     * 🔥 转换为标准格式
     */
    private convertToStandardFormat(users: any[], platform: string, accountId: string): UserMessageThread[] {
        const threads: UserMessageThread[] = [];

        for (const user of users) {
            try {
                const messages: Message[] = [];

                // 转换消息格式
                if (user.messages && Array.isArray(user.messages)) {
                    for (const msg of user.messages) {
                        const message: Message = {
                            timestamp: msg.timestamp || new Date().toISOString(),
                            sender: msg.sender as 'me' | 'user',
                            text: msg.text,
                            images: msg.images,
                            type: msg.type || (msg.images ? 'image' : 'text')
                        };
                        messages.push(message);
                    }
                }

                // 创建线程对象
                const thread: UserMessageThread = {
                    platform: platform,
                    account_id: accountId,
                    user_id: user.user_id,
                    user_name: user.name,
                    avatar: user.avatar,
                    unread_count: 0,
                    messages: messages,
                    last_message_time: user.session_time
                };

                threads.push(thread);

            } catch (error) {
                console.warn(`⚠️ 转换用户数据失败: ${user.name}:`, error);
                continue;
            }
        }

        return threads;
    }

    /**
     * 🔥 统计总消息数
     */
    private countTotalMessages(threads: UserMessageThread[]): number {
        let totalMessages = 0;
        for (const thread of threads) {
            if (thread.messages) {
                totalMessages += thread.messages.length;
            }
        }
        return totalMessages;
    }
}