// src/preload/preload.ts - 更新版本，集成消息模块

import { contextBridge, ipcRenderer } from 'electron';
import { MessageElectronAPI, createMessageElectronAPI } from './preloadMessage';

// ==================== 🔥 扩展后的主接口定义 ====================

interface ElectronAPI extends MessageElectronAPI {
    // 🔥 现有的标签页管理接口保持不变
    createTab: (accountName: string, platform: string, initialUrl?: string) => Promise<any>;
    switchTab: (tabId: string) => Promise<any>;
    navigateTab: (tabId: string, url: string) => Promise<any>;
    closeTab: (tabId: string) => Promise<any>;
    getAllTabs: () => Promise<any>;
    navigateBack: (tabId: string) => Promise<any>;
    navigateForward: (tabId: string) => Promise<any>;
    refreshTab: (tabId: string) => Promise<any>;
    openDevTools: (tabId: string) => Promise<any>;

    // 标题和图标更新事件监听
    onTabTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => void;
    onTabFaviconUpdated: (callback: (data: { tabId: string; favicon: string }) => void) => void;
    onTabMadeHeadless: (callback: (data: { tabId: string; accountName: string }) => void) => void;
    onTabUrlUpdated: (callback: (data: { tabId: string; url: string }) => void) => void;

    // 标签页生命周期事件
    onTabCreated: (callback: (data: { tabId: string; tab: TabData }) => void) => void;
    onTabClosed: (callback: (data: { tabId: string }) => void) => void;
    onTabSwitched: (callback: (data: { tabId: string }) => void) => void;

    // Cookie管理
    loadCookies: (tabId: string, cookieFile: string) => Promise<any>;
    saveCookies: (tabId: string, cookieFile: string) => Promise<any>;

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

    // 🔥 新增：消息模块快捷访问
    message: MessageElectronAPI;
}

// ==================== 🔥 实现完整的 ElectronAPI ====================

// 创建消息API实例
const messageAPI = createMessageElectronAPI();

