import { WebContentsView, BrowserWindow, Session } from 'electron';
import { SessionManager } from './SessionManager';
import { CookieManager } from './CookieManager';
import { AccountTab, TabLockInfo } from '../types';
import { HeadlessManager } from './HeadlessManager';
import { Config } from './config/Config';
import { AccountStorage } from './plugins/login/base/AccountStorage';

import * as fs from 'fs';
import * as path from 'path';
interface AccountInfo {
    username: string;
    platform: string;
    platformType: number;
}

export class TabManager {
    private tabs: Map<string, AccountTab> = new Map();
    private activeTabId: string | null = null;
    private mainWindow: BrowserWindow;
    private sessionManager: SessionManager;
    private cookieManager: CookieManager;
    private headlessManager: HeadlessManager;
    private injectedTabs: Set<string> = new Set();
    // 标签页标题缓存
    private tabTitles: Map<string, string> = new Map();
    private tabFavicons: Map<string, string> = new Map();
    // 添加窗口布局常量
    private readonly HEADER_HEIGHT = 60;
    private readonly TAB_BAR_HEIGHT = 48;
    private readonly TOP_OFFSET = 92;
    private initScripts: Map<string, string[]> = new Map();
    private stealthScript: string | null = null;
    private readonly LOCK_PRIORITIES: Record<string, number> = {
        'message': 100,         // 消息同步 - 最高优先级
        'upload': 90,           // 视频发布
        'monitor': 10,          // 监控任务
        'temp': 1               // 临时锁定
    };
    constructor(mainWindow: BrowserWindow, sessionManager: SessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
        this.cookieManager = new CookieManager();
        this.headlessManager = HeadlessManager.getInstance();
        this.setupWindowEvents();
        this.loadStealthScript();
    }
    lockTab(tabId: string, owner: string, reason: string, priority?: number): boolean {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        const lockPriority = priority || this.LOCK_PRIORITIES[owner] || this.LOCK_PRIORITIES['temp'];

        // 检查是否已被锁定
        if (tab.isLocked && tab.lockInfo) {
            // 比较优先级，高优先级可以抢占低优先级的锁
            if (lockPriority <= tab.lockInfo.priority) {
                console.warn(`⚠️ Tab已被更高优先级锁定: ${tab.accountName} (当前: ${tab.lockInfo.owner}, 尝试: ${owner})`);
                return false;
            } else {
                console.log(`🔄 高优先级抢占锁: ${tab.accountName} (${tab.lockInfo.owner} -> ${owner})`);
            }
        }

        // 🔥 直接设置到 AccountTab 接口字段
        tab.lockInfo = {
            owner: owner,
            reason: reason,
            lockTime: new Date().toISOString(),
            priority: lockPriority
        };
        tab.isLocked = true;

        console.log(`🔒 Tab已锁定: ${tab.accountName} by ${owner} - ${reason} (优先级: ${lockPriority})`);
        return true;
    }

    unlockTab(tabId: string, owner: string): boolean {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        if (!tab.isLocked || !tab.lockInfo) {
            console.warn(`⚠️ Tab未被锁定: ${tab.accountName}`);
            return true;
        }

        // 检查锁定所有者
        if (tab.lockInfo.owner !== owner) {
            console.error(`❌ 无权解锁Tab: ${tab.accountName} (锁定者: ${tab.lockInfo.owner}, 尝试解锁: ${owner})`);
            return false;
        }

        // 🔥 直接清理 AccountTab 接口字段
        delete tab.lockInfo;
        tab.isLocked = false;

        console.log(`🔓 Tab已解锁: ${tab.accountName} by ${owner}`);
        return true;
    }

    isTabAvailableForReuse(tab: AccountTab): boolean {
        return !tab.isLocked;  // 🔥 直接使用接口字段
    }

    getTabLockStatus(tabId: string): { isLocked: boolean; lockInfo?: TabLockInfo } {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            return { isLocked: false };
        }

