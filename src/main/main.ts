import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';
import { SessionManager } from './SessionManager';
import { TabManager } from './TabManager';
import { APIServer } from './APIServer';

class MultiAccountBrowser {
    private mainWindow: BrowserWindow | null = null;
    private sessionManager: SessionManager;
    private tabManager!: TabManager;  // 使用断言赋值
    private apiServer!: APIServer;    // 使用断言赋值

    constructor() {
        app.commandLine.appendSwitch('--enable-features', 'VaapiVideoDecoder');
        app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
        app.commandLine.appendSwitch('--enable-gpu-rasterization');
        app.commandLine.appendSwitch('--enable-zero-copy');
        app.commandLine.appendSwitch('--ignore-gpu-blacklist');
        app.commandLine.appendSwitch('--disable-background-timer-throttling');
        app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
        app.commandLine.appendSwitch('--disable-renderer-backgrounding');

        this.sessionManager = new SessionManager(
            path.join(app.getPath('userData'), 'sessions')
        );
    }

    private createWindow(): void {
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload/preload.js')
            },
            title: 'Multi-Account Browser'
        });

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
                this.mainWindow.loadURL('data:text/html,<h1>请先运行 npm run build 编译项目</h1>');
            }
        }

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
                        label: '测试Session隔离',
                        click: async () => {
                            const result = await this.sessionManager.validateIsolation();
                            console.log('Session隔离测试结果:', result);
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
                            // 显示关于对话框
                        }
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    // 修复 src/main/main.ts 中的 IPC 序列化问题

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
                    cookieFile: tab.cookieFile
                    // 注意：不包含 session 和 browserView，因为这些不能序列化
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

        // 测试Session隔离
        ipcMain.handle('test-isolation', async () => {
            try {
                const result = await this.sessionManager.validateIsolation();
                return { success: true, isolated: result };
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
                        uptime: os.uptime()
                    }
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });
    }

    private async initialize(): Promise<void> {
        await app.whenReady();

        this.createWindow();

        if (this.mainWindow) {
            this.tabManager = new TabManager(this.mainWindow, this.sessionManager);
            this.apiServer = new APIServer(this.tabManager, 3000);

            // 设置IPC通信
            this.setupIPC();

            // 启动API服务器
            await this.apiServer.start();

            // 验证Session隔离
            const isolationValid = await this.sessionManager.validateIsolation();
            console.log('🔍 Initial session isolation test:', isolationValid ? '✅ PASSED' : '❌ FAILED');

            // 创建一个示例标签页用于测试（仅开发模式）
            if (process.env.NODE_ENV === 'development') {
                setTimeout(async () => {
                    try {
                        const tabId = await this.tabManager.createAccountTab(
                            '测试账号',
                            '微信视频号',
                            'https://channels.weixin.qq.com'
                        );
                        await this.tabManager.switchToTab(tabId);
                    } catch (error) {
                        console.error('Failed to create test tab:', error);
                    }
                }, 2000);
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

        app.on('before-quit', async () => {
            if (this.apiServer) {
                await this.apiServer.stop();
            }
        });

        // 处理未捕获的异常
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }

    async start(): Promise<void> {
        this.setupAppEvents();
        await this.initialize();
    }
}

// 启动应用
const browser = new MultiAccountBrowser();
browser.start().catch(console.error);