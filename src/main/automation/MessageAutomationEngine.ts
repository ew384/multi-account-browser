// src/main/automation/MessageAutomationEngine.ts - 重构后的版本

import { 
    PluginMessage,
    MessageSyncParams,
    MessageSyncResult,
    MessageSendParams,
    MessageSendResult,
    BatchMessageSyncRequest,
    BatchMessageSyncResult,
    BatchMessageSendRequest,
    BatchMessageSendResult,
    MessageStatistics,
    UserMessageThread,
    MessageScheduleConfig,
    MessageScheduleStatus
} from '../../types/pluginInterface';

import { MessageStorage } from '../plugins/message/base/MessageStorage';
import { 
    getSupportedMessagePlatforms,
    createMessagePlugin,
    isMessagePlatformSupported,
    getMessagePlatformConfig
} from '../plugins/message/index';
import { AutomationEngine } from './AutomationEngine';
import { AccountStorage } from '../plugins/login/base/AccountStorage';
import { TabManager } from '../TabManager';

import { MessageTabManager, MessageScheduler } from './message';

export class MessageAutomationEngine {
    private tabManager: TabManager;
    private automationEngine: AutomationEngine;
    private messagePlugins: Map<string, PluginMessage> = new Map();
    private messageTabManager: MessageTabManager;
    private messageScheduler: MessageScheduler;
    private messageSyncStatus: Map<string, MessageScheduleStatus> = new Map();

    constructor(tabManager: TabManager,automationEngine: AutomationEngine) {
        this.tabManager = tabManager;
        this.automationEngine = automationEngine;
        // 🔥 初始化专用管理器
        this.messageTabManager = new MessageTabManager(tabManager);
        this.messageScheduler = new MessageScheduler(this.messageTabManager);
        
        // 🔥 设置调度器的同步函数（依赖注入）
        this.messageScheduler.setSyncFunction(this.syncPlatformMessages.bind(this));
        
        console.log('🔌 MessageAutomationEngine 已初始化 (重构版)');
    }

    // ==================== 插件管理方法（保持不变） ====================