// 安全地暴露API给渲染进程
const electronAPI: ElectronAPI = {
    // 🔥 消息相关接口 - 直接展开导入的接口
    ...messageAPI,

    // 🔥 现有接口保持不变
    createTab: (accountName: string, platform: string, initialUrl?: string) =>
        ipcRenderer.invoke('create-account-tab', accountName, platform, initialUrl),

    switchTab: (tabId: string) =>
        ipcRenderer.invoke('switch-tab', tabId),

    navigateTab: (tabId: string, url: string) =>
        ipcRenderer.invoke('navigate-tab', tabId, url),

    closeTab: (tabId: string) =>
        ipcRenderer.invoke('close-tab', tabId),

    navigateBack: (tabId: string) =>
        ipcRenderer.invoke('navigate-back', tabId),

    navigateForward: (tabId: string) =>
        ipcRenderer.invoke('navigate-forward', tabId),

    refreshTab: (tabId: string) =>
        ipcRenderer.invoke('refresh-tab', tabId),

    getAllTabs: () =>
        ipcRenderer.invoke('get-all-tabs'),

    openDevTools: (tabId: string) =>
        ipcRenderer.invoke('open-devtools', tabId),

    // 标题更新事件监听
    onTabTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-title-updated');
        ipcRenderer.on('tab-title-updated', (event, data) => callback(data));
    },

    onTabFaviconUpdated: (callback: (data: { tabId: string; favicon: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-favicon-updated');
        ipcRenderer.on('tab-favicon-updated', (event, data) => callback(data));
    },

    onTabMadeHeadless: (callback) => {
        ipcRenderer.removeAllListeners('tab-made-headless');
        ipcRenderer.on('tab-made-headless', (event, data) => callback(data));
    },

    onTabUrlUpdated: (callback: (data: { tabId: string; url: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-url-updated');
        ipcRenderer.on('tab-url-updated', (event, data) => callback(data));
    },

    // 标签页生命周期事件
    onTabCreated: (callback) => {
        ipcRenderer.removeAllListeners('tab-created');
        ipcRenderer.on('tab-created', (event, data) => callback(data));
    },

    onTabClosed: (callback) => {
        ipcRenderer.removeAllListeners('tab-closed');  
        ipcRenderer.on('tab-closed', (event, data) => callback(data));
    },

    onTabSwitched: (callback) => {
        ipcRenderer.removeAllListeners('tab-switched');
        ipcRenderer.on('tab-switched', (event, data) => callback(data));
    },

    // Cookie管理
    loadCookies: (tabId: string, cookieFile: string) =>
        ipcRenderer.invoke('load-cookies', tabId, cookieFile),

    saveCookies: (tabId: string, cookieFile: string) =>
        ipcRenderer.invoke('save-cookies', tabId, cookieFile),

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
        ipcRenderer.removeAllListeners(channel),

    // 🔥 消息模块的命名空间访问（可选的便捷方式）
    message: messageAPI
};

// ==================== 🔥 暴露API到全局对象 ====================

// 暴露API到全局对象
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ==================== 🔥 错误处理和性能监控 ====================

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
    console.log('🎨 Renderer process loaded with message support');
    electronAPI.log('info', 'Renderer process initialized with message automation');
});

// 性能监控
if (typeof window.performance !== 'undefined') {
    window.addEventListener('load', () => {
        const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
        console.log(`📊 Page load time: ${loadTime}ms`);
        electronAPI.log('info', `Page load time: ${loadTime}ms`);
    });
}

// ==================== 🔥 页面卸载时的清理工作 ====================

window.addEventListener('beforeunload', () => {
    try {
        // 清理消息事件监听器
        electronAPI.removeMessageEventListeners();
        
        // 清理其他事件监听器
        const channels = [
            'tab-title-updated',
            'tab-favicon-updated', 
            'tab-made-headless',
            'tab-url-updated',
            'tab-created',
            'tab-closed',
            'tab-switched',
            'menu-new-tab',
            'menu-close-tab',
            'window-resize'
        ];
        
        channels.forEach(channel => {
            electronAPI.removeAllListeners(channel);
        });

        console.log('🧹 Preload cleanup completed');
    } catch (error) {
        console.error('❌ Preload cleanup error:', error);
    }
});

// ==================== 🔥 类型声明 ====================

// TabData 接口定义（保持向后兼容）
interface TabData {
    id: string;
    accountName: string;
    displayTitle?: string;
    displayFavicon?: string;
    platform: string;
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    url?: string;
    cookieFile?: string;
    isHeadless?: boolean;
}

// 全局类型声明
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

// ==================== 🔥 开发工具和调试支持 ====================

// 开发环境下的额外功能
if (process.env.NODE_ENV === 'development') {
    // 暴露调试工具到全局
    (window as any).__ELECTRON_API_DEBUG__ = {
        // 获取所有可用的 API 方法
        getAvailableAPIs: () => {
            const apis = Object.keys(electronAPI);
            console.table(apis.map(name => ({
                API: name,
                Type: typeof electronAPI[name as keyof ElectronAPI],
                IsFunction: typeof electronAPI[name as keyof ElectronAPI] === 'function'
            })));
            return apis;
        },

        // 测试消息API连通性
        testMessageAPI: async () => {
            try {
                console.log('🧪 测试消息API连通性...');
                
                // 测试获取支持的平台
                const platforms = await electronAPI.getSupportedMessagePlatforms();
                console.log('✅ 支持的平台:', platforms);
                
                // 测试获取引擎状态
                const status = await electronAPI.getMessageEngineStatus();
                console.log('✅ 引擎状态:', status);
                
                // 测试获取监听状态
                const monitoring = await electronAPI.getMessageMonitoringStatus();
                console.log('✅ 监听状态:', monitoring);
                
                return { success: true, message: '消息API连通性测试通过' };
            } catch (error) {
                console.error('❌ 消息API测试失败:', error);
                return { success: false, error };
            }
        },

        // 模拟消息事件
        simulateMessageEvents: () => {
            console.log('🎭 模拟消息事件...');
            
            // 模拟新消息
            electronAPI.notifyNewMessage({
                diff: 3,
                total: 15,
                timestamp: Date.now(),
                platform: 'wechat'
            });
            
            // 模拟账号状态变化
            setTimeout(() => {
                electronAPI.notifyAccountStatus({
                    status: 'logged_in',
                    timestamp: Date.now(),
                    platform: 'wechat'
                });
            }, 1000);
        },

        // 清理所有事件监听器
        cleanupAllListeners: () => {
            electronAPI.removeMessageEventListeners();
            console.log('🧹 已清理所有消息事件监听器');
        }
    };

    console.log('🔧 开发模式：调试工具已加载到 window.__ELECTRON_API_DEBUG__');
}
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export type { ElectronAPI };