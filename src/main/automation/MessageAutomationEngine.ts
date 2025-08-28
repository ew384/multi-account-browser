// src/main/automation/MessageAutomationEngine.ts - MVP简化版本
import { AccountStorage } from '../plugins/login/base/AccountStorage';
import { Config } from '../config/Config';
import * as path from 'path';
import { TabManager } from '../TabManager';
import { PluginManager } from '../PluginManager';
import { MessageStorage } from '../plugins/message/base/MessageStorage';
import { 
    PluginMessage, 
    PluginType,
    PluginValidator,
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
    private websocketServer?: any;
    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        this.pluginManager = new PluginManager(tabManager);
        this.initializeDatabase();
        this.setupIPCListeners();
        this.initializePlugins();
        console.log('✅ MessageAutomationEngine MVP 已初始化');
    }
    // 🔥 新增：设置WebSocket服务器
    setWebSocketServer(io: any): void {
        this.websocketServer = io;
        console.log('🔌 MessageEngine已连接WebSocket服务器');
    }

    // 🔥 新增：基础初始化方法
    async initialize(): Promise<void> {
        try {
            await Promise.all([
                this.refreshUnreadCounts(),
                this.refreshMonitoringStatus()
            ]);
            
            this.isSystemRunning = true;
            console.log('✅ MessageAutomationEngine 基础初始化完成');
        } catch (error) {
            console.error('❌ MessageAutomationEngine 基础初始化失败:', error);
            throw error;
        }
    }

    // 🔥 新增：刷新未读统计（基础版本）
    private async refreshUnreadCounts(): Promise<void> {
        try {
            // 这里可以添加刷新未读统计的逻辑
            // 暂时是空实现，避免初始化报错
            console.log('🔄 刷新未读统计...');
        } catch (error) {
            console.warn('⚠️ 刷新未读统计失败:', error);
        }
    }

    // 🔥 新增：刷新监听状态（基础版本）
    private async refreshMonitoringStatus(): Promise<void> {
        try {
            // 这里可以添加刷新监听状态的逻辑
            // 暂时是空实现，避免初始化报错
            console.log('🔄 刷新监听状态...');
        } catch (error) {
            console.warn('⚠️ 刷新监听状态失败:', error);
        }
    }

    // 🔥 新增：推送实时消息到前端
    private notifyFrontend(eventType: string, data: any): void {
        if (this.websocketServer) {
            this.websocketServer.emit(eventType, data);
            console.log(`📡 WebSocket推送: ${eventType}`, data);
        } else {
            console.warn('⚠️ WebSocket服务器未设置，无法推送消息');
        }
    }

    // 🔥 修改：在handleNewMessageDetected中添加前端通知
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
            
            // 🔥 立即通知前端有新消息正在处理
            this.notifyFrontend('message-processing', {
                platform,
                accountId,
                status: 'started',
                timestamp: new Date().toISOString()
            });
            
            // 🔥 调用插件立即同步消息
            await this.syncNewMessages(platform, accountId, monitoring.tabId, eventData);
            
            // 🔥 同步完成后通知前端刷新
            this.notifyFrontend('message-updated', {
                platform,
                accountId,
                status: 'completed',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error(`❌ 处理新消息失败: ${platform} - ${accountId}:`, error);
            
            // 🔥 错误时也要通知前端
            this.notifyFrontend('message-error', {
                platform,
                accountId,
                error: error instanceof Error ? error.message : 'unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }
    // 🔥 新增：获取可用于监听的账号信息
    async getAvailableAccountsForMonitoring(): Promise<{
        accounts: any[];
        summary: {
            total: number;
            canMonitor: number;
            supportedPlatforms: string[];
        };
    }> {
        try {
            console.log('📋 获取可监听账号信息...');

            // 1. 确保数据库已初始化
            const { AccountStorage } = await import('../plugins/login/base/AccountStorage');
            AccountStorage.ensureDatabaseInitialized();

            // 2. 获取所有账号信息
            const accounts = AccountStorage.getAccountsWithGroupsForFrontend(false);

            // 3. 获取支持的平台
            const supportedPlatforms = this.getSupportedPlatforms();
            
            // 4. 平台名称映射
            const platformMapping: Record<string, string> = {
                '视频号': 'wechat',
                '微信视频号': 'wechat',
                '抖音': 'douyin',
                '快手': 'kuaishou',
                '小红书': 'xiaohongshu'
            };

            // 5. 处理账号信息
            const processedAccounts = accounts.map(account => {
                const platformKey = platformMapping[account.platform] || account.platform.toLowerCase();
                const supportsMessage = supportedPlatforms.includes(platformKey);
                const canMonitor = account.status === '正常' && supportsMessage;

                return {
                    ...account,
                    platformKey: platformKey,
                    supportsMessage: supportsMessage,
                    canMonitor: canMonitor,
                    cookieFile: path.join(Config.COOKIE_DIR, account.filePath)
                };
            });

            const summary = {
                total: accounts.length,
                canMonitor: processedAccounts.filter(acc => acc.canMonitor).length,
                supportedPlatforms: supportedPlatforms
            };

            console.log(`📊 账号统计: 总计 ${summary.total}, 可监听 ${summary.canMonitor}`);

            return {
                accounts: processedAccounts,
                summary: summary
            };

        } catch (error) {
            console.error('❌ 获取可监听账号信息失败:', error);
            return {
                accounts: [],
                summary: {
                    total: 0,
                    canMonitor: 0,
                    supportedPlatforms: []
                }
            };
        }
    }


    // 🔥 新增：获取WebSocket服务器状态
    getWebSocketStatus(): { connected: boolean; clientCount?: number } {
        if (this.websocketServer) {
            return {
                connected: true,
                clientCount: this.websocketServer.engine?.clientsCount || 0
            };
        }
        return { connected: false };
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
            const defaultOptions = {
                withSync: false,
                syncOptions: {
                    intelligentSync: true,
                    forceSync: false,
                    timeout: 30000
                }
            };
            return await this.startBatchMonitoring(accounts, defaultOptions);
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

    async startMessageMonitoring(params: MessageMonitoringParams & {
        withSync?: boolean;
        syncOptions?: any;
    }): Promise<{
        success: boolean;
        tabId?: string;
        error?: string;
        reason?: 'validation_failed' | 'already_monitoring' | 'script_injection_failed' | 'general_error';
        validationResult?: boolean;
        syncResult?: any;
    }> {
        const accountKey = `${params.platform}_${params.accountId}`;
        
        try {
            console.log(`🚀 启动监听: ${accountKey}`);

            // 🔥 步骤1: 检查是否已在监听
            const existingMonitoring = this.activeMonitoring.get(accountKey);
            if (existingMonitoring) {
                console.warn(`⚠️ 意外情况：账号 ${accountKey} 已在监听中，但API层未过滤`);
                return {
                    success: true,
                    reason: 'already_monitoring',
                    tabId: existingMonitoring.tabId
                };
            }

            // 🔥 步骤2: 创建Tab并加载页面
            console.log(`📱 创建Tab: ${accountKey}`);
            const tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                params.platform,
                this.getMessageUrl(params.platform),
                params.headless ?? true
            );

            // 🔥 步骤3: 等待页面加载
            console.log(`⏳ 等待页面加载: ${accountKey}`);
            await new Promise(resolve => setTimeout(resolve, 4000));

            // 🔥 步骤4: 强制同步数据
            console.log(`🔄 开始同步数据: ${accountKey}`);
            let syncResult: any = null;

            try {
                syncResult = await this.syncPlatformMessages(
                    params.platform,
                    params.accountId,
                    params.cookieFile,
                    params.syncOptions,
                    tabId  // 🔥 传入现有Tab
                );
                
                if (syncResult.success) {
                    console.log(`✅ 启动同步完成: ${accountKey}, 新消息 ${syncResult.newMessages} 条`);
                } else {
                    console.warn(`⚠️ 启动同步失败但继续监听: ${accountKey}:`, syncResult.errors);
                }
            } catch (syncError) {
                console.warn(`⚠️ 启动同步异常: ${accountKey}:`, syncError);
                syncResult = {
                    success: false,
                    error: syncError instanceof Error ? syncError.message : 'unknown error'
                };
            }

            // 🔥 步骤5: 仅在同步失败时验证账号
            if (!syncResult.success) {
                console.log(`🔍 同步失败，验证账号有效性: ${accountKey}`);
                
                const validator = this.pluginManager.getPlugin<PluginValidator>(PluginType.VALIDATOR, params.platform);
                let isValid = true;
                
                if (validator) {
                    isValid = await validator.validateTab(tabId);
                    console.log(`🔍 验证结果: ${accountKey} - ${isValid ? '有效' : '无效'}`);
                } else {
                    console.warn(`⚠️ 未找到 ${params.platform} 平台的验证器，跳过验证`);
                }

                if (!isValid) {
                    console.warn(`❌ 账号验证失败: ${accountKey} - Cookie已失效`);
                    
                    // 关闭失效账号的Tab
                    try {
                        await this.tabManager.closeTab(tabId);
                        console.log(`🗑️ 已关闭失效账号的Tab: ${tabId}`);
                    } catch (closeError) {
                        console.warn(`⚠️ 关闭失效Tab失败:`, closeError);
                    }
                    
                    // 更新数据库状态为无效
                    try {
                        const currentTime = new Date().toISOString();
                        const { AccountStorage } = await import('../plugins/login/base/AccountStorage');
                        await AccountStorage.updateValidationStatus(params.cookieFile, false, currentTime);
                        console.log(`📝 已更新账号状态为失效: ${accountKey}`);
                    } catch (dbError) {
                        console.warn(`⚠️ 更新账号状态失败:`, dbError);
                    }
                    
                    return {
                        success: false,
                        reason: 'validation_failed',
                        error: '账号已失效，请重新登录',
                        validationResult: false
                    };
                }
                
                // 账号有效但同步失败，继续建立监听
                console.warn(`⚠️ 账号有效但同步失败，继续建立监听: ${accountKey}`);
            }
            // 🔥 同步成功时无需更新状态（账号本来就是有效的）

            // 🔥 步骤6: 注入监听脚本
            console.log(`🎧 注入监听脚本: ${accountKey}`);
            const scriptSuccess = await this.injectListeningScript(tabId, params.platform, params.accountId);
            
            if (!scriptSuccess) {
                // 脚本注入失败，关闭Tab
                try {
                    await this.tabManager.closeTab(tabId);
                } catch (closeError) {
                    console.warn(`⚠️ 关闭Tab失败:`, closeError);
                }
                
                return {
                    success: false,
                    reason: 'script_injection_failed',
                    error: '监听脚本注入失败',
                    validationResult: true
                };
            }

            // 🔥 步骤7: 记录监听状态
            this.activeMonitoring.set(accountKey, {
                accountKey,
                platform: params.platform,
                accountId: params.accountId,
                tabId,
                isMonitoring: true,
                lastActivity: new Date().toISOString()
            });

            console.log(`✅ 监听启动成功: ${accountKey} -> ${tabId}`);
            return { 
                success: true, 
                tabId, 
                validationResult: true,
                syncResult
            };

        } catch (error) {
            console.error(`❌ 启动监听失败: ${accountKey}:`, error);
            return {
                success: false,
                reason: 'general_error',
                error: error instanceof Error ? error.message : 'unknown error'
            };
        }
    }

    /**
     * 🔥 注入监听脚本的独立方法
     */
    private async injectListeningScript(tabId: string, platform: string, accountId: string): Promise<boolean> {
        const listenerScript = `
            (function() {
                console.log('🎧 消息监听脚本已注入: ${platform}');
                if (window.__messageListenerInjected) return;
                window.__messageListenerInjected = true;
                
                // 🔥 修复：正确劫持微信的console.log格式
                const originalLog = console.log;
                console.log = function(...args) {
                    try {
                        // 🔥 检查微信的实际输出格式
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
                                    platform: '${platform}',
                                    accountId: '${accountId}',
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
                
                console.log('✅ 监听脚本注入完成');
                return true;
            })()
        `;

        const maxRetries = 30; // 30次重试
        const retryDelay = 1000; // 1秒间隔

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.tabManager.executeScript(tabId, listenerScript);
                
                // 验证脚本是否成功注入
                const verifyScript = `window.__messageListenerInjected === true`;
                const isInjected = await this.tabManager.executeScript(tabId, verifyScript);
                
                if (isInjected) {
                    console.log(`✅ 监听脚本注入成功: ${platform}_${accountId} (第${attempt}次尝试)`);
                    return true;
                }
                
                throw new Error('脚本注入验证失败');
                
            } catch (error) {
                console.log(`⚠️ 脚本注入失败 (第${attempt}/${maxRetries}次): ${error instanceof Error ? error.message : 'unknown'}`);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
            }
        }

        console.error(`❌ 监听脚本注入最终失败: ${platform}_${accountId}`);
        return false;
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
    async startBatchMonitoring(accounts: any[], options: {
        withSync: boolean;
        syncOptions: any;
    }): Promise<{
        results: any[];
        summary: {
            successCount: number;
            failedCount: number;
            validationFailedCount: number;
            total: number;
        };
    }> {
        const results = [];
        let successCount = 0;
        let failedCount = 0;
        let validationFailedCount = 0;

        for (const account of accounts) {
            try {
                console.log(`🔄 处理账号: ${account.platform}_${account.accountId}`);
                
                const monitoringResult = await this.startMessageMonitoring({
                    platform: account.platform,
                    accountId: account.accountId,
                    cookieFile: account.cookieFile,
                    headless: account.headless ?? true,
                    withSync: options.withSync,
                    syncOptions: options.syncOptions
                });

                // 统计结果
                if (monitoringResult.success) {
                    successCount++;
                } else if (monitoringResult.reason === 'validation_failed') {
                    validationFailedCount++;
                } else {
                    failedCount++;
                }

                results.push({
                    accountKey: `${account.platform}_${account.accountId}`,
                    ...monitoringResult
                });

                // 避免并发过高
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                failedCount++;
                const accountKey = `${account.platform}_${account.accountId}`;
                console.error(`❌ ${accountKey}: 启动监听异常 -`, error);
                
                results.push({
                    accountKey,
                    success: false,
                    error: error instanceof Error ? error.message : 'unknown error',
                    reason: 'general_error'
                });
            }
        }

        return {
            results,
            summary: {
                successCount,
                failedCount,
                validationFailedCount,
                total: accounts.length
            }
        };
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
     * 🔥 同步平台消息
     */
    async syncPlatformMessages(
        platform: string,
        accountName: string,
        cookieFile: string,
        options?: MessageSyncOptions,
        existingTabId?: string
    ): Promise<MessageSyncResult> {
        let tabId: string | null = existingTabId || null;
        const shouldCloseTab = !existingTabId; // 只有新创建的Tab才需要关闭
        try {
            console.log(`🔄 手动同步消息: ${platform} - ${accountName}`);

            const plugin = this.pluginManager.getPlugin<PluginMessage>(PluginType.MESSAGE, platform);
            
            if (!plugin) {
                throw new Error(`平台 ${platform} 不支持消息功能`);
            }

            // 创建临时Tab进行同步
            // 只有没有现有Tab时才创建新Tab
            if (!tabId) {
                tabId = await this.tabManager.createAccountTab(
                    cookieFile,
                    platform,
                    this.getMessageUrl(platform),
                    true
                );
                
                // 等待页面就绪
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

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
            if (tabId && shouldCloseTab) {
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
     * 🔥 检查账号是否正在监听
     */
    isAccountMonitoring(accountKey: string): boolean {
        return this.activeMonitoring.has(accountKey);
    }

    /**
     * 🔥 获取监听账号的TabId
     */
    getMonitoringTabId(accountKey: string): string | undefined {
        const monitoring = this.activeMonitoring.get(accountKey);
        return monitoring?.tabId;
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