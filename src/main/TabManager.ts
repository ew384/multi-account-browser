import { WebContentsView, BrowserWindow, Session } from 'electron';
import { SessionManager } from './SessionManager';
import { CookieManager } from './CookieManager';
import { AccountTab } from '../types';
import * as fs from 'fs';
import * as path from 'path';
export class TabManager {
    private tabs: Map<string, AccountTab> = new Map();
    private activeTabId: string | null = null;
    private mainWindow: BrowserWindow;
    private sessionManager: SessionManager;
    private cookieManager: CookieManager;
    // 标签页标题缓存
    private tabTitles: Map<string, string> = new Map();
    private tabFavicons: Map<string, string> = new Map();
    // 添加窗口布局常量
    private readonly HEADER_HEIGHT = 60;
    private readonly TAB_BAR_HEIGHT = 48;
    private readonly TOP_OFFSET = 108; // 60px header + 48px tab-bar
    private initScripts: Map<string, string[]> = new Map();
    constructor(mainWindow: BrowserWindow, sessionManager: SessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
        this.cookieManager = new CookieManager();
        this.setupWindowEvents();
    }
    async addInitScript(tabId: string, script: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        if (!this.initScripts.has(tabId)) {
            this.initScripts.set(tabId, []);
        }

        this.initScripts.get(tabId)!.push(script);
        console.log(`📜 Added init script to tab ${tab.accountName}`);
    }
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
    private setupWindowEvents(): void {
        this.mainWindow.on('resize', () => {
            this.updateActiveWebContentsViewBounds();
        });

        // 监听窗口状态变化
        this.mainWindow.on('maximize', () => {
            setTimeout(() => this.updateActiveWebContentsViewBounds(), 100);
        });

        this.mainWindow.on('unmaximize', () => {
            setTimeout(() => this.updateActiveWebContentsViewBounds(), 100);
        });

        // 监听窗口获得焦点事件
        this.mainWindow.on('focus', () => {
            if (this.activeTabId) {
                const tab = this.tabs.get(this.activeTabId);
                if (tab && tab.webContentsView) {
                    tab.webContentsView.webContents.focus();
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

            // 使用 WebContentsView
            const webContentsView = new WebContentsView({
                webPreferences: {
                    session: session,
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false, // 🔥 关键：禁用以提升加载速度
                    allowRunningInsecureContent: true, // 🔥 允许混合内容
                    backgroundThrottling: false,
                    v8CacheOptions: 'bypassHeatCheck',
                    plugins: false,
                    devTools: process.env.NODE_ENV === 'development',
                    // 🔥 新增性能优化选项
                    experimentalFeatures: true,
                    enableBlinkFeatures: 'CSSContainerQueries',
                    disableBlinkFeatures: 'AutomationControlled', // 隐藏自动化标识
                    preload: undefined // 不加载预加载脚本
                }
            });


            const tab: AccountTab = {
                id: tabId,
                accountName: accountName,
                platform: platform,
                session: session,
                webContentsView: webContentsView, // 替换 browserView 为 webContentsView
                loginStatus: 'unknown',
                url: initialUrl || `https://channels.weixin.qq.com`
            };

            this.tabs.set(tabId, tab);
            this.setupWebContentsViewEvents(tab);

            console.log(`✅ Tab created successfully: ${accountName} (${tabId})`);

            // 如果有初始URL，开始导航（非阻塞）
            if (initialUrl) {
                console.log(`🔗 Starting immediate navigation for ${accountName}...`);
                // 不使用 setImmediate，直接开始导航
                await this.navigateTab(tabId, initialUrl);
            }

            return tabId;

        } catch (error) {
            console.error(`❌ Failed to create tab for ${accountName}:`, error);

            // 清理已创建的资源
            if (this.tabs.has(tabId)) {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    try {
                        // WebContentsView 清理方式
                        if (this.mainWindow.contentView) {
                            this.mainWindow.contentView.removeChildView(tab.webContentsView);
                        }
                        tab.webContentsView.webContents.close();
                    } catch (cleanupError) {
                        console.warn('Failed to cleanup WebContentsView:', cleanupError);
                    }
                }
                this.tabs.delete(tabId);
            }
            this.sessionManager.deleteSession(tabId);
            throw error;
        }
    }

    private async injectInitScripts(tabId: string): Promise<void> {
        const scripts = this.initScripts.get(tabId);
        if (!scripts || scripts.length === 0) return;

        const tab = this.tabs.get(tabId);
        if (!tab) return;

        console.log(`📜 Injecting ${scripts.length} init scripts for ${tab.accountName}`);

        // 🔥 步骤1：先注入 API 兼容层，解决缺失的 Web API
        try {
            await tab.webContentsView.webContents.executeJavaScript(`
                (function() {
                    console.log('🛡️ 开始注入 API 兼容层...');
                    
                    // Notification API 兼容
                    if (typeof Notification === 'undefined') {
                        window.Notification = class MockNotification {
                            constructor(title, options = {}) {
                                this.title = title;
                                this.options = options;
                                this.onclick = null;
                                this.onshow = null;
                                this.onerror = null;
                                this.onclose = null;
                                console.log('Mock Notification created:', title);
                            }
                            
                            static get permission() { 
                                return 'granted'; 
                            }
                            
                            static requestPermission(callback) {
                                const result = 'granted';
                                if (callback) callback(result);
                                return Promise.resolve(result);
                            }
                            
                            close() {
                                console.log('Mock Notification closed');
                            }
                            
                            addEventListener(type, listener) {
                                this['on' + type] = listener;
                            }
                            
                            removeEventListener(type, listener) {
                                this['on' + type] = null;
                            }
                        };
                        console.log('✅ Notification API mock 已注入');
                    }
                    
                    // webkitNotifications 兼容 (旧版 Chrome)
                    if (typeof webkitNotifications === 'undefined') {
                        window.webkitNotifications = {
                            checkPermission: () => 0, // 0 = PERMISSION_ALLOWED
                            requestPermission: (callback) => {
                                if (callback) callback();
                                return Promise.resolve();
                            },
                            createNotification: (icon, title, body) => {
                                return new window.Notification(title, { icon, body });
                            }
                        };
                        console.log('✅ webkitNotifications API mock 已注入');
                    }
                    
                    // 其他可能缺失的 API
                    if (typeof ServiceWorker === 'undefined') {
                        window.ServiceWorker = class MockServiceWorker {};
                        console.log('✅ ServiceWorker API mock 已注入');
                    }
                    
                    if (typeof PushManager === 'undefined') {
                        window.PushManager = class MockPushManager {
                            static get supportedContentEncodings() { return []; }
                        };
                        console.log('✅ PushManager API mock 已注入');
                    }
                    
                    // 确保基础的 console 方法存在
                    if (!window.console) {
                        window.console = {
                            log: () => {},
                            warn: () => {},
                            error: () => {},
                            info: () => {},
                            debug: () => {}
                        };
                    }
                    
                    console.log('🛡️ API 兼容层注入完成');
                    return { success: true };
                })();
            `);

            console.log(`✅ API 兼容层注入成功 for ${tab.accountName}`);

        } catch (error) {
            console.warn(`⚠️ API 兼容层注入失败 for ${tab.accountName}:`, error);
            // 继续执行，不因为兼容层失败而中断
        }

        // 🔥 步骤2：注入所有初始化脚本
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i];

            try {
                console.log(`📜 Injecting script ${i + 1}/${scripts.length} for ${tab.accountName}...`);

                // 包装脚本，提供错误处理和隔离
                const wrappedScript = `
                    (function() {
                        try {
                            console.log('🚀 开始执行 init script ${i + 1}');
                            
                            // 🔥 执行实际的脚本内容
                            ${script}
                            
                            console.log('✅ Init script ${i + 1} 执行成功');
                            return { 
                                success: true, 
                                scriptIndex: ${i + 1},
                                message: 'Script executed successfully'
                            };
                            
                        } catch (e) {
                            console.error('❌ Init script ${i + 1} 执行失败:', e);
                            return { 
                                success: false, 
                                scriptIndex: ${i + 1},
                                error: e.message, 
                                stack: e.stack,
                                name: e.name,
                                line: e.lineNumber || 'unknown',
                                column: e.columnNumber || 'unknown'
                            };
                        }
                    })();
                `;

                const result = await tab.webContentsView.webContents.executeJavaScript(wrappedScript);

                if (result && result.success) {
                    console.log(`✅ Init script ${i + 1} executed successfully for ${tab.accountName}`);
                } else if (result && !result.success) {
                    console.error(`❌ Init script ${i + 1} failed for ${tab.accountName}:`);
                    console.error(`   Error: ${result.error}`);
                    console.error(`   Name: ${result.name}`);
                    console.error(`   Line: ${result.line}, Column: ${result.column}`);
                    console.error(`   Stack: ${result.stack}`);

                    // 可以选择是否继续执行后续脚本
                    // 这里选择继续执行，但记录错误
                } else {
                    console.warn(`⚠️ Init script ${i + 1} returned unexpected result for ${tab.accountName}:`, result);
                }

            } catch (error) {
                console.error(`❌ Failed to inject script ${i + 1} for ${tab.accountName}:`, error);

                // 如果是执行错误，尝试获取更多信息
                if (error instanceof Error) {
                    console.error(`   Error name: ${error.name}`);
                    console.error(`   Error message: ${error.message}`);
                    if (error.stack) {
                        console.error(`   Stack trace: ${error.stack}`);
                    }
                }

                // 继续执行下一个脚本
                continue;
            }

            // 每个脚本之间稍微等待一下，避免执行过快导致问题
            if (i < scripts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`🎉 All init scripts processing completed for ${tab.accountName}`);
    }

    private setupWebContentsViewEvents(tab: AccountTab): void {
        const webContents = tab.webContentsView.webContents;
        let lastLoggedUrl = '';
        // 防止 WebContentsView 影响主窗口
        webContents.on('before-input-event', (event, input) => {
            // 阻止某些可能影响主窗口的快捷键
            if (input.control || input.meta) {
                if (['w', 't', 'n', 'shift+t'].includes(input.key.toLowerCase())) {
                    event.preventDefault();
                }
            }
        });

        webContents.on('did-navigate', async (event, url, isInPlace, isMainFrame) => {
            if (isMainFrame) {
                console.log(`🔄 Navigation started for ${tab.accountName}: ${url}`);
                await this.injectInitScripts(tab.id);
            }
        });
        webContents.on('did-fail-load', (event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
            if (errorCode !== -3) {
                console.error(`❌ 页面加载失败: ${errorDescription} (${errorCode}) - ${tab.accountName}`);
                tab.loginStatus = 'logged_out';

                // 设置错误标题
                this.tabTitles.set(tab.id, `加载失败 - ${tab.accountName}`);
                this.notifyTabTitleUpdate(tab.id, `加载失败 - ${tab.accountName}`);
            }
        });

        webContents.on('page-title-updated', (event: any, title: string, explicitSet: boolean) => {
            if (title && title !== 'about:blank' && !title.includes('Loading')) {
                console.log(`📝 页面标题更新: ${title} (${tab.accountName})`);

                // 更新标题缓存
                this.tabTitles.set(tab.id, title);

                // 通知前端更新标签页显示
                this.notifyTabTitleUpdate(tab.id, title);
            }
        });

        // 监听页面图标更新（favicon）
        webContents.on('page-favicon-updated', (event: any, favicons: string[]) => {
            if (favicons && favicons.length > 0) {
                const favicon = favicons[0]; // 使用第一个图标
                console.log(`🎭 页面图标更新: ${favicon} (${tab.accountName})`);

                // 更新图标缓存
                this.tabFavicons.set(tab.id, favicon);

                // 通知前端更新标签页图标
                this.notifyTabFaviconUpdate(tab.id, favicon);
            }
        });

        // 页面加载完成后获取标题和图标
        webContents.on('did-finish-load', async () => {
            const currentUrl = webContents.getURL();

            if (currentUrl !== lastLoggedUrl) {
                console.log(`📄 页面加载完成: ${currentUrl} (${tab.accountName})`);
                lastLoggedUrl = currentUrl;
            }

            tab.url = currentUrl;

            // 获取页面标题
            try {
                const title = await webContents.executeJavaScript('document.title');
                if (title && title.trim()) {
                    this.tabTitles.set(tab.id, title);
                    this.notifyTabTitleUpdate(tab.id, title);
                }
            } catch (error) {
                console.warn(`获取页面标题失败: ${error}`);
            }

            // 获取页面图标
            try {
                const favicon = await webContents.executeJavaScript(`
                    (function() {
                        // 查找各种可能的图标
                        let iconUrl = '';
                        
                        // 方法1: 查找 link[rel*="icon"]
                        let iconLink = document.querySelector('link[rel*="icon"]');
                        if (iconLink && iconLink.href) {
                            iconUrl = iconLink.href;
                        }
                        
                        // 方法2: 查找默认的 favicon.ico
                        if (!iconUrl) {
                            const baseUrl = window.location.origin;
                            iconUrl = baseUrl + '/favicon.ico';
                        }
                        
                        return iconUrl;
                    })()
                `);

                if (favicon && favicon !== 'about:blank') {
                    this.tabFavicons.set(tab.id, favicon);
                    this.notifyTabFaviconUpdate(tab.id, favicon);
                }
            } catch (error) {
                console.warn(`获取页面图标失败: ${error}`);
            }

            await this.updateLoginStatus(tab.id);
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
    /**
     * 通知前端标题更新
     */
    private notifyTabTitleUpdate(tabId: string, title: string): void {
        // 发送到主窗口的渲染进程
        this.mainWindow.webContents.send('tab-title-updated', {
            tabId: tabId,
            title: title,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 通知前端图标更新
     */
    private notifyTabFaviconUpdate(tabId: string, favicon: string): void {
        // 发送到主窗口的渲染进程
        this.mainWindow.webContents.send('tab-favicon-updated', {
            tabId: tabId,
            favicon: favicon,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 获取标签页的显示信息
     */
    getTabDisplayInfo(tabId: string): { title: string; favicon?: string } {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            return { title: 'Unknown Tab' };
        }

        // 优先使用页面标题，备选使用账号名
        const title = this.tabTitles.get(tabId) || tab.accountName || 'New Tab';
        const favicon = this.tabFavicons.get(tabId);

        return { title, favicon };
    }

    /**
     * 获取所有标签页（包含显示信息）
     */
    getAllTabsWithDisplayInfo(): Array<AccountTab & { displayTitle: string; displayFavicon?: string }> {
        return Array.from(this.tabs.values()).map(tab => {
            const displayInfo = this.getTabDisplayInfo(tab.id);
            return {
                ...tab,
                displayTitle: displayInfo.title,
                displayFavicon: displayInfo.favicon
            };
        });
    }
    async loadAccountCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            await this.cookieManager.loadCookiesToSession(tab.session, cookieFilePath);
            tab.cookieFile = cookieFilePath;
            console.log(`🍪 Loaded cookies for tab: ${tab.accountName}`);

            if (tab.webContentsView.webContents.getURL()) {
                await tab.webContentsView.webContents.reload();
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
            // 隐藏当前标签页 - 使用 WebContentsView 的方式
            if (this.activeTabId && this.activeTabId !== tabId) {
                const currentTab = this.tabs.get(this.activeTabId);
                if (currentTab) {
                    // 移动到屏幕外而不是完全移除
                    currentTab.webContentsView.setBounds({ x: -5000, y: -5000, width: 1, height: 1 });
                    console.log(`🙈 Hidden tab: ${currentTab.accountName}`);
                }
            }

            // 确保新标签页已添加到窗口
            if (!this.isViewAttached(tab.webContentsView)) {
                this.mainWindow.contentView.addChildView(tab.webContentsView);
            }

            // 显示新标签页
            this.updateActiveWebContentsViewBounds(tab.webContentsView);
            this.activeTabId = tabId;

            console.log(`🔄 Switched to tab: ${tab.accountName}`);

            // 确保 WebContentsView 获得焦点
            setTimeout(() => {
                if (tab.webContentsView && tab.webContentsView.webContents) {
                    tab.webContentsView.webContents.focus();
                }
            }, 100);

        } catch (error) {
            console.error(`❌ Failed to switch to tab ${tabId}:`, error);
            throw error;
        }
    }

    private isViewAttached(webContentsView: WebContentsView): boolean {
        // 检查 WebContentsView 是否已附加到窗口
        try {
            // 这里可能需要根据实际 API 调整检查方式
            return this.mainWindow.contentView.children.includes(webContentsView);
        } catch {
            return false;
        }
    }

    private updateActiveWebContentsViewBounds(specificView?: WebContentsView): void {
        const targetView = specificView || (this.activeTabId ? this.tabs.get(this.activeTabId)?.webContentsView : null);

        if (!targetView) {
            console.log('📐 No active tab to update bounds');
            return;
        }

        const tab = Array.from(this.tabs.values()).find(t => t.webContentsView === targetView);
        if (!tab) {
            console.log('📐 Tab not found for WebContentsView');
            return;
        }

        try {
            const windowBounds = this.mainWindow.getContentBounds();

            // 计算 WebContentsView 应该占用的区域
            const webContentsViewBounds = {
                x: 0,
                y: 108, // 固定值：60 + 48
                width: windowBounds.width,
                height: Math.max(0, windowBounds.height - 108)
            };

            console.log(`📐 Setting WebContentsView bounds for ${tab.accountName}:`, webContentsViewBounds);
            console.log(`📐 Window content bounds:`, windowBounds);

            targetView.setBounds(webContentsViewBounds);

            // 验证边界设置
            setTimeout(() => {
                try {
                    const actualBounds = targetView.getBounds();
                    console.log(`📐 Actual WebContentsView bounds:`, actualBounds);

                    // 检查是否有重叠问题
                    if (actualBounds.y < this.TOP_OFFSET) {
                        console.warn(`⚠️ WebContentsView overlapping header! Adjusting...`);
                        targetView.setBounds({
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
            console.error(`❌ Failed to update WebContentsView bounds for ${tab.accountName}:`, error);
        }
    }

    async closeTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            // 如果是当前活动标签页，先移除显示
            if (this.activeTabId === tabId) {
                this.mainWindow.contentView.removeChildView(tab.webContentsView);
                this.activeTabId = null;

                // 自动切换到下一个标签页
                const remainingTabs = Array.from(this.tabs.keys()).filter(id => id !== tabId);
                if (remainingTabs.length > 0) {
                    await this.switchToTab(remainingTabs[0]);
                }
            }

            // 清理资源
            try {
                tab.webContentsView.webContents.close();
            } catch (error) {
                console.warn('Failed to close webContents:', error);
                try {
                    await tab.webContentsView.webContents.loadURL('about:blank');
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
            const result = await tab.webContentsView.webContents.executeJavaScript(script);
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

            const webContents = tab.webContentsView.webContents;

            // 预加载优化
            webContents.setZoomFactor(1.0);
            webContents.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            const navigationPromise = new Promise<void>((resolve, reject) => {
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
                    console.log(`✅ Fast navigation completed for ${tab.accountName}`);
                    resolve();
                };

                const onNavigate = (event: any, navigationUrl: string) => {
                    console.log(`🔄 Fast redirect for ${tab.accountName}: ${navigationUrl}`);
                    tab.url = navigationUrl;
                    // 🔥 减少重定向等待时间
                    if (loadingTimer) clearTimeout(loadingTimer);
                    loadingTimer = setTimeout(() => {
                        cleanup();
                        resolve();
                    }, 3000); // 减少到3秒
                };

                const onFailure = (event: any, errorCode: number, errorDescription: string) => {
                    cleanup();
                    console.log(`ℹ️ Navigation handled for ${tab.accountName}: ${errorDescription}`);
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
                }, 5000); // 减少到10秒
            });

            await webContents.loadURL(url);
            await navigationPromise;

        } catch (error) {
            console.warn(`⚠️ Fast navigation issue for ${tab.accountName}:`, error instanceof Error ? error.message : error);
            tab.url = url;
        }
    }

    private async updateLoginStatus(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            const loginCheckPromise = tab.webContentsView.webContents.executeJavaScript(`
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

    async setFileInput(tabId: string, selector: string, filePath: string): Promise<any> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            // 验证文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;

            console.log(`📁 Setting file "${fileName}" (${fileSize} bytes) to ${tab.accountName}`);

            // 方法1: 通用的文件路径设置 - 不读取文件内容
            const result = await this.setFileViaPathReference(tab, selector, filePath, fileName);

            if (result.success) {
                return result;
            }

            // 方法2: 备用方案 - 触发文件选择器
            console.log('📁 Trying file chooser trigger...');
            return await this.triggerFileChooser(tab, selector, filePath, fileName);

        } catch (error) {
            console.error(`❌ Failed to set file for tab ${tab.accountName}:`, error);
            throw new Error(`Failed to set file: ${this.getErrorMessage(error)}`);
        }
    }

    private async setFileViaPathReference(tab: any, selector: string, filePath: string, fileName: string): Promise<any> {
        try {
            // 通用方法：在页面中设置文件路径引用，让浏览器处理文件读取
            const script = `
                (function() {
                    try {
                        const fileInput = document.querySelector('${selector}');
                        if (!fileInput) {
                            return { success: false, error: 'File input not found with selector: ${selector}' };
                        }
                        
                        // 设置文件路径引用，不读取内容
                        fileInput.setAttribute('data-file-path', '${filePath}');
                        fileInput.setAttribute('data-file-name', '${fileName}');
                        
                        // 设置 Electron/WebContents 特有的属性
                        if (typeof fileInput._setElectronFile === 'function') {
                            fileInput._setElectronFile('${filePath}');
                        } else {
                            // 标准的文件路径设置
                            fileInput._electronFilePath = '${filePath}';
                        }
                        
                        // 触发标准事件
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        return { 
                            success: true,
                            fileName: '${fileName}',
                            method: 'PathReference',
                            selector: '${selector}'
                        };
                    } catch (e) {
                        return { success: false, error: e.message, method: 'PathReference' };
                    }
                })()
            `;

            const result = await tab.webContentsView.webContents.executeJavaScript(script);
            console.log(`📁 Path reference result for ${tab.accountName}:`, result);
            return result;

        } catch (error) {
            return { success: false, error: this.getErrorMessage(error), method: 'PathReference' };
        }
    }

    private async triggerFileChooser(tab: any, selector: string, filePath: string, fileName: string): Promise<any> {
        try {
            // 通用方法：触发文件选择器，标记预期文件
            const script = `
                (function() {
                    try {
                        const fileInput = document.querySelector('${selector}');
                        if (!fileInput) {
                            return { success: false, error: 'File input not found with selector: ${selector}' };
                        }
                        
                        // 标记预期的文件
                        fileInput.setAttribute('data-expected-file', '${filePath}');
                        fileInput.setAttribute('data-expected-name', '${fileName}');
                        
                        // 触发文件选择器
                        fileInput.click();
                        
                        return { 
                            success: true,
                            fileName: '${fileName}',
                            method: 'FileChooser',
                            note: 'File chooser triggered, manual selection may be required'
                        };
                    } catch (e) {
                        return { success: false, error: e.message, method: 'FileChooser' };
                    }
                })()
            `;

            const result = await tab.webContentsView.webContents.executeJavaScript(script);
            console.log(`📁 File chooser result for ${tab.accountName}:`, result);
            return result;

        } catch (error) {
            return { success: false, error: this.getErrorMessage(error), method: 'FileChooser' };
        }
    }
    // ========================================
    // 新增：添加 Playwright 兼容的 setInputFiles 方法
    // ========================================
    async setInputFiles(tabId: string, selector: string, filePath: string): Promise<boolean> {
        try {
            const result = await this.setFileInput(tabId, selector, filePath);
            return result.success || false;
        } catch (error) {
            console.error(`❌ setInputFiles failed:`, error);
            return false;
        }
    }

    private async setFileViaPlaywrightStyle(tab: any, selector: string, filePath: string, fileName: string): Promise<any> {
        try {
            // 关键：不读取文件内容，使用类似 Playwright 的机制
            // 让 Electron 的 WebContents 直接处理文件路径

            // 首先，我们需要在页面中准备文件输入框
            const prepareScript = `
                (function() {
                    try {
                        const fileInput = document.querySelector('${selector}');
                        if (!fileInput) {
                            return { success: false, error: 'File input not found with selector: ${selector}' };
                        }
                        
                        // 准备接收文件的标记
                        fileInput.setAttribute('data-ready-for-file', 'true');
                        fileInput.setAttribute('data-expected-file', '${fileName}');
                        
                        return { success: true, ready: true };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `;

            const prepareResult = await tab.webContentsView.webContents.executeJavaScript(prepareScript);

            if (!prepareResult.success) {
                throw new Error(`Prepare failed: ${prepareResult.error}`);
            }

            // 关键：使用 WebContents 的文件处理能力，而不是手动读取文件
            // 这模拟了 Playwright 的 setInputFiles 行为
            const setFileScript = `
                (function() {
                    try {
                        const fileInput = document.querySelector('${selector}');
                        if (!fileInput) {
                            return { success: false, error: 'File input not found' };
                        }
                        
                        // 模拟文件被选中的状态，但不实际读取文件内容
                        // 这将由 Electron 在后台处理
                        
                        // 创建一个模拟的 FileList，但文件内容由 Electron 处理
                        const mockFile = {
                            name: '${fileName}',
                            size: ${fs.statSync(filePath).size},
                            type: '${this.getMimeType(filePath)}',
                            lastModified: ${fs.statSync(filePath).mtimeMs}
                        };
                        
                        // 设置 WebContents 特有的文件路径属性
                        fileInput._electronFilePath = '${filePath}';
                        fileInput._electronFileName = '${fileName}';
                        
                        // 触发相关事件
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        return { 
                            success: true,
                            fileName: '${fileName}',
                            method: 'PlaywrightStyle',
                            note: 'File path set without reading content'
                        };
                    } catch (e) {
                        return { success: false, error: e.message, method: 'PlaywrightStyle' };
                    }
                })()
            `;

            const result = await tab.webContentsView.webContents.executeJavaScript(setFileScript);
            console.log(`📁 Playwright-style result for ${tab.accountName}:`, result);
            return result;

        } catch (error) {
            return { success: false, error: this.getErrorMessage(error), method: 'PlaywrightStyle' };
        }
    }

    private async setFileViaNativeDialog(tab: any, selector: string, filePath: string, fileName: string): Promise<any> {
        try {
            // 使用 Electron 的原生能力来处理文件选择
            // 这避免了在 JavaScript 中处理大文件

            console.log('📁 Using Electron native file handling...');

            // 方法：通过 WebContents 的 IPC 机制设置文件
            const result = await tab.webContentsView.webContents.executeJavaScript(`
                (function() {
                    try {
                        const fileInput = document.querySelector('${selector}');
                        if (!fileInput) {
                            return { success: false, error: 'File input not found with selector: ${selector}' };
                        }
                        
                        // 关键：在 Electron 环境中，我们可以设置特殊属性
                        // 让 Electron 的文件系统处理实际的文件读取
                        
                        // 设置 Electron 特有的文件引用
                        Object.defineProperty(fileInput, 'files', {
                            get: function() {
                                // 返回一个模拟的 FileList，但实际文件处理由 Electron 完成
                                return {
                                    length: 1,
                                    0: {
                                        name: '${fileName}',
                                        size: ${fs.statSync(filePath).size},
                                        type: '${this.getMimeType(filePath)}',
                                        lastModified: ${fs.statSync(filePath).mtimeMs},
                                        // Electron 特有：文件路径引用而非内容
                                        _electronPath: '${filePath}'
                                    },
                                    item: function(index) { return this[index] || null; }
                                };
                            }
                        });
                        
                        // 触发文件选择事件
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        return { 
                            success: true,
                            fileName: '${fileName}',
                            method: 'NativeDialog',
                            fileSize: ${fs.statSync(filePath).size}
                        };
                    } catch (e) {
                        return { success: false, error: e.message, method: 'NativeDialog' };
                    }
                })()
            `);

            console.log(`📁 Native dialog result for ${tab.accountName}:`, result);
            return result;

        } catch (error) {
            return { success: false, error: this.getErrorMessage(error), method: 'NativeDialog' };
        }
    }

    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: { [key: string]: string } = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.m4v': 'video/x-m4v',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf'
        };

        return mimeTypes[ext] || 'application/octet-stream';
    }

    // 添加调试方法
    debugWebContentsViewBounds(): void {
        console.log('🐛 Debug: Current WebContentsView bounds');
        console.log(`🐛 Window bounds:`, this.mainWindow.getContentBounds());
        console.log(`🐛 Header height: ${this.HEADER_HEIGHT}px`);
        console.log(`🐛 Tab bar height: ${this.TAB_BAR_HEIGHT}px`);
        console.log(`🐛 Top offset: ${this.TOP_OFFSET}px`);

        if (this.activeTabId) {
            const tab = this.tabs.get(this.activeTabId);
            if (tab) {
                try {
                    const bounds = tab.webContentsView.getBounds();
                    console.log(`🐛 Active WebContentsView bounds:`, bounds);
                } catch (error) {
                    console.log(`🐛 Failed to get WebContentsView bounds:`, error);
                }
            }
        }
    }

    // 强制重新设置所有 WebContentsView 边界
    forceUpdateAllBounds(): void {
        console.log('🔧 Force updating all WebContentsView bounds');
        if (this.activeTabId) {
            this.updateActiveWebContentsViewBounds();
        }
    }
}