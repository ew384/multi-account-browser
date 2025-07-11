import { BrowserView, BrowserWindow, Session } from 'electron';
import { SessionManager } from './SessionManager';
import { CookieManager } from './CookieManager';
import { AccountTab } from '../types';

export class TabManager {
    private tabs: Map<string, AccountTab> = new Map();
    private activeTabId: string | null = null;
    private mainWindow: BrowserWindow;
    private sessionManager: SessionManager;
    private cookieManager: CookieManager;

    // 添加窗口布局常量
    private readonly HEADER_HEIGHT = 60;
    private readonly TAB_BAR_HEIGHT = 48;
    private readonly TOP_OFFSET = 108; // 60px header + 48px tab-bar

    constructor(mainWindow: BrowserWindow, sessionManager: SessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
        this.cookieManager = new CookieManager();
        this.setupWindowEvents();
    }

    private setupWindowEvents(): void {
        this.mainWindow.on('resize', () => {
            this.updateActiveBrowserViewBounds();
        });

        // 监听窗口状态变化
        this.mainWindow.on('maximize', () => {
            setTimeout(() => this.updateActiveBrowserViewBounds(), 100);
        });

        this.mainWindow.on('unmaximize', () => {
            setTimeout(() => this.updateActiveBrowserViewBounds(), 100);
        });

        // 监听窗口获得焦点事件
        this.mainWindow.on('focus', () => {
            if (this.activeTabId) {
                const tab = this.tabs.get(this.activeTabId);
                if (tab && tab.browserView) {
                    tab.browserView.webContents.focus();
                }
            }
        });
    }

