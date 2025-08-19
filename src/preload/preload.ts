import { contextBridge, ipcRenderer } from 'electron';
// ==================== 🔥 内部工具函数 ====================

/**
 * 检查是否为有效的消息平台
 */
function isValidMessagePlatform(platform: string): boolean {
    const validPlatforms = ['wechat', 'xiaohongshu', 'douyin', 'kuaishou'];
    return validPlatforms.includes(platform);
}

/**
 * 创建账号密钥
 */
function createAccountKey(platform: string, accountId: string): string {
    return `${platform}_${accountId}`;
}

/**
 * 解析账号密钥
 */
function parseAccountKey(accountKey: string): { platform: string; accountId: string } | null {
    const parts = accountKey.split('_');
    if (parts.length >= 2) {
        return {
            platform: parts[0],
            accountId: parts.slice(1).join('_')
        };
    }
    return null;
}

/**
 * 验证消息发送参数
 */
function validateMessageSendParams(params: {
    platform: string;
    tabId: string;
    userName: string;
    content: string;
    type: 'text' | 'image';
}): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!params.platform) errors.push('platform 不能为空');
    if (!params.tabId) errors.push('tabId 不能为空');
    if (!params.userName) errors.push('userName 不能为空');
    if (!params.content) errors.push('content 不能为空');
    if (!['text', 'image'].includes(params.type)) errors.push('type 必须是 text 或 image');
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * 创建标准的错误响应
 */
function createErrorResponse(error: string): {
    success: false;
    error: string;
} {
    return {
        success: false,
        error
    };
}

/**
 * 创建标准的成功响应
 */
function createSuccessResponse<T>(data: T): {
    success: true;
    data: T;
} {
    return {
        success: true,
        data
    };
}
// 定义API接口类型
// ==================== 🔥 调试和开发工具 ====================

/**
 * 消息自动化调试工具
 */
const MessageDebugTools = {
    /**
     * 启用调试模式
     */
    enableDebug: () => {
        (window as any).__MESSAGE_DEBUG__ = true;
        console.log('🐛 消息自动化调试模式已启用');
    },

    /**
     * 禁用调试模式
     */
    disableDebug: () => {
        (window as any).__MESSAGE_DEBUG__ = false;
        console.log('🐛 消息自动化调试模式已禁用');
    },
};
interface ElectronAPI {
    // 标签页管理
    createTab: (accountName: string, platform: string, initialUrl?: string) => Promise<any>;
    switchTab: (tabId: string) => Promise<any>;
    navigateTab: (tabId: string, url: string) => Promise<any>;
    closeTab: (tabId: string) => Promise<any>;
    getAllTabs: () => Promise<any>;

    navigateBack: (tabId: string) => Promise<any>;
    navigateForward: (tabId: string) => Promise<any>;
    refreshTab: (tabId: string) => Promise<any>;
    // 新增：标题更新事件监听
    onTabTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => void;
    onTabFaviconUpdated: (callback: (data: { tabId: string; favicon: string }) => void) => void;
    onTabMadeHeadless: (callback: (data: { tabId: string; accountName: string }) => void) => void;

    // Cookie管理
    loadCookies: (tabId: string, cookieFile: string) => Promise<any>;
    saveCookies: (tabId: string, cookieFile: string) => Promise<any>;
    openDevTools: (tabId: string) => Promise<any>;

    // 菜单事件监听
    onMenuNewTab: (callback: () => void) => void;
    onMenuCloseTab: (callback: () => void) => void;

    // 窗口事件
    onWindowResize: (callback: (bounds: any) => void) => void;
    onTabCreated: (callback: (data: { tabId: string; tab: TabData }) => void) => void;
    onTabClosed: (callback: (data: { tabId: string }) => void) => void;
    onTabSwitched: (callback: (data: { tabId: string }) => void) => void;
    onTabUrlUpdated: (callback: (data: { tabId: string; url: string }) => void) => void;
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
    // 🔥 添加消息API
    // 📤 页面事件上报接口 - 供注入脚本使用
    notifyNewMessage: (data: {
        diff?: number;
        total?: number;
        timestamp: number;
        userList?: any[];
        messages?: any[];
        platform?: string;
        event?: string;
        eventData?: any;
        action?: string;
        accountId?: string;
        source?: string;
    }) => void;
    notifyAccountStatus: (status: {
        status: 'logged_out' | 'logged_in' | 'error';
        timestamp: number;
        error?: string;         // 错误信息（可选）
        platform?: string;     // 平台标识
    }) => void;

    // 🎯 消息监听控制接口
    startMessageMonitoring: (params: {
        platform: string;
        accountId: string;
        cookieFile: string;
        headless?: boolean;
    }) => Promise<{
        success: boolean;
        tabId?: string;
        error?: string;
    }>;

