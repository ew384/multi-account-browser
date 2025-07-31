// src/main/automation/MessageAutomationEngine.ts
// 专门的消息自动化引擎，负责所有消息相关的自动化操作

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

import { TabManager } from '../TabManager';

export class MessageAutomationEngine {
    private tabManager: TabManager;
    private messagePlugins: Map<string, PluginMessage> = new Map();
    private messageSchedulers: Map<string, NodeJS.Timeout> = new Map();
    private messageSyncStatus: Map<string, MessageScheduleStatus> = new Map();

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        console.log('🔌 MessageAutomationEngine 已初始化');
    }

    // ==================== 插件管理方法 ====================

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

            // 检查插件是否已初始化
            if (this.messagePlugins.has(platform)) {
                console.log(`✅ ${platform} 消息插件已存在`);
                return true;
            }

            // 创建插件实例
            const plugin = await createMessagePlugin(platform, this.tabManager);
            if (!plugin) {
                console.error(`❌ 创建 ${platform} 消息插件失败`);
                return false;
            }

            // 保存插件实例
            this.messagePlugins.set(platform, plugin);
            console.log(`✅ ${platform} 消息插件初始化成功`);

            return true;

        } catch (error) {
            console.error(`❌ 初始化 ${platform} 消息插件失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 获取消息插件
     */
    getMessagePlugin(platform: string): PluginMessage | null {
        return this.messagePlugins.get(platform) || null;
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

    /**
     * 🔥 获取支持的消息平台列表
     */
    getSupportedPlatforms(): string[] {
        return getSupportedMessagePlatforms();
    }

    /**
     * 🔥 检查平台是否支持消息功能
     */
    isPlatformSupported(platform: string): boolean {
        return isMessagePlatformSupported(platform);
    }

    // ==================== 消息同步功能 ====================

    /**
     * 🔥 同步单个平台的消息
     */
    async syncPlatformMessages(
        platform: string, 
        accountId: string, 
        tabId: string,
        options?: {
            fullSync?: boolean;
            timeout?: number;
        }
    ): Promise<MessageSyncResult> {
        try {
            console.log(`🔄 开始同步 ${platform} 平台消息: ${accountId}`);

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
                await MessageStorage.getLastSyncTime(platform, accountId);

            // 执行同步
            const syncParams: MessageSyncParams = {
                tabId,
                platform,
                accountId,
                lastSyncTime: lastSyncTime || undefined,
                fullSync: options?.fullSync || false
            };

            const syncResult = await plugin.syncMessages(syncParams);

            if (syncResult.success && syncResult.threads.length > 0) {
                // 保存同步结果到数据库
                const incrementalResult = await MessageStorage.incrementalSync(
                    platform,
                    accountId,
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
                accountId, 
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

    /**
     * 🔥 批量同步多个账号的消息
     */
    async batchSyncMessages(request: BatchMessageSyncRequest): Promise<BatchMessageSyncResult> {
        try {
            console.log(`🔄 批量同步消息: ${request.platform} 平台 ${request.accounts.length} 个账号`);

            const maxConcurrency = request.options?.maxConcurrency || 5;
            const timeout = request.options?.timeout || 300000; // 5分钟

            const results: BatchMessageSyncResult['results'] = [];
            let totalNewMessages = 0;
            let totalUpdatedThreads = 0;

            // 分批处理，控制并发数
            for (let i = 0; i < request.accounts.length; i += maxConcurrency) {
                const batch = request.accounts.slice(i, i + maxConcurrency);
                
                const batchPromises = batch.map(async (account) => {
                    try {
                        const syncResult = await Promise.race([
                            this.syncPlatformMessages(
                                request.platform,
                                account.accountId,
                                account.tabId,
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
                            tabId: account.tabId,
                            success: syncResult.success,
                            syncResult: syncResult
                        };

                    } catch (error) {
                        return {
                            accountId: account.accountId,
                            tabId: account.tabId,
                            success: false,
                            error: error instanceof Error ? error.message : 'unknown error'
                        };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                // 批次间短暂延迟，避免过载
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

    // ==================== 消息发送功能 ====================

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

            // 初始化插件（如果需要）
            await this.initializeMessagePlugin(platform);
            const plugin = this.getMessagePlugin(platform);

            if (!plugin) {
                throw new Error(`${platform} 消息插件不可用`);
            }

            // 构造发送参数
            const sendParams: MessageSendParams = {
                tabId,
                userName,
                content,
                type,
                platform,
                accountId
            };

            // 执行发送
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

    /**
     * 🔥 批量发送消息
     */
    async batchSendMessages(request: BatchMessageSendRequest): Promise<BatchMessageSendResult> {
        try {
            console.log(`📤 批量发送消息: ${request.platform} 平台 ${request.messages.length} 条消息`);

            const delay = request.options?.delay || 1000; // 默认1秒间隔
            const timeout = request.options?.timeout || 30000; // 30秒超时
            const continueOnError = request.options?.continueOnError !== false; // 默认遇错继续

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

                    // 如果发送失败且不继续执行，则中断
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

                // 消息间延迟
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

    // ==================== 消息查询和管理功能 ====================

    /**
     * 🔥 获取所有消息线程
     */
    async getAllMessageThreads(platform?: string, accountId?: string): Promise<UserMessageThread[]> {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();

            if (platform && accountId) {
                return await MessageStorage.getAllThreads(platform, accountId);
            } else {
                // 获取所有活跃账号的消息线程
                const activeAccounts = await MessageStorage.getActiveSyncAccounts();
                const allThreads: UserMessageThread[] = [];

                for (const account of activeAccounts) {
                    const threads = await MessageStorage.getAllThreads(account.platform, account.account_id);
                    allThreads.push(...threads);
                }

                // 按最后消息时间排序
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

    /**
     * 🔥 获取指定线程的消息
     */
    async getThreadMessages(threadId: number, limit: number = 50, offset: number = 0) {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getThreadMessages(threadId, limit, offset);
        } catch (error) {
            console.error('❌ 获取线程消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 标记消息为已读
     */
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

    /**
     * 🔥 搜索消息
     */
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

    // ==================== 统计和状态方法 ====================

    /**
     * 🔥 获取消息统计信息
     */
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

    /**
     * 🔥 获取未读消息数量
     */
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
     * 🔥 获取需要同步的账号列表
     */
    async getAccountsNeedingSync(intervalMinutes: number = 5) {
        try {
            await MessageStorage.ensureMessageDatabaseInitialized();
            return await MessageStorage.getAccountsNeedingSync(intervalMinutes);
        } catch (error) {
            console.error('❌ 获取需要同步的账号失败:', error);
            return [];
        }
    }

    // ==================== 调度管理功能 ====================

    /**
     * 🔥 启动消息自动同步调度
     */
    async startMessageScheduler(
        platform: string,
        accountId: string,
        tabId: string,
        config?: MessageScheduleConfig
    ): Promise<boolean> {
        try {
            const scheduleKey = `${platform}_${accountId}`;
            
            // 检查是否已有调度任务
            if (this.messageSchedulers.has(scheduleKey)) {
                console.log(`⚠️ ${scheduleKey} 调度任务已存在`);
                return true;
            }

            const interval = (config?.syncInterval || 5) * 60 * 1000; // 转换为毫秒
            
            console.log(`⏰ 启动消息自动同步调度: ${scheduleKey} (间隔: ${config?.syncInterval || 5}分钟)`);

            // 创建调度任务
            const scheduler = setInterval(async () => {
                try {
                    console.log(`🔄 执行定时同步: ${scheduleKey}`);
                    
                    await this.syncPlatformMessages(platform, accountId, tabId, {
                        fullSync: false // 增量同步
                    });

                    // 更新调度状态
                    this.updateScheduleStatus(platform, accountId, {
                        isRunning: true,
                        lastSyncTime: new Date().toISOString(),
                        nextSyncTime: new Date(Date.now() + interval).toISOString(),
                        syncCount: (this.messageSyncStatus.get(scheduleKey)?.syncCount || 0) + 1,
                        errorCount: this.messageSyncStatus.get(scheduleKey)?.errorCount || 0
                    });

                } catch (error) {
                    console.error(`❌ 定时同步失败: ${scheduleKey}:`, error);
                    
                    // 更新错误状态
                    const currentStatus = this.messageSyncStatus.get(scheduleKey);
                    this.updateScheduleStatus(platform, accountId, {
                        isRunning: true,
                        lastError: error instanceof Error ? error.message : 'unknown error',
                        errorCount: (currentStatus?.errorCount || 0) + 1,
                        syncCount: currentStatus?.syncCount || 0
                    });
                }
            }, interval);

            // 保存调度器
            this.messageSchedulers.set(scheduleKey, scheduler);

            // 初始化状态
            this.updateScheduleStatus(platform, accountId, {
                isRunning: true,
                nextSyncTime: new Date(Date.now() + interval).toISOString(),
                syncCount: 0,
                errorCount: 0
            });

            console.log(`✅ 消息调度启动成功: ${scheduleKey}`);
            return true;

        } catch (error) {
            console.error(`❌ 启动消息调度失败: ${platform}_${accountId}:`, error);
            return false;
        }
    }

    /**
     * 🔥 停止消息调度
     */
    stopMessageScheduler(platform: string, accountId: string): boolean {
        try {
            const scheduleKey = `${platform}_${accountId}`;
            const scheduler = this.messageSchedulers.get(scheduleKey);

            if (scheduler) {
                clearInterval(scheduler);
                this.messageSchedulers.delete(scheduleKey);

                // 更新状态
                this.updateScheduleStatus(platform, accountId, {
                    isRunning: false
                });

                console.log(`⏹️ 消息调度已停止: ${scheduleKey}`);
                return true;
            } else {
                console.log(`⚠️ 消息调度不存在: ${scheduleKey}`);
                return false;
            }

        } catch (error) {
            console.error(`❌ 停止消息调度失败: ${platform}_${accountId}:`, error);
            return false;
        }
    }

    /**
     * 🔥 获取调度状态
     */
    getScheduleStatus(platform: string, accountId: string): MessageScheduleStatus | null {
        const scheduleKey = `${platform}_${accountId}`;
        return this.messageSyncStatus.get(scheduleKey) || null;
    }

    /**
     * 🔥 获取所有调度状态
     */
    getAllScheduleStatuses(): MessageScheduleStatus[] {
        return Array.from(this.messageSyncStatus.values());
    }

    /**
     * 🔥 更新调度状态
     */
    private updateScheduleStatus(
        platform: string, 
        accountId: string, 
        updates: Partial<MessageScheduleStatus>
    ): void {
        const scheduleKey = `${platform}_${accountId}`;
        const currentStatus = this.messageSyncStatus.get(scheduleKey) || {
            platform,
            accountId,
            isRunning: false,
            syncCount: 0,
            errorCount: 0
        };

        this.messageSyncStatus.set(scheduleKey, {
            ...currentStatus,
            ...updates
        });
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
     * 🔥 销毁消息自动化引擎
     */
    async destroy(): Promise<void> {
        try {
            console.log('🧹 销毁消息自动化引擎...');

            // 停止所有调度任务
            for (const [scheduleKey] of this.messageSchedulers) {
                const [platform, accountId] = scheduleKey.split('_');
                this.stopMessageScheduler(platform, accountId);
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
            this.messageSchedulers.clear();
            this.messageSyncStatus.clear();

            console.log('✅ 消息自动化引擎已销毁');

        } catch (error) {
            console.error('❌ 销毁消息自动化引擎失败:', error);
        }
    }

    /**
     * 🔥 获取引擎状态
     */
    getEngineStatus(): {
        initializedPlugins: string[];
        activeSchedulers: string[];
        totalThreads: number;
        syncStatuses: MessageScheduleStatus[];
    } {
        return {
            initializedPlugins: Array.from(this.messagePlugins.keys()),
            activeSchedulers: Array.from(this.messageSchedulers.keys()),
            totalThreads: this.messageSyncStatus.size,
            syncStatuses: this.getAllScheduleStatuses()
        };
    }
}