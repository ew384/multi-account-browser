import express from 'express';
import cors from 'cors';
import { TabManager } from './TabManager';
import { CreateAccountRequest, ExecuteScriptRequest, NavigateRequest, APIResponse } from '../types';
import * as path from 'path';
import { AutomationEngine } from './automation/AutomationEngine';
import { HeadlessManager } from './HeadlessManager';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { SocialAutomationAPI } from './apis/SocialAutomationAPI';
import { MessageAutomationAPI } from './apis/MessageAutomationAPI';

export class APIServer {
    private app: express.Application;
    private server: any;
    private httpServer: any; // 🔥 新增
    private io: SocketIOServer; // 🔥 新增
    private automationEngine: AutomationEngine;
    private tabManager: TabManager;  // 🔥 保留 tabManager 用于底层操作
    private headlessManager: HeadlessManager;
    private socialAPI: SocialAutomationAPI;
    private messageAPI: MessageAutomationAPI;
    private uploadProgressClients: Map<number, Set<express.Response>> = new Map();
    private urlChangedNotified: Map<string, boolean> = new Map();
    constructor(automationEngine: AutomationEngine, tabManager: TabManager) {
        this.automationEngine = automationEngine;
        this.tabManager = tabManager;
        this.headlessManager = HeadlessManager.getInstance();
        this.socialAPI = new SocialAutomationAPI(automationEngine);
        this.messageAPI = new MessageAutomationAPI(tabManager,automationEngine);
        // 🔥 设置全局进度通知器
        global.uploadProgressNotifier = this.notifyUploadProgress.bind(this);
        this.app = express();
        this.httpServer = createServer(this.app);
        // 🔥 新增：初始化Socket.IO
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        // 🔥 新增：设置WebSocket事件
        this.setupWebSocket();
        
        // 🔥 关键：将WebSocket实例传给MessageEngine
        this.messageAPI.setWebSocketServer(this.io);

        this.setupMiddleware();
        this.setupRoutes();
    }
    // 🔥 新增：设置WebSocket事件处理
    private setupWebSocket(): void {
        this.io.on('connection', (socket) => {
            console.log('🔌 前端WebSocket已连接:', socket.id);

            // 发送当前监听状态给新连接的客户端
            try {
                const messageEngine = this.messageAPI.getMessageEngine();
                const status = messageEngine.getActiveMonitoringStatus();
                socket.emit('monitoring-status', status);
            } catch (error) {
                console.warn('⚠️ 发送初始监听状态失败:', error);
            }

            // 客户端断开处理
            socket.on('disconnect', () => {
                console.log('🔌 前端WebSocket已断开:', socket.id);
            });
        });

        console.log('✅ WebSocket事件监听器已设置');
    }

    private setupMiddleware(): void {
        this.app.use(cors({
            origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        const multer = require('multer');
        const upload = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: 1024 * 1024 * 1024 * 4 } // 4GB限制
        });
        this.app.use('/upload*', upload.single('file'));

        // 请求日志
        this.app.use((req, res, next) => {
            console.log(`📡 API请求: ${req.method} ${req.path}`);
            next();
        });
    }
    private setupRoutes(): void {
        this.app.use('/', this.socialAPI.getRouter());

        // 🔥 第二优先级：消息自动化API路由
        this.setupMessageRoutes();

        // 🔥 第三优先级：特殊处理的API（SSE登录）
        this.setupSpecialRoutes();

        // 🔥 第四优先级：系统级API和Tab管理API
        this.setupSystemAndTabRoutes();
    }
    private setupMessageRoutes(): void {
        console.log('🔌 设置消息自动化API路由...');
        this.app.use('/api/message-automation', this.messageAPI.getRouter());
        console.log('✅ 消息自动化API路由设置完成');
    }
    private setupSpecialRoutes(): void {
        // 🔥 SSE登录接口（需要特殊流处理，保留在APIServer）
        this.app.get('/login', this.handleLoginSSE.bind(this));
        // 🔥 新增：上传进度SSE接口
        this.app.get('/api/upload-progress/:recordId', this.handleUploadProgressSSE.bind(this));

    }

