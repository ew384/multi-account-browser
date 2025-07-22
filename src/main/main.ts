import { app, BrowserWindow, Menu, MenuItem, ipcMain } from 'electron';
import * as path from 'path';
import { SessionManager } from './SessionManager';
import { TabManager } from './TabManager';
import { APIServer } from './APIServer';
import { AutomationEngine } from './automation/AutomationEngine';
import { AccountStorage } from './plugins/login/base/AccountStorage';
class MultiAccountBrowser {
    private mainWindow: BrowserWindow | null = null;
    private sessionManager: SessionManager;
    private tabManager!: TabManager;  // 使用断言赋值
    private apiServer!: APIServer;    // 使用断言赋值
    private automationEngine!: AutomationEngine;
    constructor() {
        // 确保 Electron 版本支持 WebContentsView
        console.log(`🚀 Starting Multi-Account Browser with Electron ${process.versions.electron}`);
        console.log(`🔄 Using WebContentsView renderer`);

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
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload/preload.js'),
                devTools: process.env.NODE_ENV === 'development',
                webSecurity: false, // ✅ 禁用 web 安全检查
                allowRunningInsecureContent: true,
                experimentalFeatures: false,
                // ✅ 新增：禁用各种提示
                backgroundThrottling: false,
                webviewTag: true,
                offscreen: false
            },
            title: 'Multi-Account Browser (WebContentsView)',
            show: false, // 先不显示，等待加载完成
            titleBarStyle: 'default',
            frame: true,
            // ✅ 修复开发者工具问题 - 确保窗口足够大
            minWidth: 800,
            minHeight: 600,
            simpleFullscreen: false,
            fullscreenable: true,
            resizable: true,
            minimizable: true,
            maximizable: true,
            closable: true
        });
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            // 让外部链接在默认浏览器中打开
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        });

        // ✅ 开发者工具专门处理
        if (process.env.NODE_ENV === 'development') {
            // 在窗口加载完成后打开开发者工具，确保不被遮挡
            this.mainWindow.webContents.once('did-finish-load', () => {
                // 延迟打开开发者工具，确保界面加载完成
                setTimeout(() => {
                    this.mainWindow?.webContents.openDevTools({
                        mode: 'detach' // ✅ 关键：使用独立窗口模式
                    });
                }, 1000);
            });
        }
        // 修复：使用正确的HTML文件路径
        const htmlPath = path.join(__dirname, '../renderer/index.html');
        console.log('Loading HTML from:', htmlPath);

        // 检查文件是否存在
        if (require('fs').existsSync(htmlPath)) {
            this.mainWindow.loadFile(htmlPath);
        } else {
            console.error('HTML file not found at:', htmlPath);
            // 尝试备用路径
            const backupPath = path.join(__dirname, '../../src/renderer/index.html');
            if (require('fs').existsSync(backupPath)) {
                console.log('Using backup path:', backupPath);
                this.mainWindow.loadFile(backupPath);
            } else {
                console.error('Backup HTML file also not found at:', backupPath);
                // 创建一个临时的HTML内容
                this.mainWindow.loadURL('data:text/html,<h1>请先运行 npm run build 编译项目</h1><p>WebContentsView 版本</p>');
            }
        }

        // 窗口加载完成后显示
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
            console.log('✅ Main window loaded and shown');
        });

        // 开发模式下打开开发者工具
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }

        // 设置菜单
        this.createMenu();

        // 窗口关闭事件
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // 优化窗口渲染
        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log('✅ Main window content loaded');
        });
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
                            this.mainWindow?.webContents.openDevTools();
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
                const tabs = this.tabManager.getAllTabs();

                // 将 AccountTab 对象转换为可序列化的对象
                const serializableTabs = tabs.map(tab => ({
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

                // 创建一个示例标签页用于测试（仅开发模式）
                if (process.env.NODE_ENV === 'development') {
                    setTimeout(async () => {
                        try {
                            const tabId = await this.tabManager.createAccountTab(
                                '测试账号-WebContentsView',
                                '微信视频号',
                                'https://channels.weixin.qq.com'
                            );
                            await this.tabManager.switchToTab(tabId);
                            console.log('✅ Test tab created successfully with WebContentsView');
                        } catch (error) {
                            console.error('Failed to create test tab:', error);
                        }
                    }, 2000);
                }
                this.setupDeveloperTools();
                console.log('🎉 Multi-Account Browser 初始化完成');
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
    private setupAppEvents(): void {
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
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