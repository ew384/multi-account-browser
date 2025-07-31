// src/main/apis/MessageAutomationAPI.ts
// 专门的消息自动化API，直接调用MessageAutomationEngine，不通过AutomationEngine代理

import { Request, Response } from 'express';
import { MessageAutomationEngine } from '../automation/MessageAutomationEngine';
import { TabManager } from '../TabManager';
import {
    MessageSyncParams,
    MessageSendParams,
    BatchMessageSyncRequest,
    BatchMessageSendRequest,
    MessageScheduleConfig
} from '../../types/pluginInterface';

export class MessageAutomationAPI {
    private messageEngine: MessageAutomationEngine;

    constructor(tabManager: TabManager) {
        this.messageEngine = new MessageAutomationEngine(tabManager);
        console.log('✅ MessageAutomationAPI 已初始化');
    }

    /**
     * 获取消息引擎实例（供其他模块使用）
     */
    getMessageEngine(): MessageAutomationEngine {
        return this.messageEngine;
    }

    // ==================== 消息同步相关API ====================

    /**
     * 🔥 POST /api/messages/sync - 同步单个平台消息
     */
    async syncMessages(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountName, cookieFile } = req.body;

            if (!platform || !accountName || !cookieFile) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountName, cookieFile',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`🔄 API请求: 同步 ${platform} 消息 - ${accountName}`);

            const result = await this.messageEngine.syncPlatformMessages(
                platform,
                accountName,
                cookieFile
            );

