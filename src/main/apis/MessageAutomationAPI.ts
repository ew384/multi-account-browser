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
        this.messageEngine = new MessageAutomationEngine(tabManager);
        this.setupRoutes();
        console.log('✅ MessageAutomationAPI MVP 已初始化');
    }
    // 🔥 新增：获取MessageEngine实例的方法
    getMessageEngine(): MessageAutomationEngine {
        return this.messageEngine;
    }

    // 🔥 新增：设置WebSocket服务器（从APIServer调用）
    setWebSocketServer(io: any): void {
        this.messageEngine.setWebSocketServer(io);
    }
    /**
     * 🔥 MVP路由设置 - 只包含核心功能
     */
    private setupRoutes(): void {
        // 🔥 事件驱动监听管理
        this.router.post('/monitoring/start', this.handleStartMonitoring.bind(this));
        this.router.post('/monitoring/stop', this.handleStopMonitoring.bind(this));
        this.router.post('/monitoring/stop-all', this.handleStopAllMonitoring.bind(this));
        this.router.get('/monitoring/status', this.handleGetMonitoringStatus.bind(this));
        this.router.post('/monitoring/batch-start', this.handleStartBatchMonitoring.bind(this));

        this.router.get('/accounts', this.handleGetAccounts.bind(this));

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
     * 🔥 新增：获取可监听账号信息
     */
    async handleGetAccounts(req: Request, res: Response): Promise<void> {
        try {
            console.log('📡 API: 获取可监听账号信息');

            // 🔥 通过messageEngine获取账号信息
            const result = await this.messageEngine.getAvailableAccountsForMonitoring();

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('❌ 获取账号信息API失败:', error);
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


    async handleStartBatchMonitoring(req: Request, res: Response): Promise<void> {
        try {
            let { 
                accounts,
                withSync = true,
                syncOptions = {}
            } = req.body;

            // 🔥 步骤1: 处理自动发现模式 (保持不变)
            let mode = 'manual';
            if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
                mode = 'auto-discovery';
                console.log('🔍 自动发现模式：获取所有可监听账号');
                
                const accountsInfo = await this.messageEngine.getAvailableAccountsForMonitoring();
                const candidateAccounts = accountsInfo.accounts.filter(acc => acc.canMonitor);
                
                if (candidateAccounts.length === 0) {
                    res.json({
                        success: true,
                        data: {
                            mode: 'auto-discovery',
                            message: '没有发现可监听的账号',
                            discovery: accountsInfo.summary,
                            monitoring: { success: 0, failed: 0, results: [] }
                        }
                    });
                    return;
                }
                
                accounts = candidateAccounts.map(account => ({
                    platform: account.platformKey,
                    accountId: account.userName,
                    cookieFile: account.cookieFile,
                    headless: true
                }));
            }

            console.log(`📊 账号统计: 总计 ${accounts.length}, 可监听 ${accounts.length}`);

            // 🔥 步骤2: 前置过滤已在监听的账号
            const { toStart, alreadyMonitoring } = this.filterAccountsForMonitoring(accounts);
            
            console.log(`📋 监听状态过滤结果:`);
            console.log(`   需要启动: ${toStart.length} 个`);
            console.log(`   已在监听: ${alreadyMonitoring.length} 个`);
            
            // 🔥 如果全部已在监听，直接返回成功
            if (toStart.length === 0) {
                console.log(`✅ 所有账号已在监听中，无需重复启动`);
                
                const response = {
                    success: true,
                    data: {
                        mode: mode,
                        workflow: withSync ? 'validate_sync_monitor' : 'validate_monitor',
                        monitoring: {
                            results: alreadyMonitoring.map(account => ({
                                accountKey: `${account.platform}_${account.accountId}`,
                                success: true,
                                reason: 'already_monitoring',
                                message: `账号 ${account.platform}_${account.accountId} 已在监听中`,
                                tabId: this.messageEngine.getMonitoringTabId(`${account.platform}_${account.accountId}`)
                            })),
                            summary: {
                                successCount: alreadyMonitoring.length,
                                failedCount: 0,
                                validationFailedCount: 0,
                                total: accounts.length
                            }
                        },
                        summary: {
                            totalAccounts: accounts.length,
                            monitoringSuccess: alreadyMonitoring.length,
                            monitoringFailed: 0,
                            validationFailed: 0,
                            syncExecuted: withSync
                        }
                    }
                };
                
                res.json(response);
                return;
            }

            // 🔥 步骤3: 只对需要启动的账号进行监听
            let monitoringResults;
            if (toStart.length > 0) {
                console.log(`🚀 开始批量启动监听: ${toStart.length} 个账号`);
                
                monitoringResults = await this.messageEngine.startBatchMonitoring(toStart, {
                    withSync,
                    syncOptions: {
                        intelligentSync: true,
                        forceSync: false,
                        timeout: 30000,
                        ...syncOptions
                    }
                });
            } else {
                // 没有需要启动的账号
                monitoringResults = {
                    results: [],
                    summary: {
                        successCount: 0,
                        failedCount: 0,
                        validationFailedCount: 0,
                        total: 0
                    }
                };
            }

            // 🔥 步骤4: 合并已监听账号的结果
            const allResults = [
                ...monitoringResults.results,
                ...alreadyMonitoring.map(account => ({
                    accountKey: `${account.platform}_${account.accountId}`,
                    success: true,
                    reason: 'already_monitoring',
                    message: `账号 ${account.platform}_${account.accountId} 已在监听中`,
                    tabId: this.messageEngine.getMonitoringTabId(`${account.platform}_${account.accountId}`)
                }))
            ];

            const totalSuccess = monitoringResults.summary.successCount + alreadyMonitoring.length;

            // 🔥 步骤5: 构建最终响应
            const response = {
                success: totalSuccess > 0,
                data: {
                    mode: mode,
                    workflow: withSync ? 'validate_sync_monitor' : 'validate_monitor',
                    monitoring: {
                        results: allResults,
                        summary: {
                            successCount: totalSuccess,
                            failedCount: monitoringResults.summary.failedCount,
                            validationFailedCount: monitoringResults.summary.validationFailedCount,
                            total: accounts.length
                        }
                    },
                    summary: {
                        totalAccounts: accounts.length,
                        monitoringSuccess: totalSuccess,
                        monitoringFailed: monitoringResults.summary.failedCount,
                        validationFailed: monitoringResults.summary.validationFailedCount,
                        syncExecuted: withSync
                    }
                }
            };

            res.json(response);

        } catch (error) {
            console.error('❌ 批量启动监听失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'unknown error'
            });
        }
    }

    /**
     * 🔥 新增：过滤账号监听状态
     */
    private filterAccountsForMonitoring(accounts: any[]): {
        toStart: any[];
        alreadyMonitoring: any[];
    } {
        const toStart: any[] = [];
        const alreadyMonitoring: any[] = [];

        for (const account of accounts) {
            const accountKey = `${account.platform}_${account.accountId}`;
            
            if (this.messageEngine.isAccountMonitoring(accountKey)) {
                console.log(`✅ 账号已在监听: ${accountKey}`);
                alreadyMonitoring.push(account);
            } else {
                console.log(`📝 账号需要启动: ${accountKey}`);
                toStart.push(account);
            }
        }

        return { toStart, alreadyMonitoring };
    }

    /**
     * 🔥 简化的单个账号启动监听
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

            console.log(`🚀 API: 启动单个账号监听 - ${platform}_${accountId}`);

            // 🔥 调用Engine方法（不包含同步）
            const result = await this.messageEngine.startMessageMonitoring({
                platform, accountId, cookieFile, headless
            });

            res.json({
                success: result.success,
                data: result
            });

        } catch (error) {
            console.error('❌ 启动单个监听API失败:', error);
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
            let { platform, tabId, userName, content, type, accountId } = req.body;

            // 🔥 强制查找逻辑（用于测试）
            if (accountId) {
                const accountKey = `${platform}_${accountId}`;
                const foundTabId = this.messageEngine.getMonitoringTabId(accountKey);
                console.log(`🔍 查找TabId结果: ${accountKey} -> ${foundTabId}`);
                
                if (foundTabId) {
                    tabId = foundTabId;
                    console.log(`✅ 使用监听TabId: ${tabId}`);
                } else {
                    console.log(`❌ 未找到监听TabId，当前监听状态:`, this.messageEngine.getActiveMonitoringStatus());
                }
            }
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