        return {
            isLocked: tab.isLocked || false,  // 🔥 直接使用接口字段
            lockInfo: tab.lockInfo
        };
    }

    forceUnlockTab(tabId: string, reason: string = '强制解锁'): boolean {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            return false;
        }

        if (tab.isLocked) {
            console.warn(`⚡ 强制解锁Tab: ${tab.accountName} - ${reason}`);
            delete tab.lockInfo;
            tab.isLocked = false;
        }

        return true;
    }
    private loadStealthScript(): void {
        try {
            const stealthPath = path.join(__dirname, '../../src/utils/stealth.min.js');

            if (fs.existsSync(stealthPath)) {
                this.stealthScript = fs.readFileSync(stealthPath, 'utf8');
                console.log('✅ Stealth反检测脚本加载成功');
            } else {
                console.warn('⚠️ 未找到stealth.min.js文件:', stealthPath);
                this.stealthScript = null;
            }
        } catch (error) {
            console.error('❌ 加载stealth脚本失败:', error);
            this.stealthScript = null;
        }
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
    // 🆕 智能等待元素出现
    async waitForElement(tabId: string, selector: string, timeout: number = 30000): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        const script = `
        new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const element = document.querySelector('${selector}');
                if (element) {
                    resolve(true);
                } else if (Date.now() - startTime > ${timeout}) {
                    resolve(false);
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        })
        `;

        try {
            const result = await tab.webContentsView.webContents.executeJavaScript(script);
            return Boolean(result);
        } catch (error) {
            console.error(`❌ 等待元素失败: ${error}`);
            return false;
        }
    }

    // 🆕 智能点击元素
    async clickElement(tabId: string, selector: string): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        const script = `
        (function() {
            const element = document.querySelector('${selector}');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.click();
                return true;
            }
            return false;
        })()
        `;

        try {
            const result = await tab.webContentsView.webContents.executeJavaScript(script);
            return Boolean(result);
        } catch (error) {
            console.error(`❌ 点击元素失败: ${error}`);
            return false;
        }
    }

    /**
     * 等待页面URL变化
     */
    async waitForUrlChange(tabId: string, timeout: number = 200000): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        return new Promise((resolve) => {
            console.log(`⏳ 开始监听URL变化 (${tab.accountName}), 超时: ${timeout}ms`);

            const originalUrl = tab.webContentsView.webContents.getURL();
            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                
                try {
                    if (tab?.webContentsView?.webContents) {
                        tab.webContentsView.webContents.removeListener('did-navigate', onNavigate);
                        tab.webContentsView.webContents.removeListener('did-navigate-in-page', onNavigate);
                    }
                } catch (error) {
                    console.warn(`清理事件监听器失败:`, error);
                }
            };

            const onNavigate = (event: any, url: string) => {
                if (resolved) return;

                console.log(`🔄 URL变化检测: ${originalUrl} → ${url}`);

                if (url !== originalUrl && !url.includes('about:blank')) {
                    console.log(`✅ URL变化确认: ${tab.accountName}`);
                    cleanup();
                    resolve(true);
                }
            };

            // 🔥 优化1：只使用事件监听器，移除定期检查
            tab.webContentsView.webContents.on('did-navigate', onNavigate);
            tab.webContentsView.webContents.on('did-navigate-in-page', onNavigate);

            // 🔥 优化2：设置超时但不执行定期检查
            timeoutId = setTimeout(() => {
                console.log(`⏰ URL变化监听超时: ${tab.accountName}`);
                cleanup();
                resolve(false);
            }, timeout);

            // 🔥 优化3：移除整个定期检查的 setInterval 代码块
            // 注释掉原有的 checkInterval 相关代码
        });
    }

    async setShadowInputFiles(tabId: string, shadowSelector: string, inputSelector: string, filePath: string): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;
            const mimeType = this.getMimeType(filePath);

            console.log(`📁 Setting file "${fileName}" to Shadow DOM in ${tab.accountName}`);

            // 🔥 使用 Electron 的文件路径引用方式，不读取内容
            const script = `
                (function() {
                    try {
                        console.log('🔍 使用 Electron 文件路径引用方式...');
                        
                        const shadowHost = document.querySelector('${shadowSelector}');
                        if (!shadowHost || !shadowHost.shadowRoot) {
                            return { success: false, error: 'Shadow DOM 不可访问' };
                        }
                        
                        const shadowRoot = shadowHost.shadowRoot;
                        const fileInput = shadowRoot.querySelector('${inputSelector}');
                        if (!fileInput) {
                            return { success: false, error: 'Shadow DOM 中未找到文件输入框' };
                        }
                        
                        console.log('✅ 找到文件输入框:', fileInput);
                        
                        // 🔥 关键：使用 Electron 的文件路径引用，不读取内容
                        // 这模拟了原生 Playwright 的行为
                        
                        // 方法1：直接设置 Electron 特有的文件路径属性
                        fileInput.setAttribute('data-electron-file-path', '${filePath}');
                        
                        // 方法2：创建一个模拟的 File 对象，但不包含实际数据
                        const mockFile = {
                            name: '${fileName}',
                            size: ${fileSize},
                            type: '${mimeType}',
                            lastModified: ${fs.statSync(filePath).mtimeMs},
                            // 🔥 关键：Electron 特有的路径引用
                            path: '${filePath}',
                            // 模拟 File 对象的方法
                            stream: function() { throw new Error('Not implemented'); },
                            text: function() { throw new Error('Not implemented'); },
                            arrayBuffer: function() { throw new Error('Not implemented'); }
                        };
                        
                        // 创建 FileList 对象
                        const mockFileList = {
                            length: 1,
                            0: mockFile,
                            item: function(index) { return this[index] || null; },
                            [Symbol.iterator]: function* () { yield this[0]; }
                        };
                        
                        // 🔥 关键：重写 files 属性的 getter
                        Object.defineProperty(fileInput, 'files', {
                            get: function() {
                                return mockFileList;
                            },
                            configurable: true
                        });
                        
                        // 设置 value 属性（显示文件名）
                        Object.defineProperty(fileInput, 'value', {
                            get: function() {
                                return '${fileName}';
                            },
                            configurable: true
                        });
                        
                        // 触发标准事件
                        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        // 验证设置
                        const verification = {
                            filesLength: fileInput.files.length,
                            fileName: fileInput.files[0] ? fileInput.files[0].name : null,
                            fileSize: fileInput.files[0] ? fileInput.files[0].size : null,
                            filePath: fileInput.files[0] ? fileInput.files[0].path : null,
                            inputValue: fileInput.value
                        };
                        
                        console.log('📁 文件设置验证:', verification);
                        
                        return { 
                            success: true,
                            method: 'electron-file-reference',
                            verification: verification
                        };
                        
                    } catch (e) {
                        console.error('❌ Electron 文件引用失败:', e);
                        return { success: false, error: e.message, stack: e.stack };
                    }
                })()
            `;

            const result = await tab.webContentsView.webContents.executeJavaScript(script);
            console.log(`📁 Electron 文件引用结果:`, result);

            if (result.success) {
                const verification = result.verification;
                if (verification.filesLength > 0) {
                    console.log(`✅ 文件引用成功设置: ${verification.fileName} (${verification.fileSize} bytes)`);
                    return true;
                } else {
                    console.log(`❌ 文件引用设置失败: files.length = ${verification.filesLength}`);
                    return false;
                }
            } else {
                console.log(`❌ 脚本执行失败: ${result.error}`);
                return false;
            }

        } catch (error) {
            console.error(`❌ setShadowInputFiles 失败:`, error);
            return false;
        }
    }

    async createTab(accountName: string, platform: string, initialUrl?: string, headless: boolean = false): Promise<string> {
        const startTime = performance.now();
        const isGlobalHidden = this.headlessManager.isHidden();
        const finalHeadless = headless || isGlobalHidden;

        if (isGlobalHidden) {
            console.log(`🔇 浏览器处于${this.headlessManager.getMode()}模式，创建隐藏tab`);
        }

        const timestamp = Date.now();
        const tabId = `${platform}-${timestamp}`;

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
                    webSecurity: false,
                    allowRunningInsecureContent: true,
                    backgroundThrottling: false,
                    v8CacheOptions: 'bypassHeatCheck',
                    plugins: false,
                    devTools: true,
                    experimentalFeatures: true,
                    enableBlinkFeatures: 'CSSContainerQueries',
                    disableBlinkFeatures: 'AutomationControlled',
                    preload: path.join(__dirname, '../preload/preload.js'),
                    // 🔥 新增：根据headless模式设置
                    offscreen: finalHeadless,  // headless时启用离屏渲染
                }
            });

            const tab: AccountTab = {
                id: tabId,
                accountName: accountName,
                platform: platform,
                session: session,
                webContentsView: webContentsView,
                loginStatus: 'unknown',
                url: initialUrl,
                isHeadless: finalHeadless,
                isVisible: !finalHeadless,
                // 🔥 初始化锁定状态
                isLocked: false
            };

            this.tabs.set(tabId, tab);
            this.setupWebContentsViewEvents(tab);

            if (finalHeadless) {
                // headless tab处理：移到屏幕外但保持运行
                webContentsView.setBounds({
                    x: -9999,
                    y: -9999,
                    width: 1200,  // 保持合理尺寸让页面脚本正常执行
                    height: 800
                });
                console.log(`🔇 Created headless tab: ${accountName}`);
            } else {
                // 正常tab：自动切换显示
                //console.log(`🔄 Auto-switching to new tab: ${accountName}`);
                await this.switchToTab(tabId);
            }
            try {
                if (initialUrl && initialUrl !== 'about:blank') {
                    console.log(`🔗 Starting immediate navigation for ${accountName}...`);
                    await this.navigateTab(tabId, initialUrl); // 🔥 这里可能抛异常
                }
                
                // 🔥 把事件发送移到 try-catch 外面，确保一定执行
            } catch (error) {
                console.error(`❌ Navigation failed for ${accountName}:`, error);
                // 不要抛出异常，继续执行
            }
            this.mainWindow.webContents.send('tab-created', {
                tabId: tabId,
                tab: {
                    id: tabId,
                    accountName: accountName,
                    platform: platform,
                    loginStatus: 'unknown',
                    url: initialUrl,
                    displayTitle: accountName,
                    isHeadless: finalHeadless
                }
            });
            console.log(`📢 已发送 tab-created 事件: ${tabId}`);
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

    async createAccountTab(cookieFile: string, platform: string, initialUrl: string, headless: boolean = false): Promise<string> {
        try {
            // 从cookieFile生成账号名
            let accountName: string;
            if (path.isAbsolute(cookieFile)) {
                // 如果是绝对路径，提取文件名
                accountName = path.basename(cookieFile, '.json');
            } else {
                // 如果是相对路径，直接使用
                accountName = path.basename(cookieFile, '.json');
            }
            
            // 尝试从文件名解析出更友好的账号名
            const parts = accountName.split('_');
            if (parts.length > 2) {
                // 格式如: platform_username_timestamp.json
                accountName = parts.slice(1, -1).join('_') || 'unknown';
            }
            
            console.log(`🚀 创建模拟Chrome认证行为的账号Tab: ${accountName} (${platform})`);
            
            // 🔥 先创建tab但不导航
            const tabId = await this.createTab(accountName, platform, 'about:blank', headless);
            //const tabId = await this.createTab(accountName, platform, initialUrl, headless);
            // 🔥 先加载cookies
            console.log(`🍪 优先加载Cookie文件: ${cookieFile}`);
            await this.loadAccountCookies(tabId, cookieFile);
            
            //console.log(`⏳ 等待Cookie生效...`);
            //await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 🔥 Cookie生效后才导航
            //console.log(`🔗 Cookie验证完成，开始导航到: ${initialUrl}`);
            await this.navigateTab(tabId, initialUrl);
            
            //console.log(`⏳ 等待页面加载和认证检查...`);
            //await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log(`✅ 账号Tab创建完成: ${tabId}`);
            return tabId;
            
        } catch (error) {
            console.error(`❌ 创建账号Tab失败:`, error);
            throw error;
        }
    }

    async openDevTools(tabId: string): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        try {
            const webContents = tab.webContentsView.webContents;
            webContents.openDevTools({ mode: 'detach' });
            console.log(`✅ 开发者工具已打开: ${tab.accountName}`);
            return true;
        } catch (error) {
            console.error(`❌ 打开开发者工具失败: ${tab.accountName}:`, error);
            return false;
        }
    }

    private setupWebContentsViewEvents(tab: AccountTab): void {
        const webContents = tab.webContentsView.webContents;
        //webContents.session.webRequest.onHeadersReceived((details, callback) => {
        //    if (details.responseHeaders) {
        //        delete details.responseHeaders['content-security-policy'];
        //        delete details.responseHeaders['Content-Security-Policy'];
        //    }
        //    callback({ responseHeaders: details.responseHeaders });
        //});
        let lastLoggedUrl = '';
        webContents.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        // 防止 WebContentsView 影响主窗口
        webContents.on('before-input-event', (event, input) => {
            // 阻止某些可能影响主窗口的快捷键
            if (input.control || input.meta) {
                if (['w', 't', 'n', 'shift+t'].includes(input.key.toLowerCase())) {
                    event.preventDefault();
                }
            }
        });
        webContents.on('did-navigate', (event, url) => {
            tab.url = url;
            
            // 🔥 新增：通知渲染进程更新URL输入框
            this.mainWindow.webContents.send('tab-url-updated', {
                tabId: tab.id,
                url: url,
                timestamp: new Date().toISOString()
            });
            
            //console.log(`🔗 Tab URL updated: ${tab.accountName} -> ${url}`);
        });
        webContents.on('did-navigate-in-page', (event, url) => {
            tab.url = url;
            
            // 🔥 新增：通知渲染进程更新URL输入框
            this.mainWindow.webContents.send('tab-url-updated', {
                tabId: tab.id,
                url: url,
                timestamp: new Date().toISOString()
            });
            
            //console.log(`🔗 Tab URL updated (in-page): ${tab.accountName} -> ${url}`);
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
                //console.log(`📝 页面标题更新: ${title} (${tab.accountName})`);

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
                //console.log(`🎭 页面图标更新: ${favicon} (${tab.accountName})`);

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
                //console.log(`📄 页面加载完成: ${currentUrl} (${tab.accountName})`);
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

        });

        // 处理新窗口 - 防止弹出窗口影响主界面
        webContents.setWindowOpenHandler(({ url }: { url: string }) => {
            //console.log(`🔗 Redirecting popup to current tab for ${tab.accountName}: ${url}`);
            webContents.loadURL(url).catch((error) => {
                console.warn(`⚠️ Failed to load redirected URL for ${tab.accountName}: ${error.message}`);
            });
            return { action: 'deny' };
        });

        // 处理证书错误
        webContents.on('certificate-error', (event, url, error, certificate, callback) => {
            if (process.env.NODE_ENV === 'development') {
                //console.log(`🔒 Ignoring certificate error for ${tab.accountName}: ${error}`);
                event.preventDefault();
                callback(true);
            } else {
                console.warn(`🔒 Certificate error for ${tab.accountName}: ${error}`);
                callback(false);
            }
        });

        webContents.on('did-start-loading', () => {
            //console.log(`⏳ Loading started for ${tab.accountName}`);
        });

        webContents.on('did-stop-loading', () => {
            //console.log(`✅ Loading completed for ${tab.accountName}`);
        });

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


    async navigateBack(tabId: string): Promise<boolean> {
        //console.log(`🔙 TabManager.navigateBack 被调用: ${tabId}`);
        
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        //console.log(`🔙 找到标签页: ${tab.accountName}`);
        
        try {
            const webContents = tab.webContentsView.webContents;
            
            // 🔥 使用新的 navigationHistory API
            if (!webContents.navigationHistory.canGoBack()) {
                console.warn(`⚠️ WebContents 无法后退: ${tab.accountName}`);
                return false;
            }

            //console.log(`⬅️ 执行 Electron 原生后退导航: ${tab.accountName}`);
            
            // 🔥 使用新的 navigationHistory API
            webContents.navigationHistory.goBack();
            
            //console.log(`✅ 后退导航成功: ${tab.accountName}`);
            return true;

        } catch (error) {
            console.error(`❌ 后退导航异常: ${tab.accountName}:`, error);
            return false;
        }
    }

    async navigateForward(tabId: string): Promise<boolean> {
        //console.log(`🔜 TabManager.navigateForward 被调用: ${tabId}`);
        
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        try {
            const webContents = tab.webContentsView.webContents;
            
            // 🔥 使用新的 navigationHistory API
            if (!webContents.navigationHistory.canGoForward()) {
                console.warn('⚠️ WebContents 无法前进');
                return false;
            }

            //console.log('➡️ 执行 Electron 原生前进导航');

            // 🔥 使用新的 navigationHistory API
            webContents.navigationHistory.goForward();
            
            //console.log(`✅ 前进导航成功: ${tab.accountName}`);
            return true;

        } catch (error) {
            console.error(`❌ 前进导航异常: ${tab.accountName}:`, error);
            return false;
        }
    }
    /**
     * 刷新标签页
     */
    async refreshTab(tabId: string): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`❌ Tab不存在: ${tabId}`);
            return false;
        }

        try {
            //console.log(`🔄 执行页面刷新: ${tab.accountName}`);
            
            // 方法1: 使用 webContents.reload() - 更安全可靠
            tab.webContentsView.webContents.reload();
            
            //console.log(`✅ 页面刷新成功: ${tab.accountName}`);
            return true;

        } catch (error) {
            console.error(`❌ 页面刷新异常: ${tab.accountName}:`, error);
            
            // 备用方法2: 使用 JavaScript 刷新
            try {
                await tab.webContentsView.webContents.executeJavaScript('window.location.reload(); true;');
                console.log(`✅ 备用刷新成功: ${tab.accountName}`);
                return true;
            } catch (fallbackError) {
                console.error(`❌ 备用刷新也失败: ${tab.accountName}:`, fallbackError);
                return false;
            }
        }
    }
    async loadAccountCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            let fullCookiePath: string;
            if (path.isAbsolute(cookieFilePath)) {
                fullCookiePath = cookieFilePath;
            } else {
                fullCookiePath = path.join(Config.COOKIE_DIR, cookieFilePath);
            }

            await this.cookieManager.loadCookiesToSession(tab.session, fullCookiePath);
            tab.cookieFile = cookieFilePath;
            
            console.log(`🍪 Cookie加载完成: ${tab.accountName}`);
            
        } catch (error) {
            console.error(`❌ Failed to load cookies for tab ${tab.accountName}:`, error);
            throw error;
        }
    }
    // 临时隐藏当前标签页，显示UI
    async hideCurrentTabTemporarily(): Promise<void> {
        if (this.activeTabId) {
            const tab = this.tabs.get(this.activeTabId);
            if (tab) {
                console.log(`🙈 Temporarily hiding tab: ${tab.accountName}`);
                tab.webContentsView.setBounds({ x: -5000, y: -5000, width: 1, height: 1 });
            }
        }
    }

    // 恢复当前标签页显示
    async showCurrentTab(): Promise<void> {
        if (this.activeTabId) {
            console.log(`👁️ Showing current tab again`);
            this.updateActiveWebContentsViewBounds();
        }
    }
    async switchToTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);
        const mode = this.headlessManager.getMode();
        if (mode === 'headless') {
            console.log(`🚫 headless模式无法切换显示tab: ${tab.accountName}`);
            return;
        }

        if (mode === 'background') {
            console.log(`📱 background模式 - 切换tab但窗口可能隐藏: ${tab.accountName}`);
        }

        // 🔥 新增：检查tab级别的headless
        if (tab.isHeadless) {
            console.log(`❌ Cannot switch to headless tab: ${tab.accountName}`);
            return;
        }
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
                // 确保主窗口HTML已经完全加载
                if (this.mainWindow.webContents.isLoading()) {
                    //console.log(`⏳ 等待主窗口加载完成...`);
                    await new Promise<void>(resolve => {
                        // 🔥 使用 any 类型转换来绕过 TypeScript 类型检查
                        (this.mainWindow.webContents as any).once('did-finish-load', () => {
                            resolve();
                        });
                    });
                }
                
                //console.log(`➕ 添加 WebContentsView 到主窗口: ${tab.accountName}`);
                this.mainWindow.contentView.addChildView(tab.webContentsView);
            }

            // 显示新标签页
            this.updateActiveWebContentsViewBounds(tab.webContentsView);
            this.activeTabId = tabId;

            //console.log(`🔄 Switched to tab: ${tab.accountName}`);
            this.mainWindow.webContents.send('tab-switched', { tabId });
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
            return;
        }

        const tab = Array.from(this.tabs.values()).find(t => t.webContentsView === targetView);
        if (!tab) {
            return;
        }

        try {
            const windowBounds = this.mainWindow.getContentBounds();
            const webContentsViewBounds = {
                x: 0,
                y: this.TOP_OFFSET, // 使用常量而不是硬编码
                width: windowBounds.width,
                height: Math.max(0, windowBounds.height - this.TOP_OFFSET)
            };

            targetView.setBounds(webContentsViewBounds);

        } catch (error) {
            console.error(`❌ Failed to update WebContentsView bounds for ${tab.accountName}:`, error);
        }
    }

    async closeTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            // 🔥 清理锁定状态
            const extendedTab = tab as any;
            if (extendedTab.isLocked) {
                //console.log(`🔓 清理已锁定Tab的锁定状态: ${tab.accountName}`);
                delete extendedTab.lockInfo;
                extendedTab.isLocked = false;
            }

            // ... 其余现有关闭逻辑保持不变
            if (this.activeTabId === tabId) {
                if (!tab.isHeadless) {
                    this.mainWindow.contentView.removeChildView(tab.webContentsView);
                }
                this.activeTabId = null;

                const remainingVisibleTabs = Array.from(this.tabs.keys())
                    .filter(id => id !== tabId)
                    .filter(id => {
                        const remainingTab = this.tabs.get(id);
                        return remainingTab && !remainingTab.isHeadless;
                    });

                if (remainingVisibleTabs.length > 0) {
                    await this.switchToTab(remainingVisibleTabs[0]);
                }
            }

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
            this.injectedTabs.delete(tabId);
            this.initScripts.delete(tabId);
            console.log(`🗑️ Closed tab: ${tab.accountName}`);
            this.mainWindow.webContents.send('tab-closed', { tabId });
        } catch (error) {
            console.error(`❌ Failed to close tab ${tabId}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 为消息同步创建专用Tab
     */
    async createMessageTab(platform: string, accountId: string, cookieFile: string): Promise<string> {
        const accountKey = `${platform}_${accountId}`;
        
        try {
            // 创建headless tab
            const tabId = await this.createHeadlessTab(
                `消息_${accountId}`, 
                platform, 
                this.getMessageUrl(platform)
            );
            
            // 加载Cookie
            await this.loadAccountCookies(tabId, cookieFile);
            
            // 🔥 立即锁定这个tab
            const lockSuccess = this.lockTab(tabId, 'message', '消息同步发送专用');
            if (!lockSuccess) {
                console.warn(`⚠️ 无法锁定消息Tab: ${tabId}`);
            }
            
            console.log(`✅ 消息专用Tab创建完成: ${tabId}`);
            return tabId;
            
        } catch (error) {
            console.error(`❌ 创建消息Tab失败: ${accountKey}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 清理消息Tab
     */
    async cleanupMessageTab(tabId: string): Promise<void> {
        try {
            // 先解锁，再关闭
            this.unlockTab(tabId, 'message');
            await this.closeTab(tabId);
            console.log(`✅ 消息Tab清理完成: ${tabId}`);
        } catch (error) {
            console.error(`❌ 清理消息Tab失败: ${tabId}:`, error);
        }
    }

    /**
     * 🔥 获取平台消息URL
     */
    private getMessageUrl(platform: string): string {
        const messageUrls: Record<string, string> = {
            'wechat': 'https://channels.weixin.qq.com/platform/private_msg',
            'xiaohongshu': 'https://creator.xiaohongshu.com/creator/post',
            // 其他平台...
        };
        
        return messageUrls[platform] || 'about:blank';
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
            //console.log(`🔗 Starting navigation for ${tab.accountName} to: ${url}`);

            const webContents = tab.webContentsView.webContents;

            webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
                const allowedPermissions = ['notifications', 'media','geolocation'];
                callback(allowedPermissions.includes(permission));
            });
            await webContents.loadURL(url);

            // 简单等待页面稳定
            /*
            await new Promise((resolve) => {
                const onLoad = () => {
                    webContents.removeListener('did-finish-load', onLoad);
                    console.log(`✅ Navigation completed for ${tab.accountName}`);
                    resolve(void 0);
                };

                webContents.once('did-finish-load', onLoad);

                // 3秒超时保护
                setTimeout(() => {
                //    webContents.removeListener('did-finish-load', onLoad);
                //    console.log(`⏱️ Navigation timeout for ${tab.accountName}, continuing...`);
                //    resolve(void 0);
                //}, 1000);
            });*/

        } catch (error) {
            console.warn(`⚠️ Navigation issue for ${tab.accountName}:`, error instanceof Error ? error.message : error);
            tab.url = url;
        }
    }


    getAllTabs(): AccountTab[] {
        return Array.from(this.tabs.values());
    }

    getActiveTab(): AccountTab | null {
        if (!this.activeTabId) return null;
        return this.tabs.get(this.activeTabId) || null;
    }
    getHeadlessTabs(): AccountTab[] {
        return Array.from(this.tabs.values()).filter(tab => tab.isHeadless);
    }

    // 🔥 新增：获取所有可见tabs
    getVisibleTabs(): AccountTab[] {
        return Array.from(this.tabs.values()).filter(tab => !tab.isHeadless);
    }

    // 🔥 新增：将headless tab转为正常tab
    async makeTabVisible(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.isHeadless) return;

        tab.isHeadless = false;
        tab.isVisible = true;

        // 添加到可视区域并切换过去
        this.mainWindow.contentView.addChildView(tab.webContentsView);
        await this.switchToTab(tabId);

        console.log(`👁️ Made tab visible: ${tab.accountName}`);
    }

    // 🔥 新增：将正常tab转为headless
    async makeTabHeadless(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab || tab.isHeadless) return;

        // 🔥 关键修复1：如果是当前激活的标签页，先切换到其他标签页
        if (this.activeTabId === tabId) {
            // 找到其他可见的标签页
            const visibleTabs = Array.from(this.tabs.keys())
                .filter(id => id !== tabId)
                .filter(id => {
                    const otherTab = this.tabs.get(id);
                    return otherTab && !otherTab.isHeadless;
                });

            if (visibleTabs.length > 0) {
                // 切换到第一个可见标签页
                await this.switchToTab(visibleTabs[0]);
            } else {
                // 没有其他可见标签页，清空活动标签页
                this.activeTabId = null;
            }
        }

        // 🔥 关键修复2：从可视区域移除 WebContentsView
        try {
            this.mainWindow.contentView.removeChildView(tab.webContentsView);
            console.log(`🔇 Removed WebContentsView from window: ${tab.accountName}`);
        } catch (error) {
            console.warn(`⚠️ Failed to remove WebContentsView:`, error);
        }

        // 🔥 关键修复3：设置标签页状态
        tab.isHeadless = true;
        tab.isVisible = false;

        // 🔥 关键修复4：移到屏幕外但保持运行
        tab.webContentsView.setBounds({ x: -9999, y: -9999, width: 1200, height: 800 });

        // 🔥 关键修复5：通知前端隐藏标签页头部
        this.mainWindow.webContents.send('tab-made-headless', {
            tabId: tabId,
            accountName: tab.accountName,
            timestamp: new Date().toISOString()
        });

        console.log(`🔇 Made tab headless: ${tab.accountName}`);
    }

    // 🔥 新增：创建headless tab的便捷方法
    async createHeadlessTab(accountName: string, platform: string, initialUrl?: string): Promise<string> {
        return await this.createTab(accountName, platform, initialUrl, true);
    }
    async saveCookies(tabId: string, cookieFilePath: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        await this.cookieManager.saveCookiesFromSession(tab.session, cookieFilePath);
        tab.cookieFile = cookieFilePath;
    }

    async setInputFilesStreaming(tabId: string, selector: string, filePath: string, options?: {
        shadowSelector?: string,
        triggerSelector?: string,
        waitForInput?: boolean
    }): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`文件不存在: ${filePath}`);
            }

            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;
            const mimeType = this.getMimeType(filePath);

            console.log(`🌊 开始流式上传: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
            console.log(`📋 参数: selector="${selector}", shadowSelector="${options?.shadowSelector}"`);

            const chunkSize = 2 * 1024 * 1024; // 2MB 块
            const totalChunks = Math.ceil(fileSize / chunkSize);

            // 在页面中注入流式上传处理器
            const prepareScript = `
            (function() {
                try {
                    window.__streamUpload = {
                        chunks: new Array(${totalChunks}),
                        receivedChunks: 0,
                        totalChunks: ${totalChunks},
                        fileName: '${fileName}',
                        fileSize: ${fileSize},
                        mimeType: '${mimeType}',
                        selector: '${selector}',
                        shadowSelector: '${options?.shadowSelector || ''}',
                        triggerSelector: '${options?.triggerSelector || ''}',
                        waitForInput: ${options?.waitForInput || false},
                        
                        findFileInput: function() {
                            console.log('🔍 查找文件输入框...');
                            console.log('   selector:', this.selector);
                            console.log('   shadowSelector:', this.shadowSelector);
                            
                            let fileInput = null;
                            
                            // 方法1：直接查找
                            fileInput = document.querySelector(this.selector);
                            if (fileInput) {
                                console.log('✅ 在主文档中找到文件输入框');
                                return fileInput;
                            }
                            
                            // 方法2：在 Shadow DOM 中查找
                            if (this.shadowSelector) {
                                const shadowHost = document.querySelector(this.shadowSelector);
                                if (shadowHost && shadowHost.shadowRoot) {
                                    fileInput = shadowHost.shadowRoot.querySelector(this.selector);
                                    if (fileInput) {
                                        console.log('✅ 在 Shadow DOM 中找到文件输入框');
                                        return fileInput;
                                    }
                                } else {
                                    console.log('⚠️ 未找到 Shadow DOM 宿主或 shadowRoot');
                                }
                            }
                            
                            // 方法3：点击触发区域创建文件输入框
                            if (!fileInput && this.triggerSelector) {
                                console.log('🎯 尝试点击触发区域...');
                                const trigger = this.shadowSelector ? 
                                    (document.querySelector(this.shadowSelector)?.shadowRoot?.querySelector(this.triggerSelector)) :
                                    document.querySelector(this.triggerSelector);
                                    
                                if (trigger) {
                                    trigger.click();
                                    console.log('✅ 已点击触发区域');
                                    
                                    if (this.waitForInput) {
                                        for (let attempts = 0; attempts < 20; attempts++) {
                                            fileInput = this.shadowSelector ?
                                                (document.querySelector(this.shadowSelector)?.shadowRoot?.querySelector(this.selector)) :
                                                document.querySelector(this.selector);
                                                
                                            if (fileInput) {
                                                console.log('✅ 触发后找到文件输入框');
                                                return fileInput;
                                            }
                                            
                                            // 同步等待 100ms
                                            const waitStart = Date.now();
                                            while (Date.now() - waitStart < 100) {}
                                        }
                                    }
                                } else {
                                    console.log('❌ 未找到触发区域:', this.triggerSelector);
                                }
                            }
                            
                            console.log('❌ 未找到文件输入框');
                            return null;
                        },
                        
                        receiveChunk: function(chunkData, chunkIndex) {
                            try {
                                const binaryString = atob(chunkData);
                                const bytes = new Uint8Array(binaryString.length);
                                
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                
                                this.chunks[chunkIndex] = bytes;
                                this.receivedChunks++;
                                
                                const progress = ((this.receivedChunks / this.totalChunks) * 100).toFixed(1);
                                console.log(\`📦 接收块 \${this.receivedChunks}/\${this.totalChunks} (\${progress}%)\`);
                                
                                if (this.receivedChunks === this.totalChunks) {
                                    this.assembleFile();
                                }
                                
                                return { success: true, chunkIndex: chunkIndex };
                            } catch (e) {
                                console.error('❌ 接收块失败:', e);
                                return { success: false, error: e.message };
                            }
                        },
                        
                        assembleFile: function() {
                            try {
                                console.log('🔧 开始组装文件...');
                                
                                const file = new File(this.chunks, this.fileName, {
                                    type: this.mimeType,
                                    lastModified: Date.now()
                                });
                                
                                console.log('📁 文件对象创建成功:', file.name, file.size, 'bytes');
                                
                                const fileInput = this.findFileInput();
                                
                                if (fileInput) {
                                    console.log('🎯 设置文件到输入框...');
                                    
                                    const dataTransfer = new DataTransfer();
                                    dataTransfer.items.add(file);
                                    
                                    Object.defineProperty(fileInput, 'files', {
                                        value: dataTransfer.files,
                                        configurable: true
                                    });
                                    
                                    console.log('🔔 触发事件...');
                                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    
                                    console.log('✅ 流式文件上传完成!');
                                    
                                    // 验证设置
                                    const verification = {
                                        filesCount: fileInput.files ? fileInput.files.length : 0,
                                        fileName: fileInput.files && fileInput.files[0] ? fileInput.files[0].name : 'N/A',
                                        fileSize: fileInput.files && fileInput.files[0] ? fileInput.files[0].size : 0
                                    };
                                    
                                    console.log('🔍 验证结果:', verification);
                                    
                                } else {
                                    console.error('❌ 组装完成但无法找到文件输入框');
                                }
                                
                                delete window.__streamUpload;
                                
                            } catch (e) {
                                console.error('❌ 组装文件失败:', e);
                            }
                        }
                    };
                    
                    console.log('✅ 流式上传处理器已注入');
                    return { success: true, totalChunks: ${totalChunks} };
                    
                } catch (e) {
                    console.error('❌ 注入流式上传处理器失败:', e);
                    return { success: false, error: e.message };
                }
            })()
            `;

            // 注入处理器
            const prepareResult = await tab.webContentsView.webContents.executeJavaScript(prepareScript);
            if (!prepareResult.success) {
                throw new Error(`注入处理器失败: ${prepareResult.error}`);
            }

            console.log(`📦 开始传输 ${totalChunks} 个块...`);

            // 流式读取并发送文件块
            const fd = fs.openSync(filePath, 'r');

            try {
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, fileSize);
                    const actualChunkSize = end - start;

                    // 读取当前块
                    const buffer = Buffer.alloc(actualChunkSize);
                    fs.readSync(fd, buffer, 0, actualChunkSize, start);

                    const chunkBase64 = buffer.toString('base64');

                    // 发送到页面
                    const chunkScript = `
                    if (window.__streamUpload) {
                        window.__streamUpload.receiveChunk('${chunkBase64}', ${i});
                    } else {
                        console.error('❌ 流式上传处理器不存在');
                    }
                    `;

                    await tab.webContentsView.webContents.executeJavaScript(chunkScript);

                    // 进度报告
                    if (i % 10 === 0 || i === totalChunks - 1) {
                        const progress = ((i + 1) / totalChunks * 100).toFixed(1);
                        console.log(`📊 传输进度: ${progress}% (${i + 1}/${totalChunks})`);
                    }

                    // 避免阻塞，每5块休息一下
                    if (i % 5 === 0 && i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }

                console.log(`✅ 所有块传输完成，等待文件组装...`);

                // 等待组装完成
                await new Promise(resolve => setTimeout(resolve, 2000));

                return true;

            } finally {
                fs.closeSync(fd);
            }

        } catch (error) {
            console.error(`❌ 流式上传失败:`, error);
            return false;
        }
    }


    async setInputFilesStreamingV2(tabId: string, selector: string, filePath: string, options?: {
        shadowSelector?: string,
        triggerSelector?: string,
        waitForInput?: boolean
    }): Promise<boolean> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            const fileName = path.basename(filePath);
            const fileSize = fs.statSync(filePath).size;
            const mimeType = this.getMimeType(filePath);

            console.log(`🌊 V2流式上传: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

            // 🔥 新方案：真正的流式处理
            const streamScriptV2 = `
            (function() {
                try {
                    console.log('🚀 V2: 创建真正的流式处理器...');
                    
                    // 🔥 关键：使用临时存储 + 实时组装
                    window.__streamUploaderV2 = {
                        fileName: '${fileName}',
                        fileSize: ${fileSize},
                        mimeType: '${mimeType}',
                        selector: '${selector}',
                        shadowSelector: '${options?.shadowSelector || ''}',
                        triggerSelector: '${options?.triggerSelector || ''}',
                        
                        // 🔥 关键1：不保存所有块，实时组装
                        chunkBuffer: [],
                        assembledSize: 0,
                        totalChunks: 0,
                        receivedChunks: 0,
                        
                        // 内存监控
                        maxMemoryUsed: 0,
                        currentMemoryUsed: 0,
                        
                        // 🔥 关键2：接收块后立即处理，不累积
                        processChunk: function(chunkData, chunkIndex, totalChunks) {
                            const startTime = performance.now();
                            this.totalChunks = totalChunks;
                            
                            try {
                                // 解码当前块
                                const binaryString = atob(chunkData);
                                const bytes = new Uint8Array(binaryString.length);
                                
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                
                                // 🔥 关键：立即添加到缓冲区，不等待所有块
                                this.chunkBuffer.push(bytes);
                                this.assembledSize += bytes.length;
                                this.receivedChunks++;
                                
                                // 🔥 内存使用监控
                                this.currentMemoryUsed = this.chunkBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
                                this.maxMemoryUsed = Math.max(this.maxMemoryUsed, this.currentMemoryUsed);
                                
                                const progress = (this.receivedChunks / totalChunks * 100).toFixed(1);
                                console.log(\`📦 V2处理块 \${chunkIndex + 1}/\${totalChunks} (\${progress}%) - 内存: \${(this.currentMemoryUsed / 1024 / 1024).toFixed(2)}MB\`);
                                
                                // 🔥 关键：达到一定块数就部分组装（减少内存占用）
                                if (this.chunkBuffer.length >= 50 || this.receivedChunks === totalChunks) {
                                    this.partialAssemble();
                                }
                                
                                // 最后一块时完成文件创建
                                if (this.receivedChunks === totalChunks) {
                                    this.finalizeFile();
                                }
                                
                                const endTime = performance.now();
                                return { 
                                    success: true, 
                                    chunkIndex: chunkIndex,
                                    processingTime: endTime - startTime,
                                    memoryUsed: this.currentMemoryUsed
                                };
                                
                            } catch (e) {
                                console.error('❌ V2处理块失败:', e);
                                return { success: false, error: e.message };
                            }
                        },
                        
                        // 🔥 关键3：部分组装，释放内存
                        partialAssemble: function() {
                            if (this.chunkBuffer.length === 0) return;
                            
                            console.log(\`🔧 V2部分组装 \${this.chunkBuffer.length} 块...\`);
                            
                            // 创建一个组合的 Uint8Array
                            const totalLength = this.chunkBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
                            const combined = new Uint8Array(totalLength);
                            
                            let offset = 0;
                            for (const chunk of this.chunkBuffer) {
                                combined.set(chunk, offset);
                                offset += chunk.length;
                            }
                            
                            // 🔥 关键：创建部分 Blob 并立即释放块内存
                            if (!this.partialBlobs) {
                                this.partialBlobs = [];
                            }
                            
                            this.partialBlobs.push(new Blob([combined], { type: this.mimeType }));
                            
                            // 🔥 立即清理内存
                            this.chunkBuffer = [];
                            this.currentMemoryUsed = 0;
                            
                            console.log(\`✅ V2部分组装完成，内存已释放\`);
                        },
                        
                        // 🔥 关键4：最终组装文件
                        finalizeFile: function() {
                            try {
                                console.log('🎯 V2最终组装文件...');
                                console.log(\`📊 内存使用峰值: \${(this.maxMemoryUsed / 1024 / 1024).toFixed(2)}MB\`);
                                
                                // 最后一次部分组装
                                if (this.chunkBuffer.length > 0) {
                                    this.partialAssemble();
                                }
                                
                                // 🔥 从部分 Blobs 创建最终文件
                                const file = new File(this.partialBlobs || [], this.fileName, {
                                    type: this.mimeType,
                                    lastModified: Date.now()
                                });
                                
                                console.log(\`📁 V2文件创建完成: \${file.name}, \${file.size} bytes\`);
                                
                                this.setToFileInput(file);
                                
                            } catch (e) {
                                console.error('❌ V2最终组装失败:', e);
                            }
                        },
                        
                        setToFileInput: function(file) {
                            // 查找文件输入框的通用逻辑
                            let fileInput = document.querySelector(this.selector);
                            
                            if (!fileInput && this.shadowSelector) {
                                const shadowHost = document.querySelector(this.shadowSelector);
                                if (shadowHost && shadowHost.shadowRoot) {
                                    fileInput = shadowHost.shadowRoot.querySelector(this.selector);
                                }
                            }
                            
                            // 如果需要触发
                            if (!fileInput && this.triggerSelector) {
                                const trigger = this.shadowSelector ? 
                                    (document.querySelector(this.shadowSelector)?.shadowRoot?.querySelector(this.triggerSelector)) :
                                    document.querySelector(this.triggerSelector);
                                    
                                if (trigger) {
                                    trigger.click();
                                    
                                    // 等待文件输入框出现
                                    for (let attempts = 0; attempts < 20; attempts++) {
                                        fileInput = this.shadowSelector ?
                                            (document.querySelector(this.shadowSelector)?.shadowRoot?.querySelector(this.selector)) :
                                            document.querySelector(this.selector);
                                            
                                        if (fileInput) break;
                                        
                                        const waitStart = Date.now();
                                        while (Date.now() - waitStart < 100) {}
                                    }
                                }
                            }
                            
                            if (fileInput) {
                                const dataTransfer = new DataTransfer();
                                dataTransfer.items.add(file);
                                fileInput.files = dataTransfer.files;
                                
                                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                                fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                                
                                console.log('✅ V2文件设置到输入框完成!');
                                
                                // 验证
                                const verification = {
                                    filesCount: fileInput.files ? fileInput.files.length : 0,
                                    fileName: fileInput.files && fileInput.files[0] ? fileInput.files[0].name : 'N/A',
                                    fileSize: fileInput.files && fileInput.files[0] ? fileInput.files[0].size : 0,
                                    maxMemoryUsed: \`\${(this.maxMemoryUsed / 1024 / 1024).toFixed(2)}MB\`
                                };
                                
                                console.log('🔍 V2验证结果:', verification);
                            } else {
                                console.error('❌ V2未找到文件输入框');
                            }
                            
                            // 清理
                            delete window.__streamUploaderV2;
                        }
                    };
                    
                    console.log('✅ V2流式上传处理器已注入');
                    return { success: true };
                    
                } catch (e) {
                    console.error('❌ V2注入流式上传处理器失败:', e);
                    return { success: false, error: e.message };
                }
            })()
            `;

            // 注入V2处理器
            const prepareResult = await tab.webContentsView.webContents.executeJavaScript(streamScriptV2);
            if (!prepareResult.success) {
                throw new Error(`V2注入处理器失败: ${prepareResult.error}`);
            }

            // 🔥 流式读取并发送（与V1相同，但接收端处理不同）
            const chunkSize = 2 * 1024 * 1024;
            const totalChunks = Math.ceil(fileSize / chunkSize);
            const fd = fs.openSync(filePath, 'r');

            console.log(`📦 V2开始传输 ${totalChunks} 个块...`);

            try {
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, fileSize);
                    const actualChunkSize = end - start;

                    const buffer = Buffer.alloc(actualChunkSize);
                    fs.readSync(fd, buffer, 0, actualChunkSize, start);

                    const chunkBase64 = buffer.toString('base64');

                    // 发送到V2处理器
                    const chunkScript = `
                    if (window.__streamUploaderV2) {
                        window.__streamUploaderV2.processChunk('${chunkBase64}', ${i}, ${totalChunks});
                    } else {
                        console.error('❌ V2流式上传处理器不存在');
                    }
                    `;

                    await tab.webContentsView.webContents.executeJavaScript(chunkScript);

                    // 🔥 立即释放Node.js端内存
                    buffer.fill(0);

                    if (i % 10 === 0 || i === totalChunks - 1) {
                        const progress = ((i + 1) / totalChunks * 100).toFixed(1);
                        console.log(`📊 V2传输进度: ${progress}% (${i + 1}/${totalChunks})`);
                    }
                }

                console.log(`✅ V2所有块传输完成，等待文件组装...`);
                await new Promise(resolve => setTimeout(resolve, 2000));

                return true;

            } finally {
                fs.closeSync(fd);
            }

        } catch (error) {
            console.error(`❌ V2流式上传失败:`, error);
            return false;
        }
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
    async setInputFiles(tabId: string, selector: string, filePath: string): Promise<boolean> {
        try {
            const result = await this.setFileInput(tabId, selector, filePath);
            return result.success || false;
        } catch (error) {
            console.error(`❌ setInputFiles failed:`, error);
            return false;
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