    async createAccountTab(accountName: string, platform: string, initialUrl?: string): Promise<string> {
        const timestamp = Date.now();
        const tabId = `${platform}-${accountName.replace(/[^a-zA-Z0-9]/g, '_')}-${timestamp}`;

        try {
            console.log(`🚀 Initializing tab for ${accountName} on ${platform}...`);

            const session = this.sessionManager.createIsolatedSession(tabId);

            const browserView = new BrowserView({
                webPreferences: {
                    session: session,
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false, // 改为false，沙盒模式会影响性能
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    backgroundThrottling: false,
                    v8CacheOptions: 'bypassHeatCheck',
                    plugins: false
                }
            });

            const tab: AccountTab = {
                id: tabId,
                accountName: accountName,
                platform: platform,
                session: session,
                browserView: browserView,
                loginStatus: 'unknown',
                url: initialUrl || `https://channels.weixin.qq.com`
            };

            this.tabs.set(tabId, tab);
            this.setupBrowserViewEvents(tab);

            console.log(`✅ Tab created successfully: ${accountName} (${tabId})`);

            // 如果有初始URL，开始导航（非阻塞）
            if (initialUrl) {
                console.log(`🔗 Starting initial navigation for ${accountName}...`);
                setImmediate(() => {
                    this.navigateTab(tabId, initialUrl).catch((error) => {
                        console.warn(`⚠️ Initial navigation warning for ${accountName}: ${error.message}`);
                    });
                });
            }

            return tabId;

        } catch (error) {
            console.error(`❌ Failed to create tab for ${accountName}:`, error);

            // 清理已创建的资源
            if (this.tabs.has(tabId)) {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    try {
                        // 确保从主窗口移除BrowserView
                        this.mainWindow.removeBrowserView(tab.browserView);
                        tab.browserView.webContents.close();
                    } catch (cleanupError) {
                        console.warn('Failed to cleanup browser view:', cleanupError);
                    }
                }
                this.tabs.delete(tabId);
            }
            this.sessionManager.deleteSession(tabId);
            throw error;
        }
    }

    private setupBrowserViewEvents(tab: AccountTab): void {
        const webContents = tab.browserView.webContents;
        let lastLoggedUrl = '';

        // 防止BrowserView影响主窗口
        webContents.on('before-input-event', (event, input) => {
            // 阻止某些可能影响主窗口的快捷键
            if (input.control || input.meta) {
                if (['w', 't', 'n', 'shift+t'].includes(input.key.toLowerCase())) {
                    event.preventDefault();
                }
            }
        });

        webContents.on('did-finish-load', async () => {
            const currentUrl = webContents.getURL();

            if (currentUrl !== lastLoggedUrl) {
                console.log(`📄 Page loaded for ${tab.accountName}: ${currentUrl}`);
                lastLoggedUrl = currentUrl;
            }

            tab.url = currentUrl;
            await this.updateLoginStatus(tab.id);
        });

        webContents.on('did-fail-load', (event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
            if (errorCode !== -3) {
                console.error(`❌ Page load failed for ${tab.accountName}: ${errorDescription} (${errorCode})`);
                tab.loginStatus = 'logged_out';
            }
        });

        webContents.on('page-title-updated', (event: any, title: string) => {
            if (title && title !== 'about:blank' && !title.includes('Loading')) {
                console.log(`📝 Page title: ${title} (${tab.accountName})`);
            }
        });

        // 处理新窗口 - 防止弹出窗口影响主界面
        webContents.setWindowOpenHandler(({ url }: { url: string }) => {
            console.log(`🔗 Redirecting popup to current tab for ${tab.accountName}: ${url}`);
            webContents.loadURL(url).catch((error) => {
                console.warn(`⚠️ Failed to load redirected URL for ${tab.accountName}: ${error.message}`);
            });
            return { action: 'deny' };
        });

        // 处理证书错误
        webContents.on('certificate-error', (event, url, error, certificate, callback) => {
            if (process.env.NODE_ENV === 'development') {
                console.log(`🔒 Ignoring certificate error for ${tab.accountName}: ${error}`);
                event.preventDefault();
                callback(true);
            } else {
                console.warn(`🔒 Certificate error for ${tab.accountName}: ${error}`);
                callback(false);
            }
        });

        webContents.on('did-start-loading', () => {
            console.log(`⏳ Loading started for ${tab.accountName}`);
        });

        webContents.on('did-stop-loading', () => {
            console.log(`✅ Loading completed for ${tab.accountName}`);
        });

        // 防止页面劫持焦点
        webContents.on('focus', () => {
            // 确保主窗口保持响应
            if (this.mainWindow && !this.mainWindow.isFocused()) {
                this.mainWindow.focus();
            }
        });

        // 设置用户代理
        webContents.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
    }

    async loadAccountCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            await this.cookieManager.loadCookiesToSession(tab.session, cookieFilePath);
            tab.cookieFile = cookieFilePath;
            console.log(`🍪 Loaded cookies for tab: ${tab.accountName}`);

            if (tab.browserView.webContents.getURL()) {
                await tab.browserView.webContents.reload();
            }
        } catch (error) {
            console.error(`❌ Failed to load cookies for tab ${tab.accountName}:`, error);
            throw error;
        }
    }

    async switchToTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            // 隐藏当前标签页
            if (this.activeTabId && this.activeTabId !== tabId) {
                const currentTab = this.tabs.get(this.activeTabId);
                if (currentTab) {
                    this.mainWindow.removeBrowserView(currentTab.browserView);
                    console.log(`🔄 Removed previous tab from view: ${currentTab.accountName}`);
                }
            }

            // 显示新标签页
            this.mainWindow.setBrowserView(tab.browserView);
            this.updateActiveBrowserViewBounds();

            this.activeTabId = tabId;
            console.log(`🔄 Switched to tab: ${tab.accountName}`);

            // 确保BrowserView获得焦点
            setTimeout(() => {
                if (tab.browserView && tab.browserView.webContents) {
                    tab.browserView.webContents.focus();
                }
            }, 100);

        } catch (error) {
            console.error(`❌ Failed to switch to tab ${tabId}:`, error);
            throw error;
        }
    }

    private updateActiveBrowserViewBounds(): void {
        if (!this.activeTabId) {
            console.log('📐 No active tab to update bounds');
            return;
        }

        const tab = this.tabs.get(this.activeTabId);
        if (!tab) {
            console.log('📐 Active tab not found');
            return;
        }

        try {
            const windowBounds = this.mainWindow.getContentBounds();

            // 计算BrowserView应该占用的区域
            const browserViewBounds = {
                x: 0,
                y: 108, // 固定值：60 + 48
                width: windowBounds.width,
                height: Math.max(0, windowBounds.height - 108)
            };

            console.log(`📐 Setting BrowserView bounds for ${tab.accountName}:`, browserViewBounds);
            console.log(`📐 Window content bounds:`, windowBounds);

            tab.browserView.setBounds(browserViewBounds);

            // 验证边界设置
            setTimeout(() => {
                try {
                    const actualBounds = tab.browserView.getBounds();
                    console.log(`📐 Actual BrowserView bounds:`, actualBounds);

                    // 检查是否有重叠问题
                    if (actualBounds.y < this.TOP_OFFSET) {
                        console.warn(`⚠️ BrowserView overlapping header! Adjusting...`);
                        tab.browserView.setBounds({
                            ...actualBounds,
                            y: this.TOP_OFFSET,
                            height: Math.max(0, actualBounds.height - (this.TOP_OFFSET - actualBounds.y))
                        });
                    }
                } catch (error) {
                    console.warn('Failed to verify bounds:', error);
                }
            }, 50);

        } catch (error) {
            console.error(`❌ Failed to update BrowserView bounds for ${tab.accountName}:`, error);
        }
    }

    async closeTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            // 如果是当前活动标签页，先移除显示
            if (this.activeTabId === tabId) {
                this.mainWindow.removeBrowserView(tab.browserView);
                this.activeTabId = null;

                // 自动切换到下一个标签页
                const remainingTabs = Array.from(this.tabs.keys()).filter(id => id !== tabId);
                if (remainingTabs.length > 0) {
                    await this.switchToTab(remainingTabs[0]);
                }
            }

            // 清理资源
            try {
                tab.browserView.webContents.close();
            } catch (error) {
                console.warn('Failed to close webContents:', error);
                try {
                    await tab.browserView.webContents.loadURL('about:blank');
                } catch (navError) {
                    console.warn('Failed to navigate to blank page:', navError);
                }
            }

            this.tabs.delete(tabId);
            this.sessionManager.deleteSession(tabId);

            console.log(`🗑️ Closed tab: ${tab.accountName}`);
        } catch (error) {
            console.error(`❌ Failed to close tab ${tabId}:`, error);
            throw error;
        }
    }

    async executeScript(tabId: string, script: string): Promise<any> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            const result = await tab.browserView.webContents.executeJavaScript(script);
            console.log(`📜 Executed script in tab ${tab.accountName}`);
            return result;
        } catch (error) {
            console.error(`❌ Script execution failed in tab ${tab.accountName}:`, error);
            throw error;
        }
    }

    async navigateTab(tabId: string, url: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            tab.url = url;
            console.log(`🔗 Starting navigation for ${tab.accountName} to: ${url}`);

            const webContents = tab.browserView.webContents;

            // 预加载优化
            webContents.setZoomFactor(1.0);

            const navigationPromise = new Promise<void>((resolve) => {
                let resolved = false;
                let loadingTimer: NodeJS.Timeout;

                const cleanup = () => {
                    if (resolved) return;
                    resolved = true;
                    if (loadingTimer) clearTimeout(loadingTimer);
                    webContents.removeListener('did-finish-load', onLoad);
                    webContents.removeListener('did-fail-load', onFailure);
                    webContents.removeListener('did-navigate', onNavigate);
                };

                const onLoad = () => {
                    cleanup();
                    console.log(`✅ Navigation completed for ${tab.accountName}: ${webContents.getURL()}`);
                    resolve();
                };

                const onNavigate = (event: any, navigationUrl: string) => {
                    console.log(`🔄 Navigation redirect for ${tab.accountName}: ${navigationUrl}`);
                    tab.url = navigationUrl;
                    // 重置定时器
                    if (loadingTimer) clearTimeout(loadingTimer);
                    loadingTimer = setTimeout(() => {
                        cleanup();
                        console.log(`⏱️ Navigation completed after redirect for ${tab.accountName}`);
                        resolve();
                    }, 8000); // 重定向后再等8秒
                };

                const onFailure = (event: any, errorCode: number, errorDescription: string) => {
                    cleanup();
                    console.log(`ℹ️ Navigation handled for ${tab.accountName}: ${errorDescription} (${errorCode})`);
                    resolve(); // 不抛错，继续执行
                };

                webContents.once('did-finish-load', onLoad);
                webContents.once('did-fail-load', onFailure);
                webContents.on('did-navigate', onNavigate);

                // 减少超时时间，但增加智能判断
                loadingTimer = setTimeout(() => {
                    cleanup();
                    console.log(`⏱️ Navigation timeout for ${tab.accountName}, continuing...`);
                    resolve();
                }, 10000); // 减少到10秒
            });

            await webContents.loadURL(url);
            await navigationPromise;

        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('ERR_ABORTED')) {
                    console.log(`ℹ️ Navigation redirected for ${tab.accountName} (expected for login flows)`);
                } else if (error.message.includes('ERR_NETWORK_CHANGED')) {
                    console.log(`ℹ️ Network changed during navigation for ${tab.accountName}`);
                } else {
                    console.warn(`⚠️ Navigation issue for ${tab.accountName}: ${error.message}`);
                }
            } else {
                console.warn(`⚠️ Unknown navigation issue for ${tab.accountName}:`, error);
            }

            tab.url = url;
        }
    }

    private async updateLoginStatus(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            const loginCheckPromise = tab.browserView.webContents.executeJavaScript(`
            (function() {
              try {
                const indicators = {
                  hasUserAvatar: !!document.querySelector('.avatar, .user-avatar, .profile-avatar'),
                  hasUserName: !!document.querySelector('.username, .user-name, .nickname'),
                  hasLoginButton: !!document.querySelector('.login-btn, .sign-in, .登录'),
                  hasLogoutButton: !!document.querySelector('.logout, .sign-out, .退出'),
                  currentUrl: window.location.href,
                  title: document.title
                };
                return indicators;
              } catch (e) {
                return {
                  hasUserAvatar: false,
                  hasUserName: false,
                  hasLoginButton: false,
                  hasLogoutButton: false,
                  currentUrl: window.location.href,
                  title: document.title,
                  error: e.message
                };
              }
            })()
          `);

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Login status check timeout')), 5000);
            });

            const indicators = await Promise.race([loginCheckPromise, timeoutPromise]) as any;

            if (indicators.hasUserAvatar || indicators.hasUserName || indicators.hasLogoutButton) {
                tab.loginStatus = 'logged_in';
            } else if (indicators.hasLoginButton) {
                tab.loginStatus = 'logged_out';
            } else {
                tab.loginStatus = 'unknown';
            }

            console.log(`🔍 Login status for ${tab.accountName}: ${tab.loginStatus}`);

        } catch (error) {
            console.warn(`⚠️ Failed to check login status for ${tab.accountName}:`, error instanceof Error ? error.message : 'Unknown error');
            tab.loginStatus = 'unknown';
        }
    }

    getAllTabs(): AccountTab[] {
        return Array.from(this.tabs.values());
    }

    getActiveTab(): AccountTab | null {
        if (!this.activeTabId) return null;
        return this.tabs.get(this.activeTabId) || null;
    }

    async saveCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        await this.cookieManager.saveCookiesFromSession(tab.session, cookieFilePath);
        tab.cookieFile = cookieFilePath;
    }

    // 添加调试方法
    debugBrowserViewBounds(): void {
        console.log('🐛 Debug: Current BrowserView bounds');
        console.log(`🐛 Window bounds:`, this.mainWindow.getContentBounds());
        console.log(`🐛 Header height: ${this.HEADER_HEIGHT}px`);
        console.log(`🐛 Tab bar height: ${this.TAB_BAR_HEIGHT}px`);
        console.log(`🐛 Top offset: ${this.TOP_OFFSET}px`);

        if (this.activeTabId) {
            const tab = this.tabs.get(this.activeTabId);
            if (tab) {
                try {
                    const bounds = tab.browserView.getBounds();
                    console.log(`🐛 Active BrowserView bounds:`, bounds);
                } catch (error) {
                    console.log(`🐛 Failed to get BrowserView bounds:`, error);
                }
            }
        }
    }

    // 强制重新设置所有BrowserView边界
    forceUpdateAllBounds(): void {
        console.log('🔧 Force updating all BrowserView bounds');
        if (this.activeTabId) {
            this.updateActiveBrowserViewBounds();
        }
    }
}