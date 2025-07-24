import express from 'express';
import cors from 'cors';
import { TabManager } from './TabManager';
import { CreateAccountRequest, ExecuteScriptRequest, NavigateRequest, APIResponse } from '../types';
import * as path from 'path';
import { AutomationEngine } from './automation/AutomationEngine';
import { HeadlessManager } from './HeadlessManager';
import {
    BatchUploadRequest,
} from '../types/pluginInterface';
import { Config } from './config/Config';

export class APIServer {
    private app: express.Application;
    private server: any;
    private automationEngine: AutomationEngine;
    private tabManager: TabManager;  // 🔥 保留 tabManager 用于底层操作
    private headlessManager: HeadlessManager;

    constructor(automationEngine: AutomationEngine, tabManager: TabManager) {
        this.automationEngine = automationEngine;
        this.tabManager = tabManager;  // 🔥 保留 tabManager 引用
        this.headlessManager = HeadlessManager.getInstance();
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`📡 API请求: ${req.method} ${req.path}`);
            next();
        });
    }
    private setupRoutes(): void {
        // 🔥 登录接口 - 对应 Python 的 /login
        this.app.get('/login', this.handleLoginSSE.bind(this));

        // 🔥 视频发布接口 - 对应 Python 的 /postVideo
        this.app.post('/postVideo', this.handlePostVideo.bind(this));

        // 其他现有接口...
        this.setupOtherRoutes();
    }
    private handleLoginSSE(req: express.Request, res: express.Response): void {
        const type = req.query.type as string;
        const id = (req.query.id as string) || `session_${Date.now()}`;

        console.log(`🔐 SSE登录请求: type=${type}, id=${id}`);

        // 验证参数
        if (!type) {
            res.write(`data: 500\n\n`);
            res.end();
            return;
        }

        // 设置SSE响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // 连接断开处理
        req.on('close', () => {
            console.log(`📡 SSE连接断开: ${id}`);
        });

        // 立即启动登录流程
        this.startLoginAndStream(type, id, res);
    }

    private async startLoginAndStream(type: string, id: string, res: express.Response) {
        try {
            // 平台类型映射
            const platformMap: Record<string, string> = {
                '1': 'xiaohongshu',
                '2': 'wechat',
                '3': 'douyin',
                '4': 'kuaishou'
            };

            const platform = platformMap[type];
            if (!platform) {
                res.write(`data: 500\n\n`);
                res.end();
                return;
            }

            console.log(`🚀 启动登录: ${platform}`);
            const loginResult = await this.automationEngine.startLogin(platform, id);

            if (loginResult.success && loginResult.qrCodeUrl) {
                // 发送二维码URL
                res.write(`data: ${loginResult.qrCodeUrl}\n\n`);

                // 监听登录完成 - 需要新的方法
                this.monitorLoginCompletionSSE(id, platform, res);
            } else {
                res.write(`data: 500\n\n`);
                res.end();
            }
        } catch (error) {
            console.error(`❌ 登录启动失败:`, error);
            res.write(`data: 500\n\n`);
            res.end();
        }
    }

    // 新增：专门为SSE的监听方法
    private async monitorLoginCompletionSSE(userId: string, platform: string, res: express.Response): Promise<void> {
        const checkInterval = setInterval(async () => {
            try {
                const loginStatus = this.automationEngine.getLoginStatus(userId);

                if (!loginStatus) {
                    clearInterval(checkInterval);
                    res.write(`data: 500\n\n`);
                    res.end();
                    return;
                }

                if (loginStatus.status === 'completed') {
                    clearInterval(checkInterval);
                    res.write(`data: 200\n\n`);
                    res.end();
                } else if (loginStatus.status === 'failed' || loginStatus.status === 'cancelled') {
                    clearInterval(checkInterval);
                    res.write(`data: 500\n\n`);
                    res.end();
                }

            } catch (error) {
                console.error(`❌ 登录状态检查错误:`, error);
                clearInterval(checkInterval);
                res.write(`data: 500\n\n`);
                res.end();
            }
        }, 2000);

        // 5分钟超时
        setTimeout(() => {
            clearInterval(checkInterval);
            const loginStatus = this.automationEngine.getLoginStatus(userId);
            if (loginStatus && loginStatus.status === 'pending') {
                res.write(`data: 500\n\n`);
                res.end();
            }
        }, 300000);
    }
    /**
     * 🔥 视频发布接口
     * 对应 Python: @app.route('/postVideo', methods=['POST'])
     */
    private async handlePostVideo(req: express.Request, res: express.Response): Promise<void> {
        try {
            const {
                fileList = [],
                accountList = [],
                type: typeVal,
                title,
                tags,
                category,
                enableTimer,
                videosPerDay,
                dailyTimes,
                startDays
            } = req.body;

            console.log(`📤 接收到视频发布请求:`);
            console.log(`   文件数: ${fileList.length}`);
            console.log(`   账号数: ${accountList.length}`);
            console.log(`   平台类型: ${typeVal}`);

            // 验证必要参数
            if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '文件列表不能为空'
                });
                return;
            }

            if (!accountList || !Array.isArray(accountList) || accountList.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '账号列表不能为空'
                });
                return;
            }

            // 平台类型映射
            const platformMap: Record<string, string> = {
                '1': 'xiaohongshu',
                '2': 'wechat',
                '3': 'douyin',
                '4': 'kuaishou'
            };

            const platform = platformMap[typeVal];
            if (!platform) {
                res.status(400).json({
                    success: false,
                    error: `不支持的平台类型: ${typeVal}`
                });
                return;
            }

            // 检查平台是否支持上传
            if (!this.automationEngine.isPlatformSupported(platform)) {
                res.status(400).json({
                    success: false,
                    error: `平台 ${platform} 暂不支持视频上传功能`
                });
                return;
            }

            // 🔥 构造批量上传请求
            const batchRequest: BatchUploadRequest = {
                platform,
                files: fileList,
                accounts: accountList.map((account: any) => ({
                    cookieFile: account.cookieFile || account.filePath,
                    platform: platform,
                    accountName: account.userName || account.accountName,
                    accountId: account.accountId,
                    followersCount: account.followersCount,
                    videosCount: account.videosCount,
                    avatar: account.avatar,
                    bio: account.bio
                })),
                params: {
                    title: title || '默认标题',
                    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
                    category: category === 0 ? undefined : category,
                    enableOriginal: true,
                    addToCollection: false,
                    // 🔥 定时发布相关参数
                    publishDate: enableTimer ? this.calculatePublishDate(videosPerDay, dailyTimes, startDays) : undefined
                }
            };

            // 🔥 执行批量上传
            const uploadResults = await this.automationEngine.batchUpload(batchRequest);

            // 统计结果
            const successCount = uploadResults.filter(r => r.success).length;
            const failedCount = uploadResults.length - successCount;

            console.log(`📊 批量上传完成: 成功 ${successCount}, 失败 ${failedCount}`);

            res.json({
                success: true,
                message: `批量上传完成: 成功 ${successCount}, 失败 ${failedCount}`,
                results: uploadResults,
                summary: {
                    total: uploadResults.length,
                    success: successCount,
                    failed: failedCount,
                    platform: platform
                }
            });

        } catch (error) {
            console.error(`❌ 视频发布接口错误:`, error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : '服务器内部错误'
            });
        }
    }


    /**
     * 🔥 计算发布时间
     * 对应 Python 的定时发布逻辑
     */
    private calculatePublishDate(videosPerDay?: number, dailyTimes?: string[], startDays?: number): Date | undefined {
        if (!videosPerDay || !dailyTimes || !Array.isArray(dailyTimes)) {
            return undefined;
        }

        try {
            const now = new Date();
            const startDate = new Date(now.getTime() + (startDays || 0) * 24 * 60 * 60 * 1000);

            // 使用第一个时间点作为发布时间
            const timeStr = dailyTimes[0] || '09:00';
            const [hours, minutes] = timeStr.split(':').map(Number);

            startDate.setHours(hours, minutes, 0, 0);

            return startDate;
        } catch (error) {
            console.warn(`⚠️ 计算发布时间失败:`, error);
            return undefined;
        }
    }
    private setupOtherRoutes(): void {

        this.app.post('/api/automation/get-account-info', async (req, res) => {
            try {
                const { tabId, platform } = req.body;

                if (!tabId || !platform) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and platform are required'
                    });
                }

                console.log(`🔍 收到账号信息提取请求: Tab ${tabId}, 平台 ${platform}`);

                const accountInfo = await this.automationEngine.getAccountInfo(platform, tabId);

                console.log(`📊 账号信息提取结果:`, accountInfo);
                res.json({
                    success: !!accountInfo,
                    data: accountInfo
                });

            } catch (error) {
                console.error('❌ 提取账号信息失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // 🔥 获取有效账号列表 - 对应 Python 的 /getValidAccounts
        this.app.get('/api/accounts/valid', async (req, res) => {
            try {
                console.log('📋 获取有效账号列表请求');

                // 1. 自动验证过期账号
                const validationSummary = await this.automationEngine.autoValidateExpiredAccounts();

                // 2. 获取所有有效账号
                const validAccounts = await this.automationEngine.getValidAccounts();

                res.json({
                    success: true,
                    data: {
                        validAccounts: validAccounts,
                        totalCount: validAccounts.length,
                        validationSummary: validationSummary,
                        timestamp: new Date().toISOString()
                    }
                });

            } catch (error) {
                console.error('❌ 获取有效账号失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取有效账号失败'
                });
            }
        });

        // 🔥 获取分组账号信息 - 对应 Python 的 /getAccountsWithGroups  
        this.app.get('/api/accounts/groups', async (req, res) => {
            try {
                console.log('📋 获取分组账号信息请求');

                // 通过 AutomationEngine 获取分组账号信息
                const accountsWithGroups = await this.automationEngine.getAccountsWithGroups();

                // 按分组整理数据
                const groupedAccounts = new Map();

                for (const account of accountsWithGroups) {
                    const groupKey = account.groupId || 0; // 0 表示未分组
                    const groupName = account.groupName || '未分组';
                    const groupColor = account.groupColor || '#666666';

                    if (!groupedAccounts.has(groupKey)) {
                        groupedAccounts.set(groupKey, {
                            groupId: groupKey,
                            groupName: groupName,
                            groupColor: groupColor,
                            accounts: [],
                            validCount: 0,
                            totalCount: 0
                        });
                    }

                    const group = groupedAccounts.get(groupKey);
                    group.accounts.push({
                        id: account.id,
                        userName: account.userName,
                        platform: account.platform,
                        platformType: account.type,
                        filePath: account.filePath,
                        status: account.status,
                        isValid: account.status === 1,
                        lastCheckTime: account.lastCheckTime
                    });

                    group.totalCount++;
                    if (account.status === 1) {
                        group.validCount++;
                    }
                }

                // 转换为数组格式
                const result = Array.from(groupedAccounts.values()).sort((a, b) => {
                    // 未分组排在最后
                    if (a.groupId === 0) return 1;
                    if (b.groupId === 0) return -1;
                    return a.groupId - b.groupId;
                });

                res.json({
                    success: true,
                    data: {
                        groups: result,
                        totalGroups: result.length,
                        totalAccounts: accountsWithGroups.length,
                        validAccounts: accountsWithGroups.filter(acc => acc.status === 1).length,
                        timestamp: new Date().toISOString()
                    }
                });

            } catch (error) {
                console.error('❌ 获取分组账号信息失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '获取分组账号信息失败'
                });
            }
        });

        // 🔥 手动批量验证账号
        this.app.post('/api/accounts/validate-batch', async (req, res) => {
            try {
                const { accountIds, platforms } = req.body;

                console.log(`🔍 手动批量验证请求: ${accountIds?.length || 0} 个账号`);

                let accountsToValidate = [];

                if (accountIds && accountIds.length > 0) {
                    // 验证指定ID的账号
                    const allAccounts = await this.automationEngine.getAccountsWithGroups();
                    accountsToValidate = allAccounts.filter(acc => accountIds.includes(acc.id));
                } else if (platforms && platforms.length > 0) {
                    // 验证指定平台的所有账号
                    const allAccounts = await this.automationEngine.getAccountsWithGroups();
                    accountsToValidate = allAccounts.filter(acc => platforms.includes(acc.platform));
                } else {
                    // 验证所有需要验证的账号
                    accountsToValidate = await this.automationEngine.getAccountsNeedingValidation();
                }

                if (accountsToValidate.length === 0) {
                    return res.json({
                        success: true,
                        message: '没有账号需要验证',
                        data: { validatedCount: 0, results: [] }
                    });
                }

                // 通过 AutomationEngine 执行批量验证
                const validationResults = await this.automationEngine.batchValidateAccounts(
                    accountsToValidate.map(account => ({
                        platform: account.platform,
                        accountName: account.userName,
                        cookieFile: path.join(Config.COOKIE_DIR, account.filePath)
                    }))
                );

                const successCount = validationResults.filter(r => r.isValid).length;

                res.json({
                    success: true,
                    message: `批量验证完成: ${successCount}/${accountsToValidate.length} 个账号有效`,
                    data: {
                        validatedCount: accountsToValidate.length,
                        validCount: successCount,
                        invalidCount: accountsToValidate.length - successCount,
                        results: validationResults
                    }
                });

            } catch (error) {
                console.error('❌ 批量验证失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : '批量验证失败'
                });
            }
        });
        // 打开标签页开发者工具
        this.app.post('/api/account/open-devtools', async (req, res) => {
            try {
                const { tabId } = req.body;

                if (!tabId) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId is required'
                    });
                }

                console.log(`🛠️ Opening DevTools for tab: ${tabId}`);
                await this.tabManager.openDevTools(tabId);

                res.json({
                    success: true,
                    data: { tabId, message: 'DevTools window opened' }
                });
            } catch (error) {
                console.error('Error opening DevTools:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 获取API信息
        this.app.get('/api/info', (req, res) => {
            const tabs = this.tabManager.getAllTabs();
            res.json({
                success: true,
                data: {
                    totalTabs: tabs.length,
                    activeTab: this.tabManager.getActiveTab()?.id || null,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    renderer: 'WebContentsView'
                }
            });
        });

        // 创建账号标签页
        this.app.post('/api/account/create', async (req, res) => {
            try {
                const { accountName, platform, cookieFile, initialUrl }: CreateAccountRequest = req.body;

                if (!accountName || !platform) {
                    return res.status(400).json({
                        success: false,
                        error: 'accountName and platform are required'
                    });
                }

                console.log(`📱 Creating account tab: ${accountName} (${platform})`);
                const tabId = await this.tabManager.createAccountTab(accountName, platform, initialUrl);

                if (cookieFile) {
                    console.log(`🍪 Loading cookies from: ${cookieFile}`);
                    await this.tabManager.loadAccountCookies(tabId, cookieFile);
                }

                const response: APIResponse = {
                    success: true,
                    data: { tabId, accountName, platform, initialUrl, renderer: 'WebContentsView' }
                };

                res.json(response);
            } catch (error) {
                console.error('Error creating account tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 切换到指定账号
        this.app.post('/api/account/switch', async (req, res) => {
            try {
                const { tabId } = req.body;

                if (!tabId) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId is required'
                    });
                }

                console.log(`🔄 Switching to tab: ${tabId}`);
                await this.tabManager.switchToTab(tabId);

                res.json({
                    success: true,
                    data: { activeTabId: tabId }
                });
            } catch (error) {
                console.error('Error switching tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        this.app.post('/api/account/add-init-script', async (req, res) => {
            try {
                const { tabId, script } = req.body;

                if (!tabId || !script) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and script are required'
                    });
                }

                await this.tabManager.addInitScript(tabId, script);

                res.json({
                    success: true,
                    data: { tabId }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // 在指定账号标签页执行脚本
        this.app.post('/api/account/execute', async (req, res) => {
            try {
                const { tabId, script }: ExecuteScriptRequest = req.body;

                if (!tabId || !script) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and script are required'
                    });
                }

                console.log(`📜 Executing script in tab: ${tabId}`);
                const result = await this.tabManager.executeScript(tabId, script);

                res.json({
                    success: true,
                    data: result
                });
            } catch (error) {
                console.error('Error executing script:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 导航到指定URL
        this.app.post('/api/account/navigate', async (req, res) => {
            try {
                const { tabId, url }: NavigateRequest = req.body;

                if (!tabId || !url) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and url are required'
                    });
                }

                console.log(`🔗 Navigating tab ${tabId} to: ${url}`);
                await this.tabManager.navigateTab(tabId, url);

                res.json({
                    success: true,
                    data: { tabId, url }
                });
            } catch (error) {
                console.error('Error navigating tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // UI覆盖层管理API
        this.app.post('/api/ui/hide-tab-temporarily', async (req, res) => {
            try {
                await this.tabManager.hideCurrentTabTemporarily();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        this.app.post('/api/ui/show-current-tab', async (req, res) => {
            try {
                await this.tabManager.showCurrentTab();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // 加载Cookie
        this.app.post('/api/account/load-cookies', async (req, res) => {
            try {
                const { tabId, cookieFile } = req.body;

                if (!tabId || !cookieFile) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and cookieFile are required'
                    });
                }

                console.log(`🍪 Loading cookies for tab ${tabId} from: ${cookieFile}`);
                await this.tabManager.loadAccountCookies(tabId, cookieFile);

                res.json({
                    success: true,
                    data: { tabId, cookieFile }
                });
            } catch (error) {
                console.error('Error loading cookies:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 保存Cookie
        this.app.post('/api/account/save-cookies', async (req, res) => {
            try {
                const { tabId, cookieFile } = req.body;

                if (!tabId || !cookieFile) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId and cookieFile are required'
                    });
                }

                console.log(`💾 Saving cookies for tab ${tabId} to: ${cookieFile}`);
                await this.tabManager.saveCookies(tabId, cookieFile);

                res.json({
                    success: true,
                    data: { tabId, cookieFile }
                });
            } catch (error) {
                console.error('Error saving cookies:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });


        this.app.get('/api/account/find-by-cookie', (req, res) => {
            try {
                const { cookieFile } = req.query;

                if (!cookieFile) {
                    return res.status(400).json({
                        success: false,
                        error: 'cookieFile parameter is required'
                    });
                }

                const cookieFileName = require('path').basename(cookieFile as string);
                const tabs = this.tabManager.getAllTabs();

                // 查找匹配的标签页
                const matchingTab = tabs.find(tab => {
                    if (tab.cookieFile) {
                        const tabCookieFileName = require('path').basename(tab.cookieFile);
                        return tabCookieFileName === cookieFileName;
                    }
                    return false;
                });

                if (matchingTab) {
                    res.json({
                        success: true,
                        data: {
                            found: true,
                            tabId: matchingTab.id,
                            accountName: matchingTab.accountName,
                            platform: matchingTab.platform,
                            url: matchingTab.url,
                            loginStatus: matchingTab.loginStatus
                        }
                    });
                } else {
                    res.json({
                        success: true,
                        data: { found: false }
                    });
                }
            } catch (error) {
                console.error('Error finding account by cookie:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // 获取所有账号状态
        this.app.get('/api/accounts', (req, res) => {
            try {
                const accounts = this.tabManager.getAllTabs().map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile,
                    renderer: 'WebContentsView'
                }));

                res.json({
                    success: true,
                    data: accounts
                });
            } catch (error) {
                console.error('Error getting accounts:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });


        this.app.post('/api/account/wait-url-change', async (req, res) => {
            try {
                const { tabId, timeout = 200000 } = req.body;
                if (!tabId) {
                    return res.status(400).json({ success: false, error: 'tabId is required' });
                }

                const changed = await this.tabManager.waitForUrlChange(tabId, timeout);
                res.json({ success: true, data: { urlChanged: changed } });
            } catch (error) {
                res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        });
        // 获取指定账号详情
        this.app.get('/api/account/:tabId', (req, res) => {
            try {
                const { tabId } = req.params;
                const tabs = this.tabManager.getAllTabs();
                const tab = tabs.find(t => t.id === tabId);

                if (!tab) {
                    return res.status(404).json({
                        success: false,
                        error: 'Tab not found'
                    });
                }

                res.json({
                    success: true,
                    data: {
                        id: tab.id,
                        accountName: tab.accountName,
                        platform: tab.platform,
                        loginStatus: tab.loginStatus,
                        url: tab.url,
                        cookieFile: tab.cookieFile,
                        renderer: 'WebContentsView'
                    }
                });
            } catch (error) {
                console.error('Error getting account details:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 关闭标签页
        this.app.post('/api/account/close', async (req, res) => {
            try {
                const { tabId } = req.body;

                if (!tabId) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId is required'
                    });
                }

                console.log(`🗑️ Closing tab: ${tabId}`);
                await this.tabManager.closeTab(tabId);

                res.json({
                    success: true,
                    data: { closedTabId: tabId }
                });
            } catch (error) {
                console.error('Error closing tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 关闭所有标签页
        this.app.post('/api/accounts/close-all', async (req, res) => {
            try {
                const tabs = this.tabManager.getAllTabs();
                const tabIds = tabs.map(tab => tab.id);

                console.log(`🗑️ Closing all ${tabIds.length} tabs`);

                for (const tabId of tabIds) {
                    await this.tabManager.closeTab(tabId);
                }

                res.json({
                    success: true,
                    data: { closedTabs: tabIds.length }
                });
            } catch (error) {
                console.error('Error closing all tabs:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 获取当前活动标签页
        this.app.get('/api/account/active', (req, res) => {
            try {
                const activeTab = this.tabManager.getActiveTab();

                if (activeTab) {
                    res.json({
                        success: true,
                        data: {
                            id: activeTab.id,
                            accountName: activeTab.accountName,
                            platform: activeTab.platform,
                            loginStatus: activeTab.loginStatus,
                            url: activeTab.url,
                            renderer: 'WebContentsView'
                        }
                    });
                } else {
                    res.json({
                        success: true,
                        data: null
                    });
                }
            } catch (error) {
                console.error('Error getting active tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 刷新指定标签页
        this.app.post('/api/account/refresh', async (req, res) => {
            try {
                const { tabId } = req.body;

                if (!tabId) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId is required'
                    });
                }

                console.log(`🔄 Refreshing tab: ${tabId}`);
                const result = await this.tabManager.executeScript(tabId, 'window.location.reload(); true;');

                res.json({
                    success: true,
                    data: { tabId, refreshed: true }
                });
            } catch (error) {
                console.error('Error refreshing tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 获取标签页截图
        this.app.post('/api/account/screenshot', async (req, res) => {
            try {
                const { tabId } = req.body;

                if (!tabId) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId is required'
                    });
                }

                const tabs = this.tabManager.getAllTabs();
                const tab = tabs.find(t => t.id === tabId);

                if (!tab) {
                    return res.status(404).json({
                        success: false,
                        error: 'Tab not found'
                    });
                }

                console.log(`📸 Taking screenshot of tab: ${tabId}`);
                const image = await tab.webContentsView.webContents.capturePage();
                const base64 = image.toDataURL();

                res.json({
                    success: true,
                    data: {
                        tabId,
                        screenshot: base64,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                console.error('Error taking screenshot:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 批量操作接口
        this.app.post('/api/accounts/batch', async (req, res) => {
            try {
                const { operation, tabIds, data } = req.body;

                if (!operation || !tabIds || !Array.isArray(tabIds)) {
                    return res.status(400).json({
                        success: false,
                        error: 'operation and tabIds array are required'
                    });
                }

                console.log(`🔄 Batch operation: ${operation} on ${tabIds.length} tabs`);
                const results = [];

                for (const tabId of tabIds) {
                    try {
                        let result;

                        switch (operation) {
                            case 'execute':
                                if (!data?.script) {
                                    throw new Error('script is required for execute operation');
                                }
                                result = await this.tabManager.executeScript(tabId, data.script);
                                break;

                            case 'navigate':
                                if (!data?.url) {
                                    throw new Error('url is required for navigate operation');
                                }
                                await this.tabManager.navigateTab(tabId, data.url);
                                result = { navigated: true };
                                break;

                            case 'refresh':
                                await this.tabManager.executeScript(tabId, 'window.location.reload(); true;');
                                result = { refreshed: true };
                                break;

                            case 'screenshot':
                                const tabs = this.tabManager.getAllTabs();
                                const tab = tabs.find(t => t.id === tabId);
                                if (tab) {
                                    const image = await tab.webContentsView.webContents.capturePage();
                                    result = { screenshot: image.toDataURL() };
                                } else {
                                    throw new Error('Tab not found');
                                }
                                break;

                            case 'get-title':
                                result = await this.tabManager.executeScript(tabId, 'document.title');
                                break;

                            case 'get-url':
                                result = await this.tabManager.executeScript(tabId, 'window.location.href');
                                break;

                            case 'save-cookies':
                                if (!data?.cookieFile) {
                                    throw new Error('cookieFile is required for save-cookies operation');
                                }
                                await this.tabManager.saveCookies(tabId, data.cookieFile);
                                result = { cookiesSaved: true };
                                break;

                            case 'load-cookies':
                                if (!data?.cookieFile) {
                                    throw new Error('cookieFile is required for load-cookies operation');
                                }
                                await this.tabManager.loadAccountCookies(tabId, data.cookieFile);
                                result = { cookiesLoaded: true };
                                break;

                            default:
                                throw new Error(`Unknown operation: ${operation}`);
                        }

                        results.push({
                            tabId,
                            success: true,
                            data: result
                        });
                    } catch (error) {
                        results.push({
                            tabId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }

                res.json({
                    success: true,
                    data: results
                });
            } catch (error) {
                console.error('Error in batch operation:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 检查标签页状态
        this.app.get('/api/account/:tabId/status', async (req, res) => {
            try {
                const { tabId } = req.params;
                const tabs = this.tabManager.getAllTabs();
                const tab = tabs.find(t => t.id === tabId);

                if (!tab) {
                    return res.status(404).json({
                        success: false,
                        error: 'Tab not found'
                    });
                }

                // 执行状态检查脚本
                const statusInfo = await this.tabManager.executeScript(tabId, `
                    ({
                        url: window.location.href,
                        title: document.title,
                        readyState: document.readyState,
                        userAgent: navigator.userAgent.substring(0, 100),
                        timestamp: new Date().toISOString(),
                        viewport: {
                            width: window.innerWidth,
                            height: window.innerHeight
                        },
                        hasUserAvatar: !!document.querySelector('.avatar, .user-avatar, .profile-avatar'),
                        hasUserName: !!document.querySelector('.username, .user-name, .nickname'),
                        hasLoginButton: !!document.querySelector('.login-btn, .sign-in, .登录'),
                        hasLogoutButton: !!document.querySelector('.logout, .sign-out, .退出')
                    })
                `);

                res.json({
                    success: true,
                    data: {
                        tabId,
                        accountName: tab.accountName,
                        platform: tab.platform,
                        loginStatus: tab.loginStatus,
                        statusInfo,
                        renderer: 'WebContentsView'
                    }
                });
            } catch (error) {
                console.error('Error checking tab status:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 调试接口 - 获取 WebContentsView 边界信息
        this.app.get('/api/debug/bounds', (req, res) => {
            try {
                const tabs = this.tabManager.getAllTabs();
                const activeTab = this.tabManager.getActiveTab();

                const boundsInfo = tabs.map(tab => {
                    try {
                        const bounds = tab.webContentsView.getBounds();
                        return {
                            tabId: tab.id,
                            accountName: tab.accountName,
                            isActive: tab.id === activeTab?.id,
                            bounds: bounds,
                            url: tab.url
                        };
                    } catch (error) {
                        return {
                            tabId: tab.id,
                            accountName: tab.accountName,
                            isActive: tab.id === activeTab?.id,
                            bounds: null,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        };
                    }
                });

                res.json({
                    success: true,
                    data: {
                        totalTabs: tabs.length,
                        activeTabId: activeTab?.id || null,
                        bounds: boundsInfo,
                        renderer: 'WebContentsView'
                    }
                });
            } catch (error) {
                console.error('Error getting bounds info:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 在现有路由后添加文件上传端点
        this.app.post('/api/account/set-file', async (req, res) => {
            try {
                const { tabId, selector, filePath } = req.body;

                if (!tabId || !selector || !filePath) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId, selector and filePath are required'
                    });
                }

                console.log(`📁 Setting file for tab ${tabId}: ${filePath}`);

                // 调用 TabManager 的修复后方法
                const result = await this.tabManager.setFileInput(tabId, selector, filePath);

                res.json({
                    success: true,
                    data: result
                });
            } catch (error) {
                console.error('Error setting file:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // 在 APIServer.ts 中添加
        this.app.post('/api/account/set-files-streaming', async (req, res) => {
            try {
                const { tabId, selector, filePath, options = {} } = req.body;

                console.log(`📥 收到流式上传请求:`);
                console.log(`   tabId: ${tabId}`);
                console.log(`   selector: ${selector}`);
                console.log(`   filePath: ${filePath}`);
                console.log(`   options:`, options);

                const result = await this.tabManager.setInputFilesStreaming(
                    tabId, selector, filePath, options
                );

                res.json({
                    success: result,
                    data: { tabId, selector, filePath, method: 'streaming' }
                });

            } catch (error) {
                console.error(`❌ 流式上传API失败:`, error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 在 APIServer.ts 中添加
        this.app.post('/api/account/set-files-streaming-v2', async (req, res) => {
            try {
                const { tabId, selector, filePath, options = {} } = req.body;

                console.log(`📥 收到V2流式上传请求:`);
                console.log(`   文件: ${path.basename(filePath)}`);

                const result = await this.tabManager.setInputFilesStreamingV2(
                    tabId, selector, filePath, options
                );

                res.json({
                    success: result,
                    data: { tabId, selector, filePath, method: 'streaming-v2' }
                });

            } catch (error) {
                console.error(`❌ V2流式上传API失败:`, error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Playwright 兼容的端点 - 返回简单的 boolean
        this.app.post('/api/account/set-input-files', async (req, res) => {
            try {
                const { tabId, selector, filePath } = req.body;

                if (!tabId || !selector || !filePath) {
                    return res.status(400).json({
                        success: false,
                        error: 'tabId, selector and filePath are required'
                    });
                }

                console.log(`📁 Setting input files for tab ${tabId}: ${filePath}`);

                // 使用 Playwright 兼容的方法
                const result = await this.tabManager.setInputFiles(tabId, selector, filePath);

                res.json({
                    success: result,
                    data: { tabId, selector, filePath, method: 'setInputFiles' }
                });
            } catch (error) {
                console.error('Error setting input files:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        this.app.get('/api/accounts-with-display', (req, res) => {
            try {
                const accounts = this.tabManager.getAllTabsWithDisplayInfo().map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    displayTitle: tab.displayTitle,
                    displayFavicon: tab.displayFavicon,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile,
                    renderer: 'WebContentsView'
                }));

                res.json({
                    success: true,
                    data: accounts
                });
            } catch (error) {
                console.error('Error getting accounts with display info:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 获取单个标签页的显示信息
        this.app.get('/api/account/:tabId/display', (req, res) => {
            try {
                const { tabId } = req.params;
                const displayInfo = this.tabManager.getTabDisplayInfo(tabId);

                if (displayInfo) {
                    res.json({
                        success: true,
                        data: {
                            tabId: tabId,
                            title: displayInfo.title,
                            favicon: displayInfo.favicon,
                            timestamp: new Date().toISOString()
                        }
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Tab not found'
                    });
                }
            } catch (error) {
                console.error('Error getting tab display info:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        this.app.get('/api/mode/status', (req, res) => {
            try {
                const mode = this.headlessManager.getMode();
                res.json({
                    success: true,
                    data: {
                        mode: mode,
                        isHidden: this.headlessManager.isHidden(),
                        isHeadless: this.headlessManager.isHeadlessMode(),
                        isBackground: this.headlessManager.isBackgroundMode(),
                        canShow: mode !== 'headless',
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get browser mode'
                });
            }
        });

        // 切换浏览器模式
        this.app.post('/api/mode/switch', async (req, res) => {
            try {
                const { mode: newMode } = req.body;

                // 严格的模式验证
                const validModes = ['normal', 'headless', 'background'] as const;
                type BrowserMode = typeof validModes[number];

                if (!validModes.includes(newMode as BrowserMode)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid mode: ${newMode}. Valid modes are: ${validModes.join(', ')}`
                    });
                }

                const currentMode = this.headlessManager.getMode();

                if (currentMode === newMode) {
                    return res.json({
                        success: true,
                        message: `Already in ${newMode} mode`,
                        data: {
                            currentMode: currentMode,
                            previousMode: currentMode
                        }
                    });
                }

                // 执行模式切换
                await this.headlessManager.switchMode(newMode as BrowserMode);

                res.json({
                    success: true,
                    message: `Successfully switched from ${currentMode} to ${newMode} mode`,
                    data: {
                        currentMode: this.headlessManager.getMode(),
                        previousMode: currentMode
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to switch browser mode'
                });
            }
        });

        // 显示主窗口
        this.app.post('/api/window/show', (req, res) => {
            try {
                const mode = this.headlessManager.getMode();

                if (mode === 'headless') {
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot show window in headless mode'
                    });
                }

                this.headlessManager.showWindow();
                res.json({
                    success: true,
                    message: 'Window shown successfully'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to show window'
                });
            }
        });

        // 隐藏主窗口
        this.app.post('/api/window/hide', (req, res) => {
            try {
                this.headlessManager.hideWindow();
                res.json({
                    success: true,
                    message: 'Window hidden successfully'
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to hide window'
                });
            }
        });

        // 临时显示窗口（仅 background 模式）
        this.app.post('/api/window/show-temp', async (req, res) => {
            try {
                const { duration = 5000 } = req.body;
                const mode = this.headlessManager.getMode();

                // 验证参数
                if (typeof duration !== 'number' || duration <= 0 || duration > 300000) {
                    return res.status(400).json({
                        success: false,
                        error: 'Duration must be a positive number between 1 and 300000 (5 minutes)'
                    });
                }

                if (mode === 'headless') {
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot show window temporarily in headless mode'
                    });
                }

                if (mode === 'normal') {
                    return res.status(400).json({
                        success: false,
                        error: 'Window is already visible in normal mode'
                    });
                }

                await this.headlessManager.showTemporarily(duration);

                res.json({
                    success: true,
                    message: `Window will be shown temporarily for ${duration}ms`,
                    data: {
                        duration: duration,
                        mode: mode
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to show window temporarily'
                });
            }
        });

        // 获取窗口状态
        this.app.get('/api/window/status', (req, res) => {
            try {
                const mode = this.headlessManager.getMode();

                res.json({
                    success: true,
                    data: {
                        mode: mode,
                        isHidden: this.headlessManager.isHidden(),
                        canShow: mode !== 'headless',
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get window status'
                });
            }
        });

        // 获取支持的模式列表
        this.app.get('/api/modes', (req, res) => {
            try {
                res.json({
                    success: true,
                    data: {
                        modes: [
                            {
                                name: 'normal',
                                description: '正常模式 - 窗口可见，完整功能',
                                features: ['visible', 'interactive', 'devtools', 'menu']
                            },
                            {
                                name: 'background',
                                description: '后台模式 - 窗口隐藏但可调出',
                                features: ['hidden', 'api-controllable', 'tray-icon', 'switchable']
                            },
                            {
                                name: 'headless',
                                description: '无界面模式 - 完全隐藏，纯API',
                                features: ['completely-hidden', 'api-only', 'server-mode']
                            }
                        ],
                        currentMode: this.headlessManager.getMode()
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get supported modes'
                });
            }
        });

        // 🔥 新增：Headless Tab 管理 API

        // 获取所有 headless tabs
        this.app.get('/api/tabs/headless', (req, res) => {
            try {
                const headlessTabs = this.tabManager.getHeadlessTabs();
                const serializableTabs = headlessTabs.map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile,
                    isHeadless: tab.isHeadless,
                    isVisible: tab.isVisible
                }));

                res.json({
                    success: true,
                    data: {
                        tabs: serializableTabs,
                        count: serializableTabs.length
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get headless tabs'
                });
            }
        });

        // 获取所有可见 tabs
        this.app.get('/api/tabs/visible', (req, res) => {
            try {
                const visibleTabs = this.tabManager.getVisibleTabs();
                const serializableTabs = visibleTabs.map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile,
                    isHeadless: tab.isHeadless,
                    isVisible: tab.isVisible
                }));

                res.json({
                    success: true,
                    data: {
                        tabs: serializableTabs,
                        count: serializableTabs.length
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get visible tabs'
                });
            }
        });

        // 创建 headless tab
        this.app.post('/api/tabs/create-headless', async (req, res) => {
            try {
                const { accountName, platform, initialUrl } = req.body;

                if (!accountName || !platform) {
                    return res.status(400).json({
                        success: false,
                        error: 'accountName and platform are required'
                    });
                }

                const tabId = await this.tabManager.createHeadlessTab(accountName, platform, initialUrl);

                res.json({
                    success: true,
                    data: {
                        tabId: tabId,
                        accountName: accountName,
                        platform: platform,
                        mode: 'headless'
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to create headless tab'
                });
            }
        });

        // 将 tab 转为可见
        this.app.post('/api/tabs/:tabId/make-visible', async (req, res) => {
            try {
                const { tabId } = req.params;

                await this.tabManager.makeTabVisible(tabId);

                res.json({
                    success: true,
                    message: `Tab ${tabId} is now visible`
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to make tab visible'
                });
            }
        });

        // 将 tab 转为 headless
        this.app.post('/api/tabs/:tabId/make-headless', async (req, res) => {
            try {
                const { tabId } = req.params;

                await this.tabManager.makeTabHeadless(tabId);

                res.json({
                    success: true,
                    message: `Tab ${tabId} is now headless`
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to make tab headless'
                });
            }
        });
        // 调试接口 - 强制更新边界
        this.app.post('/api/debug/update-bounds', (req, res) => {
            try {
                this.tabManager.forceUpdateAllBounds();

                res.json({
                    success: true,
                    message: 'Bounds updated for all tabs',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error updating bounds:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 健康检查接口
        this.app.get('/health', (req, res) => {
            const systemStatus = this.automationEngine.getSystemStatus();
            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                system: systemStatus
            });
        });

        // 获取支持的平台
        this.app.get('/platforms', (req, res) => {
            const platformInfo = this.automationEngine.getPlatformSupportInfo();
            res.json({
                success: true,
                platforms: platformInfo
            });
        });

        // 404 处理
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: `接口不存在: ${req.method} ${req.path}`
            });
        });
    }
    start(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(port, () => {
                    const mode = this.headlessManager.getMode();
                    console.log(`🚀 API Server running on http://localhost:${port}`);
                    console.log(`📱 Current mode: ${mode}`);
                    console.log(`📋 Available endpoints:`);
                    console.log(`   GET  /api/health - Health check`);
                    console.log(`   GET  /api/info - Server info`);
                    console.log(`   GET  /api/mode/status - Get current mode`);
                    console.log(`   POST /api/mode/switch - Switch mode`);
                    console.log(`   POST /api/window/show - Show window`);
                    console.log(`   POST /api/window/hide - Hide window`);
                    console.log(`   POST /api/window/show-temp - Show temporarily`);
                    console.log(`   GET  /api/window/status - Get window status`);
                    console.log(`   GET  /api/modes - Get supported modes`);
                    console.log(`   GET  /api/tabs/headless - Get headless tabs`);
                    console.log(`   GET  /api/tabs/visible - Get visible tabs`);
                    console.log(`   POST /api/tabs/create-headless - Create headless tab`);
                    console.log(`   GET  /api/accounts - Get all accounts`);
                    console.log(`   GET  /api/account/:tabId - Get account details`);
                    console.log(`   GET  /api/account/active - Get active account`);
                    console.log(`   POST /api/account/create - Create account tab`);
                    console.log(`   POST /api/account/switch - Switch to tab`);
                    console.log(`   POST /api/account/execute - Execute script`);
                    console.log(`   POST /api/account/navigate - Navigate tab`);
                    console.log(`   POST /api/account/refresh - Refresh tab`);
                    console.log(`   POST /api/account/screenshot - Take screenshot`);
                    console.log(`   POST /api/account/load-cookies - Load cookies`);
                    console.log(`   POST /api/account/save-cookies - Save cookies`);
                    console.log(`   POST /api/account/close - Close tab`);
                    console.log(`   POST /api/accounts/close-all - Close all tabs`);
                    console.log(`   POST /api/account/set-file - Set file to input`);
                    console.log(`   POST /api/accounts/batch - Batch operations`);
                    console.log(`   GET  /api/account/:tabId/status - Check tab status`);
                    console.log(`   GET  /api/debug/bounds - Debug bounds info`);
                    console.log(`   POST /api/debug/update-bounds - Update bounds`);
                    console.log(`🔄 Using WebContentsView renderer`);
                    resolve();
                });

                this.server.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`❌ Port ${port} is already in use`);
                    } else {
                        console.error('❌ API Server error:', error);
                    }
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('🛑 API Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    isRunning(): boolean {
        return !!this.server && this.server.listening;
    }
}