    /**
     * 🔥 初始化消息插件
     */
    async initializeMessagePlugin(platform: string): Promise<boolean> {
        try {
            console.log(`🔌 初始化 ${platform} 消息插件...`);

            if (!isMessagePlatformSupported(platform)) {
                console.error(`❌ 不支持的消息平台: ${platform}`);
                return false;
            }

            if (this.messagePlugins.has(platform)) {
                console.log(`✅ ${platform} 消息插件已存在`);
                return true;
            }

            const plugin = await createMessagePlugin(platform, this.tabManager);
            if (!plugin) {
                console.error(`❌ 创建 ${platform} 消息插件失败`);
                return false;
            }

            this.messagePlugins.set(platform, plugin);
            console.log(`✅ ${platform} 消息插件初始化成功`);

            return true;

        } catch (error) {
            console.error(`❌ 初始化 ${platform} 消息插件失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 批量初始化消息插件
     */
    async initializeAllMessagePlugins(): Promise<{ 
        success: number; 
        failed: number; 
        results: Record<string, boolean> 
    }> {
        console.log('🔌 批量初始化所有消息插件...');

        const platforms = getSupportedMessagePlatforms();
        const results: Record<string, boolean> = {};
        let success = 0;
        let failed = 0;

        for (const platform of platforms) {
            const result = await this.initializeMessagePlugin(platform);
            results[platform] = result;
            
            if (result) {
                success++;
            } else {
                failed++;
            }
        }

        console.log(`📊 消息插件初始化完成: 成功 ${success}, 失败 ${failed}`);
        return { success, failed, results };
    }

    getMessagePlugin(platform: string): PluginMessage | null {
        return this.messagePlugins.get(platform) || null;
    }

    getSupportedPlatforms(): string[] {
        return getSupportedMessagePlatforms();
    }

    isPlatformSupported(platform: string): boolean {
        return isMessagePlatformSupported(platform);
    }

    // ==================== Tab管理 - 委托给MessageTabManager ====================

    /**
     * 🔥 确保消息Tab存在并健康 - 委托给MessageTabManager
     */
    async ensureMessageTab(platform: string, accountId: string, cookieFile: string): Promise<string> {
        return await this.messageTabManager.ensureMessageTab(platform, accountId, cookieFile);
    }

    /**
     * 🔥 清理消息Tab - 委托给MessageTabManager
     */
    async cleanupMessageTab(platform: string, accountId: string): Promise<void> {
        const accountKey = `${platform}_${accountId}`;
        await this.messageTabManager.cleanupMessageTab(accountKey);
    }

    /**
     * 🔥 获取消息Tab状态
     */
    async getMessageTabsStatus() {
        return await this.messageTabManager.getAllTabsStatus();
    }

    // ==================== 调度管理 - 委托给MessageScheduler ====================
    /**
     * 🔥 自动加载所有有效账号到调度系统
     */
    async autoLoadValidAccountsToSchedule(): Promise<{
        success: number;
        failed: number;
        results: Array<{ accountKey: string; success: boolean; taskId?: string; error?: string }>;
    }> {
        console.log('🔍 自动加载所有有效账号到消息调度系统...');
        
        try {
            // 🔥 通过注入的 AutomationEngine 获取有效账号
            const validAccounts = await this.automationEngine.getValidAccounts();
            console.log(`📋 发现 ${validAccounts.length} 个有效账号`);

            const results = [];
            let success = 0;
            let failed = 0;

            for (const account of validAccounts) {
                try {
                    // 🔥 需要确认 AccountStorage.getPlatformName 方法
                    const platform = AccountStorage.getPlatformName(account.type);
                    const accountId = account.userName;
                    const cookieFile = account.filePath;
                    const accountKey = `${platform}_${accountId}`;
                    
                    // 检查是否已存在
                    const existingTask = this.messageScheduler.getTaskByAccount(platform, accountId);
                    
                    if (existingTask) {
                        // 检查Cookie文件是否更新
                        if (existingTask.currentCookieFile !== cookieFile) {
                            this.messageScheduler.updateTaskCookie(accountKey, cookieFile, 'auto_reload');
                            console.log(`🔄 更新账号Cookie: ${accountKey}`);
                        } else {
                            console.log(`⚠️ 账号已存在，跳过: ${accountKey}`);
                        }
                        
                        results.push({ accountKey, success: true, taskId: existingTask.id });
                        success++;
                        continue;
                    }

                    // 添加新任务
                    const taskId = this.addAccountToSchedule({
                        platform: platform,
                        accountId: accountId,
                        cookieFile: cookieFile,
                        syncInterval: 5,
                        autoStart: true
                    });

                    results.push({ accountKey, success: true, taskId });
                    success++;
                    
                    console.log(`✅ 已添加到调度: ${accountKey}`);
                    
                } catch (error) {
                    const accountKey = `unknown_${account.userName}`;
                    results.push({ 
                        accountKey, 
                        success: false, 
                        error: error instanceof Error ? error.message : 'unknown error' 
                    });
                    failed++;
                    console.error(`❌ 添加账号失败: ${account.userName}:`, error);
                }
            }

            console.log(`📊 自动加载完成: 成功 ${success}, 失败 ${failed}`);
            return { success, failed, results };
            
        } catch (error) {
            console.error('❌ 自动加载账号失败:', error);
            throw error;
        }
    }
    /**
     * 🔥 启动完整的消息自动化系统
     */
    async startCompleteMessageSystem(): Promise<boolean> {
        try {
            console.log('🚀 启动完整的消息自动化系统...');
            
            // 1. 自动加载所有有效账号
            const loadResult = await this.autoLoadValidAccountsToSchedule();
            console.log(`📋 账号加载结果: 成功 ${loadResult.success}, 失败 ${loadResult.failed}`);
            
            // 2. 启动调度器（如果有任务）
            if (loadResult.success > 0) {
                await this.messageScheduler.start();  // 🔥 直接调用 messageScheduler.start()
                console.log('✅ 消息调度器已启动');
                return true;
            } else {
                console.log('⚠️ 没有可用账号，调度器未启动');
                return false;
            }
            
        } catch (error) {
            console.error('❌ 启动消息自动化系统失败:', error);
            return false;
        }
    }

    /**
     * 🔥 启动消息自动化调度系统
     */
    async startScheduleSystem(): Promise<void> {
        console.log('🚀 启动消息自动化调度系统...');
        
        try {
            // 1. 初始化所有消息插件
            await this.initializeAllMessagePlugins();
            
            // 2. 启动调度器
            await this.messageScheduler.start();
            
            console.log('✅ 消息自动化调度系统已启动');
            
        } catch (error) {
            console.error('❌ 启动调度系统失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 停止消息自动化调度系统
     */
    async stopScheduleSystem(): Promise<void> {
        console.log('⏹️ 停止消息自动化调度系统...');
        
        try {
            await this.messageScheduler.stop();
            console.log('✅ 消息自动化调度系统已停止');
        } catch (error) {
            console.error('❌ 停止调度系统失败:', error);
        }
    }

    /**
     * 🔥 添加账号到调度系统
     */
    addAccountToSchedule(params: {
        platform: string;
        accountId: string;
        cookieFile: string;
        syncInterval?: number;
        priority?: number;
        autoStart?: boolean;
    }): string {
        console.log(`➕ 添加账号到调度系统: ${params.platform}_${params.accountId}`);
        
        const taskId = this.messageScheduler.addTask({
            platform: params.platform,
            accountId: params.accountId,
            cookieFile: params.cookieFile,
            syncInterval: params.syncInterval || 5,
            priority: params.priority || 5,
            enabled: params.autoStart !== false
        });
        
        return taskId;
    }


    /**
     * 🔥 从调度系统移除账号
     */
    removeAccountFromSchedule(platform: string, accountId: string): boolean {
        const task = this.messageScheduler.getTaskByAccount(platform, accountId);
        if (task) {
            return this.messageScheduler.removeTask(task.id);
        }
        return false;
    }

    /**
     * 🔥 获取调度系统状态
     */
    getScheduleSystemStatus() {
        return this.messageScheduler.getSchedulerStatus();
    }

    /**
     * 🔥 获取账号调度状态
     */
    getAccountScheduleStatus(platform: string, accountId: string) {
        return this.messageScheduler.getTaskByAccount(platform, accountId);
    }

    // ==================== 消息同步功能（核心业务逻辑） ====================

    /**
     * 🔥 同步单个平台的消息
     */
    async syncPlatformMessages(
        platform: string, 
        accountName: string, 
        cookieFile: string,
        options?: {
            fullSync?: boolean;
            timeout?: number;
        }
    ): Promise<MessageSyncResult> {
        try {
            console.log(`🔄 开始同步 ${platform} 平台消息: ${accountName}`);


            
            // 🔥 关键：使用MessageTabManager自动创建或复用tab
            const actualTabId = await this.ensureMessageTab(platform, accountName, cookieFile);
            console.log(`✅ 消息Tab已就绪: ${actualTabId}`);
            
            // 确保消息数据库已初始化
            await MessageStorage.ensureMessageDatabaseInitialized();

            // 初始化插件（如果需要）
            await this.initializeMessagePlugin(platform);
            const plugin = this.getMessagePlugin(platform);

            if (!plugin) {
                throw new Error(`${platform} 消息插件不可用`);
            }

            // 获取最后同步时间（用于增量同步）
            const lastSyncTime = options?.fullSync ? 
                undefined : 
                await MessageStorage.getLastSyncTime(platform, accountName);

            // 执行同步
            const syncParams: MessageSyncParams = {
                tabId:actualTabId,
                platform,
                accountId: accountName,
                lastSyncTime: lastSyncTime || undefined,
                fullSync: options?.fullSync || false
            };

            const syncResult = await plugin.syncMessages(syncParams);

            if (syncResult.success && syncResult.threads.length > 0) {
                // 保存同步结果到数据库
                const incrementalResult = await MessageStorage.incrementalSync(
                    platform,
                    accountName,
                    syncResult.threads
                );

                console.log(`✅ ${platform} 消息同步完成: 新消息 ${incrementalResult.newMessages} 条`);

                // 合并统计信息
                return {
                    ...syncResult,
                    newMessages: incrementalResult.newMessages,
                    updatedThreads: incrementalResult.updatedThreads,
                    errors: [...(syncResult.errors || []), ...incrementalResult.errors]
                };
            }

            return syncResult;

        } catch (error) {
            console.error(`❌ ${platform} 消息同步失败:`, error);
            
            // 记录同步错误
            await MessageStorage.recordSyncError(
                platform, 
                accountName, 
                error instanceof Error ? error.message : 'unknown error'
            );

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

    // ==================== 消息发送功能（保持不变） ====================

    /**
     * 🔥 发送单条消息
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
            console.log(`📤 发送 ${platform} 消息: ${userName} (${type})`);

            await this.initializeMessagePlugin(platform);
            const plugin = this.getMessagePlugin(platform);

            if (!plugin) {
                throw new Error(`${platform} 消息插件不可用`);
            }

            const sendParams: MessageSendParams = {
                tabId,
                userName,
                content,
                type,
                platform,
                accountId
            };

            const sendResult = await plugin.sendMessage(sendParams);

            if (sendResult.success) {
                console.log(`✅ ${platform} 消息发送成功: ${userName}`);
            } else {
                console.error(`❌ ${platform} 消息发送失败: ${sendResult.error}`);
            }

            return sendResult;

        } catch (error) {
            console.error(`❌ ${platform} 消息发送异常:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                user: userName,
                type: type
            };
        }
    }

