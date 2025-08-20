// src/main/automation/MessageAutomationEngine.ts - MVP简化版本

import { TabManager } from '../TabManager';
import { PluginManager } from '../PluginManager';
import { MessageStorage } from '../plugins/message/base/MessageStorage';
import { 
    PluginMessage, 
    PluginType,
    MessageSyncParams,
    MessageSyncResult,
    MessageSendParams,
    MessageSendResult,
    UserMessageThread,
    MessageStatistics,
    Message,
    MessageSyncOptions,
    BatchMessageSyncRequest,
    BatchMessageSyncResult,
    BatchMessageSendRequest,
    BatchMessageSendResult
} from '../../types/pluginInterface';
import { ipcMain } from 'electron';

// ==================== 接口定义 ====================

export interface MessageMonitoringParams {
    platform: string;
    accountId: string;
    cookieFile: string;
    headless?: boolean;
}

export interface MessageMonitoringStatus {
    accountKey: string;
    platform: string;
    accountId: string;
    tabId?: string;
    isMonitoring: boolean;
    lastActivity?: string;
}


/**
 * 🔥 消息自动化引擎 - MVP简化版本
 * 
 * 核心功能：
 * 1. 多账号跨平台私信管理
 * 2. 实时监听页面新消息
 * 3. 检测账号失效并自动清理
 * 4. 简化的Tab生命周期管理
 */