    stopMessageMonitoring: (accountKey: string) => Promise<{
        success: boolean;
        error?: string;
    }>;

    startBatchMessageMonitoring: (accounts: Array<{
        platform: string;
        accountId: string;
        cookieFile: string;
        headless?: boolean;
    }>) => Promise<{
        success: number;
        failed: number;
        results: any[];
    }>;

    stopAllMessageMonitoring: () => Promise<{
        stopped: number;
        failed: number;
    }>;

    getMessageMonitoringStatus: () => Promise<{
        success: boolean;
        data: {
            monitoring: Array<{
                accountKey: string;
                platform: string;
                accountId: string;
                tabId?: string;
                isMonitoring: boolean;
                lastActivity?: string;
            }>;
            summary: {
                total: number;
                active: number;
            };
        };
    }>;

    // 🔄 手动消息同步接口
    syncPlatformMessages: (params: {
        platform: string;
        accountName: string;
        cookieFile: string;
        options?: {
            forceSync?: boolean;
            maxRetries?: number;
            timeout?: number;
        };
    }) => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    batchSyncPlatformMessages: (request: {
        platform: string;
        accounts: Array<{
            accountId: string;
            cookieFile: string;
            lastSyncTime?: string;
        }>;
        options?: {
            maxConcurrency?: number;
            timeout?: number;
            fullSync?: boolean;
        };
    }) => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    // 📤 消息发送接口
    sendPlatformMessage: (params: {
        platform: string;
        tabId: string;
        userName: string;
        content: string;
        type: 'text' | 'image';
        accountId?: string;
    }) => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    batchSendPlatformMessages: (request: {
        platform: string;
        messages: Array<{
            tabId: string;
            accountId: string;
            userName: string;
            content: string;
            type: 'text' | 'image';
        }>;
        options?: {
            delay?: number;
            timeout?: number;
            continueOnError?: boolean;
        };
    }) => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    // 📋 消息查询接口
    getMessageThreads: (params?: {
        platform?: string;
        accountId?: string;
    }) => Promise<{
        success: boolean;
        data?: {
            threads: any[];
            total: number;
        };
        error?: string;
    }>;

    getThreadMessages: (params: {
        threadId: number;
        limit?: number;
        offset?: number;
    }) => Promise<{
        success: boolean;
        data?: {
            threadId: number;
            messages: any[];
            count: number;
        };
        error?: string;
    }>;

    markMessagesAsRead: (params: {
        threadId: number;
        messageIds?: number[];
    }) => Promise<{
        success: boolean;
        data?: {
            threadId: number;
            messageIds?: number[];
        };
        error?: string;
    }>;

    // 🔍 消息搜索和统计接口
    searchMessages: (params: {
        platform: string;
        accountId: string;
        keyword: string;
        limit?: number;
    }) => Promise<{
        success: boolean;
        data?: {
            keyword: string;
            results: any[];
            count: number;
        };
        error?: string;
    }>;

    getMessageStatistics: () => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    getUnreadMessageCount: (params?: {
        platform?: string;
        accountId?: string;
    }) => Promise<{
        success: boolean;
        data?: {
            platform: string;
            accountId: string;
            unreadCount: number;
        };
        error?: string;
    }>;

    // 🔧 消息系统状态接口
    getMessageEngineStatus: () => Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;

    getSupportedMessagePlatforms: () => Promise<{
        success: boolean;
        data?: {
            platforms: string[];
            total: number;
        };
        error?: string;
    }>;

    // 🎧 消息事件监听接口
    onNewMessageDetected: (callback: (data: {
        accountKey: string;
        platform: string;
        accountId: string;
        messageData: any;
        timestamp: string;
    }) => void) => void;

    onAccountStatusChanged: (callback: (data: {
        accountKey: string;
        platform: string;
        accountId: string;
        status: 'logged_out' | 'logged_in' | 'error';
        timestamp: string;
    }) => void) => void;

    onMessageSyncCompleted: (callback: (data: {
        accountKey: string;
        platform: string;
        accountId: string;
        result: any;
        timestamp: string;
    }) => void) => void;

    onMessageSendCompleted: (callback: (data: {
        platform: string;
        userName: string;
        success: boolean;
        result: any;
        timestamp: string;
    }) => void) => void;

    // 🧹 事件监听器清理接口
    removeMessageEventListeners: () => void;
        // 🔥 工具函数
    messageUtils: {
        isValidMessagePlatform: (platform: string) => boolean;
        createAccountKey: (platform: string, accountId: string) => string;
        parseAccountKey: (accountKey: string) => { platform: string; accountId: string } | null;
        validateMessageSendParams: (params: any) => { isValid: boolean; errors: string[] };
        createErrorResponse: (error: string) => { success: false; error: string };
        createSuccessResponse: <T>(data: T) => { success: true; data: T };
    };