            res.json({
                success: result.success,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 同步消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'SYNC_ERROR'
            });
        }
    }

    /**
     * 🔥 POST /api/messages/batch-sync - 批量同步消息
     */
    async batchSyncMessages(req: Request, res: Response): Promise<void> {
        try {
            const request: BatchMessageSyncRequest = req.body;

            if (!request.platform || !request.accounts || request.accounts.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accounts',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`🔄 API请求: 批量同步 ${request.platform} 消息 - ${request.accounts.length} 个账号`);

            const result = await this.messageEngine.batchSyncMessages(request);

            res.json({
                success: result.success,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 批量同步消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'BATCH_SYNC_ERROR'
            });
        }
    }

    // ==================== 消息发送相关API ====================

    /**
     * 🔥 POST /api/messages/send - 发送单条消息
     */
    async sendMessage(req: Request, res: Response): Promise<void> {
        try {
            const { platform, tabId, userName, content, type, accountId } = req.body;

            if (!platform || !tabId || !userName || !content || !type) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, tabId, userName, content, type',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            if (!['text', 'image'].includes(type)) {
                res.status(400).json({
                    success: false,
                    error: 'type 必须是 text 或 image',
                    code: 'INVALID_TYPE'
                });
                return;
            }

            console.log(`📤 API请求: 发送 ${platform} 消息 - ${userName} (${type})`);

            const result = await this.messageEngine.sendPlatformMessage(
                platform,
                tabId,
                userName,
                content,
                type,
                accountId
            );

            res.json({
                success: result.success,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 发送消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'SEND_ERROR'
            });
        }
    }

    /**
     * 🔥 POST /api/messages/batch-send - 批量发送消息
     */
    async batchSendMessages(req: Request, res: Response): Promise<void> {
        try {
            const request: BatchMessageSendRequest = req.body;

            if (!request.platform || !request.messages || request.messages.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, messages',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`📤 API请求: 批量发送 ${request.platform} 消息 - ${request.messages.length} 条`);

            const result = await this.messageEngine.batchSendMessages(request);

            res.json({
                success: result.success,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 批量发送消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'BATCH_SEND_ERROR'
            });
        }
    }

    // ==================== 消息查询相关API ====================

    /**
     * 🔥 GET /api/messages/threads - 获取消息线程列表
     */
    async getMessageThreads(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.query;

            console.log(`📋 API请求: 获取消息线程 - ${platform || 'all'}`);

            const threads = await this.messageEngine.getAllMessageThreads(
                platform as string,
                accountId as string
            );

            res.json({
                success: true,
                data: {
                    threads: threads,
                    total: threads.length
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取消息线程API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'GET_THREADS_ERROR'
            });
        }
    }

    /**
     * 🔥 GET /api/messages/thread/:threadId - 获取指定线程的消息
     */
    async getThreadMessages(req: Request, res: Response): Promise<void> {
        try {
            const { threadId } = req.params;
            const { limit = 50, offset = 0 } = req.query;

            if (!threadId || isNaN(Number(threadId))) {
                res.status(400).json({
                    success: false,
                    error: '无效的 threadId',
                    code: 'INVALID_THREAD_ID'
                });
                return;
            }

            console.log(`📋 API请求: 获取线程消息 - ${threadId}`);

            const messages = await this.messageEngine.getThreadMessages(
                Number(threadId),
                Number(limit),
                Number(offset)
            );

            res.json({
                success: true,
                data: {
                    threadId: Number(threadId),
                    messages: messages,
                    count: messages.length,
                    limit: Number(limit),
                    offset: Number(offset)
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取线程消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'GET_MESSAGES_ERROR'
            });
        }
    }

    /**
     * 🔥 POST /api/messages/mark-read - 标记消息为已读
     */
    async markMessagesAsRead(req: Request, res: Response): Promise<void> {
        try {
            const { threadId, messageIds } = req.body;

            if (!threadId || isNaN(Number(threadId))) {
                res.status(400).json({
                    success: false,
                    error: '无效的 threadId',
                    code: 'INVALID_THREAD_ID'
                });
                return;
            }

            console.log(`✅ API请求: 标记消息已读 - 线程 ${threadId}`);

            const success = await this.messageEngine.markMessagesAsRead(
                Number(threadId),
                messageIds
            );

            res.json({
                success: success,
                data: {
                    threadId: Number(threadId),
                    messageIds: messageIds,
                    markedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 标记消息已读API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'MARK_READ_ERROR'
            });
        }
    }

    /**
     * 🔥 GET /api/messages/search - 搜索消息
     */
    async searchMessages(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId, keyword, limit = 20 } = req.query;

            if (!platform || !accountId || !keyword) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountId, keyword',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`🔍 API请求: 搜索消息 - ${keyword}`);

            const results = await this.messageEngine.searchMessages(
                platform as string,
                accountId as string,
                keyword as string,
                Number(limit)
            );

            res.json({
                success: true,
                data: {
                    keyword: keyword,
                    results: results,
                    count: results.length
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 搜索消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'SEARCH_ERROR'
            });
        }
    }

    // ==================== 统计相关API ====================

    /**
     * 🔥 GET /api/messages/statistics - 获取消息统计
     */
    async getMessageStatistics(req: Request, res: Response): Promise<void> {
        try {
            console.log('📊 API请求: 获取消息统计');

            const stats = await this.messageEngine.getMessageStatistics();

            res.json({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取消息统计API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'STATS_ERROR'
            });
        }
    }

    /**
     * 🔥 GET /api/messages/unread-count - 获取未读消息数
     */
    async getUnreadCount(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.query;

            console.log('📊 API请求: 获取未读消息数');

            const count = await this.messageEngine.getUnreadCount(
                platform as string,
                accountId as string
            );

            res.json({
                success: true,
                data: {
                    platform: platform || 'all',
                    accountId: accountId || 'all',
                    unreadCount: count
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取未读数API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'UNREAD_COUNT_ERROR'
            });
        }
    }

    // ==================== 调度管理相关API ====================

    /**
     * 🔥 POST /api/messages/scheduler/start - 启动消息调度
     */
    async startScheduler(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId, tabId, config } = req.body;

            if (!platform || !accountId || !tabId) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountId, tabId',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`⏰ API请求: 启动消息调度 - ${platform}_${accountId}`);

            const success = await this.messageEngine.startMessageScheduler(
                platform,
                accountId,
                tabId,
                config
            );

            res.json({
                success: success,
                data: {
                    platform,
                    accountId,
                    tabId,
                    config: config || { syncInterval: 5 },
                    startedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 启动调度API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'START_SCHEDULER_ERROR'
            });
        }
    }

    /**
     * 🔥 POST /api/messages/scheduler/stop - 停止消息调度
     */
    async stopScheduler(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.body;

            if (!platform || !accountId) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountId',
                    code: 'MISSING_PARAMS'
                });
                return;
            }

            console.log(`⏹️ API请求: 停止消息调度 - ${platform}_${accountId}`);

            const success = this.messageEngine.stopMessageScheduler(platform, accountId);

            res.json({
                success: success,
                data: {
                    platform,
                    accountId,
                    stoppedAt: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 停止调度API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'STOP_SCHEDULER_ERROR'
            });
        }
    }

    /**
     * 🔥 GET /api/messages/scheduler/status - 获取调度状态
     */
    async getSchedulerStatus(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.query;

            if (platform && accountId) {
                // 获取单个调度状态
                const status = this.messageEngine.getScheduleStatus(
                    platform as string,
                    accountId as string
                );

                res.json({
                    success: true,
                    data: status,
                    timestamp: new Date().toISOString()
                });
            } else {
                // 获取所有调度状态
                const statuses = this.messageEngine.getAllScheduleStatuses();

                res.json({
                    success: true,
                    data: {
                        statuses: statuses,
                        total: statuses.length,
                        active: statuses.filter(s => s.isRunning).length
                    },
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ 获取调度状态API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'GET_SCHEDULER_STATUS_ERROR'
            });
        }
    }

    // ==================== 系统管理相关API ====================

    /**
     * 🔥 GET /api/messages/platforms - 获取支持的平台列表
     */
    async getSupportedPlatforms(req: Request, res: Response): Promise<void> {
        try {
            const platforms = this.messageEngine.getSupportedPlatforms();

            res.json({
                success: true,
                data: {
                    platforms: platforms,
                    total: platforms.length
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取支持平台API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'GET_PLATFORMS_ERROR'
            });
        }
    }

    /**
     * 🔥 POST /api/messages/maintenance - 执行系统维护
     */
    async performMaintenance(req: Request, res: Response): Promise<void> {
        try {
            const { 
                cleanupOldMessages = true, 
                daysToKeep = 30, 
                repairDataConsistency = false,
                checkDatabaseHealth = true 
            } = req.body;

            console.log('🔧 API请求: 执行系统维护');

            const results: any = {
                timestamp: new Date().toISOString(),
                tasks: {}
            };

            // 清理旧消息
            if (cleanupOldMessages) {
                const deletedCount = await this.messageEngine.cleanupOldMessages(daysToKeep);
                results.tasks.cleanup = { deletedMessages: deletedCount };
            }

            // 修复数据一致性
            if (repairDataConsistency) {
                const repairResult = await this.messageEngine.repairDataConsistency();
                results.tasks.repair = repairResult;
            }

            // 检查数据库健康
            if (checkDatabaseHealth) {
                const healthResult = await this.messageEngine.getDatabaseHealth();
                results.tasks.health = healthResult;
            }

            res.json({
                success: true,
                data: results,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 系统维护API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'MAINTENANCE_ERROR'
            });
        }
    }

    /**
     * 🔥 GET /api/messages/engine/status - 获取消息引擎状态
     */
    async getEngineStatus(req: Request, res: Response): Promise<void> {
        try {
            const status = this.messageEngine.getEngineStatus();

            res.json({
                success: true,
                data: status,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ 获取引擎状态API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error',
                code: 'GET_ENGINE_STATUS_ERROR'
            });
        }
    }

    // ==================== 生命周期管理 ====================

    /**
     * 🔥 销毁API实例
     */
    async destroy(): Promise<void> {
        try {
            console.log('🧹 销毁 MessageAutomationAPI...');
            
            if (this.messageEngine) {
                await this.messageEngine.destroy();
            }
            
            console.log('✅ MessageAutomationAPI 已销毁');
        } catch (error) {
            console.error('❌ 销毁 MessageAutomationAPI 失败:', error);
        }
    }
}