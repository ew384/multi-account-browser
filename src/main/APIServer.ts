import express from 'express';
import cors from 'cors';
import { TabManager } from './TabManager';
import { CreateAccountRequest, ExecuteScriptRequest, NavigateRequest, APIResponse } from '../types';

export class APIServer {
    private app: express.Application;
    private tabManager: TabManager;
    private server: any;
    private port: number;

    constructor(tabManager: TabManager, port: number = 3000) {
        this.app = express();
        this.tabManager = tabManager;
        this.port = port;
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        // 请求日志中间件
        this.app.use((req, res, next) => {
            console.log(`🌐 API ${req.method} ${req.path} - ${new Date().toLocaleTimeString()}`);
            next();
        });

        // 错误处理中间件
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('API Error:', err);
            res.status(500).json({
                success: false,
                error: err instanceof Error ? err.message : 'Internal Server Error'
            });
        });
    }

    private setupRoutes(): void {
        // 健康检查
        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                message: 'Multi-Account Browser API is running',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
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
                    memory: process.memoryUsage()
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
                    data: { tabId, accountName, platform, initialUrl }
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

        // 获取所有账号状态
        this.app.get('/api/accounts', (req, res) => {
            try {
                const accounts = this.tabManager.getAllTabs().map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile
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
                        cookieFile: tab.cookieFile
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
                            url: activeTab.url
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
                const image = await tab.browserView.webContents.capturePage();
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

        // 404 处理
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'API endpoint not found'
            });
        });
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`🚀 API Server running on http://localhost:${this.port}`);
                    console.log(`📋 Available endpoints:`);
                    console.log(`   GET  /api/health - Health check`);
                    console.log(`   GET  /api/accounts - Get all accounts`);
                    console.log(`   POST /api/account/create - Create account tab`);
                    console.log(`   POST /api/account/switch - Switch to tab`);
                    console.log(`   POST /api/account/execute - Execute script`);
                    console.log(`   POST /api/account/navigate - Navigate tab`);
                    resolve();
                });

                this.server.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`❌ Port ${this.port} is already in use`);
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

    getPort(): number {
        return this.port;
    }

    isRunning(): boolean {
        return !!this.server && this.server.listening;
    }
}