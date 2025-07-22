import { WebContentsView, BrowserWindow, Session } from 'electron';
import { SessionManager } from './SessionManager';
import { CookieManager } from './CookieManager';
import { AccountTab } from '../types';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { app } from 'electron'

const dbPath = path.join(
    app.getPath('userData'),
    'database.db'
)
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
    // 标签页标题缓存
    private tabTitles: Map<string, string> = new Map();
    private tabFavicons: Map<string, string> = new Map();
    // 添加窗口布局常量
    private readonly HEADER_HEIGHT = 60;
    private readonly TAB_BAR_HEIGHT = 48;
    private readonly TOP_OFFSET = 108; // 60px header + 48px tab-bar
    private initScripts: Map<string, string[]> = new Map();
    private stealthScript: string | null = null;
    constructor(mainWindow: BrowserWindow, sessionManager: SessionManager) {
        this.mainWindow = mainWindow;
        this.sessionManager = sessionManager;
        this.cookieManager = new CookieManager();
        this.setupWindowEvents();
        this.loadStealthScript();
    }
    private loadStealthScript(): void {
        try {
            // 假设stealth.min.js在项目根目录的utils文件夹中
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

    async getQRCode(tabId: string, selector: string): Promise<string | null> {
        const tab = this.tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);

        try {
            console.log(`🔍 获取二维码: ${selector} (${tab.accountName})`);

            const script = `
            (function() {
                try {
                    // 处理 iframe 中的图片
                    if ('${selector}'.includes('iframe')) {
                        const iframe = document.querySelector('iframe');
                        if (iframe && iframe.contentDocument) {
                            const img = iframe.contentDocument.querySelector('img');
                            return img ? img.src : null;
                        }
                    }
                    
                    // 处理普通选择器
                    const element = document.querySelector('${selector}');
                    if (element) {
                        if (element.tagName === 'IMG') {
                            return element.src;
                        }
                        // 如果不是img标签，查找其中的img
                        const img = element.querySelector('img');
                        return img ? img.src : null;
                    }
                    
                    return null;
                } catch (e) {
                    console.error('获取二维码失败:', e);
                    return null;
                }
            })()
            `;

            const result = await tab.webContentsView.webContents.executeJavaScript(script);

            if (result) {
                console.log(`✅ 二维码获取成功: ${result.substring(0, 50)}...`);
            } else {
                console.log(`❌ 未找到二维码: ${selector}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ 获取二维码失败 for ${tab.accountName}:`, error);
            return null;
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
                tab.webContentsView.webContents.removeListener('did-navigate', onNavigate);
                tab.webContentsView.webContents.removeListener('did-navigate-in-page', onNavigate);
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

            // 监听导航事件
            tab.webContentsView.webContents.on('did-navigate', onNavigate);
            tab.webContentsView.webContents.on('did-navigate-in-page', onNavigate);

            // 设置超时
            timeoutId = setTimeout(() => {
                console.log(`⏰ URL变化监听超时: ${tab.accountName}`);
                cleanup();
                resolve(false);
            }, timeout);

            // 定期检查URL变化（备用方案）
            const checkInterval = setInterval(() => {
                if (resolved) {
                    clearInterval(checkInterval);
                    return;
                }

                try {
                    const currentUrl = tab.webContentsView.webContents.getURL();
                    if (currentUrl !== originalUrl && !currentUrl.includes('about:blank')) {
                        console.log(`✅ 定期检查发现URL变化: ${tab.accountName}`);
                        clearInterval(checkInterval);
                        cleanup();
                        resolve(true);
                    }
                } catch (error) {
                    console.warn(`URL检查出错: ${error}`);
                }
            }, 1000);

            // 确保interval也会被清理
            const originalCleanup = cleanup;
            const enhancedCleanup = () => {
                clearInterval(checkInterval);
                originalCleanup();
            };

            // 替换cleanup引用
            timeoutId = setTimeout(() => {
                console.log(`⏰ URL变化监听超时: ${tab.accountName}`);
                enhancedCleanup();
                resolve(false);
            }, timeout);
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
                webContentsView: webContentsView,
                loginStatus: 'unknown',
                url: initialUrl || `https://channels.weixin.qq.com`
            };

            this.tabs.set(tabId, tab);
            this.setupWebContentsViewEvents(tab);
            webContentsView.webContents.once('did-finish-load', async () => {
                try {
                    await webContentsView.webContents.executeJavaScript(`
                        window.__TAB_ID__ = '${tabId}';
                        window.__ACCOUNT_NAME__ = '${accountName}';
                        window.__PLATFORM__ = '${platform}';
                        console.log('🏷️ Tab identity injected:', {
                            tabId: '${tabId}',
                            accountName: '${accountName}',
                            platform: '${platform}'
                        });
                    `);
                    console.log(`✅ Tab ID injected for ${accountName}: ${tabId}`);
                } catch (error) {
                    console.warn(`Failed to inject tab_id for ${accountName}:`, error);
                }
            });

            // 🔥 页面导航时重新注入
            webContentsView.webContents.on('did-navigate', async (event, url) => {
                try {
                    await webContentsView.webContents.executeJavaScript(`
                        window.__TAB_ID__ = '${tabId}';
                        window.__ACCOUNT_NAME__ = '${accountName}';
                        window.__PLATFORM__ = '${platform}';
                    `);
                    console.log(`🔄 Tab ID re-injected after navigation: ${tabId}`);
                } catch (error) {
                    console.warn(`Failed to re-inject tab_id after navigation:`, error);
                }
            });
            console.log(`✅ Tab created successfully: ${accountName} (${tabId})`);
            console.log(`🔄 Auto-switching to new tab: ${accountName}`);
            await this.switchToTab(tabId);
            // 如果有初始URL，开始导航（非阻塞）
            if (this.stealthScript) {
                try {
                    await this.addInitScript(tabId, this.stealthScript);
                    console.log(`🛡️ 反检测脚本已注入: ${accountName}`);
                } catch (error) {
                    console.warn(`⚠️ 反检测脚本注入失败 for ${accountName}:`, error);
                }
            }
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
    private async getAccountInfoFromDb(cookieFile: string): Promise<AccountInfo | null> {
        /**
         * Get account info from database
         * @param cookieFile - Cookie file path
         * @returns Account info or null if not found
         */
        try {
            const cookieFilename = path.basename(cookieFile);

            // Open database connection
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            // Execute query
            const result = await db.get(
                'SELECT userName, type FROM user_info WHERE filePath = ?',
                [cookieFilename]
            );

            await db.close();

            if (result) {
                const { userName, type: platformType } = result;
                const platformMap: Record<number, string> = {
                    1: 'xiaohongshu',
                    2: 'weixin',
                    3: 'douyin',
                    4: 'kuaishou'
                };

                return {
                    username: userName,
                    platform: platformMap[platformType] || 'unknown',
                    platformType: platformType
                };
            }

            return null;
        } catch (e) {
            console.error(`⚠️ Failed to get account info:`, e);
            return null;
        }
    }
    async getOrCreateTab(cookieFile: string, platform: string, initialUrl: string, tabNamePrefix?: string): Promise<string> {
        /**
         * Get or create a tab - general method
         * 
         * @param cookieFile - Cookie file path/name, used as identifier
         * @param platform - Platform name (xiaohongshu, wechat, douyin, kuaishou)
         * @param initialUrl - Initial URL
         * @param tabNamePrefix - Tab name prefix, e.g. "视频号_", "抖音_"
         * @returns Tab ID
         */
        console.log(`🚀 Getting or creating tab for ${cookieFile} on ${platform}...`);

        const cookieIdentifier = typeof cookieFile === 'string' ? path.basename(cookieFile) : String(cookieFile);

        // 1. Check existing tabs
        try {
            const existingTabs = await this.getAllTabs();
            if (existingTabs) {
                for (const tab of existingTabs) {
                    const tabCookieFile = tab.cookieFile;
                    if (tabCookieFile) {
                        const tabCookieName = path.basename(tabCookieFile);
                        if (tabCookieName === cookieIdentifier) {
                            console.log(`🔄 Reusing existing tab: ${tab.id} (Cookie match: ${cookieIdentifier})`);
                            return tab.id;
                        }
                    } else {
                        console.log(`📋 Tab ${cookieFile} doesn't match (Cookie: ${tab.cookieFile})`);
                    }
                }
            }
        } catch (e) {
            console.error(`⚠️ Failed to query existing tabs:`, e);
        }

        // 2. Create new tab
        try {
            // Get account info for naming
            const accountInfo = await this.getAccountInfoFromDb(cookieFile);
            const accountName = accountInfo?.username || 'unknown';

            // Generate tab name
            let fullTabName: string;
            if (tabNamePrefix) {
                fullTabName = `${tabNamePrefix}${accountName}`;
            } else {
                const platformPrefixMap: Record<string, string> = {
                    'xiaohongshu': '小红书_',
                    'wechat': '视频号_',
                    'douyin': '抖音_',
                    'kuaishou': '快手_'
                };
                const prefix = platformPrefixMap[platform] || `${platform}_`;
                fullTabName = `${prefix}${accountName}`;
            }

            // Create tab (pass cookieFile directly for one-step process)
            const tabId = await this.createAccountTab(
                fullTabName,
                platform,
                initialUrl
            );
            await this.loadAccountCookies(tabId, cookieFile);
            return tabId;

        } catch (e) {
            throw new Error(`Failed to create tab: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async openDevTools(tabId: string): Promise<void> {
        console.log('🔧 TabManager.openDevTools called for:', tabId);

        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.log('❌ Tab not found:', tabId);
            throw new Error(`Tab ${tabId} not found`);
        }

        console.log('✅ Tab found:', tab.accountName);
        const accountName = tab.accountName;
        const cookieFilePath = path.join(__dirname, 'cookies', `${accountName}.json`);
        await this.cookieManager.saveCookiesFromSession(tab.session, cookieFilePath);
        try {
            const { BrowserWindow, session } = require('electron');

            console.log('🔧 Creating DevTools using webview approach for Electron 37...');

            // 🔥 获取当前页面的URL，用于在webview中重新加载
            const currentUrl = tab.webContentsView.webContents.getURL();
            console.log('🔧 Current page URL:', currentUrl);
            const partitionName = `persist:${accountName}`;
            const devtoolsSession = session.fromPartition(partitionName);

            // 📥 3. 加载 cookie 到 devtools 的 session
            await this.cookieManager.loadCookiesToSession(devtoolsSession, cookieFilePath)
            // 🔥 创建包含webview的开发者工具窗口
            const devtools = new BrowserWindow({
                width: 1400,
                height: 900,
                title: `DevTools - ${tab.accountName}`,
                show: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    devTools: true,  // 这个窗口本身可以有开发者工具
                    webviewTag: true, // 🔥 关键：启用webview标签
                    webSecurity: false
                },
                autoHideMenuBar: true
            });

            // 🔥 创建包含webview的HTML页面
            const webviewHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>DevTools for ${tab.accountName}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: #1e1e1e;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    .header {
                        background: #2d2d30;
                        color: #cccccc;
                        padding: 8px 16px;
                        border-bottom: 1px solid #3c3c3c;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        min-height: 40px;
                    }
                    .url-info {
                        font-size: 12px;
                        color: #9cdcfe;
                        font-family: monospace;
                    }
                    .controls {
                        display: flex;
                        gap: 8px;
                    }
                    .btn {
                        background: #0e639c;
                        color: white;
                        border: none;
                        padding: 4px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }
                    .btn:hover {
                        background: #1177bb;
                    }
                    .container {
                        flex: 1;
                        display: flex;
                        position: relative;
                    }
                    webview {
                        flex: 1;
                        border: none;
                    }
                    .status {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        color: #cccccc;
                        text-align: center;
                        pointer-events: none;
                        z-index: 1000;
                        background: rgba(45, 45, 48, 0.9);
                        padding: 20px;
                        border-radius: 8px;
                        display: none;
                    }
                    .loading {
                        display: block;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="url-info">🛠️ DevTools for: ${currentUrl || 'about:blank'}</div>
                    <div class="controls">
                        <button class="btn" onclick="openDevTools()">打开开发者工具</button>
                        <button class="btn" onclick="refreshPage()">刷新页面</button>
                        <button class="btn" onclick="inspectMode()">检查元素</button>
                    </div>
                </div>
                <div class="container">
                    <div id="status" class="status loading">
                        正在加载页面...
                    </div>
                    <webview 
                        id="webview" 
                        src="${currentUrl || 'about:blank'}"
                        partition="persist:devtools-${tabId}"
                        webpreferences="contextIsolation=false, nodeIntegration=false, devTools=true"
                        style="width: 100%; height: 100%;">
                    </webview>
                </div>
    
                <script>
                    console.log('DevTools webview container loaded');
                    
                    const webview = document.getElementById('webview');
                    const status = document.getElementById('status');
                    
                    // 🔥 webview事件监听
                    webview.addEventListener('dom-ready', () => {
                        console.log('✅ Webview DOM ready');
                        status.style.display = 'none';
                        
                        // 🔥 自动打开开发者工具
                        setTimeout(() => {
                            try {
                                webview.openDevTools();
                                console.log('✅ DevTools opened in webview');
                            } catch (error) {
                                console.error('❌ Failed to open DevTools:', error);
                            }
                        }, 1000);
                    });
    
                    webview.addEventListener('did-start-loading', () => {
                        console.log('🔄 Webview started loading');
                        status.textContent = '正在加载页面...';
                        status.style.display = 'block';
                    });
    
                    webview.addEventListener('did-finish-load', () => {
                        console.log('✅ Webview finished loading');
                        status.style.display = 'none';
                    });
    
                    webview.addEventListener('did-fail-load', (event) => {
                        console.error('❌ Webview failed to load:', event);
                        status.textContent = '页面加载失败';
                        status.style.display = 'block';
                    });
    
                    // 🔥 控制函数
                    function openDevTools() {
                        try {
                            webview.openDevTools();
                            console.log('🛠️ DevTools opened manually');
                        } catch (error) {
                            console.error('❌ Failed to open DevTools manually:', error);
                            alert('无法打开开发者工具: ' + error.message);
                        }
                    }
    
                    function refreshPage() {
                        webview.reload();
                        console.log('🔄 Page refreshed');
                    }
    
                    function inspectMode() {
                        try {
                            // 尝试启用检查模式
                            webview.executeJavaScript(\`
                                console.log('🔍 Inspect mode activated');
                                document.addEventListener('click', function(e) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Element clicked:', e.target);
                                    return false;
                                }, true);
                            \`);
                            alert('检查模式已激活，点击页面元素查看信息');
                        } catch (error) {
                            console.error('❌ Failed to activate inspect mode:', error);
                        }
                    }
    
                    // 🔥 与原始标签页同步Cookie的功能
                    function syncWithOriginalTab() {
                        // 这里可以通过IPC与主进程通信，同步Cookie
                        console.log('🔄 Syncing with original tab...');
                    }
    
                    // 监听webview的导航事件
                    webview.addEventListener('did-navigate', (event) => {
                        console.log('🔗 Webview navigated to:', event.url);
                        document.querySelector('.url-info').textContent = '🛠️ DevTools for: ' + event.url;
                    });
    
                    console.log('🎉 DevTools container ready');
                </script>
            </body>
            </html>
            `;

            // 🔥 加载webview HTML
            await devtools.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(webviewHTML)}`);

            // 窗口关闭处理
            devtools.on('closed', () => {
                console.log(`🔧 DevTools window closed for: ${tab.accountName}`);
            });

            console.log('✅ WebView-based DevTools created successfully');

        } catch (error) {
            console.error(`❌ Failed to create webview DevTools:`, error);
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
            webContents.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
                // 快速拒绝不必要的权限请求
                callback(false);
            });
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