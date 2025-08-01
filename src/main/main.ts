import { app, BrowserWindow, Menu, MenuItem, ipcMain } from 'electron';
import * as path from 'path';
import { SessionManager } from './SessionManager';
import { TabManager } from './TabManager';
import { APIServer } from './APIServer';
import { AutomationEngine } from './automation/AutomationEngine';
import { AccountStorage } from './plugins/login/base/AccountStorage';
import { HeadlessManager } from './HeadlessManager';
class MultiAccountBrowser {
    private mainWindow: BrowserWindow | null = null;
    private sessionManager: SessionManager;
    private tabManager!: TabManager;  // 使用断言赋值
    private apiServer!: APIServer;    // 使用断言赋值
    private automationEngine!: AutomationEngine;
    private headlessManager: HeadlessManager;
    constructor() {
        // 确保 Electron 版本支持 WebContentsView
        console.log(`🚀 Starting Multi-Account Browser with Electron ${process.versions.electron}`);
        console.log(`🔄 Using WebContentsView renderer`);
        console.log('🔍 Command line arguments:', process.argv);
        this.headlessManager = HeadlessManager.getInstance();
        // Electron 性能优化参数
        app.commandLine.appendSwitch('--enable-features', 'VaapiVideoDecoder');
        app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
        app.commandLine.appendSwitch('--enable-gpu-rasterization');
        app.commandLine.appendSwitch('--enable-zero-copy');
        app.commandLine.appendSwitch('--ignore-gpu-blacklist');
        app.commandLine.appendSwitch('--disable-background-timer-throttling');
        app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
        app.commandLine.appendSwitch('--disable-renderer-backgrounding');
        // ✅ 新增：彻底禁用各种通知和提示
        app.commandLine.appendSwitch('--disable-notifications');
        app.commandLine.appendSwitch('--disable-infobars');
        app.commandLine.appendSwitch('--disable-translate');
        app.commandLine.appendSwitch('--disable-save-password-bubble');
        app.commandLine.appendSwitch('--disable-automation');
        app.commandLine.appendSwitch('--no-first-run');
        app.commandLine.appendSwitch('--no-default-browser-check');
        app.commandLine.appendSwitch('--disable-default-apps');
        app.commandLine.appendSwitch('--disable-extensions');
        app.commandLine.appendSwitch('--disable-component-extensions-with-background-pages');
        app.commandLine.appendSwitch('--disable-background-networking');
        app.commandLine.appendSwitch('--disable-sync');
        app.commandLine.appendSwitch('--disable-features', 'MediaRouter');
        app.commandLine.appendSwitch('--disable-ipc-flooding-protection');

        // ✅ 新增：禁用开发者工具相关提示
        app.commandLine.appendSwitch('--disable-dev-shm-usage');
        app.commandLine.appendSwitch('--disable-gpu-sandbox');
        app.commandLine.appendSwitch('--disable-software-rasterizer');
        app.commandLine.appendSwitch('--disable-background-timer-throttling');

        // ✅ 新增：禁用语言和地区检测提示
        app.commandLine.appendSwitch('--lang', 'en-US');
        app.commandLine.appendSwitch('--disable-locale-detection');

        // ✅ 新增：禁用各种安全警告
        app.commandLine.appendSwitch('--allow-running-insecure-content');
        app.commandLine.appendSwitch('--disable-web-security');
        app.commandLine.appendSwitch('--disable-site-isolation-trials');
        app.commandLine.appendSwitch('--enable-remote-extensions');
        //app.commandLine.appendSwitch('remote-debugging-port', '9712');
        this.sessionManager = new SessionManager(
            path.join(app.getPath('userData'), 'sessions')
        );
    }