export class MessageAutomationEngine {
    private tabManager: TabManager;
    private pluginManager: PluginManager;
    private activeMonitoring: Map<string, MessageMonitoringStatus> = new Map();
    private scheduleIntervals: Map<string, NodeJS.Timeout> = new Map();
    private isSystemRunning: boolean = false;
    private lastSyncTime: Map<string, number> = new Map();
    private readonly DEBOUNCE_INTERVAL = 3000; // 3秒防抖

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        this.pluginManager = new PluginManager(tabManager);
        this.initializeDatabase();
        this.setupIPCListeners();
        this.initializePlugins();
        console.log('✅ MessageAutomationEngine MVP 已初始化');
    }

    // ==================== 🔧 插件管理器访问 ====================

    /**
     * 🔥 获取插件管理器实例
     */
    getPluginManager(): PluginManager {
        return this.pluginManager;
    }
    private async initializePlugins(): Promise<void> {
        try {
            await this.pluginManager.initializeAllPlugins();
            console.log('✅ MessageAutomationEngine 插件初始化完成');
        } catch (error) {
            console.error('❌ MessageAutomationEngine 插件初始化失败:', error);
        }
    }
    // ==================== 🔧 初始化方法 ====================

    /**
     * 🔥 初始化消息数据库
     */
    private initializeDatabase(): void {
        try {
            MessageStorage.ensureMessageDatabaseInitialized();
            console.log('✅ 消息数据库初始化完成');
        } catch (error) {
            console.error('❌ 消息数据库初始化失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 设置 IPC 监听器
     */
    private setupIPCListeners(): void {
        console.log('🔌 设置 MessageAutomationEngine IPC 监听器...');

        // 页面事件上报监听
        ipcMain.on('message-new-message', (event, data) => {
            this.handleIPCNewMessage(event, data);
        });

        ipcMain.on('message-account-status', (event, data) => {
            this.handleIPCAccountStatus(event, data);
        });

        // 消息监听控制
        ipcMain.handle('message-start-monitoring', async (event, params) => {
            return await this.startMessageMonitoring(params);
        });

        ipcMain.handle('message-stop-monitoring', async (event, accountKey) => {
            return { success: await this.stopMessageMonitoring(accountKey) };
        });

        ipcMain.handle('message-start-batch-monitoring', async (event, accounts) => {
            return await this.startBatchMonitoring(accounts);
        });

        ipcMain.handle('message-stop-all-monitoring', async (event) => {
            return await this.stopAllMonitoring();
        });

        ipcMain.handle('message-get-monitoring-status', async (event) => {
            const status = this.getActiveMonitoringStatus();
            return {
                success: true,
                data: {
                    monitoring: status,
                    summary: {
                        total: status.length,
                        active: status.filter(s => s.isMonitoring).length
                    }
                }
            };
        });

        // 手动同步和发送
        ipcMain.handle('message-sync-messages', async (event, params) => {
            try {
                const result = await this.syncPlatformMessages(
                    params.platform,
                    params.accountName,
                    params.cookieFile,
                    params.options
                );
                return { success: result.success, data: result };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-batch-sync-messages', async (event, request) => {
            try {
                const result = await this.batchSyncMessages(request);
                return { success: result.success, data: result };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-send-message', async (event, params) => {
            try {
                const result = await this.sendPlatformMessage(
                    params.platform,
                    params.tabId,
                    params.userName,
                    params.content,
                    params.type,
                    params.accountId
                );
                return { success: result.success, data: result };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-batch-send-messages', async (event, request) => {
            try {
                const result = await this.batchSendMessages(request);
                return { success: result.success, data: result };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        // 消息查询
        ipcMain.handle('message-get-threads', async (event, params) => {
            try {
                const threads = await this.getAllMessageThreads(
                    params?.platform,
                    params?.accountId
                );
                return {
                    success: true,
                    data: {
                        threads: threads,
                        total: threads.length
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-get-thread-messages', async (event, params) => {
            try {
                const messages = await this.getThreadMessages(
                    params.threadId,
                    params.limit,
                    params.offset
                );
                return {
                    success: true,
                    data: {
                        threadId: params.threadId,
                        messages: messages,
                        count: messages.length
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-mark-read', async (event, params) => {
            try {
                const success = await this.markMessagesAsRead(
                    params.threadId,
                    params.messageIds
                );
                return {
                    success: success,
                    data: {
                        threadId: params.threadId,
                        messageIds: params.messageIds
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        // 搜索和统计
        ipcMain.handle('message-search', async (event, params) => {
            try {
                const results = await this.searchMessages(
                    params.platform,
                    params.accountId,
                    params.keyword,
                    params.limit
                );
                return {
                    success: true,
                    data: {
                        keyword: params.keyword,
                        results: results,
                        count: results.length
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-get-statistics', async (event) => {
            try {
                const stats = await this.getMessageStatistics();
                return { success: true, data: stats };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-get-unread-count', async (event, params) => {
            try {
                const count = await this.getUnreadCount(
                    params?.platform,
                    params?.accountId
                );
                return {
                    success: true,
                    data: {
                        platform: params?.platform || 'all',
                        accountId: params?.accountId || 'all',
                        unreadCount: count
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        // 系统状态
        ipcMain.handle('message-get-engine-status', async (event) => {
            try {
                const status = this.getEngineStatus();
                return { success: true, data: status };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        ipcMain.handle('message-get-supported-platforms', async (event) => {
            try {
                const platforms = this.getSupportedPlatforms();
                return {
                    success: true,
                    data: {
                        platforms: platforms,
                        total: platforms.length
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                };
            }
        });

        console.log('✅ MessageAutomationEngine IPC 监听器设置完成');
    }

    // ==================== 🔥 IPC 事件处理方法 ====================

    /**
     * 🔥 处理页面新消息事件
     */
    private handleIPCNewMessage(event: any, data: any): void {
        try {
            console.log('📨 收到新消息事件:', data);
            
            if ((data.source === 'console_hijack' || data.source === 'console_hijack_fixed') && data.event === 'NewMsgNotify') {
                // 🔥 检测到真实的微信新消息事件
                console.log(`🔔 ${data.platform} 平台检测到真实新消息!`);
                console.log(`📋 事件详情:`, data.eventData);
                
                // 🔥 立即触发消息同步
                this.handleNewMessageDetected(data.platform, data.accountId, data.eventData);
                
            } else if (data.source === 'dom_observer') {
                console.log(`👁️ ${data.platform} DOM监听检测到变化`);
                
            } else if (data.source === 'periodic_check') {
                console.log(`⏱️ ${data.platform} 定时检查 - 元素数量: ${data.total || 0}`);
                
            } else if (data.test) {
                console.log(`🧪 ${data.platform} 测试消息`);
                
            } else {
                console.log(`📨 ${data.platform} 其他消息事件:`, data);
            }
            
        } catch (error) {
            console.error('❌ 处理新消息事件失败:', error);
        }
    }

    // 🔥 新增：处理检测到的新消息
    private async handleNewMessageDetected(platform: string, accountId: string, eventData: any): Promise<void> {
        try {
            console.log(`🚀 开始处理新消息: ${platform} - ${accountId}`);
            
            // 获取对应的监听状态
            const accountKey = `${platform}_${accountId}`;
            const monitoring = this.activeMonitoring.get(accountKey);
            
            if (!monitoring || !monitoring.tabId) {
                console.warn(`⚠️ 未找到监听状态: ${accountKey}`);
                return;
            }
            
            // 🔥 调用插件立即同步消息
            await this.syncNewMessages(platform, accountId, monitoring.tabId, eventData);
            
        } catch (error) {
            console.error(`❌ 处理新消息失败: ${platform} - ${accountId}:`, error);
        }
    }


    /**
     * 🔥 处理账号状态变化事件
     */
    private handleIPCAccountStatus(event: any, data: any): void {
        try {
            console.log('📊 收到账号状态事件:', data);
            if (data.status === 'logged_out' && data.platform) {
                console.warn(`⚠️ ${data.platform} 账号已登出，可能需要重新登录`);
            }
        } catch (error) {
            console.error('❌ 处理账号状态事件失败:', error);
        }
    }

    // ==================== 🔥 核心公共接口 ====================

    /**
     * 🔥 启动单个账号消息监听
     */
    async startMessageMonitoring(params: MessageMonitoringParams): Promise<{
        success: boolean;
        tabId?: string;
        error?: string;
    }> {
        const accountKey = `${params.platform}_${params.accountId}`;
        
        try {
            console.log(`🚀 启动消息监听: ${accountKey}`);

            // 1. 检查是否已在监听
            if (this.activeMonitoring.has(accountKey)) {
                return {
                    success: false,
                    error: `账号 ${accountKey} 已在监听中`
                };
            }

            // 2. 通过 PluginManager 获取插件
            const plugin = this.pluginManager.getPlugin<PluginMessage>(PluginType.MESSAGE, params.platform);
            
            if (!plugin) {
                return {
                    success: false,
                    error: `平台 ${params.platform} 不支持消息功能`
                };
            }

            // 3. 创建专用Tab
            const tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                params.platform,
                this.getMessageUrl(params.platform),
                params.headless ?? true
            );

            // 4. 等待页面加载
            console.log(`⏳ 等待页面加载完成...`);
            await new Promise(resolve => setTimeout(resolve, 4000));
            if (params.platform === 'wechat') {
                console.log(`🖱️ 点击私信导航以确保监听环境准备...`);
                const navSuccess = await (plugin as any).clickPrivateMessage(tabId);
                if (!navSuccess) {
                        console.warn('⚠️ 私信导航失败，尝试继续...');
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // 5. 注入监听脚本
            const listenerScript = `
                (function() {
                    console.log('🎧 微信消息监听脚本已注入: ${params.platform}');
                    if (window.__messageListenerInjected) return;
                    window.__messageListenerInjected = true;
                    
                    // 🔥 修复：正确劫持微信的console.log格式
                    const originalLog = console.log;
                    console.log = function(...args) {
                        try {
                            // 🔥 修复：检查微信的实际输出格式
                            if (args.length >= 2 && 
                                args[0] === 'received data' && 
                                args[1] && 
                                typeof args[1] === 'object' && 
                                args[1].name === 'NewMsgNotify') {
                                
                                console.log('🔔 检测到微信新消息事件:', args[1]);
                                
                                if (window.electronAPI && window.electronAPI.notifyNewMessage) {
                                    window.electronAPI.notifyNewMessage({
                                        event: 'NewMsgNotify',
                                        eventData: {
                                            name: args[1].name,
                                            data: args[1].data || args[1],
                                            fullArgs: args,
                                            timestamp: Date.now()
                                        },
                                        timestamp: Date.now(),
                                        platform: '${params.platform}',
                                        accountId: '${params.accountId}',
                                        source: 'console_hijack'
                                    });
                                    console.log('✅ 已通知主进程 - 微信新消息');
                                }
                            }
                        } catch (error) {
                            console.error('❌ 处理新消息事件失败:', error);
                        }
                        
                        originalLog.apply(console, args);
                    };
                    
                    // ... 其他监听逻辑保持不变
                })()
            `;
            console.log(`🎧 开始注入监听脚本...`);
            let scriptInjected = false;
            const maxScriptRetries = 30; // 30次重试，每次1秒

            for (let attempt = 1; attempt <= maxScriptRetries; attempt++) {
                try {
                    await this.tabManager.executeScript(tabId, listenerScript);
                    
                    // 验证脚本是否成功注入
                    const verifyScript = `window.__messageListenerInjected === true`;
                    const isInjected = await this.tabManager.executeScript(tabId, verifyScript);
                    
                    if (isInjected) {
                        scriptInjected = true;
                        console.log(`✅ 监听脚本注入成功 (第${attempt}次尝试)`);
                        break;
                    } else {
                        throw new Error('脚本注入验证失败');
                    }
                } catch (error) {
                    console.log(`⚠️ 监听脚本注入失败 (第${attempt}次): ${error instanceof Error ? error.message : 'unknown'}`);
                    
                    if (attempt < maxScriptRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }
            }

            if (!scriptInjected) {
                return {
                    success: false,
                    error: `监听脚本注入失败，重试${maxScriptRetries}次后放弃`
                };
            }

            // 6. 锁定Tab
            //this.tabManager.lockTab(tabId, 'message', '消息监听专用');

            // 7. 记录监听状态
            this.activeMonitoring.set(accountKey, {
                accountKey,
                platform: params.platform,
                accountId: params.accountId,
                tabId,
                isMonitoring: true,
                lastActivity: new Date().toISOString()
            });

            console.log(`✅ 消息监听启动成功: ${accountKey} -> ${tabId}`);
            return { success: true, tabId };

        } catch (error) {
            console.error(`❌ 启动消息监听失败: ${accountKey}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            };
        }
    }

    /**
     * 🔥 停止单个账号消息监听
     */
    async stopMessageMonitoring(accountKey: string): Promise<boolean> {
        try {
            const monitoring = this.activeMonitoring.get(accountKey);
            if (!monitoring) {
                console.warn(`⚠️ 账号未在监听: ${accountKey}`);
                return false;
            }

            console.log(`🛑 停止消息监听: ${accountKey}`);

            if (monitoring.tabId) {
                this.tabManager.unlockTab(monitoring.tabId, 'message');
                await this.tabManager.closeTab(monitoring.tabId);
            }

            this.activeMonitoring.delete(accountKey);
            console.log(`✅ 消息监听已停止: ${accountKey}`);
            return true;

        } catch (error) {
            console.error(`❌ 停止消息监听失败: ${accountKey}:`, error);
            return false;
        }
    }

    /**
     * 🔥 批量启动监听
     */
    async startBatchMonitoring(accounts: MessageMonitoringParams[]): Promise<{
        success: number;
        failed: number;
        results: any[];
    }> {
        console.log(`🚀 批量启动监听: ${accounts.length} 个账号`);

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (const account of accounts) {
            try {
                const result = await this.startMessageMonitoring(account);
                
                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                }

                results.push({
                    accountKey: `${account.platform}_${account.accountId}`,
                    ...result
                });

                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                failedCount++;
                results.push({
                    accountKey: `${account.platform}_${account.accountId}`,
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                });
            }
        }

        console.log(`📊 批量启动完成: 成功 ${successCount}, 失败 ${failedCount}`);
        return { success: successCount, failed: failedCount, results };
    }

    /**
     * 🔥 停止所有监听
     */
    async stopAllMonitoring(): Promise<{stopped: number; failed: number}> {
        console.log('🛑 停止所有消息监听...');

        const accountKeys = Array.from(this.activeMonitoring.keys());
        let stoppedCount = 0;
        let failedCount = 0;

        for (const accountKey of accountKeys) {
            try {
                const success = await this.stopMessageMonitoring(accountKey);
                if (success) {
                    stoppedCount++;
                } else {
                    failedCount++;
                }
            } catch (error) {
                console.error(`❌ 停止监听失败: ${accountKey}:`, error);
                failedCount++;
            }
        }

        console.log(`📊 停止监听完成: 成功 ${stoppedCount}, 失败 ${failedCount}`);
        return { stopped: stoppedCount, failed: failedCount };
    }

    /**
     * 🔥 获取活动监听状态
     */
    getActiveMonitoringStatus(): Array<{
        accountKey: string;
        platform: string;
        accountId: string;
        tabId?: string;
        isMonitoring: boolean;
        lastActivity?: string;
    }> {
        return Array.from(this.activeMonitoring.values()).map(status => ({
            accountKey: status.accountKey,
            platform: status.platform,
            accountId: status.accountId,
            tabId: status.tabId,
            isMonitoring: status.isMonitoring,
            lastActivity: status.lastActivity
        }));
    }

    // ==================== 🔥 工具方法 ====================

    /**
     * 🔥 获取平台消息URL
     */
    private getMessageUrl(platform: string): string {
        const messageUrls: Record<string, string> = {
            'wechat': 'https://channels.weixin.qq.com/',
            'xiaohongshu': 'https://creator.xiaohongshu.com/im',
            'douyin': 'https://creator.douyin.com/im',
            'kuaishou': 'https://cp.kuaishou.com/profile/msg'
        };
        
        return messageUrls[platform] || 'about:blank';
    }

    // ==================== 🔥 原有核心API（保持不变） ====================
    private shouldSync(platform: string, accountId: string): boolean {
        const accountKey = `${platform}_${accountId}`;
        const now = Date.now();
        const lastSync = this.lastSyncTime.get(accountKey) || 0;
        
        if (now - lastSync < this.DEBOUNCE_INTERVAL) {
            console.log(`⏱️ 同步防抖: ${accountKey} (${now - lastSync}ms < ${this.DEBOUNCE_INTERVAL}ms)`);
            return false;
        }
        
        // 更新最后同步时间
        this.lastSyncTime.set(accountKey, now);
        return true;
    }
    private async syncNewMessages(platform: string, accountId: string, tabId: string, eventData: any): Promise<void> {
        // 🔥 简单防抖检查
        if (!this.shouldSync(platform, accountId)) {
            return;
        }

        try {
            console.log(`🔄 开始同步新消息: ${platform} - ${accountId}`);
            
            const plugin = this.pluginManager.getPlugin<PluginMessage>(PluginType.MESSAGE, platform);
            if (!plugin) {
                console.error(`❌ 平台 ${platform} 不支持消息功能`);
                return;
            }
            
            const syncParams: MessageSyncParams = {
                tabId: tabId,
                platform: platform,
                accountId: accountId,
                fullSync: false,
                eventData: eventData
            };
            
            console.log(`📞 调用 ${platform} 插件同步消息...`);
            const result = await plugin.syncMessages(syncParams);
            
            if (result.success) {
                console.log(`✅ 新消息同步成功: 获取到 ${result.newMessages} 条新消息`);
                
                if (result.threads.length > 0) {
                    const syncResult = MessageStorage.incrementalSync(
                        platform,
                        accountId,
                        result.threads
                    );
                    
                    console.log(`💾 数据库同步完成: 新消息 ${syncResult.newMessages} 条，更新线程 ${syncResult.updatedThreads} 个`);
                }
            } else {
                console.error(`❌ 新消息同步失败:`, result.errors);
            }
            
        } catch (error) {
            console.error(`❌ 同步新消息异常: ${platform} - ${accountId}:`, error);
        }
    }
    /**
     * 🔥 智能同步决策：基于时间比较自动判断
     */
    private async shouldSyncUser(
        platform: string,
        accountId: string,
        userId: string,
        userName: string,
        sessionTime: string | null
    ): Promise<{ shouldSync: boolean; reason: string }> {
        try {
            // 没有会话时间 = 同步
            if (!sessionTime) {
                return { shouldSync: true, reason: '缺少会话时间' };
            }

            // 数据库中没有这个用户 = 同步
            const existingThread = MessageStorage.getThreadByUser(platform, accountId, userId);
            if (!existingThread || !existingThread.last_message_time) {
                return { shouldSync: true, reason: '新用户或无历史消息' };
            }

            // 🔥 核心逻辑：时间比较
            const sessionTimestamp = new Date(sessionTime);
            const lastDbTimestamp = new Date(existingThread.last_message_time);
            
            if (sessionTimestamp > lastDbTimestamp) {
                const minutesDiff = Math.round((sessionTimestamp.getTime() - lastDbTimestamp.getTime()) / (1000 * 60));
                return { 
                    shouldSync: true, 
                    reason: `有新消息 (${minutesDiff}分钟前)` 
                };
            }

            return { 
                shouldSync: false, 
                reason: '无新消息' 
            };

        } catch (error) {
            console.error(`❌ 同步决策失败: ${userName}:`, error);
            return { shouldSync: true, reason: '判断异常，默认同步' };
        }
    }

    /**
     * 🔥 批量智能同步决策：预过滤需要同步的用户
     */
    private async filterUsersForSync(
        platform: string,
        accountId: string, 
        users: any[]
    ): Promise<{
        toSync: any[];
        skipped: any[];
        summary: { total: number; toSync: number; skipped: number };
    }> {
        console.log(`🔍 智能同步决策: 分析 ${users.length} 个用户...`);
        
        const toSync: any[] = [];
        const skipped: any[] = [];

        for (const user of users) {
            const decision = await this.shouldSyncUser(
                platform,
                accountId,
                user.user_id,
                user.name,
                user.session_time
            );

            if (decision.shouldSync) {
                toSync.push(user);
                console.log(`  ✅ ${user.name}: ${decision.reason}`);
            } else {
                skipped.push({ ...user, skipReason: decision.reason });
                console.log(`  ⏭️ ${user.name}: ${decision.reason}`);
            }
        }

        const summary = {
            total: users.length,
            toSync: toSync.length,
            skipped: skipped.length
        };

        console.log(`📊 智能同步决策完成: 需同步 ${summary.toSync}/${summary.total} 个用户`);
        return { toSync, skipped, summary };
    }
    /**
     * 🔥 手动同步平台消息
     */
    async syncPlatformMessages(
        platform: string,
        accountName: string,
        cookieFile: string,
        options?: MessageSyncOptions
    ): Promise<MessageSyncResult> {
        let tabId: string | null = null;
        
        try {
            console.log(`🔄 手动同步消息: ${platform} - ${accountName}`);

            const plugin = this.pluginManager.getPlugin<PluginMessage>(PluginType.MESSAGE, platform);
            
            if (!plugin) {
                throw new Error(`平台 ${platform} 不支持消息功能`);
            }

            // 创建临时Tab进行同步
            tabId = await this.tabManager.createAccountTab(
                cookieFile,
                platform,
                this.getMessageUrl(platform),
                false
            );
            
            // 等待页面就绪
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 执行同步
            const syncParams: MessageSyncParams = {
                tabId,
                platform,
                accountId: accountName,
                fullSync: options?.forceSync || false
            };

            const result = await plugin.syncMessages(syncParams);

            if (result.success && result.threads.length > 0) {
                // 🔥 检查是否为智能同步模式
                const isIntelligentSync = options?.intelligentSync || false;
                
                if (isIntelligentSync) {
                    // 智能同步：只同步需要的用户
                    const syncDecision = await this.filterUsersForSync(
                        platform,
                        accountName,
                        result.threads
                    );

                    if (syncDecision.toSync.length > 0) {
                        const syncResult = MessageStorage.incrementalSync(
                            platform,
                            accountName,
                            syncDecision.toSync
                        );
                        
                        result.newMessages = syncResult.newMessages;
                        result.updatedThreads = syncResult.updatedThreads;
                        
                        console.log(`📈 智能同步统计:`);
                        console.log(`  - 总用户: ${syncDecision.summary.total}`);
                        console.log(`  - 实际同步: ${syncDecision.summary.toSync}`);
                        console.log(`  - 跳过用户: ${syncDecision.summary.skipped}`);
                        console.log(`  - 新消息: ${syncResult.newMessages} 条`);
                        
                        if (syncResult.errors.length > 0) {
                            result.errors = (result.errors || []).concat(syncResult.errors);
                        }
                    } else {
                        console.log(`⏭️ 智能同步: 所有用户都无新消息，跳过数据库操作`);
                        result.newMessages = 0;
                        result.updatedThreads = 0;
                    }
                } else {
                    // 传统同步：同步所有用户
                    const syncResult = MessageStorage.incrementalSync(
                        platform,
                        accountName,
                        result.threads
                    );
                    
                    result.newMessages = syncResult.newMessages;
                    result.updatedThreads = syncResult.updatedThreads;
                    if (syncResult.errors.length > 0) {
                        result.errors = (result.errors || []).concat(syncResult.errors);
                    }
                }
            }

            console.log(`✅ 手动同步完成: ${platform} - ${accountName}`);
            return result;

        } catch (error) {
            console.error(`❌ 手动同步失败: ${platform} - ${accountName}:`, error);
            return {
                success: false,
                threads: [],
                newMessages: 0,
                updatedThreads: 0,
                errors: [error instanceof Error ? error.message : 'unknown error'],
                syncTime: new Date().toISOString()
            };
        } finally {
            if (tabId) {
                try {
                    await this.tabManager.closeTab(tabId);
                } catch (error) {
                    console.error(`❌ 关闭临时同步Tab失败: ${tabId}:`, error);
                }
            }
        }
    }

    /**
     * 🔥 发送平台消息
     */
    async sendPlatformMessage(
        platform: string,
        tabId: string,
        userName: string,
        content: string,
        type: 'text' | 'image',
        accountId?: string
    ): Promise<MessageSendResult> {
        try {
            console.log(`📤 发送消息: ${platform} - ${userName} (${type})`);

            const plugin = this.pluginManager.getPlugin<PluginMessage>(PluginType.MESSAGE, platform);
            
            if (!plugin) {
                throw new Error(`平台 ${platform} 不支持消息功能`);
            }

            const sendParams: MessageSendParams = {
                tabId,
                userName,
                content,
                type,
                platform,
                accountId
            };

            const result = await plugin.sendMessage(sendParams);
            console.log(`${result.success ? '✅' : '❌'} 消息发送${result.success ? '成功' : '失败'}: ${userName}`);
            return result;

        } catch (error) {
            console.error(`❌ 发送消息异常: ${platform} - ${userName}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                user: userName,
                type: type
            };
        }
    }

    /**
     * 🔥 批量同步消息
     */
    async batchSyncMessages(request: BatchMessageSyncRequest): Promise<BatchMessageSyncResult> {
        console.log(`🔄 批量同步消息: ${request.platform} - ${request.accounts.length} 个账号`);

        const results = [];
        let successCount = 0;
        let failedCount = 0;
        let totalNewMessages = 0;
        let totalUpdatedThreads = 0;

        for (const account of request.accounts) {
            try {
                const syncResult = await this.syncPlatformMessages(
                    request.platform,
                    account.accountId,
                    account.cookieFile,
                    {
                        forceSync: request.options?.fullSync,
                        timeout: request.options?.timeout
                    }
                );

                if (syncResult.success) {
                    successCount++;
                    totalNewMessages += syncResult.newMessages;
                    totalUpdatedThreads += syncResult.updatedThreads;
                } else {
                    failedCount++;
                }

                results.push({
                    accountId: account.accountId,
                    tabId: '',
                    success: syncResult.success,
                    syncResult,
                    error: syncResult.success ? undefined : syncResult.errors?.[0]
                });

                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                failedCount++;
                results.push({
                    accountId: account.accountId,
                    tabId: '',
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error'
                });
            }
        }

        console.log(`📊 批量同步完成: 成功 ${successCount}, 失败 ${failedCount}`);

        return {
            success: successCount > 0,
            results,
            summary: {
                totalAccounts: request.accounts.length,
                successCount,
                failedCount,
                totalNewMessages,
                totalUpdatedThreads
            },
            syncTime: new Date().toISOString()
        };
    }

    /**
     * 🔥 批量发送消息
     */
    async batchSendMessages(request: BatchMessageSendRequest): Promise<BatchMessageSendResult> {
        console.log(`📤 批量发送消息: ${request.platform} - ${request.messages.length} 条`);

        const results = [];
        let successCount = 0;
        let failedCount = 0;
        const delay = request.options?.delay || 1000;
        const continueOnError = request.options?.continueOnError ?? true;

        for (const message of request.messages) {
            try {
                const result = await this.sendPlatformMessage(
                    request.platform,
                    message.tabId,
                    message.userName,
                    message.content,
                    message.type,
                    message.accountId
                );

                results.push(result);

                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                    if (!continueOnError) {
                        console.log('❌ 遇到错误，停止批量发送');
                        break;
                    }
                }

                if (delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                failedCount++;
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error',
                    user: message.userName,
                    type: message.type
                });

                if (!continueOnError) {
                    break;
                }
            }
        }

        console.log(`📊 批量发送完成: 成功 ${successCount}, 失败 ${failedCount}`);

        return {
            success: successCount > 0,
            results,
            summary: {
                totalMessages: request.messages.length,
                successCount,
                failedCount
            },
            sendTime: new Date().toISOString()
        };
    }

    /**
     * 🔥 获取所有消息线程
     */
    async getAllMessageThreads(platform?: string, accountId?: string): Promise<UserMessageThread[]> {
        try {
            if (platform && accountId) {
                return MessageStorage.getAllThreads(platform, accountId);
            } else {
                console.warn(`⚠️ 需要实现获取所有平台账号的逻辑`);
                return [];
            }
        } catch (error) {
            console.error('❌ 获取消息线程失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取线程消息
     */
    async getThreadMessages(threadId: number, limit?: number, offset?: number): Promise<Message[]> {
        try {
            return MessageStorage.getThreadMessages(threadId, limit || 50, offset || 0);
        } catch (error) {
            console.error('❌ 获取线程消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 标记消息已读
     */
    async markMessagesAsRead(threadId: number, messageIds?: number[]): Promise<boolean> {
        try {
            MessageStorage.markMessagesAsRead(threadId, messageIds);
            return true;
        } catch (error) {
            console.error('❌ 标记消息已读失败:', error);
            return false;
        }
    }

    /**
     * 🔥 搜索消息
     */
    async searchMessages(platform: string, accountId: string, keyword: string, limit?: number): Promise<any[]> {
        try {
            return MessageStorage.searchMessages(platform, accountId, keyword, limit || 20);
        } catch (error) {
            console.error('❌ 搜索消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取消息统计
     */
    async getMessageStatistics(): Promise<MessageStatistics> {
        try {
            return MessageStorage.getMessageStatistics();
        } catch (error) {
            console.error('❌ 获取消息统计失败:', error);
            return {
                totalThreads: 0,
                totalMessages: 0,
                unreadMessages: 0,
                platformStats: {}
            };
        }
    }

    /**
     * 🔥 获取未读消息数
     */
    async getUnreadCount(platform?: string, accountId?: string): Promise<number> {
        try {
            return MessageStorage.getUnreadCount(platform, accountId);
        } catch (error) {
            console.error('❌ 获取未读消息数失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 获取支持的平台
     */
    getSupportedPlatforms(): string[] {
        try {
            // 通过 pluginManager 获取支持的消息平台
            return this.pluginManager.getSupportedPlatforms(PluginType.MESSAGE);
        } catch (error) {
            console.error('❌ 获取支持平台失败:', error);
            return ['wechat']; // 默认返回微信
        }
    }

    /**
     * 🔥 获取引擎状态
     */
    getEngineStatus(): {
        isRunning: boolean;
        activeMonitoring: number;
        supportedPlatforms: string[];
        initializedPlugins: string[];
        syncStatuses: any[];
    } {
        return {
            isRunning: this.isSystemRunning,
            activeMonitoring: this.activeMonitoring.size,
            supportedPlatforms: this.getSupportedPlatforms(),
            initializedPlugins: Array.from(this.activeMonitoring.keys()).map(key => key.split('_')[0]),
            syncStatuses: Array.from(this.activeMonitoring.values())
        };
    }

    /**
     * 🔥 获取所有调度状态（为API兼容性添加）
     */
    getAllScheduleStatuses(): any[] {
        return Array.from(this.scheduleIntervals.entries()).map(([key, interval]) => ({
            key,
            intervalId: interval,
            isActive: !!interval
        }));
    }

    /**
     * 🔥 销毁引擎
     */
    async destroy(): Promise<void> {
        try {
            console.log('🛑 MessageAutomationEngine 开始销毁...');
            
            // 停止所有监听
            await this.stopAllMonitoring();
            
            // 清理调度任务
            for (const [key, interval] of this.scheduleIntervals.entries()) {
                clearInterval(interval);
                this.scheduleIntervals.delete(key);
            }
            
            // 清理状态
            this.activeMonitoring.clear();
            this.isSystemRunning = false;
            
            console.log('✅ MessageAutomationEngine 销毁完成');
        } catch (error) {
            console.error('❌ MessageAutomationEngine 销毁失败:', error);
        }
    }
}