    // 🔥 新增：上传进度SSE处理
    private handleUploadProgressSSE(req: express.Request, res: express.Response): void {
        const recordId = parseInt(req.params.recordId);
        
        if (!recordId || isNaN(recordId)) {
            res.status(400).json({ error: 'Invalid recordId' });
            return;
        }

        console.log(`📡 建立上传进度SSE连接: recordId=${recordId}`);

        // 设置SSE响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // 添加到客户端集合
        if (!this.uploadProgressClients.has(recordId)) {
            this.uploadProgressClients.set(recordId, new Set());
        }
        this.uploadProgressClients.get(recordId)!.add(res);

        // 发送当前内存中的状态
        try {
            const currentProgress = this.automationEngine.getUploadProgress(recordId);
            if (currentProgress.length > 0) {
                res.write(`data: ${JSON.stringify({ 
                    type: 'initial', 
                    data: currentProgress 
                })}\n\n`);
                console.log(`📤 发送初始进度数据: ${currentProgress.length} 条记录`);
            }
        } catch (error) {
            console.error('❌ 获取初始进度数据失败:', error);
        }

        // 连接断开处理
        req.on('close', () => {
            console.log(`📡 上传进度SSE连接断开: recordId=${recordId}`);
            const clients = this.uploadProgressClients.get(recordId);
            if (clients) {
                clients.delete(res);
                if (clients.size === 0) {
                    this.uploadProgressClients.delete(recordId);
                }
            }
        });

        // 发送心跳保持连接
        const heartbeat = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
            } catch (error) {
                clearInterval(heartbeat);
                const clients = this.uploadProgressClients.get(recordId);
                if (clients) {
                    clients.delete(res);
                }
            }
        }, 30000); // 30秒心跳

        req.on('close', () => {
            clearInterval(heartbeat);
        });
    }

    // 🔥 新增：推送进度更新
    notifyUploadProgress(recordId: number, progressData: any): void {
        const clients = this.uploadProgressClients.get(recordId);
        if (!clients || clients.size === 0) {
            return; // 没有客户端连接，直接返回
        }

        const message = `data: ${JSON.stringify({ 
            type: 'progress', 
            data: progressData 
        })}\n\n`;

        console.log(`📤 推送进度更新: recordId=${recordId}, 客户端数=${clients.size}, 账号=${progressData.accountName}`);

        // 遍历所有客户端推送
        const deadClients = new Set<express.Response>();
        
        clients.forEach(client => {
            try {
                client.write(message);
            } catch (error) {
                console.error('📡 SSE推送失败，标记移除客户端:', error);
                deadClients.add(client);
            }
        });

        // 清理失效的客户端连接
        deadClients.forEach(client => {
            clients.delete(client);
        });

        if (clients.size === 0) {
            this.uploadProgressClients.delete(recordId);
        }
    }

    private handleLoginSSE(req: express.Request, res: express.Response): void {
        const type = req.query.type as string;
        const id = (req.query.id as string) || `session_${Date.now()}`;
        const mode = req.query.mode as string;
        const accountId = req.query.accountId as string;
        
        console.log(`🔐 SSE登录请求: type=${type}, id=${id}, mode=${mode}, accountId=${accountId}`);

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

        // 立即启动登录流程（现在包含完整的监听逻辑）
        this.startLoginAndStream(type, id, res, mode, accountId);
    }

    private async startLoginAndStream(
        type: string, 
        id: string, 
        res: express.Response, 
        mode?: string, 
        accountId?: string
    ): Promise<void> {
        // 🔥 添加连接状态检查
        console.log(`🔍 startLoginAndStream 开始:`, {
            type, id, mode, accountId,
            urlChangedNotified: this.urlChangedNotified.has(id),
            timestamp: new Date().toISOString()
        });
        let isConnected = true;
        // 🔥 清理可能存在的旧状态
        if (this.urlChangedNotified.has(id)) {
            console.log(`🧹 清理 ${id} 的旧 urlChangedNotified 状态`);
            this.urlChangedNotified.delete(id);
        }
        
        // 🔥 监听客户端断开
        res.req.on('close', () => {
            console.log(`📡 SSE客户端断开连接: ${id}`);
            isConnected = false;
        });
        
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

            console.log(`🚀 启动登录: ${platform}${mode === 'recover' ? ' (恢复模式)' : ''}`);
            const loginOptions = mode === 'recover' && accountId ? {
                isRecover: true,
                accountId: parseInt(accountId)
            } : undefined;
            const loginResult = await this.automationEngine.startLogin(platform, id, loginOptions);
            if (loginResult.success && loginResult.qrCodeUrl) {
                // 发送二维码URL
                res.write(`data: ${loginResult.qrCodeUrl}\n\n`);

                // 🔥 直接在这里监听登录完成，不调用其他方法
                const checkInterval = setInterval(() => {
                    // 检查连接状态
                    if (!isConnected) {
                        clearInterval(checkInterval);
                        return;
                    }

                    try {
                        const loginStatus = this.automationEngine.getLoginStatus(id);
                        if (!loginStatus) {
                            clearInterval(checkInterval);
                            this.urlChangedNotified.delete(id); // 🔥 清理标记
                            if (isConnected) {
                                res.write(`data: 500\n\n`);
                                res.end();
                            }
                            return;
                        }
                        // 🔥 URL跳转成功，只发送一次 url_changed
                        if (!this.urlChangedNotified.get(id) && loginStatus.status === 'processing') {
                            res.write(`data: url_changed\n\n`);
                            console.log(`📡 SSE发送URL跳转状态: ${id}`);
                            this.urlChangedNotified.set(id, true);
                        }
                        // 🔥 处理完成，断开连接
                        else if (loginStatus.status === 'completed') {
                            clearInterval(checkInterval);
                            this.urlChangedNotified.delete(id); // 🔥 清理标记
                            if (isConnected) {
                                res.write(`data: 200\n\n`);
                                res.end();
                                console.log(`📡 SSE发送完成状态并断开: ${id}`);
                            }
                        } 
                        // 🔥 处理失败，断开连接
                        else if (loginStatus.status === 'failed' || loginStatus.status === 'cancelled') {
                            clearInterval(checkInterval);
                            this.urlChangedNotified.delete(id); // 🔥 清理标记
                            if (isConnected) {
                                res.write(`data: 500\n\n`);
                                res.end();
                            }
                        }
                    } catch (error) {
                        console.error(`❌ 登录状态检查错误:`, error);
                        clearInterval(checkInterval);
                        this.urlChangedNotified.delete(id); // 🔥 清理标记
                        if (isConnected) {
                            res.write(`data: 500\n\n`);
                            res.end();
                        }
                    }
                }, 2000);

                // 5分钟超时
                setTimeout(() => {
                    clearInterval(checkInterval);
                    this.urlChangedNotified.delete(id); // 🔥 清理标记
                    if (isConnected && !res.headersSent) {
                        res.write(`data: 500\n\n`);
                        res.end();
                    }
                }, 300000);
            } else {
                res.write(`data: 500\n\n`);
                res.end();
            }
        } catch (error) {
            console.error(`❌ 登录启动失败:`, error);
            this.urlChangedNotified.delete(id); // 🔥 清理标记
            if (isConnected) {
                res.write(`data: 500\n\n`);
                res.end();
            }
        }
    }

    private setupSystemAndTabRoutes(): void {
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

        this.app.post('/api/account/create', async (req, res) => {
            try {
                const { accountName, platform, cookieFile, initialUrl, headless = false }: CreateAccountRequest = req.body;

                if (!platform) {
                    return res.status(400).json({
                        success: false,
                        error: 'platform is required'
                    });
                }

                // 🔥 根据是否有cookieFile决定使用哪个方法
                let tabId: string;
                
                if (cookieFile) {
                    // 🔥 有cookieFile时，使用修复后的createAccountTab（先Cookie后导航）
                    console.log(`📱 Creating account tab with cookie: ${accountName || path.basename(cookieFile)} (${platform})`);
                    
                    const targetUrl = initialUrl || this.getDefaultUrl(platform);
                    tabId = await this.tabManager.createAccountTab(cookieFile, platform, targetUrl, headless);
                    
                    console.log(`✅ Account tab created with cookie: ${tabId}`);
                    
                } else {
                    // 🔥 没有cookieFile时，使用原来的createTab方法
                    if (!accountName) {
                        return res.status(400).json({
                            success: false,
                            error: 'accountName is required when cookieFile is not provided'
                        });
                    }
                    
                    console.log(`📱 Creating basic tab: ${accountName} (${platform})`);
                    tabId = await this.tabManager.createTab(accountName, platform, initialUrl, headless);
                    console.log(`✅ Basic tab created: ${tabId}`);
                }

                // 🔥 构建响应数据
                const tab = this.tabManager.getAllTabs().find(t => t.id === tabId);
                
                const response: APIResponse = {
                    success: true,
                    data: { 
                        tabId, 
                        accountName: tab?.accountName || accountName || 'Unknown',
                        platform, 
                        initialUrl: tab?.url || initialUrl,
                        cookieFile,
                        headless,
                        renderer: 'WebContentsView',
                        method: cookieFile ? 'createAccountTab' : 'createTab'
                    }
                };

                res.json(response);
                
            } catch (error) {
                console.error('❌ Error creating account tab:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    details: {
                        timestamp: new Date().toISOString(),
                        method: 'POST /api/account/create'
                    }
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
    private getDefaultUrl(platform: string): string {
        const defaultUrls: Record<string, string> = {
            'xiaohongshu': 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
            'wechat': 'https://channels.weixin.qq.com/platform',
            'douyin': 'https://creator.douyin.com/',
            'kuaishou': 'https://cp.kuaishou.com/'
        };
        
        return defaultUrls[platform] || 'about:blank';
    }
    start(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // 使用httpServer而不是app
                this.server = this.httpServer.listen(port, async () => {
                    const mode = this.headlessManager.getMode();
                    console.log(`🚀 API Server running on http://localhost:${port}`);
                    console.log(`🔌 WebSocket Server running on ws://localhost:${port}`);
                    console.log(`📱 Current mode: ${mode}`);

                    try {
                        await this.messageAPI.getMessageEngine().initialize();
                        console.log('✅ 消息引擎基础初始化完成');
                    } catch (initError) {
                        console.error('❌ 消息引擎初始化失败:', initError);
                    }
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

    // 🔥 新增：获取WebSocket实例的方法
    getWebSocketServer(): SocketIOServer {
        return this.io;
    }

    // 🔥 修改stop方法
    async stop(): Promise<void> {
        return new Promise(async (resolve) => {
            try {
                console.log('🛑 正在停止API服务器...');
                
                // 关闭WebSocket连接
                if (this.io) {
                    this.io.close();
                    console.log('🔌 WebSocket服务器已关闭');
                }
                
                // 🔥 新增：关闭所有SSE连接
                console.log('🔌 关闭SSE连接...');
                for (const [recordId, clients] of this.uploadProgressClients.entries()) {
                    console.log(`📡 关闭recordId=${recordId}的${clients.size}个SSE连接`);
                    clients.forEach(client => {
                        try {
                            client.write(`data: ${JSON.stringify({ type: 'server_shutdown' })}\n\n`);
                            client.end();
                        } catch (error) {
                            // 忽略关闭时的错误
                        }
                    });
                }
                this.uploadProgressClients.clear();
                this.urlChangedNotified.clear();
                // 🔥 新增：清理全局通知器
                global.uploadProgressNotifier = undefined;
                console.log('✅ SSE连接已清理');

                // 保持原有逻辑：然后停止HTTP服务器
                if (this.server) {
                    this.server.close(() => {
                        console.log('🛑 API Server stopped');
                        resolve();
                    });
                } else {
                    resolve();
                }
            } catch (error) {
                console.error('❌ 停止API服务器时出错:', error);
                resolve(); // 即使出错也要resolve，避免阻塞
            }
        });
    }
    getMessageAPI(): MessageAutomationAPI {
        return this.messageAPI;
    }


    isRunning(): boolean {
        return !!this.server && this.server.listening;
    }
}