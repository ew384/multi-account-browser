// src/preload/preloadMessage.ts
// 消息自动化相关的 IPC 接口定义和实现

import { ipcRenderer } from 'electron';

// ==================== 🔥 消息自动化接口类型定义 ====================

/**
 * 消息自动化相关的 Electron API 接口
 */
export interface MessageElectronAPI {
    // 📤 页面事件上报接口 - 供注入脚本使用
    notifyNewMessage: (data: {
        diff?: number;          // 新消息数量差异
        total?: number;         // 总消息数量
        timestamp: number;      // 时间戳
        userList?: any[];       // 用户列表（可选）
        messages?: any[];       // 具体消息数据（可选）
        platform?: string;     // 平台标识
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
}

// ==================== 🔥 消息自动化接口实现 ====================

/**
 * 创建消息自动化相关的 Electron API 实现
 */
export function createMessageElectronAPI(): MessageElectronAPI {
    return {
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
        }
    };
}

// ==================== 🔥 使用示例和文档 ====================

/**
 * 使用示例：
 * 
 * ```typescript
 * // 1. 启动消息监听
 * const result = await window.electronAPI.startMessageMonitoring({
 *     platform: 'wechat',
 *     accountId: 'account123',
 *     cookieFile: 'wechat_account123.json',
 *     headless: true
 * });
 * 
 * if (result.success) {
 *     console.log('监听启动成功:', result.tabId);
 * }
 * 
 * // 2. 监听新消息事件
 * window.electronAPI.onNewMessageDetected((data) => {
 *     console.log('检测到新消息:', data);
 *     // 更新UI显示新消息
 * });
 * 
 * // 3. 页面注入脚本中上报事件（在页面中执行）
 * window.electronAPI.notifyNewMessage({
 *     diff: 2,
 *     total: 15,
 *     timestamp: Date.now(),
 *     platform: 'wechat'
 * });
 * 
 * // 4. 手动同步消息
 * const syncResult = await window.electronAPI.syncPlatformMessages({
 *     platform: 'wechat',
 *     accountName: 'TestAccount',
 *     cookieFile: 'wechat_account123.json'
 * });
 * 
 * // 5. 发送消息
 * const sendResult = await window.electronAPI.sendPlatformMessage({
 *     platform: 'wechat',
 *     tabId: 'tab_12345',
 *     userName: '张三',
 *     content: '你好！',
 *     type: 'text'
 * });
 * 
 * // 6. 获取消息线程
 * const threads = await window.electronAPI.getMessageThreads({
 *     platform: 'wechat',
 *     accountId: 'account123'
 * });
 * 
 * // 7. 批量操作
 * const batchResult = await window.electronAPI.startBatchMessageMonitoring([
 *     {
 *         platform: 'wechat',
 *         accountId: 'account1',
 *         cookieFile: 'wechat_account1.json'
 *     },
 *     {
 *         platform: 'xiaohongshu', 
 *         accountId: 'account2',
 *         cookieFile: 'xhs_account2.json'
 *     }
 * ]);
 * 
 * // 8. 获取统计信息
 * const stats = await window.electronAPI.getMessageStatistics();
 * const unreadCount = await window.electronAPI.getUnreadMessageCount();
 * 
 * // 9. 清理事件监听器（页面卸载时）
 * window.electronAPI.removeMessageEventListeners();
 * ```
 */

// ==================== 🔥 类型工具函数 ====================

/**
 * 检查是否为有效的消息平台
 */
export function isValidMessagePlatform(platform: string): boolean {
    const validPlatforms = ['wechat', 'xiaohongshu', 'douyin', 'kuaishou'];
    return validPlatforms.includes(platform);
}

/**
 * 创建账号密钥
 */
export function createAccountKey(platform: string, accountId: string): string {
    return `${platform}_${accountId}`;
}

/**
 * 解析账号密钥
 */
export function parseAccountKey(accountKey: string): { platform: string; accountId: string } | null {
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
export function validateMessageSendParams(params: {
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
export function createErrorResponse(error: string): {
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
export function createSuccessResponse<T>(data: T): {
    success: true;
    data: T;
} {
    return {
        success: true,
        data
    };
}

// ==================== 🔥 调试和开发工具 ====================

/**
 * 消息自动化调试工具
 */
export const MessageDebugTools = {
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

    /**
     * 检查调试模式状态
     */
    isDebugEnabled: (): boolean => {
        return !!(window as any).__MESSAGE_DEBUG__;
    },

    /**
     * 调试日志
     */
    log: (message: string, data?: any) => {
        if (MessageDebugTools.isDebugEnabled()) {
            console.log(`🔍 [MessageDebug] ${message}`, data || '');
        }
    },

    /**
     * 获取当前监听状态（调试用）
     */
    getCurrentMonitoringStatus: async () => {
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                const status = await window.electronAPI.getMessageMonitoringStatus();
                console.table(status.data?.monitoring || []);
                return status;
            } catch (error) {
                console.error('获取监听状态失败:', error);
                return null;
            }
        }
        return null;
    },

    /**
     * 模拟新消息事件（测试用）
     */
    simulateNewMessage: (platform: string = 'wechat') => {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.notifyNewMessage({
                diff: 1,
                total: Math.floor(Math.random() * 100),
                timestamp: Date.now(),
                platform: platform
            });
            console.log(`🔔 模拟新消息事件: ${platform}`);
        }
    },

    /**
     * 模拟账号登出事件（测试用）
     */
    simulateAccountLogout: (platform: string = 'wechat') => {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.notifyAccountStatus({
                status: 'logged_out',
                timestamp: Date.now(),
                platform: platform
            });
            console.log(`⚠️ 模拟账号登出事件: ${platform}`);
        }
    }
};

// 导出调试工具到全局（开发环境）
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    (window as any).MessageDebugTools = MessageDebugTools;
}

export default {
    createMessageElectronAPI,
    MessageDebugTools,
    isValidMessagePlatform,
    createAccountKey,
    parseAccountKey,
    validateMessageSendParams,
    createErrorResponse,
    createSuccessResponse
};