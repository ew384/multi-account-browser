import { BrowserWindow, Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'path';

export type BrowserMode = 'normal' | 'headless' | 'background';

export class HeadlessManager {
    private static instance: HeadlessManager;
    private mode: BrowserMode = 'normal';
    private mainWindow: BrowserWindow | null = null;
    private tray: Tray | null = null;

    private constructor() {
        this.detectMode();
    }

    static getInstance(): HeadlessManager {
        if (!HeadlessManager.instance) {
            HeadlessManager.instance = new HeadlessManager();
        }
        return HeadlessManager.instance;
    }

    private detectMode(): void {
        if (process.argv.includes('--headless')) {
            this.mode = 'headless';
        } else if (process.argv.includes('--background')) {
            this.mode = 'background';
        } else {
            this.mode = 'normal';
        }

        console.log(`🚀 检测到启动模式: ${this.mode}`);
    }

    getMode(): BrowserMode {
        return this.mode;
    }

    isHeadlessMode(): boolean {
        return this.mode === 'headless';
    }

    isBackgroundMode(): boolean {
        return this.mode === 'background';
    }

    isHidden(): boolean {
        return this.mode === 'headless' || this.mode === 'background';
    }

    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window;
        this.setupWindowForMode();
    }

    private setupWindowForMode(): void {
        if (!this.mainWindow) return;

        switch (this.mode) {
            case 'headless':
                this.setupHeadlessMode();
                break;
            case 'background':
                this.setupBackgroundMode();
                break;
            case 'normal':
                this.setupNormalMode();
                break;
        }
    }

    private setupHeadlessMode(): void {
        if (!this.mainWindow) return;

        console.log('🔇 设置headless模式 - 完全隐藏');

        this.mainWindow.hide();
        this.mainWindow.setSkipTaskbar(true);

        // 强制阻止任何显示尝试
        this.mainWindow.on('show', () => {
            if (this.mode === 'headless') {
                this.mainWindow?.hide();
                console.log('🚫 阻止headless模式窗口显示');
            }
        });

        this.mainWindow.on('restore', () => {
            if (this.mode === 'headless') {
                this.mainWindow?.hide();
            }
        });
    }

    private setupBackgroundMode(): void {
        if (!this.mainWindow) return;

        console.log('📱 设置background模式 - 后台运行可调出');

        this.mainWindow.hide();
        this.mainWindow.setSkipTaskbar(false); // 保留任务栏图标

        // 创建系统托盘
        this.createTrayIcon();
    }

    private setupNormalMode(): void {
        console.log('👁️ 设置normal模式 - 正常显示');
        // 正常模式不需要特殊设置
    }

    private createTrayIcon(): void {
        if (this.tray) return;

        try {
            const iconPath = path.join(__dirname, '../../../assets/tray-icon.png');
            this.tray = new Tray(iconPath);

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: '显示浏览器',
                    click: () => this.showWindow(),
                    type: 'normal'
                },
                {
                    label: '隐藏浏览器',
                    click: () => this.hideWindow(),
                    enabled: this.mainWindow?.isVisible() || false
                },
                { type: 'separator' },
                {
                    label: '模式信息',
                    enabled: false,
                    sublabel: `当前: ${this.mode} 模式`
                },
                {
                    label: '关于后台模式',
                    click: () => {
                        if (this.mainWindow) {
                            const { dialog } = require('electron');
                            dialog.showMessageBox(this.mainWindow, {
                                type: 'info',
                                title: '后台模式说明',
                                message: '应用正在后台运行',
                                detail: '• 关闭窗口不会退出应用\n• 双击托盘图标可显示窗口\n• 使用 Ctrl+Q 或右键菜单退出应用'
                            });
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: '退出应用',
                    click: () => {
                        console.log('🛑 用户通过托盘菜单退出应用');
                        app.quit();
                    },
                    accelerator: 'CmdOrCtrl+Q'
                }
            ]);

            this.tray.setContextMenu(contextMenu);
            this.tray.setToolTip('Multi-Account Browser (Background Mode)\n双击显示窗口，右键查看菜单');

            // 双击托盘图标显示窗口
            this.tray.on('double-click', () => this.showWindow());

            console.log('✅ 系统托盘已创建');

        } catch (error) {
            console.warn('⚠️ 创建托盘图标失败:', error);
        }
    }

    // 公共方法：显示窗口
    showWindow(): void {
        if (!this.mainWindow) return;

        if (this.mode === 'headless') {
            console.log('🚫 headless模式不能显示窗口');
            return;
        }

        this.mainWindow.show();
        this.mainWindow.focus();
        console.log('👁️ 窗口已显示');
    }

    // 公共方法：隐藏窗口  
    hideWindow(): void {
        if (!this.mainWindow) return;

        this.mainWindow.hide();
        console.log('🙈 窗口已隐藏');
    }

    // 临时显示（仅background模式有效）
    async showTemporarily(duration: number = 5000): Promise<void> {
        if (this.mode !== 'background' || !this.mainWindow) {
            console.log(`⚠️ 临时显示功能仅在background模式下可用，当前模式: ${this.mode}`);
            return;
        }

        console.log(`👁️ 临时显示浏览器 ${duration}ms`);
        this.showWindow();

        setTimeout(() => {
            if (this.mode === 'background') {
                this.hideWindow();
                console.log('🔇 恢复后台模式');
            }
        }, duration);
    }

    // 动态切换模式（运行时切换）
    async switchMode(newMode: BrowserMode): Promise<void> {
        if (this.mode === newMode) return;

        const oldMode = this.mode;
        this.mode = newMode;

        console.log(`🔄 模式切换: ${oldMode} → ${newMode}`);

        // 清理旧模式的设置
        this.cleanup();

        // 应用新模式的设置
        this.setupWindowForMode();
    }

    private cleanup(): void {
        // 清理托盘图标
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    destroy(): void {
        this.cleanup();
    }
}