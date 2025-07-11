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
                    sandbox: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false
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
                // 不等待导航完成，让标签页创建立即返回
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

        webContents.on('did-finish-load', async () => {
            const currentUrl = webContents.getURL();

            // 避免重复日志同一个URL
            if (currentUrl !== lastLoggedUrl) {
                console.log(`📄 Page loaded for ${tab.accountName}: ${currentUrl}`);
                lastLoggedUrl = currentUrl;
            }

            tab.url = currentUrl;
            await this.updateLoginStatus(tab.id);
        });

        webContents.on('did-fail-load', (event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
            // 只记录非重定向的真正错误
            if (errorCode !== -3) {
                console.error(`❌ Page load failed for ${tab.accountName}: ${errorDescription} (${errorCode})`);
                tab.loginStatus = 'logged_out';
            }
            // ERR_ABORTED (-3) 不记录，因为通常是正常的重定向
        });

        webContents.on('page-title-updated', (event: any, title: string) => {
            // 只记录有意义的标题变化
            if (title && title !== 'about:blank' && !title.includes('Loading')) {
                console.log(`📝 Page title: ${title} (${tab.accountName})`);
            }
        });

        // 处理新窗口
        webContents.setWindowOpenHandler(({ url }: { url: string }) => {
            console.log(`🔗 Redirecting popup to current tab for ${tab.accountName}: ${url}`);

            // 在当前标签页中打开链接，不等待完成
            webContents.loadURL(url).catch((error) => {
                console.warn(`⚠️ Failed to load redirected URL for ${tab.accountName}: ${error.message}`);
            });

            return { action: 'deny' };
        });

        // 处理证书错误（开发环境）
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

        // 添加网络状态监听
        webContents.on('did-start-loading', () => {
            console.log(`⏳ Loading started for ${tab.accountName}`);
        });

        webContents.on('did-stop-loading', () => {
            console.log(`✅ Loading completed for ${tab.accountName}`);
        });
    }

    async loadAccountCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            await this.cookieManager.loadCookiesToSession(tab.session, cookieFilePath);
            tab.cookieFile = cookieFilePath;
            console.log(`🍪 Loaded cookies for tab: ${tab.accountName}`);

            // 刷新页面以应用新的Cookie
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

        // 隐藏当前标签页
        if (this.activeTabId && this.activeTabId !== tabId) {
            const currentTab = this.tabs.get(this.activeTabId);
            if (currentTab) {
                this.mainWindow.removeBrowserView(currentTab.browserView);
            }
        }

        // 显示新标签页
        this.mainWindow.setBrowserView(tab.browserView);
        this.updateActiveBrowserViewBounds();

        this.activeTabId = tabId;
        console.log(`🔄 Switched to tab: ${tab.accountName}`);
    }

    private updateActiveBrowserViewBounds(): void {
        if (!this.activeTabId) return;

        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;

        const bounds = this.mainWindow.getBounds();
        const topOffset = 120; // 为标签栏和工具栏留出空间

        tab.browserView.setBounds({
            x: 0,
            y: topOffset,
            width: bounds.width,
            height: bounds.height - topOffset
        });
    }

    async closeTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // 如果是当前活动标签页，先切换到其他标签页
        if (this.activeTabId === tabId) {
            this.mainWindow.removeBrowserView(tab.browserView);
            this.activeTabId = null;

            // 自动切换到下一个标签页
            const remainingTabs = Array.from(this.tabs.keys()).filter(id => id !== tabId);
            if (remainingTabs.length > 0) {
                await this.switchToTab(remainingTabs[0]);
            }
        }

        // 清理资源 - 修复：使用正确的方法关闭webContents
        try {
            // 在新版本Electron中，直接关闭BrowserView
            tab.browserView.webContents.close();
        } catch (error) {
            console.warn('Failed to close webContents:', error);
            // 如果close方法不可用，尝试其他清理方式
            try {
                // 导航到空白页面作为清理
                await tab.browserView.webContents.loadURL('about:blank');
            } catch (navError) {
                console.warn('Failed to navigate to blank page:', navError);
            }
        }

        this.tabs.delete(tabId);
        this.sessionManager.deleteSession(tabId);

        console.log(`🗑️ Closed tab: ${tab.accountName}`);
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

            // 设置更宽松的导航策略
            const webContents = tab.browserView.webContents;

            // 创建导航Promise，但不强制等待完成
            const navigationPromise = new Promise<void>((resolve) => {
                let resolved = false;

                const cleanup = () => {
                    if (resolved) return;
                    resolved = true;
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
                    tab.url = navigationUrl; // 更新URL
                    // 不调用resolve，等待最终页面加载
                };

                const onFailure = (event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
                    cleanup();

                    // 根据错误类型决定如何处理
                    switch (errorCode) {
                        case -3: // ERR_ABORTED - 通常是重定向或用户取消
                            console.log(`ℹ️ Navigation redirected for ${tab.accountName}: ${validatedURL}`);
                            resolve(); // 不算错误
                            break;
                        case -2: // ERR_FAILED - 一般网络错误
                            console.warn(`⚠️ Network error for ${tab.accountName}: ${errorDescription}`);
                            resolve(); // 网络错误也不阻止标签页创建
                            break;
                        case -105: // ERR_NAME_NOT_RESOLVED
                            console.warn(`⚠️ DNS resolution failed for ${tab.accountName}: ${errorDescription}`);
                            resolve();
                            break;
                        default:
                            console.warn(`⚠️ Navigation failed for ${tab.accountName}: ${errorDescription} (${errorCode})`);
                            resolve(); // 所有导航错误都不阻止标签页创建
                    }
                };

                webContents.once('did-finish-load', onLoad);
                webContents.once('did-fail-load', onFailure);
                webContents.on('did-navigate', onNavigate);

                // 较长的超时时间，因为微信登录可能需要较长时间
                setTimeout(() => {
                    cleanup();
                    console.log(`⏱️ Navigation timeout for ${tab.accountName}, but continuing...`);
                    resolve();
                }, 15000); // 15秒超时
            });

            // 开始导航
            await webContents.loadURL(url);

            // 等待导航完成，但任何情况都不抛出错误
            await navigationPromise;

        } catch (error) {
            // 即使 loadURL 失败也只记录警告
            if (error instanceof Error) {
                // 特殊处理常见的微信相关错误
                if (error.message.includes('ERR_ABORTED')) {
                    console.log(`ℹ️ Navigation redirected for ${tab.accountName} (expected for WeChat login)`);
                } else if (error.message.includes('ERR_NETWORK_CHANGED')) {
                    console.log(`ℹ️ Network changed during navigation for ${tab.accountName}`);
                } else {
                    console.warn(`⚠️ Navigation issue for ${tab.accountName}: ${error.message}`);
                }
            } else {
                console.warn(`⚠️ Unknown navigation issue for ${tab.accountName}:`, error);
            }

            // 保存URL，即使导航失败
            tab.url = url;
        }
    }

    private async updateLoginStatus(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            // 添加超时保护
            const loginCheckPromise = tab.browserView.webContents.executeJavaScript(`
            (function() {
              try {
                // 检查是否有用户头像、用户名或登录按钮等元素
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

            // 5秒超时
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Login status check timeout')), 5000);
            });

            const indicators = await Promise.race([loginCheckPromise, timeoutPromise]) as any;

            // 根据指示器判断登录状态
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
}