    // ==================== 批量操作（保持不变） ====================

    async batchSyncMessages(request: BatchMessageSyncRequest): Promise<BatchMessageSyncResult> {
        try {
            console.log(`🔄 批量同步消息: ${request.platform} 平台 ${request.accounts.length} 个账号`);

            const maxConcurrency = request.options?.maxConcurrency || 5;
            const timeout = request.options?.timeout || 300000;

            const results: BatchMessageSyncResult['results'] = [];
            let totalNewMessages = 0;
            let totalUpdatedThreads = 0;

            for (let i = 0; i < request.accounts.length; i += maxConcurrency) {
                const batch = request.accounts.slice(i, i + maxConcurrency);
                
                const batchPromises = batch.map(async (account) => {
                    try {
                        const tabId = await this.ensureMessageTab(
                            request.platform,
                            account.accountId,
                            account.cookieFile
                        );

                        const syncResult = await Promise.race([
                            this.syncPlatformMessages(
                                request.platform,
                                account.accountId,
                                tabId,
                                {
                                    fullSync: request.options?.fullSync,
                                    timeout: timeout
                                }
                            ),
                            new Promise<MessageSyncResult>((_, reject) => 
                                setTimeout(() => reject(new Error('同步超时')), timeout)
                            )
                        ]);

                        totalNewMessages += syncResult.newMessages;
                        totalUpdatedThreads += syncResult.updatedThreads;

                        return {
                            accountId: account.accountId,
                            tabId: tabId,
                            success: syncResult.success,
                            syncResult: syncResult
                        };

                    } catch (error) {
                        return {
                            accountId: account.accountId,
                            tabId: '',
                            success: false,
                            error: error instanceof Error ? error.message : 'unknown error'
                        };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                if (i + maxConcurrency < request.accounts.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.length - successCount;

            console.log(`📊 批量同步完成: ${successCount}/${request.accounts.length} 成功`);

            return {
                success: successCount > 0,
                results: results,
                summary: {
                    totalAccounts: request.accounts.length,
                    successCount,
                    failedCount,
                    totalNewMessages,
                    totalUpdatedThreads
                },
                syncTime: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ 批量消息同步失败:', error);
            throw error;
        }
    }

    async batchSendMessages(request: BatchMessageSendRequest): Promise<BatchMessageSendResult> {
        // ... 现有实现保持不变
        try {
            console.log(`📤 批量发送消息: ${request.platform} 平台 ${request.messages.length} 条消息`);

            const delay = request.options?.delay || 1000;
            const timeout = request.options?.timeout || 30000;
            const continueOnError = request.options?.continueOnError !== false;

            const results: MessageSendResult[] = [];

            for (const message of request.messages) {
                try {
                    const sendResult = await Promise.race([
                        this.sendPlatformMessage(
                            request.platform,
                            message.tabId,
                            message.userName,
                            message.content,
                            message.type,
                            message.accountId
                        ),
                        new Promise<MessageSendResult>((_, reject) => 
                            setTimeout(() => reject(new Error('发送超时')), timeout)
                        )
                    ]);

                    results.push(sendResult);

                    if (!sendResult.success && !continueOnError) {
                        console.warn(`⚠️ 消息发送失败，中止批量发送: ${sendResult.error}`);
                        break;
                    }

                } catch (error) {
                    const errorResult: MessageSendResult = {
                        success: false,
                        error: error instanceof Error ? error.message : 'unknown error',
                        user: message.userName,
                        type: message.type
                    };

                    results.push(errorResult);

                    if (!continueOnError) {
                        console.warn(`⚠️ 消息发送异常，中止批量发送: ${errorResult.error}`);
                        break;
                    }
                }

                if (results.length < request.messages.length) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.length - successCount;

            console.log(`📊 批量发送完成: ${successCount}/${request.messages.length} 成功`);

            return {
                success: successCount > 0,
                results: results,
                summary: {
                    totalMessages: request.messages.length,
                    successCount,
                    failedCount
                },
                sendTime: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ 批量消息发送失败:', error);
            throw error;
        }
    }

    // ==================== 查询和统计功能（保持不变） ====================

    async getAllMessageThreads(platform?: string, accountId?: string): Promise<UserMessageThread[]> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();

            if (platform && accountId) {
                return await MessageStorage.getAllThreads(platform, accountId);
            } else {
                const activeAccounts = await MessageStorage.getActiveSyncAccounts();
                const allThreads: UserMessageThread[] = [];

                for (const account of activeAccounts) {
                    const threads = await MessageStorage.getAllThreads(account.platform, account.account_id);
                    allThreads.push(...threads);
                }

                return allThreads.sort((a, b) => {
                    const timeA = a.last_message_time || '0';
                    const timeB = b.last_message_time || '0';
                    return timeB.localeCompare(timeA);
                });
            }

        } catch (error) {
            console.error('❌ 获取消息线程失败:', error);
            return [];
        }
    }

    async getThreadMessages(threadId: number, limit: number = 50, offset: number = 0) {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getThreadMessages(threadId, limit, offset);
        } catch (error) {
            console.error('❌ 获取线程消息失败:', error);
            return [];
        }
    }

    async markMessagesAsRead(threadId: number, messageIds?: number[]): Promise<boolean> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            await MessageStorage.markMessagesAsRead(threadId, messageIds);
            return true;
        } catch (error) {
            console.error('❌ 标记消息已读失败:', error);
            return false;
        }
    }

    async searchMessages(
        platform: string,
        accountId: string,
        keyword: string,
        limit: number = 20
    ) {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.searchMessages(platform, accountId, keyword, limit);
        } catch (error) {
            console.error('❌ 搜索消息失败:', error);
            return [];
        }
    }

    async getMessageStatistics(): Promise<MessageStatistics> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getMessageStatistics();
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

    async getUnreadCount(platform?: string, accountId?: string): Promise<number> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getUnreadCount(platform, accountId);
        } catch (error) {
            console.error('❌ 获取未读消息统计失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 获取调度状态 (兼容方法)
     */
    getScheduleStatus(platform: string, accountId: string): MessageScheduleStatus | null {
        const task = this.getAccountScheduleStatus(platform, accountId);
        if (!task) return null;
        
        // 转换为旧格式
        return {
            platform: task.platform,
            accountId: task.accountId,
            isRunning: task.status === 'running' || task.status === 'pending',
            lastSyncTime: task.lastSyncTime,
            nextSyncTime: task.nextSyncTime,
            syncCount: task.syncCount,
            errorCount: task.errorCount,
            lastError: task.lastError
        };
    }

    /**
     * 🔥 获取所有调度状态 (兼容方法)
     */
    getAllScheduleStatuses(): MessageScheduleStatus[] {
        const schedulerStatus = this.getScheduleSystemStatus();
        
        return schedulerStatus.tasks.map(task => ({
            platform: task.platform,
            accountId: task.accountId,
            isRunning: task.status === 'running' || task.status === 'pending',
            lastSyncTime: task.lastSyncTime,
            nextSyncTime: task.nextSyncTime,
            syncCount: task.syncCount,
            errorCount: task.errorCount,
            lastError: task.lastError
        }));
    }
    /**
     * 🔥 新增：更新账号Cookie
     */
    updateAccountCookie(platform: string, accountId: string, newCookieFile: string): boolean {
        const accountKey = `${platform}_${accountId}`;
        return this.messageScheduler.updateTaskCookie(accountKey, newCookieFile, 'relogin');
    }

    // ==================== 数据清理功能 ====================

    /**
     * 🔥 清理旧消息数据
     */
    async cleanupOldMessages(daysToKeep: number = 30): Promise<number> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.cleanupOldMessages(daysToKeep);
        } catch (error) {
            console.error('❌ 清理旧消息失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 修复数据一致性
     */
    async repairDataConsistency() {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.repairDataConsistency();
        } catch (error) {
            console.error('❌ 修复数据一致性失败:', error);
            return { repairedThreads: 0, orphanedMessages: 0 };
        }
    }

    /**
     * 🔥 获取数据库健康状态
     */
    async getDatabaseHealth() {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getDatabaseHealth();
        } catch (error) {
            console.error('❌ 获取数据库健康状态失败:', error);
            return {
                isHealthy: false,
                issues: ['检查数据库健康状态失败'],
                suggestions: ['检查数据库连接'],
                stats: {
                    totalThreads: 0,
                    totalMessages: 0,
                    unreadMessages: 0,
                    platformStats: {}
                }
            };
        }
    }


    // ==================== 生命周期管理 ====================

    /**
     * 🔥 获取引擎状态
     */
    getEngineStatus(): {
        initializedPlugins: string[];
        schedulerStatus: any;
        tabsStatus: any;
        syncStatuses: MessageScheduleStatus[];
    } {
        return {
            initializedPlugins: Array.from(this.messagePlugins.keys()),
            schedulerStatus: this.getScheduleSystemStatus(),
            tabsStatus: null, // 异步方法，这里不调用
            syncStatuses: this.getAllScheduleStatuses()
        };
    }

    /**
     * 🔥 销毁消息自动化引擎
     */
    async destroy(): Promise<void> {
        try {
            console.log('🧹 销毁MessageAutomationEngine...');

            // 按顺序销毁组件
            if (this.messageScheduler) {
                await this.messageScheduler.destroy();
            }
            
            if (this.messageTabManager) {
                await this.messageTabManager.destroy();
            }

            // 销毁所有插件
            for (const [platform, plugin] of this.messagePlugins) {
                try {
                    if (plugin.destroy) {
                        await plugin.destroy();
                    }
                } catch (error) {
                    console.warn(`⚠️ 销毁 ${platform} 插件失败:`, error);
                }
            }

            // 清理资源
            this.messagePlugins.clear();
            this.messageSyncStatus.clear();

            console.log('✅ MessageAutomationEngine已销毁');

        } catch (error) {
            console.error('❌ 销毁MessageAutomationEngine失败:', error);
        }
    }
}