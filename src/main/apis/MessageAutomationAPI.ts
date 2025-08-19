// src/main/apis/MessageAutomationAPI.ts - MVP简化版本

import { Request, Response } from 'express';
import * as express from 'express';
import { MessageAutomationEngine } from '../automation/MessageAutomationEngine';
import { TabManager } from '../TabManager';
import { AutomationEngine } from '../automation/AutomationEngine';

export class MessageAutomationAPI {
    private router = express.Router();
    private messageEngine: MessageAutomationEngine;

    constructor(tabManager: TabManager, automationEngine: AutomationEngine) {
        this.messageEngine = new MessageAutomationEngine(tabManager, automationEngine);
        this.setupRoutes();
        console.log('✅ MessageAutomationAPI MVP 已初始化');
    }

    /**
     * 🔥 MVP路由设置 - 只包含核心功能
     */
    private setupRoutes(): void {
        // 🔥 事件驱动监听管理
        this.router.post('/monitoring/start', this.handleStartMonitoring.bind(this));
        this.router.post('/monitoring/stop', this.handleStopMonitoring.bind(this));
        this.router.post('/monitoring/batch-start', this.handleStartBatchMonitoring.bind(this));
        this.router.post('/monitoring/stop-all', this.handleStopAllMonitoring.bind(this));
        this.router.get('/monitoring/status', this.handleGetMonitoringStatus.bind(this));

        // 🔥 手动消息同步（原有功能保留）
        this.router.post('/sync', this.handleSyncMessages.bind(this));
        this.router.post('/sync/batch', this.handleBatchSyncMessages.bind(this));

        // 🔥 消息发送
        this.router.post('/send', this.handleSendMessage.bind(this));
        this.router.post('/send/batch', this.handleBatchSendMessages.bind(this));

        // 🔥 消息查询
        this.router.get('/threads', this.handleGetMessageThreads.bind(this));
        this.router.get('/threads/:threadId/messages', this.handleGetThreadMessages.bind(this));
        this.router.post('/messages/mark-read', this.handleMarkMessagesAsRead.bind(this));

        // 🔥 搜索和统计
        this.router.get('/search', this.handleSearchMessages.bind(this));
        this.router.get('/statistics', this.handleGetMessageStatistics.bind(this));
        this.router.get('/unread-count', this.handleGetUnreadCount.bind(this));

        // 🔥 系统状态
        this.router.get('/engine/status', this.handleGetEngineStatus.bind(this));
        this.router.get('/platforms', this.handleGetSupportedPlatforms.bind(this));
    }

    // ==================== 事件驱动监听API ====================

    /**
     * 🔥 启动消息监听
     */
    async handleStartMonitoring(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId, cookieFile, headless = true } = req.body;

