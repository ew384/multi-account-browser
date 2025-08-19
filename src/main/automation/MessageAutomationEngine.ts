// src/main/automation/MessageAutomationEngine.ts

import { TabManager } from '../TabManager';
import { MessageStorage } from '../plugins/message/base/MessageStorage';
import { 
    createMessagePlugin,
    getSupportedMessagePlatforms,
    getMessagePlatformConfig,
    getAllMessagePlatformConfigs
} from '../plugins/message';
import { 
    PluginMessage, 
    MessageSyncParams,
    MessageSyncResult,
    MessageSendParams,
    MessageSendResult,
    UserMessageThread,
    MessageStatistics,
    Message,
    BatchMessageSyncRequest,
    BatchMessageSyncResult,
    BatchMessageSendRequest,
    BatchMessageSendResult
} from '../../types/pluginInterface';
import { ipcMain } from 'electron';
import * as path from 'path';

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
    plugin?: PluginMessage;
}

export interface MessageSyncOptions {
    forceSync?: boolean;
    maxRetries?: number;
    timeout?: number;
}

/**
 * 🔥 消息自动化引擎 - IPC事件驱动版本
 * 
 * 核心功能：
 * 1. 多账号跨平台私信管理
 * 2. 实时监听页面新消息
 * 3. 检测账号失效并自动清理
 * 4. 简化的Tab生命周期管理
 */
export class MessageAutomationEngine {
    private tabManager: TabManager;
    private automationEngine: any; // AutomationEngine 实例
    private messagePlugins: Map<string, PluginMessage> = new Map();
    private activeMonitoring: Map<string, MessageMonitoringStatus> = new Map();
    private scheduleIntervals: Map<string, NodeJS.Timeout> = new Map();
    private isSystemRunning: boolean = false;

    constructor(tabManager: TabManager, automationEngine: any) {
        this.tabManager = tabManager;
        this.automationEngine = automationEngine;
        this.initializeDatabase();
        this.setupIPCListeners();
        console.log('🔥 MessageAutomationEngine 已初始化');
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

            // 2. 获取或创建插件
            const plugin = await this.getOrCreatePlugin(params.platform);
            if (!plugin) {
                return {
                    success: false,
                    error: `平台 ${params.platform} 不支持消息功能`
                };
            }

            // 3. 创建专用Tab (使用 createAccountTab)
            const tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                params.platform,
                this.getMessageUrl(params.platform),
                params.headless ?? true
            );

            // 4. 等待页面就绪
            const isReady = await this.waitForPageReady(tabId, params.platform);
            if (!isReady) {
                await this.tabManager.closeTab(tabId);
                return {
                    success: false,
                    error: '页面加载超时或失败'
                };
            }

            // 5. 注入监听脚本
            await this.injectMessageListener(tabId, params.platform);

            // 6. 锁定Tab防止被其他功能使用
            const lockSuccess = this.tabManager.lockTab(tabId, 'message', '消息监听专用');
            if (!lockSuccess) {
                console.warn(`⚠️ 无法锁定消息Tab: ${tabId}`);
            }

            // 7. 记录监听状态
            this.activeMonitoring.set(accountKey, {
                accountKey,
                platform: params.platform,
                accountId: params.accountId,
                tabId,
                isMonitoring: true,
                lastActivity: new Date().toISOString(),
                plugin
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

            // 1. 解锁并清理Tab
            if (monitoring.tabId) {
                this.tabManager.unlockTab(monitoring.tabId, 'message');
                await this.tabManager.closeTab(monitoring.tabId);
            }

            // 2. 移除监听状态
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

                // 避免并发过多，添加短暂延迟
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

    /**
     * 🔥 获取特定账号监听状态
     */
    getMonitoringStatus(accountKey: string): {
        isActive: boolean;
        tabId?: string;
        lastActivity?: string;
    } {
        const monitoring = this.activeMonitoring.get(accountKey);
        
        if (!monitoring) {
            return { isActive: false };
        }

        return {
            isActive: monitoring.isMonitoring,
            tabId: monitoring.tabId,
            lastActivity: monitoring.lastActivity
        };
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

            const plugin = await this.getOrCreatePlugin(platform);
            if (!plugin) {
                throw new Error(`平台 ${platform} 不支持消息功能`);
            }

            // 创建临时Tab进行同步
            tabId = await this.tabManager.createAccountTab(
                cookieFile,
                platform,
                this.getMessageUrl(platform),
                true // headless模式
            );
            
            // 等待页面就绪
            await this.waitForPageReady(tabId, platform, 30000);

            // 执行同步
            const syncParams: MessageSyncParams = {
                tabId,
                platform,
                accountId: accountName,
                fullSync: options?.forceSync || false
            };

            const result = await plugin.syncMessages(syncParams);

            // 保存同步结果到数据库
            if (result.success && result.threads.length > 0) {
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

            const plugin = await this.getOrCreatePlugin(platform);
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
                    tabId: '', // 临时Tab，同步完成后已关闭
                    success: syncResult.success,
                    syncResult,
                    error: syncResult.success ? undefined : syncResult.errors?.[0]
                });

                // 避免并发过多
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

                // 消息间延迟
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
                // 如果没有指定平台和账号，返回所有线程
                const platforms = this.getSupportedPlatforms();
                const allThreads: UserMessageThread[] = [];
                
                for (const plt of platforms) {
                    // 这里需要获取该平台的所有账号，暂时返回空数组
                    // 实际应用中可以从账号存储中获取
                    console.warn(`⚠️ 需要实现获取平台 ${plt} 的所有账号逻辑`);
                }
                
                return allThreads;
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
        return getSupportedMessagePlatforms();
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
            initializedPlugins: Array.from(this.messagePlugins.keys()),
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
}