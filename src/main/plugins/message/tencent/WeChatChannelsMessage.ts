// src/main/plugins/message/tencent/WeChatChannelsMessage.ts
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
export class WeChatChannelsMessage implements PluginMessage {
    public readonly platform = 'wechat';
    public readonly name = '微信视频号消息插件';
    public readonly type = PluginType.MESSAGE;

    private tabManager!: any;  // TabManager 实例

    async init(tabManager: any): Promise<void> {
        this.tabManager = tabManager;
        console.log('✅ 微信视频号消息插件初始化完成');
    }

    async destroy(): Promise<void> {
        console.log('🧹 微信视频号消息插件已销毁');
    }
    /**
     * 🔥 点击微信视频号助手的互动管理 > 私信
     */
    private async clickPrivateMessage(tabId: string): Promise<boolean> {
        try {
            console.log('🖱️ 执行点击私信导航...');
            
            const clickScript = `
                (function clickPrivateMessage() {
                    console.log('开始执行脚本...');
                    
                    // 第一步：点击互动管理折叠按钮
                    const interactionMenu = document.querySelector('a[class*="finder-ui-desktop-menu__sub__link"] span[class*="finder-ui-desktop-menu__link__inner"] span[class*="finder-ui-desktop-menu__name"] span');
                    
                    if (!interactionMenu) {
                        console.error('未找到互动管理菜单');
                        return false;
                    }
                    
                    // 查找包含"互动管理"文本的元素
                    let interactionLink = null;
                    const menuItems = document.querySelectorAll('a[class*="finder-ui-desktop-menu__sub__link"]');
                    
                    for (let item of menuItems) {
                        const nameSpan = item.querySelector('span[class*="finder-ui-desktop-menu__name"] span');
                        if (nameSpan && nameSpan.textContent.trim() === '互动管理') {
                            interactionLink = item;
                            break;
                        }
                    }
                    
                    if (!interactionLink) {
                        console.error('未找到互动管理链接');
                        return false;
                    }
                    
                    console.log('找到互动管理菜单，准备点击...');
                    
                    // 点击互动管理展开子菜单
                    interactionLink.click();
                    
                    // 等待子菜单展开后再点击私信
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            console.log('查找私信菜单项...');
                            
                            // 查找私信菜单项
                            const subMenuItems = document.querySelectorAll('li[class*="finder-ui-desktop-sub-menu__item"] a');
                            let privateMessageLink = null;
                            
                            for (let item of subMenuItems) {
                                const nameSpan = item.querySelector('span[class*="finder-ui-desktop-menu__name"] span');
                                if (nameSpan && nameSpan.textContent.trim() === '私信') {
                                    privateMessageLink = item;
                                    break;
                                }
                            }
                            
                            if (!privateMessageLink) {
                                console.error('未找到私信菜单项');
                                resolve(false);
                                return;
                            }
                            
                            console.log('找到私信菜单项，准备点击...');
                            
                            // 点击私信
                            privateMessageLink.click();
                            
                            console.log('脚本执行完成！');
                            resolve(true);
                            
                        }, 500); // 等待500毫秒让子菜单展开
                    });
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, clickScript);
            
            if (result) {
                console.log('✅ 私信导航点击成功');
                // 等待页面跳转完成
                await new Promise(resolve => setTimeout(resolve, 3000));
                return true;
            } else {
                console.log('❌ 私信导航点击失败');
                return false;
            }

        } catch (error) {
            console.error('❌ 点击私信导航异常:', error);
            return false;
        }
    }
    /**
     * 🔥 同步消息功能 - 执行消息获取脚本
     */
    async syncMessages(params: MessageSyncParams): Promise<MessageSyncResult> {
        try {
            console.log(`🔄 开始同步微信视频号消息: ${params.accountId}`);
            
            // 🔥 如果有事件数据，说明是实时同步
            if (params.eventData) {
                console.log(`⚡ 实时同步模式 - 事件数据:`, params.eventData);
                // 实时同步不需要点击导航，因为页面已经在正确位置
            } else {
                console.log(`🔄 常规同步模式`);
                // 常规同步需要点击私信导航
                console.log(`🖱️ 点击私信导航...`);
                const navSuccess = await this.clickPrivateMessage(params.tabId);
                if (!navSuccess) {
                    console.warn('⚠️ 私信导航失败，尝试继续...');
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // 验证标签页上下文
            const isValidContext = await this.validateTabContext(params.tabId);
            if (!isValidContext) {
                throw new Error('标签页不在微信视频号助手页面');
            }
            
            // 🔥 生成同步脚本（可以根据是否有eventData优化）
            const syncScript = this.generateWechatSyncScript(params.eventData);
            
            // 🔥 调整重试策略
            const maxRetries = params.eventData ? 10 : 120; // 实时同步减少重试次数，但给一定容错
            const retryDelay = params.eventData ? 300 : 1000; // 实时同步更快重试
            let lastError = '';
            
            console.log(`📝 开始执行同步脚本 (${params.eventData ? '实时' : '常规'}模式)...`);
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // 执行同步脚本
                    const scriptResult = await this.tabManager.executeScript(params.tabId, syncScript);
                    
                    if (!scriptResult) {
                        throw new Error('脚本执行返回空结果');
                    }

                    // 解析脚本返回的数据
                    const parsedData = this.parseMessageData(scriptResult);
                    
                    if (parsedData.success && parsedData.users) {
                        // 转换为标准格式
                        const threads = this.convertToStandardFormat(parsedData.users, params.platform, params.accountId);
                        
                        console.log(`✅ 微信消息同步成功: 获取到 ${threads.length} 个对话线程`);
                        return {
                            success: true,
                            threads: threads,
                            newMessages: this.countTotalMessages(threads),
                            updatedThreads: threads.length,
                            syncTime: new Date().toISOString()
                        };
                    }
                    
                    throw new Error(parsedData.errors?.[0] || '数据解析失败');
                    
                } catch (error) {
                    lastError = error instanceof Error ? error.message : 'unknown error';
                    
                    if (params.eventData) {
                        console.log(`⚠️ 实时同步第 ${attempt} 次尝试失败: ${lastError}`);
                    } else {
                        console.log(`⚠️ 常规同步第 ${attempt} 次尝试失败: ${lastError}`);
                    }
                    
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                }
            }

            // 所有重试都失败
            const syncMode = params.eventData ? '实时' : '常规';
            return {
                success: false,
                threads: [],
                newMessages: 0,
                updatedThreads: 0,
                errors: [`${syncMode}同步重试 ${maxRetries} 次后失败: ${lastError}`],
                syncTime: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ 微信消息同步失败:', error);
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

    // 🔥 新增/更新：生成微信消息同步脚本
    private generateWechatSyncScript(eventData?: any): string {
        if (eventData) {
            // 🔥 实时同步：可能可以优化脚本，针对性获取最新消息
            console.log('📜 生成实时同步脚本...');
            // 当前先使用相同的脚本，将来可以优化
            const scriptPath = path.join(__dirname, './scripts/wechat-sync.js');
            return fs.readFileSync(scriptPath, 'utf-8');
        } else {
            // 🔥 常规同步：使用完整的同步脚本
            console.log('📜 生成常规同步脚本...');
            const scriptPath = path.join(__dirname, './scripts/wechat-sync.js');
            return fs.readFileSync(scriptPath, 'utf-8');
        }
    }
    /**
     * 🔥 发送消息功能 - 执行消息发送脚本
     */
    async sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
        try {
            console.log(`📤 发送微信消息: ${params.userName} (${params.type})`);

            // 验证标签页上下文
            const isValidContext = await this.validateTabContext(params.tabId);
            if (!isValidContext) {
                return {
                    success: false,
                    error: '标签页不在微信视频号助手页面',
                    user: params.userName,
                    type: params.type
                };
            }

            // 🔥 生成消息发送脚本 - 使用你已验证的脚本
            const sendScript = this.generateWechatSendScript(
                params.userName, 
                params.content, 
                params.type
            );

            console.log(`📱 执行微信消息发送脚本...`);

            // 执行发送脚本
            const scriptResult = await this.tabManager.executeScript(params.tabId, sendScript);

            // 解析发送结果
            const sendResult = this.parseSendResult(scriptResult);

            if (sendResult.success) {
                console.log(`✅ 微信消息发送成功: ${params.userName}`);
                return {
                    success: true,
                    message: `${params.type === 'image' ? '图片' : '消息'}发送成功`,
                    user: params.userName,
                    type: params.type,
                    content: params.type === 'text' ? params.content : 'image',
                    timestamp: new Date().toISOString()
                };
            } else {
                console.error(`❌ 微信消息发送失败: ${sendResult.error}`);
                return {
                    success: false,
                    error: sendResult.error || '发送失败',
                    user: params.userName,
                    type: params.type
                };
            }

        } catch (error) {
            console.error('❌ 微信消息发送异常:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                user: params.userName,
                type: params.type
            };
        }
    }

    /**
     * 🔥 获取用户列表（可选功能）
     */
    async getUserList(tabId: string): Promise<UserInfo[]> {
        try {
            console.log('📋 获取微信用户列表...');

            const userListScript = `
                (function() {
                    const getDoc = () => {
                        const iframes = document.querySelectorAll('iframe');
                        for (let iframe of iframes) {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow.document;
                                if (doc && doc.querySelectorAll('.private-msg-list').length > 0) return doc;
                            } catch (e) { continue; }
                        }
                        return document;
                    };

                    try {
                        const doc = getDoc();
                        const users = [];
                        const userElements = doc.querySelectorAll('.session-wrap');

                        for (let userElement of userElements) {
                            const nameElement = userElement.querySelector('.name');
                            const avatarElement = userElement.querySelector('.feed-img');
                            const unreadElement = userElement.querySelector('.unread-count');

                            if (nameElement && avatarElement) {
                                users.push({
                                    user_id: Math.random().toString(36).substring(2, 15), // 临时ID
                                    name: nameElement.textContent.trim(),
                                    avatar: avatarElement.src,
                                    unread_count: unreadElement ? parseInt(unreadElement.textContent) || 0 : 0
                                });
                            }
                        }

                        return { success: true, users: users };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                })()
            `;

            const result = await this.tabManager.executeScript(tabId, userListScript);

            if (result && result.success) {
                return result.users || [];
            } else {
                console.warn('⚠️ 获取用户列表失败:', result?.error);
                return [];
            }

        } catch (error) {
            console.error('❌ 获取用户列表异常:', error);
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
                    // 检查是否在微信视频号助手页面
                    const url = window.location.href;
                    const isWechatChannels = url.includes('channels.weixin.qq.com');
                    
                    // 检查是否有私信相关元素
                    const hasPrivateMsg = document.querySelector('.private-msg-list') || 
                                         document.querySelector('.session-wrap') ||
                                         document.querySelectorAll('iframe').length > 0;
                    
                    return {
                        isValidUrl: isWechatChannels,
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
            platform: 'wechat',
            name: '微信视频号',
            features: ['私信同步', '消息发送', '图片发送', '用户列表'],
            syncInterval: 5, // 5分钟
            maxConcurrency: 3,
            supportedMessageTypes: ['text', 'image'],
            maxMessageLength: 1000,
            imageFormats: ['png', 'jpg', 'jpeg', 'gif']
        };
    }

    // ==================== 私有方法 ====================
    /**
     * 🔥 生成微信消息发送脚本
     */
    private generateWechatSendScript(userName: string, content: string, type: 'text' | 'image'): string {
        // 🔥 这里是你已经验证成功的 WechatMessageSendScript
        return `
            (async function(userName, content, type = 'text') {
                const delay = ms => new Promise(r => setTimeout(r, ms));
                const getDoc = () => {
                    const iframes = document.querySelectorAll('iframe');
                    for (let iframe of iframes) {
                        try {
                            const doc = iframe.contentDocument || iframe.contentWindow.document;
                            if (doc && doc.querySelectorAll('.private-msg-list').length > 0) return doc;
                        } catch (e) { continue; }
                    }
                    return document;
                };

                try {
                    const doc = getDoc();
                    const currentTab = doc.querySelector('li.weui-desktop-tab__nav_current a');
                    if (!currentTab || currentTab.textContent.trim() !== '私信') {
                        const privateTab = Array.from(doc.querySelectorAll('li.weui-desktop-tab__nav a'))
                            .find(tab => tab.textContent.trim() === '私信');
                        if (privateTab) {
                            privateTab.click();
                            await delay(1000);
                        }
                    }

                    const userElements = doc.querySelectorAll('.session-wrap');
                    let targetUser = null;
                    for (let userElement of userElements) {
                        const nameElement = userElement.querySelector('.name');
                        if (nameElement && nameElement.textContent.trim() === userName) {
                            targetUser = userElement;
                            break;
                        }
                    }

                    if (!targetUser) throw new Error('用户未找到: ' + userName);

                    targetUser.click();
                    await delay(1500);

                    if (type === 'image') {
                        const base64ToFile = (base64, filename) => {
                            const arr = base64.split(',');
                            const mime = arr[0].match(/:(.*);\\/)[1];
                            const bstr = atob(arr[1]);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) u8arr[n] = bstr.charCodeAt(n);
                            return new File([u8arr], filename, { type: mime });
                        };

                        const fileInput = doc.querySelector('input.file-uploader[type="file"]');
                        if (!fileInput) throw new Error('文件上传控件未找到');

                        const imageFile = base64ToFile(content, 'image.png');
                        const dt = new DataTransfer();
                        dt.items.add(imageFile);
                        fileInput.files = dt.files;
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        await delay(2000);
                    } else {
                        const textarea = doc.querySelector('textarea.edit_area');
                        if (!textarea) throw new Error('输入框未找到');

                        textarea.value = '';
                        textarea.focus();
                        textarea.value = content;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        await delay(300);
                    }

                    const sendButton = doc.querySelector('button.weui-desktop-btn.weui-desktop-btn_default');
                    if (!sendButton) throw new Error('发送按钮未找到');

                    sendButton.click();
                    await delay(type === 'image' ? 1500 : 800);

                    return {
                        success: true,
                        message: \`\${type === 'image' ? '图片' : '消息'}发送成功\`,
                        user: userName,
                        type: type,
                        content: type === 'text' ? content : 'image'
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        user: userName,
                        type: type
                    };
                }
            })('${userName}', \`${content}\`, '${type}')
        `;
    }

    /**
     * 🔥 解析消息同步脚本返回的数据
     */
    private parseMessageData(scriptResult: any): {
        success: boolean;
        users?: any[];
        errors?: string[];
    } {
        try {
            // 🔥 添加调试信息
            console.log('📊 脚本返回的原始数据:', JSON.stringify(scriptResult, null, 2));
            console.log('📊 数据类型:', typeof scriptResult);
            
            // 如果脚本结果直接是解析好的对象
            if (scriptResult && typeof scriptResult === 'object') {
                if (scriptResult.users && Array.isArray(scriptResult.users)) {
                    console.log('✅ 找到users数组，长度:', scriptResult.users.length);
                    return {
                        success: true,
                        users: scriptResult.users
                    };
                } else {
                    console.log('⚠️ scriptResult是对象但没有users数组');
                    console.log('⚠️ scriptResult的keys:', Object.keys(scriptResult));
                }
            }

            // 如果脚本结果是字符串，尝试解析
            if (typeof scriptResult === 'string') {
                console.log('📝 尝试解析字符串数据...');
                const parsed = JSON.parse(scriptResult);
                if (parsed.users && Array.isArray(parsed.users)) {
                    console.log('✅ 解析后找到users数组，长度:', parsed.users.length);
                    return {
                        success: true,
                        users: parsed.users
                    };
                }
            }

            return {
                success: false,
                errors: ['脚本返回数据格式不正确']
            };

        } catch (error) {
            console.error('❌ 解析消息数据失败:', error);
            return {
                success: false,
                errors: ['数据解析异常: ' + (error instanceof Error ? error.message : 'unknown error')]
            };
        }
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
                            timestamp: new Date().toISOString(), // 实际应该从消息中提取时间戳
                            sender: msg.sender as 'me' | 'user',
                            text: msg.text,
                            images: msg.images,
                            type: msg.images ? (msg.text ? 'mixed' : 'image') : 'text'
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
                    unread_count: 0, // 新获取的消息暂时标记为未读
                    messages: messages,
                    last_message_time: messages.length > 0 ? messages[messages.length - 1].timestamp : undefined
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