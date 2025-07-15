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
                version: '2.0.0', // 版本号提升表示支持 WebContentsView
                renderer: 'WebContentsView' // 标识使用的渲染器
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

        // 404 处理
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'API endpoint not found',
                renderer: 'WebContentsView'
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
                    console.log(`   GET  /api/info - Server info`);
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