            if (!platform || !accountId || !cookieFile) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountId, cookieFile'
                });
                return;
            }

            console.log(`🚀 API: 启动消息监听 - ${platform}_${accountId}`);

            const result = await this.messageEngine.startMessageMonitoring({
                platform, accountId, cookieFile, headless
            });

            res.json({
                success: result.success,
                data: {
                    accountKey: `${platform}_${accountId}`,
                    tabId: result.tabId,
                    startedAt: new Date().toISOString(),
                    ...(result.error && { error: result.error })
                }
            });

        } catch (error) {
            console.error('❌ 启动监听API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 停止消息监听
     */
    async handleStopMonitoring(req: Request, res: Response): Promise<void> {
        try {
            const { accountKey } = req.body;

            if (!accountKey) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: accountKey'
                });
                return;
            }

            console.log(`⏹️ API: 停止消息监听 - ${accountKey}`);

            const success = await this.messageEngine.stopMessageMonitoring(accountKey);

            res.json({
                success: success,
                data: {
                    accountKey,
                    stoppedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('❌ 停止监听API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 批量启动监听
     */
    async handleStartBatchMonitoring(req: Request, res: Response): Promise<void> {
        try {
            const { accounts } = req.body;

            if (!accounts || !Array.isArray(accounts)) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: accounts (array)'
                });
                return;
            }

            console.log(`🚀 API: 批量启动监听 - ${accounts.length} 个账号`);

            const result = await this.messageEngine.startBatchMonitoring(accounts);

            res.json({
                success: result.success > 0,
                data: result
            });

        } catch (error) {
            console.error('❌ 批量启动监听API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 停止所有监听
     */
    async handleStopAllMonitoring(req: Request, res: Response): Promise<void> {
        try {
            console.log('⏹️ API: 停止所有监听');

            const result = await this.messageEngine.stopAllMonitoring();

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('❌ 停止所有监听API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取监听状态
     */
    async handleGetMonitoringStatus(req: Request, res: Response): Promise<void> {
        try {
            const status = this.messageEngine.getActiveMonitoringStatus();

            res.json({
                success: true,
                data: {
                    monitoring: status,
                    summary: {
                        total: status.length,
                        active: status.filter(s => s.isMonitoring).length
                    }
                }
            });

        } catch (error) {
            console.error('❌ 获取监听状态API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    // ==================== 原有核心API（保持不变） ====================

    /**
     * 🔥 手动同步消息
     */
    async handleSyncMessages(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountName, cookieFile } = req.body;

            if (!platform || !accountName || !cookieFile) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountName, cookieFile'
                });
                return;
            }

            console.log(`🔄 API: 同步消息 - ${platform} ${accountName}`);

            const result = await this.messageEngine.syncPlatformMessages(
                platform,
                accountName,
                cookieFile
            );

            res.json({
                success: result.success,
                data: result
            });

        } catch (error) {
            console.error('❌ 同步消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 批量同步消息
     */
    async handleBatchSyncMessages(req: Request, res: Response): Promise<void> {
        try {
            const request = req.body;

            if (!request.platform || !request.accounts) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accounts'
                });
                return;
            }

            console.log(`🔄 API: 批量同步消息 - ${request.platform} ${request.accounts.length} 个账号`);

            const result = await this.messageEngine.batchSyncMessages(request);

            res.json({
                success: result.success,
                data: result
            });

        } catch (error) {
            console.error('❌ 批量同步消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 发送消息
     */
    async handleSendMessage(req: Request, res: Response): Promise<void> {
        try {
            const { platform, tabId, userName, content, type, accountId } = req.body;

            if (!platform || !tabId || !userName || !content || !type) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, tabId, userName, content, type'
                });
                return;
            }

            console.log(`📤 API: 发送消息 - ${platform} ${userName} (${type})`);

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
                data: result
            });

        } catch (error) {
            console.error('❌ 发送消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 批量发送消息
     */
    async handleBatchSendMessages(req: Request, res: Response): Promise<void> {
        try {
            const request = req.body;

            if (!request.platform || !request.messages) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, messages'
                });
                return;
            }

            console.log(`📤 API: 批量发送消息 - ${request.platform} ${request.messages.length} 条`);

            const result = await this.messageEngine.batchSendMessages(request);

            res.json({
                success: result.success,
                data: result
            });

        } catch (error) {
            console.error('❌ 批量发送消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取消息线程
     */
    async handleGetMessageThreads(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.query;

            console.log('📋 API: 获取消息线程');

            const threads = await this.messageEngine.getAllMessageThreads(
                platform as string,
                accountId as string
            );

            res.json({
                success: true,
                data: {
                    threads: threads,
                    total: threads.length
                }
            });

        } catch (error) {
            console.error('❌ 获取消息线程API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取线程消息
     */
    async handleGetThreadMessages(req: Request, res: Response): Promise<void> {
        try {
            const { threadId } = req.params;
            const { limit = 50, offset = 0 } = req.query;

            if (!threadId || isNaN(Number(threadId))) {
                res.status(400).json({
                    success: false,
                    error: '无效的 threadId'
                });
                return;
            }

            console.log(`📋 API: 获取线程消息 - ${threadId}`);

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
                    count: messages.length
                }
            });

        } catch (error) {
            console.error('❌ 获取线程消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 标记消息已读
     */
    async handleMarkMessagesAsRead(req: Request, res: Response): Promise<void> {
        try {
            const { threadId, messageIds } = req.body;

            if (!threadId || isNaN(Number(threadId))) {
                res.status(400).json({
                    success: false,
                    error: '无效的 threadId'
                });
                return;
            }

            console.log(`✅ API: 标记消息已读 - 线程 ${threadId}`);

            const success = await this.messageEngine.markMessagesAsRead(
                Number(threadId),
                messageIds
            );

            res.json({
                success: success,
                data: {
                    threadId: Number(threadId),
                    messageIds: messageIds
                }
            });

        } catch (error) {
            console.error('❌ 标记消息已读API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 搜索消息
     */
    async handleSearchMessages(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId, keyword, limit = 20 } = req.query;

            if (!platform || !accountId || !keyword) {
                res.status(400).json({
                    success: false,
                    error: '缺少必需参数: platform, accountId, keyword'
                });
                return;
            }

            console.log(`🔍 API: 搜索消息 - ${keyword}`);

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
                }
            });

        } catch (error) {
            console.error('❌ 搜索消息API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取消息统计
     */
    async handleGetMessageStatistics(req: Request, res: Response): Promise<void> {
        try {
            console.log('📊 API: 获取消息统计');

            const stats = await this.messageEngine.getMessageStatistics();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('❌ 获取消息统计API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取未读消息数
     */
    async handleGetUnreadCount(req: Request, res: Response): Promise<void> {
        try {
            const { platform, accountId } = req.query;

            console.log('📊 API: 获取未读消息数');

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
                }
            });

        } catch (error) {
            console.error('❌ 获取未读数API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取引擎状态
     */
    async handleGetEngineStatus(req: Request, res: Response): Promise<void> {
        try {
            const status = this.messageEngine.getEngineStatus();

            res.json({
                success: true,
                data: status
            });

        } catch (error) {
            console.error('❌ 获取引擎状态API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取支持的平台
     */
    async handleGetSupportedPlatforms(req: Request, res: Response): Promise<void> {
        try {
            const platforms = this.messageEngine.getSupportedPlatforms();

            res.json({
                success: true,
                data: {
                    platforms: platforms,
                    total: platforms.length
                }
            });

        } catch (error) {
            console.error('❌ 获取支持平台API失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 获取路由器实例
     */
    getRouter(): express.Router {
        return this.router;
    }

}