    private setupDeveloperTools(): void {
        if (process.env.NODE_ENV !== 'development') return;

        // 监听开发者工具打开事件
        this.mainWindow?.webContents.on('devtools-opened', () => {
            console.log('🛠️ DevTools opened');

            // 确保主窗口不会遮挡开发者工具
            setTimeout(() => {
                if (this.mainWindow) {
                    // 调整窗口大小，为开发者工具让出空间
                    const bounds = this.mainWindow.getBounds();
                    this.mainWindow.setBounds({
                        x: bounds.x,
                        y: bounds.y,
                        width: Math.max(800, bounds.width - 400), // 减小宽度
                        height: bounds.height
                    });
                }
            }, 100);
        });

        // 监听开发者工具关闭事件
        this.mainWindow?.webContents.on('devtools-closed', () => {
            console.log('🛠️ DevTools closed');

            // 恢复窗口大小
            setTimeout(() => {
                if (this.mainWindow) {
                    this.mainWindow.setBounds({
                        x: 100,
                        y: 100,
                        width: 1400,
                        height: 900
                    });
                }
            }, 100);
        });

        // 添加菜单项来控制开发者工具
        const currentMenu = Menu.getApplicationMenu();
        if (currentMenu) {
            const toolsMenu = currentMenu.items.find(item => item.label === '工具');
            if (toolsMenu && toolsMenu.submenu) {
                toolsMenu.submenu.append(new MenuItem({
                    label: '独立窗口开发者工具',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        this.mainWindow?.webContents.openDevTools({ mode: 'detach' });
                    }
                }));
            }
        }
    }

    private createWindow(): void {
        const mode = this.headlessManager.getMode();
        console.log(`🚀 创建窗口 - 模式: ${mode}`);

        // 基础配置（所有模式共用）
        const baseConfig: Electron.BrowserWindowConstructorOptions = {
            width: 1400,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload/preload.js'),
                devTools: true,//process.env.NODE_ENV === 'development',
                webSecurity: false,
                allowRunningInsecureContent: true,
                experimentalFeatures: false,
                backgroundThrottling: false,
                webviewTag: true,
                offscreen: false
            },
            title: 'Multi-Account Browser (WebContentsView)',
            minWidth: 800,
            minHeight: 600,
            simpleFullscreen: false,
            fullscreenable: true,
            closable: true
        };

        // 根据模式设置特定配置
        let modeSpecificConfig: Partial<Electron.BrowserWindowConstructorOptions> = {};

        switch (mode) {
            case 'headless':
                modeSpecificConfig = {
                    show: false,
                    skipTaskbar: true,
                    frame: false,
                    resizable: false,
                    minimizable: false,
                    maximizable: false,
                    focusable: false,
                    titleBarStyle: 'hidden'
                };
                break;

            case 'background':
                modeSpecificConfig = {
                    show: false,
                    skipTaskbar: false,  // 保留任务栏图标但隐藏
                    frame: true,
                    resizable: true,
                    minimizable: true,
                    maximizable: true,
                    focusable: true,
                    titleBarStyle: 'default'
                };
                break;

            case 'normal':
            default:
                modeSpecificConfig = {
                    show: false, // 先不显示，等待ready-to-show
                    skipTaskbar: false,
                    frame: true,
                    resizable: true,
                    minimizable: true,
                    maximizable: true,
                    focusable: true,
                    titleBarStyle: 'default'
                };
                break;
        }

        // 合并配置
        const windowConfig = { ...baseConfig, ...modeSpecificConfig };

        this.mainWindow = new BrowserWindow(windowConfig);

        // 将窗口传给 HeadlessManager 进行模式配置
        this.headlessManager.setMainWindow(this.mainWindow);

        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        });

        // 开发者工具处理（只在normal模式下自动打开）
        if (process.env.NODE_ENV === 'development' && mode === 'normal') {
            this.mainWindow.webContents.once('did-finish-load', () => {
                setTimeout(() => {
                    this.mainWindow?.webContents.openDevTools({
                        mode: 'detach'
                    });
                }, 1000);
            });
        }

        // 加载HTML文件的逻辑保持不变
        const htmlPath = path.join(__dirname, '../renderer/index.html');
        console.log('Loading HTML from:', htmlPath);

        if (require('fs').existsSync(htmlPath)) {
            this.mainWindow.loadFile(htmlPath);
        } else {
            console.error('HTML file not found at:', htmlPath);
            const backupPath = path.join(__dirname, '../../src/renderer/index.html');
            if (require('fs').existsSync(backupPath)) {
                console.log('Using backup path:', backupPath);
                this.mainWindow.loadFile(backupPath);
            } else {
                console.error('Backup HTML file also not found at:', backupPath);
                this.mainWindow.loadURL('data:text/html,<h1>请先运行 npm run build 编译项目</h1><p>WebContentsView 版本</p>');
            }
        }

        // 窗口加载完成后的处理
        this.mainWindow.once('ready-to-show', () => {
            if (mode === 'normal') {
                this.mainWindow?.show();
                console.log('✅ Main window loaded and shown');
            } else {
                console.log(`✅ Main window loaded in ${mode} mode (hidden)`);
            }
        });


        // 设置菜单（只在normal模式）
        if (mode === 'normal') {
            this.createMenu();
        }

        // 窗口关闭事件
        this.mainWindow.on('close', (event) => {
            const mode = this.headlessManager.getMode();

            if (mode === 'background') {
                // background 模式下，关闭窗口 = 隐藏窗口，不退出应用
                console.log('📱 Background模式: 窗口关闭 → 隐藏到后台');
                event.preventDefault(); // 阻止默认的关闭行为
                this.mainWindow?.hide();

                // 可选：显示提示
                this.showBackgroundModeNotification();

            } else if (mode === 'headless') {
                // headless 模式下，不应该有窗口关闭事件，但如果有就退出
                console.log('🔇 Headless模式: 应用退出');
                // 不阻止，让应用正常退出

            } else {
                // normal 模式下，关闭窗口 = 退出应用
                console.log('👁️ Normal模式: 应用退出');
                // 不阻止，让应用正常退出
            }
        });

        // 保留原有的 closed 事件处理
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
        // 优化窗口渲染
        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log(`✅ Main window content loaded (${mode} mode)`);
        });
    }
    private showBackgroundModeNotification(): void {
        try {
            const { Notification } = require('electron');
            if (Notification.isSupported()) {
                new Notification({
                    title: 'Multi-Account Browser',
                    body: '应用已隐藏到后台运行\n双击托盘图标可重新显示',
                    icon: path.join(__dirname, '../../assets/icon.png') // 如果有图标
                }).show();
            }
        } catch (error) {
            console.log('💡 应用已隐藏到后台，双击托盘图标可重新显示');
        }
    }
    private createMenu(): void {
        const template: any[] = [
            {
                label: '文件',
                submenu: [
                    {
                        label: '新建账号标签页',
                        accelerator: 'CmdOrCtrl+T',
                        click: () => {
                            this.mainWindow?.webContents.send('menu-new-tab');
                        }
                    },
                    {
                        label: '关闭当前标签页',
                        accelerator: 'CmdOrCtrl+W',
                        click: () => {
                            this.mainWindow?.webContents.send('menu-close-tab');
                        }
                    },
                    { type: 'separator' },
                    {
                        label: '退出',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: '工具',
                submenu: [
                    {
                        label: '调试 WebContentsView 边界',
                        click: () => {
                            this.tabManager?.debugWebContentsViewBounds();
                        }
                    },
                    {
                        label: '强制更新边界',
                        click: () => {
                            this.tabManager?.forceUpdateAllBounds();
                        }
                    },
                    {
                        label: '开发者工具',
                        accelerator: 'F12',
                        click: () => {
                            // 确保开发者工具能正常打开
                            if (this.mainWindow) {
                                const webContents = this.mainWindow.webContents;
                                if (webContents.isDevToolsOpened()) {
                                    webContents.closeDevTools();
                                } else {
                                    webContents.openDevTools({ mode: 'detach' });
                                }
                            }
                        }

                    }
                ]
            },
            {
                label: '帮助',
                submenu: [
                    {
                        label: '关于',
                        click: () => {
                            const { dialog } = require('electron');
                            dialog.showMessageBox(this.mainWindow!, {
                                type: 'info',
                                title: '关于',
                                message: 'Multi-Account Browser v2.0',
                                detail: 'WebContentsView 版本\n支持多账号 Cookie 隔离'
                            });
                        }
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    private setupIPC(): void {
        // 获取所有标签页 - 修复序列化问题
        ipcMain.handle('get-all-tabs', async () => {
            try {
                const allTabs = this.tabManager.getAllTabs();
                const visibleTabs = allTabs.filter(tab => !tab.isHeadless);

                // 将 AccountTab 对象转换为可序列化的对象
                const serializableTabs = visibleTabs.map(tab => ({
                    id: tab.id,
                    accountName: tab.accountName,
                    platform: tab.platform,
                    loginStatus: tab.loginStatus,
                    url: tab.url,
                    cookieFile: tab.cookieFile,
                    renderer: 'WebContentsView'
                    // 注意：不包含 session 和 webContentsView，因为这些不能序列化
                }));

                return { success: true, tabs: serializableTabs };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    tabs: []
                };
            }
        });

        // 创建账号标签页
        ipcMain.handle('create-account-tab', async (event, accountName: string, platform: string, initialUrl?: string) => {
            try {
                const tabId = await this.tabManager.createAccountTab(accountName, platform, initialUrl);
                return { success: true, tabId };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 切换标签页
        ipcMain.handle('switch-tab', async (event, tabId: string) => {
            try {
                await this.tabManager.switchToTab(tabId);
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 关闭标签页
        ipcMain.handle('close-tab', async (event, tabId: string) => {
            try {
                await this.tabManager.closeTab(tabId);
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 加载Cookie
        ipcMain.handle('load-cookies', async (event, tabId: string, cookieFile: string) => {
            try {
                await this.tabManager.loadAccountCookies(tabId, cookieFile);
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 保存Cookie
        ipcMain.handle('save-cookies', async (event, tabId: string, cookieFile: string) => {
            try {
                await this.tabManager.saveCookies(tabId, cookieFile);
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });


        // 显示打开对话框
        ipcMain.handle('show-open-dialog', async (event, options) => {
            try {
                const { dialog } = require('electron');
                const result = await dialog.showOpenDialog(this.mainWindow!, options);
                return result;
            } catch (error) {
                throw error;
            }
        });

        // 显示保存对话框
        ipcMain.handle('show-save-dialog', async (event, options) => {
            try {
                const { dialog } = require('electron');
                const result = await dialog.showSaveDialog(this.mainWindow!, options);
                return result;
            } catch (error) {
                throw error;
            }
        });

        // 显示通知
        ipcMain.handle('show-notification', async (event, title: string, body: string) => {
            try {
                const { Notification } = require('electron');
                if (Notification.isSupported()) {
                    new Notification({ title, body }).show();
                }
                return { success: true };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 日志记录
        ipcMain.handle('log', async (event, level: string, message: string) => {
            console.log(`[${level.toUpperCase()}] ${message}`);
            return { success: true };
        });

        // 获取系统信息
        ipcMain.handle('get-system-info', async () => {
            try {
                const os = require('os');
                return {
                    success: true,
                    data: {
                        platform: os.platform(),
                        arch: os.arch(),
                        totalmem: os.totalmem(),
                        freemem: os.freemem(),
                        uptime: os.uptime(),
                        electronVersion: process.versions.electron,
                        renderer: 'WebContentsView'
                    }
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });
        // 获取当前浏览器模式
        ipcMain.handle('get-browser-mode', async () => {
            try {
                const mode = this.headlessManager.getMode();
                return {
                    success: true,
                    data: {
                        mode: mode,
                        isHidden: this.headlessManager.isHidden(),
                        isHeadless: this.headlessManager.isHeadlessMode(),
                        isBackground: this.headlessManager.isBackgroundMode(),
                        canShow: mode !== 'headless',
                        timestamp: new Date().toISOString()
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get browser mode'
                };
            }
        });

        // 显示主窗口
        ipcMain.handle('show-window', async () => {
            try {
                const mode = this.headlessManager.getMode();

                if (mode === 'headless') {
                    return {
                        success: false,
                        error: 'Cannot show window in headless mode'
                    };
                }

                this.headlessManager.showWindow();
                return {
                    success: true,
                    message: 'Window shown successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to show window'
                };
            }
        });

        // 隐藏主窗口
        ipcMain.handle('hide-window', async () => {
            try {
                this.headlessManager.hideWindow();
                return {
                    success: true,
                    message: 'Window hidden successfully'
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to hide window'
                };
            }
        });

        // 切换浏览器模式
        ipcMain.handle('switch-browser-mode', async (event, newMode: string) => {
            try {
                // 严格的模式验证
                const validModes = ['normal', 'headless', 'background'] as const;
                type BrowserMode = typeof validModes[number];

                if (!validModes.includes(newMode as BrowserMode)) {
                    return {
                        success: false,
                        error: `Invalid mode: ${newMode}. Valid modes are: ${validModes.join(', ')}`
                    };
                }

                const currentMode = this.headlessManager.getMode();

                if (currentMode === newMode) {
                    return {
                        success: true,
                        message: `Already in ${newMode} mode`,
                        data: {
                            currentMode: currentMode,
                            previousMode: currentMode
                        }
                    };
                }

                // 执行模式切换
                await this.headlessManager.switchMode(newMode as BrowserMode);

                return {
                    success: true,
                    message: `Successfully switched from ${currentMode} to ${newMode} mode`,
                    data: {
                        currentMode: this.headlessManager.getMode(),
                        previousMode: currentMode
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to switch browser mode'
                };
            }
        });

        // 临时显示窗口（仅 background 模式）
        ipcMain.handle('show-window-temporarily', async (event, duration: number = 5000) => {
            try {
                const mode = this.headlessManager.getMode();

                // 验证参数
                if (typeof duration !== 'number' || duration <= 0 || duration > 300000) {
                    return {
                        success: false,
                        error: 'Duration must be a positive number between 1 and 300000 (5 minutes)'
                    };
                }

                if (mode === 'headless') {
                    return {
                        success: false,
                        error: 'Cannot show window temporarily in headless mode'
                    };
                }

                if (mode === 'normal') {
                    return {
                        success: false,
                        error: 'Window is already visible in normal mode'
                    };
                }

                await this.headlessManager.showTemporarily(duration);

                return {
                    success: true,
                    message: `Window will be shown temporarily for ${duration}ms`,
                    data: {
                        duration: duration,
                        mode: mode
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to show window temporarily'
                };
            }
        });

        // 获取窗口状态
        ipcMain.handle('get-window-status', async () => {
            try {
                const mode = this.headlessManager.getMode();
                const isVisible = this.mainWindow?.isVisible() || false;
                const isMinimized = this.mainWindow?.isMinimized() || false;
                const isMaximized = this.mainWindow?.isMaximized() || false;
                const isFocused = this.mainWindow?.isFocused() || false;

                return {
                    success: true,
                    data: {
                        mode: mode,
                        isVisible: isVisible,
                        isMinimized: isMinimized,
                        isMaximized: isMaximized,
                        isFocused: isFocused,
                        isHidden: this.headlessManager.isHidden(),
                        bounds: this.mainWindow?.getBounds() || null,
                        timestamp: new Date().toISOString()
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get window status'
                };
            }
        });

        // 获取支持的模式列表
        ipcMain.handle('get-supported-modes', async () => {
            try {
                return {
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
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to get supported modes'
                };
            }
        });
    }

    private async initialize(): Promise<void> {
        await app.whenReady();

        // 检查 WebContentsView 支持
        try {
            const { WebContentsView } = require('electron');
            if (!WebContentsView) {
                throw new Error('WebContentsView not available');
            }
            console.log('✅ WebContentsView support confirmed');
        } catch (error) {
            console.error('❌ WebContentsView not supported in this Electron version');
            console.error('Please upgrade to Electron 29+ to use WebContentsView');
            app.quit();
            return;
        }

        this.createWindow();

        if (this.mainWindow) {
            try {
                // 🔥 步骤0：首先初始化数据库
                console.log('🗄️ 初始化数据库...');
                await AccountStorage.ensureDatabaseInitialized();
                console.log('✅ 数据库初始化完成');
                // 🔥 步骤1：初始化 TabManager
                console.log('📋 初始化 TabManager...');
                this.tabManager = new TabManager(this.mainWindow, this.sessionManager);

                // 🔥 步骤2：创建 AutomationEngine
                console.log('🔧 初始化 AutomationEngine...');
                this.automationEngine = new AutomationEngine(this.tabManager);

                // 🔥 步骤3：初始化所有插件
                console.log('🔌 初始化插件系统...');
                await this.automationEngine.getPluginManager().initializeAllPlugins();
                console.log('✅ 插件系统初始化完成');

                // 🔥 步骤4：创建 APIServer
                console.log('🚀 初始化 API 服务器...');
                this.apiServer = new APIServer(this.automationEngine, this.tabManager);

                // 🔥 步骤5：设置IPC通信
                this.setupIPC();

                // 🔥 步骤6：启动API服务器
                await this.apiServer.start(3409);
                console.log('✅ API 服务器启动成功: http://localhost:3409');

                // 只在normal模式下设置开发者工具
                const mode = this.headlessManager.getMode();
                if (mode === 'normal') {
                    this.setupDeveloperTools();
                }
                this.logInitializationComplete(mode);
            } catch (error) {
                console.error('❌ 初始化过程中发生错误:', error);

                // 清理资源
                if (this.apiServer) {
                    try {
                        await this.apiServer.stop();
                    } catch (stopError) {
                        console.error('❌ 停止 API 服务器失败:', stopError);
                    }
                }

                throw error;
            }
        }
    }
    private logInitializationComplete(mode: string): void {
        console.log(`🎉 Multi-Account Browser 初始化完成 (${mode} 模式)`);

        switch (mode) {
            case 'headless':
                console.log('🔇 无界面模式 - 可用功能:');
                console.log('   - API调用: http://localhost:3409');
                console.log('   - 创建标签页: POST /api/account/create');
                console.log('   - 账号验证等后台任务');
                break;

            case 'background':
                console.log('📱 后台模式 - 可用功能:');
                console.log('   - API调用: http://localhost:3409');
                console.log('   - 双击托盘图标显示界面');
                console.log('   - 可通过API控制窗口显示/隐藏');
                break;

            case 'normal':
            default:
                console.log('👁️ 正常模式 - 可用功能:');
                console.log('   - 界面操作: 创建、切换、管理标签页');
                console.log('   - API调用: http://localhost:3409');
                console.log('   - 开发者工具和调试功能');
                break;
        }

        console.log('📖 使用提示:');
        console.log('   - 创建标签页: 通过界面或 API');
        console.log('   - 账号登录: 加载 Cookie 文件');
        console.log('   - 自动化任务: 使用插件系统');
    }
    private setupAppEvents(): void {
        app.on('window-all-closed', () => {
            const mode = this.headlessManager.getMode();

            if (mode === 'background') {
                // background 模式下，即使所有窗口关闭也不退出应用
                console.log('📱 Background模式: 所有窗口已关闭，但应用继续在后台运行');

                // 可选：显示提示
                if (process.platform !== 'darwin') {
                    this.showBackgroundModeNotification();
                }
            } else {
                // normal 和 headless 模式下的正常处理
                if (process.platform !== 'darwin') {
                    app.quit();
                }
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        app.on('before-quit', async (event) => {
            console.log('🛑 应用程序准备退出...');

            // 防止应用立即退出，等待清理完成
            event.preventDefault();

            try {
                // 🔥 步骤1：停止 API 服务器
                if (this.apiServer) {
                    console.log('🛑 停止 API 服务器...');
                    await this.apiServer.stop();
                }

                // 🔥 步骤2：清理所有标签页
                if (this.tabManager) {
                    console.log('🗑️ 清理所有标签页...');
                    const tabs = this.tabManager.getAllTabs();
                    for (const tab of tabs) {
                        try {
                            await this.tabManager.closeTab(tab.id);
                        } catch (error) {
                            console.warn(`⚠️ 关闭标签页 ${tab.id} 失败:`, error);
                        }
                    }
                }

                // 🔥 步骤3：销毁插件
                if (this.automationEngine) {
                    console.log('🔌 销毁插件系统...');
                    await this.automationEngine.getPluginManager().destroyAllPlugins();
                }
                // 新增：清理 HeadlessManager
                console.log('🔇 清理 HeadlessManager...');
                this.headlessManager.destroy();

                console.log('✅ 清理完成，应用程序退出');

            } catch (error) {
                console.error('❌ 清理过程中发生错误:', error);
            } finally {
                // 强制退出
                app.exit(0);
            }
        });

        // 处理未捕获的异常
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // macOS 特定的应用事件
        if (process.platform === 'darwin') {
            app.on('activate', () => {
                // 在 macOS 上，当点击 dock 图标并且没有其他窗口打开时，
                // 通常在应用程序中重新创建一个窗口。
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createWindow();
                }
            });
        }
    }

    async start(): Promise<void> {
        const mode = this.headlessManager.getMode();
        console.log(`🚀 Multi-Account Browser 启动中...`);
        console.log(`📱 检测到启动模式: ${mode}`);

        if (mode === 'headless') {
            console.log('🔇 无界面模式 - 窗口完全隐藏，仅API可用');
        } else if (mode === 'background') {
            console.log('📱 后台模式 - 窗口隐藏但可调出查看');
        } else {
            console.log('👁️ 正常模式 - 窗口正常显示');
        }
        this.setupAppEvents();
        await this.initialize();
    }
}

// 启动应用
const browser = new MultiAccountBrowser();
browser.start().catch((error) => {
    console.error('❌ 应用启动失败:', error);
    process.exit(1);
});