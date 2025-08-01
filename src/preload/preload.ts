import { contextBridge, ipcRenderer } from 'electron';

// 定义API接口类型
interface ElectronAPI {
    // 标签页管理
    createAccountTab: (accountName: string, platform: string, initialUrl?: string) => Promise<any>;
    switchTab: (tabId: string) => Promise<any>;
    closeTab: (tabId: string) => Promise<any>;
    getAllTabs: () => Promise<any>;
    // 新增：标题更新事件监听
    onTabTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => void;
    onTabFaviconUpdated: (callback: (data: { tabId: string; favicon: string }) => void) => void;

    // 新增：获取标签页显示信息
    getTabDisplayInfo: (tabId: string) => Promise<any>;
    getAllTabsWithDisplay: () => Promise<any>;
    // Cookie管理
    loadCookies: (tabId: string, cookieFile: string) => Promise<any>;
    saveCookies: (tabId: string, cookieFile: string) => Promise<any>;

    // 测试功能
    testIsolation: () => Promise<any>;

    // 菜单事件监听
    onMenuNewTab: (callback: () => void) => void;
    onMenuCloseTab: (callback: () => void) => void;

    // 窗口事件
    onWindowResize: (callback: (bounds: any) => void) => void;

    // 系统信息
    getSystemInfo: () => Promise<any>;

    // 文件操作
    showOpenDialog: (options: any) => Promise<any>;
    showSaveDialog: (options: any) => Promise<any>;

    // 通知
    showNotification: (title: string, body: string) => void;

    // 日志
    log: (level: string, message: string) => void;

    // 清理
    removeAllListeners: (channel: string) => void;
}

// 安全地暴露API给渲染进程
const electronAPI: ElectronAPI = {
    // 标签页管理
    createAccountTab: (accountName: string, platform: string, initialUrl?: string) =>
        ipcRenderer.invoke('create-account-tab', accountName, platform, initialUrl),

    switchTab: (tabId: string) =>
        ipcRenderer.invoke('switch-tab', tabId),

    closeTab: (tabId: string) =>
        ipcRenderer.invoke('close-tab', tabId),

    getAllTabs: () =>
        ipcRenderer.invoke('get-all-tabs'),
    // 标题更新事件监听
    onTabTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-title-updated');
        ipcRenderer.on('tab-title-updated', (event, data) => callback(data));
    },

    onTabFaviconUpdated: (callback: (data: { tabId: string; favicon: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-favicon-updated');
        ipcRenderer.on('tab-favicon-updated', (event, data) => callback(data));
    },

    // 获取显示信息
    getTabDisplayInfo: (tabId: string) =>
        fetch(`http://localhost:3409/api/account/${tabId}/display`).then(r => r.json()),

    getAllTabsWithDisplay: () =>
        fetch('http://localhost:3409/api/accounts-with-display').then(r => r.json()),
    // Cookie管理
    loadCookies: (tabId: string, cookieFile: string) =>
        ipcRenderer.invoke('load-cookies', tabId, cookieFile),

    saveCookies: (tabId: string, cookieFile: string) =>
        ipcRenderer.invoke('save-cookies', tabId, cookieFile),

    // 测试功能
    testIsolation: () =>
        ipcRenderer.invoke('test-isolation'),

    // 菜单事件监听
    onMenuNewTab: (callback: () => void) => {
        ipcRenderer.removeAllListeners('menu-new-tab');
        ipcRenderer.on('menu-new-tab', callback);
    },

    onMenuCloseTab: (callback: () => void) => {
        ipcRenderer.removeAllListeners('menu-close-tab');
        ipcRenderer.on('menu-close-tab', callback);
    },

    // 窗口事件
    onWindowResize: (callback: (bounds: any) => void) => {
        ipcRenderer.removeAllListeners('window-resize');
        ipcRenderer.on('window-resize', (event, bounds) => callback(bounds));
    },

    // 系统信息
    getSystemInfo: () =>
        ipcRenderer.invoke('get-system-info'),

    // 文件对话框
    showOpenDialog: (options: any) =>
        ipcRenderer.invoke('show-open-dialog', options),

    showSaveDialog: (options: any) =>
        ipcRenderer.invoke('show-save-dialog', options),

    // 通知
    showNotification: (title: string, body: string) =>
        ipcRenderer.invoke('show-notification', title, body),

    // 日志
    log: (level: string, message: string) =>
        ipcRenderer.invoke('log', level, message),

    // 清理监听器
    removeAllListeners: (channel: string) =>
        ipcRenderer.removeAllListeners(channel)
};

// 暴露API到全局对象
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 添加错误处理
window.addEventListener('error', (event) => {
    console.error('Renderer process error:', event.error);
    electronAPI.log('error', `Renderer error: ${event.error.message}`);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    electronAPI.log('error', `Unhandled rejection: ${event.reason}`);
});

// 页面加载完成事件
window.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 Renderer process loaded');
    electronAPI.log('info', 'Renderer process initialized');
});

// 性能监控
if (typeof window.performance !== 'undefined') {
    window.addEventListener('load', () => {
        const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
        console.log(`📊 Page load time: ${loadTime}ms`);
        electronAPI.log('info', `Page load time: ${loadTime}ms`);
    });
}

// 类型声明
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export type { ElectronAPI };