    // 🔥 调试工具
    messageDebugTools: typeof MessageDebugTools;
}

// 安全地暴露API给渲染进程
const electronAPI: ElectronAPI = {
    // 标签页管理
    onTabMadeHeadless: (callback) => {
        ipcRenderer.removeAllListeners('tab-made-headless');
        ipcRenderer.on('tab-made-headless', (event, data) => callback(data));
    },
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
    onTabUrlUpdated: (callback: (data: { tabId: string; url: string }) => void) => {
        ipcRenderer.removeAllListeners('tab-url-updated');
        ipcRenderer.on('tab-url-updated', (event, data) => callback(data));
    },
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
    openDevTools: (tabId: string) =>
        ipcRenderer.invoke('open-devtools', tabId),

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
    // 📤 页面事件上报接口
    notifyNewMessage: (data: any) => {
        ipcRenderer.send('message-new-message', data);
    },

    notifyAccountStatus: (status: any) => {
        ipcRenderer.send('message-account-status', status);
    },

    // 🎯 消息监听控制接口
    startMessageMonitoring: (params) =>
        ipcRenderer.invoke('message-start-monitoring', params),

    stopMessageMonitoring: (accountKey: string) =>
        ipcRenderer.invoke('message-stop-monitoring', accountKey),

    startBatchMessageMonitoring: (accounts) =>
        ipcRenderer.invoke('message-start-batch-monitoring', accounts),

    stopAllMessageMonitoring: () =>
        ipcRenderer.invoke('message-stop-all-monitoring'),

    getMessageMonitoringStatus: () =>
        ipcRenderer.invoke('message-get-monitoring-status'),

    // 🔄 手动消息同步接口
    syncPlatformMessages: (params) =>
        ipcRenderer.invoke('message-sync-messages', params),

    batchSyncPlatformMessages: (request) =>
        ipcRenderer.invoke('message-batch-sync-messages', request),

    // 📤 消息发送接口
    sendPlatformMessage: (params) =>
        ipcRenderer.invoke('message-send-message', params),

    batchSendPlatformMessages: (request) =>
        ipcRenderer.invoke('message-batch-send-messages', request),

    // 📋 消息查询接口
    getMessageThreads: (params?) =>
        ipcRenderer.invoke('message-get-threads', params),

    getThreadMessages: (params) =>
        ipcRenderer.invoke('message-get-thread-messages', params),

    markMessagesAsRead: (params) =>
        ipcRenderer.invoke('message-mark-read', params),

    // 🔍 消息搜索和统计接口
    searchMessages: (params) =>
        ipcRenderer.invoke('message-search', params),

    getMessageStatistics: () =>
        ipcRenderer.invoke('message-get-statistics'),

    getUnreadMessageCount: (params?) =>
        ipcRenderer.invoke('message-get-unread-count', params),

    // 🔧 消息系统状态接口
    getMessageEngineStatus: () =>
        ipcRenderer.invoke('message-get-engine-status'),

    getSupportedMessagePlatforms: () =>
        ipcRenderer.invoke('message-get-supported-platforms'),

    // 🎧 消息事件监听接口
    onNewMessageDetected: (callback) => {
        ipcRenderer.removeAllListeners('message-new-message-detected');
        ipcRenderer.on('message-new-message-detected', (event, data) => callback(data));
    },

    onAccountStatusChanged: (callback) => {
        ipcRenderer.removeAllListeners('message-account-status-changed');
        ipcRenderer.on('message-account-status-changed', (event, data) => callback(data));
    },

    onMessageSyncCompleted: (callback) => {
        ipcRenderer.removeAllListeners('message-sync-completed');
        ipcRenderer.on('message-sync-completed', (event, data) => callback(data));
    },

    onMessageSendCompleted: (callback) => {
        ipcRenderer.removeAllListeners('message-send-completed');
        ipcRenderer.on('message-send-completed', (event, data) => callback(data));
    },

    // 🧹 事件监听器清理接口
    removeMessageEventListeners: () => {
        const messageEvents = [
            'message-new-message-detected',
            'message-account-status-changed', 
            'message-sync-completed',
            'message-send-completed'
        ];
        
        messageEvents.forEach(event => {
            ipcRenderer.removeAllListeners(event);
        });
        
        console.log('🧹 消息事件监听器已清理');
    },
        // 🔥 工具函数
    messageUtils: {
        isValidMessagePlatform,
        createAccountKey,
        parseAccountKey,
        validateMessageSendParams,
        createErrorResponse,
        createSuccessResponse
    },

    // 🔥 调试工具
    messageDebugTools: MessageDebugTools
    
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