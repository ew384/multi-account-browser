// src/types/pluginInterface.ts

import { TabManager } from '../main/TabManager';

/**
 * 插件类型枚举
 */
export enum PluginType {
    UPLOADER = 'uploader',
    LOGIN = 'login',
    VALIDATOR = 'validator',
    DOWNLOADER = 'downloader',
    PROCESSOR = 'processor',
    MESSAGE = 'message',
}

/**
 * 视频上传参数接口
 */
export interface UploadParams {
    // 账号相关
    cookieFile: string;        // Cookie文件路径，如 'wechat_account1.json'
    platform: string;         // 平台标识，如 'wechat', 'douyin', 'xiaohongshu'
    accountName?: string;      // 🔥 新增：账号名称（用于状态更新）
    // 视频相关
    filePath: string;          // 视频文件路径
    title: string;             // 视频标题
    tags: string[];            // 标签数组，如 ['生活', '分享']
    thumbnailPath?: string;     // 封面文件路径 
    location?: string;       // 发布位置
    // 可选参数
    publishDate?: Date;        // 定时发布时间
    enableOriginal?: boolean;  // 是否启用原创声明
    addToCollection?: boolean; // 是否添加到合集
    category?: string;         // 视频分类，如 '生活', '美食' 等
    headless?: boolean;
}

/**
 * 账号信息接口
 */
export interface AccountInfo {
    cookieFile?: string;       // Cookie文件路径
    platform?: string;         // 平台名称
    accountName: string;       // 账号名称
    accountId?: string;        // 账号ID
    followersCount?: number;   // 粉丝数
    videosCount?: number;      // 视频数
    avatar?: string;           // 头像URL
    localAvatar?: string;      // 本地头像路径
    bio?: string;              // 简介
    extractedAt?: string;      // 提取时间
}

/**
 * 上传结果接口
 */
export interface UploadResult {
    success: boolean;          // 是否成功
    error?: string;            // 错误信息
    file?: string;             // 文件名
    account?: string;          // 账号名
    platform?: string;        // 平台名
    uploadTime?: string;       // 上传时间
}

/**
 * 批量上传请求接口
 */
export interface BatchUploadRequest {
    platform: string;         // 平台
    files: string[];           // 文件列表
    accounts: AccountInfo[];   // 账号列表
    params: Omit<UploadParams, 'cookieFile' | 'platform' | 'filePath'>; // 其他参数
}

/**
 * 登录参数接口
 */
export interface LoginParams {
    platform: string;         // 平台类型 'wechat', 'douyin' 等
    userId: string;           // 用户输入的ID
    loginUrl?: string;        // 登录页面URL (可选)
}

/**
 * 登录结果接口  
 */
export interface LoginResult {
    success: boolean;
    qrCodeUrl?: string;       // 二维码URL (用于前端显示)
    cookieFile?: string;      // 生成的Cookie文件名
    accountInfo?: AccountInfo; // 账号信息
    error?: string;
    tabId?: string;           // 标签页ID (内部使用)
}

export interface LoginStatus {
    userId: string;
    platform: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    startTime: string;
    endTime?: string;
    tabId?: string;
    qrCodeUrl?: string;
    cookieFile?: string;
    accountInfo?: LoginAccountInfo;
    error?: string;
}
/**
 * 插件基础接口
 */
export interface BasePlugin {
    readonly platform: string;
    readonly name: string;
    readonly type: PluginType;

    init(tabManager: TabManager): Promise<void>;
    destroy?(): Promise<void>;
}

/**
 * 上传器插件接口
 */
export interface PluginUploader extends BasePlugin {
    readonly type: PluginType.UPLOADER;

    /**
     * 完整的视频上传流程
     * @param params 上传参数
     * @returns 是否成功
     */
    uploadVideoComplete(params: UploadParams, tabId: string): Promise<{ success: boolean; tabId?: string }>;
    /**
     * 获取账号信息（可选）
     * @param tabId 标签页ID
     * @returns 账号信息
     */
    getAccountInfo?(tabId: string, downloadAvatar?: boolean): Promise<AccountInfo | null>;

    /**
     * 验证账号状态（可选）
     * @param tabId 标签页ID
     * @returns 是否有效
     */
    validateAccount?(tabId: string): Promise<boolean>;
}

/**
 * 登录插件接口
 */
export interface PluginLogin extends BasePlugin {
    readonly type: PluginType.LOGIN;

    /**
     * 开始登录流程 - 获取二维码
     * @param params 登录参数
     * @returns 登录结果 (包含二维码URL)
     */
    startLogin(params: LoginParams): Promise<LoginResult>;


    /**
     * 取消登录
     * @param tabId 标签页ID
     */
    cancelLogin(tabId: string): Promise<void>;

    /**
     * 检查登录状态
     * @param tabId 标签页ID
     * @returns 是否仍在登录中
     */
    checkLoginStatus?(tabId: string): Promise<boolean>;
}

/**
 * 验证器插件接口
 */
export interface PluginValidator extends BasePlugin {
    readonly type: PluginType.VALIDATOR;
    //validateCookie(cookieFile: string): Promise<boolean>;
    validateTab(tabId: string): Promise<boolean>;
}
export interface PluginProcessor {
    readonly name: string;
    readonly type: PluginType.PROCESSOR;
    readonly scenario: string;  // 处理场景标识

    init(dependencies: ProcessorDependencies): Promise<void>;
    process(params: any): Promise<any>;
    destroy(): Promise<void>;
}

// 🔥 处理器依赖注入类型 - 使用 any 避免循环依赖
export interface ProcessorDependencies {
    tabManager: any;  // TabManager 实例
    pluginManager: any;  // PluginManager 实例
    [key: string]: any;
}

// 🔥 登录完成处理参数
export interface LoginCompleteParams {
    tabId: string;
    userId: string;
    platform: string;
    isRecover?: boolean;  // 🔥 新增
    accountId?: number;   // 🔥 新增
}

// 🔥 登录完成处理结果
export interface LoginCompleteResult {
    success: boolean;
    cookiePath?: string;
    accountInfo?: LoginAccountInfo;  // 使用专门的登录账号信息类型
    error?: string;
}

// 🔥 登录账号信息类型 - 基于 AccountInfo 但更灵活
export interface LoginAccountInfo {
    platform: string;         // 登录时平台是必需的
    cookieFile?: string;       // Cookie文件路径
    accountName?: string;      // 账号名称
    accountId?: string;        // 账号ID
    followersCount?: number;   // 粉丝数
    videosCount?: number;      // 视频数
    avatar?: string;           // 头像URL
    bio?: string;              // 个人简介
    localAvatar?: string;      // 本地头像路径
    localAvatarPath?: string;  // 本地头像路径（兼容字段）
    extractedAt?: string;      // 提取时间
}
/**
 * 插件注册信息
 */
export interface PluginRegistration {
    type: PluginType;
    platform: string;
    plugin: BasePlugin;
}
// ==================== 消息相关数据模型 ====================

/**
 * 消息基础接口
 */
export interface Message {
    id?: string | number;           // 消息ID（可选，数据库自动生成）
    message_id?: string;            // 平台消息ID（去重用）
    timestamp: string;              // 消息时间戳（ISO格式）
    sender: 'me' | 'user';         // 发送者：我 | 用户
    text?: string;                  // 文本内容
    images?: string[];              // 图片数组（base64或URL）
    type?: 'text' | 'image' | 'mixed';  // 消息类型（自动推断）
    is_read?: boolean;              // 是否已读
}

/**
 * 用户对话线程接口
 */
export interface UserMessageThread {
    id?: number;                    // 线程ID（数据库主键）
    platform: string;              // 平台标识：'wechat', 'douyin', 'xiaohongshu'
    account_id: string;             // 我方账号ID（支持多账号）
    user_id: string;                // 对方用户ID
    user_name: string;              // 对方用户名
    avatar?: string;                // 对方头像URL
    unread_count: number;           // 未读消息数
    last_message_time?: string;     // 最后一条消息时间
    last_sync_time?: string;        // 最后同步时间
    messages?: Message[];           // 消息列表（可选，按需加载）
    
    // 🔥 前端显示用的附加字段
    last_message_text?: string;     // 最后一条消息文本预览
    last_message_type?: string;     // 最后一条消息类型
}

/**
 * 用户基础信息接口
 */
export interface UserInfo {
    user_id: string;                // 用户ID
    name: string;                   // 用户名
    avatar?: string;                // 头像URL
    unread_count?: number;          // 未读数（可选）
}

/**
 * 消息发送参数接口
 */
export interface MessageSendParams {
    tabId: string;                  // 浏览器标签页ID
    userName: string;               // 目标用户名
    content: string;                // 消息内容（文本或base64图片）
    type: 'text' | 'image';        // 消息类型
    platform: string;              // 平台标识
    accountId?: string;             // 发送账号ID（可选）
}

/**
 * 消息发送结果接口
 */
export interface MessageSendResult {
    success: boolean;               // 是否成功
    message?: string;               // 成功消息
    error?: string;                 // 错误信息
    user: string;                   // 目标用户
    type: 'text' | 'image';        // 消息类型
    content?: string;               // 发送内容（文本时返回）
    timestamp?: string;             // 发送时间戳
}

/**
 * 消息同步参数接口
 */
export interface MessageSyncParams {
    tabId: string;                  // 浏览器标签页ID
    platform: string;              // 平台标识
    accountId: string;              // 账号ID
    lastSyncTime?: string;          // 上次同步时间（增量同步用）
    fullSync?: boolean;             // 是否全量同步
    // 🔥 新增：事件数据，用于实时同步
    eventData?: any;
}

/**
 * 消息同步结果接口
 */
export interface MessageSyncResult {
    success: boolean;               // 是否成功
    threads: UserMessageThread[];  // 同步到的对话线程
    newMessages: number;            // 新消息数量
    updatedThreads: number;         // 更新的线程数
    errors?: string[];              // 错误列表
    syncTime: string;               // 同步完成时间
    message?: string;               // 附加消息（如"该账号暂无私信用户"）
}

/**
 * 消息统计接口
 */
export interface MessageStatistics {
    totalThreads: number;           // 总对话数
    totalMessages: number;          // 总消息数
    unreadMessages: number;         // 未读消息数
    platformStats: Record<string, { // 按平台统计
        threads: number;
        messages: number;
        unread: number;
    }>;
    timeRangeStats?: {              // 时间范围统计（可选）
        startTime: string;
        endTime: string;
        totalMessages: number;
        sentByMe: number;
        receivedFromUsers: number;
        activeUsers: number;
    };
}

// ==================== 消息插件接口定义 ====================

/**
 * 消息插件基础接口
 */
export interface PluginMessage extends BasePlugin {
    readonly type: PluginType.MESSAGE;

    /**
     * 🔥 同步消息功能 - 核心方法
     * @param params 同步参数
     * @returns 同步结果
     */
    syncMessages(params: MessageSyncParams): Promise<MessageSyncResult>;

    /**
     * 🔥 发送消息功能 - 核心方法  
     * @param params 发送参数
     * @returns 发送结果
     */
    sendMessage(params: MessageSendParams): Promise<MessageSendResult>;

    /**
     * 获取用户列表（可选）
     * @param tabId 标签页ID
     * @returns 用户列表
     */
    getUserList?(tabId: string): Promise<UserInfo[]>;

    /**
     * 验证标签页上下文（可选）
     * @param tabId 标签页ID
     * @returns 是否在正确页面
     */
    validateTabContext?(tabId: string): Promise<boolean>;

    /**
     * 获取平台特定配置（可选）
     * @returns 平台配置
     */
    getPlatformConfig?(): Record<string, any>;

    // 🔥 添加索引签名以支持动态方法访问
    [key: string]: any;
}

// ==================== 批量操作接口 ====================


/**
 * 批量消息同步请求接口
 */
export interface BatchMessageSyncRequest {
    platform: string;              // 平台标识
    accounts: Array<{               // 账号列表
        accountId: string;
        cookieFile: string;
        lastSyncTime?: string;
    }>;
    options?: MessageSyncOptions;   // 🔥 使用统一的同步选项类型
}
/**
 * 批量消息同步结果接口
 */
export interface BatchMessageSyncResult {
    success: boolean;               // 整体是否成功
    results: Array<{                // 各账号结果
        accountId: string;
        tabId: string;
        success: boolean;
        syncResult?: MessageSyncResult;
        error?: string;
    }>;
    summary: {                      // 汇总统计
        totalAccounts: number;
        successCount: number;
        failedCount: number;
        totalNewMessages: number;
        totalUpdatedThreads: number;
    };
    syncTime: string;               // 批量同步完成时间
}

/**
 * 批量消息发送请求接口
 */
export interface BatchMessageSendRequest {
    platform: string;              // 平台标识
    messages: Array<{               // 消息列表
        tabId: string;
        accountId: string;
        userName: string;
        content: string;
        type: 'text' | 'image';
    }>;
    options?: {                     // 发送选项
        delay?: number;             // 消息间隔（毫秒，默认1000）
        timeout?: number;           // 超时时间（毫秒）
        continueOnError?: boolean;  // 遇到错误是否继续
    };
}

/**
 * 批量消息发送结果接口
 */
export interface BatchMessageSendResult {
    success: boolean;               // 整体是否成功
    results: Array<MessageSendResult>; // 各消息发送结果
    summary: {                      // 汇总统计
        totalMessages: number;
        successCount: number;
        failedCount: number;
    };
    sendTime: string;               // 批量发送完成时间
}

// ==================== 消息相关接口 ====================

/**
 * 消息同步选项接口
 */
export interface MessageSyncOptions {
    forceSync?: boolean;            // 是否强制同步
    maxRetries?: number;            // 最大重试次数
    timeout?: number;               // 超时时间（毫秒）
    intelligentSync?: boolean;      // 🔥 智能同步开关
    maxConcurrency?: number;        // 最大并发数
    fullSync?: boolean;             // 是否全量同步
}


// ==================== 扩展现有接口 ====================

/**
 * 扩展 BasePlugin 接口（如果需要）
 */
export interface BasePlugin {
    readonly platform: string;
    readonly name: string;
    readonly type: PluginType;

    init(tabManager: any): Promise<void>;  // TabManager 类型
    destroy?(): Promise<void>;
}

// ==================== 类型别名和工具类型 ====================

/**
 * 消息插件类型别名
 */
export type MessagePlugin = PluginMessage;

/**
 * 支持的消息平台联合类型
 */
export type MessagePlatform = 'wechat' | 'douyin' | 'xiaohongshu' | 'kuaishou' | 'tiktok';

/**
 * 消息内容联合类型
 */
export type MessageContent = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    images: string[];
} | {
    type: 'mixed';
    text: string;
    images: string[];
};

/**
 * 消息查询选项接口
 */
export interface MessageQueryOptions {
    platform?: string;             // 过滤平台
    accountId?: string;             // 过滤账号
    userId?: string;                // 过滤用户
    startTime?: string;             // 开始时间
    endTime?: string;               // 结束时间
    sender?: 'me' | 'user';        // 过滤发送者
    contentType?: 'text' | 'image' | 'mixed'; // 过滤内容类型
    isRead?: boolean;               // 过滤已读状态
    keyword?: string;               // 关键词搜索
    limit?: number;                 // 结果数量限制
    offset?: number;                // 结果偏移量
}

/**
 * 消息导出选项接口
 */
export interface MessageExportOptions {
    format: 'json' | 'csv' | 'txt'; // 导出格式
    includeImages?: boolean;        // 是否包含图片
    dateRange?: {                   // 时间范围
        start: string;
        end: string;
    };
    platforms?: string[];           // 指定平台
    accountIds?: string[];          // 指定账号
}

// ==================== 事件和通知接口 ====================

/**
 * 消息事件接口
 */
export interface MessageEvent {
    type: 'new_message' | 'message_sent' | 'sync_completed' | 'sync_error';
    platform: string;
    accountId: string;
    data: any;
    timestamp: string;
}

/**
 * 消息通知配置接口
 */
export interface MessageNotificationConfig {
    enabled: boolean;               // 是否启用通知
    platforms: string[];            // 通知的平台
    notifyOnNewMessage: boolean;    // 新消息通知
    notifyOnSyncError: boolean;     // 同步错误通知
    notifyOnSendFailed: boolean;    // 发送失败通知
    soundEnabled?: boolean;         // 是否播放提示音
    desktopNotification?: boolean;  // 是否显示桌面通知
}

// ==================== 错误处理接口 ====================

/**
 * 消息错误接口
 */
export interface MessageError extends Error {
    code: string;                   // 错误代码
    platform: string;              // 相关平台
    accountId?: string;             // 相关账号
    operation: 'sync' | 'send' | 'validate'; // 操作类型
    details?: any;                  // 错误详情
    timestamp: string;              // 错误时间
}

/**
 * 错误恢复策略接口
 */
export interface ErrorRecoveryStrategy {
    maxRetries: number;             // 最大重试次数
    retryDelay: number;             // 重试延迟（毫秒）
    backoffMultiplier?: number;     // 退避乘数
    recoverableErrors: string[];    // 可恢复的错误代码
    onMaxRetriesReached?: (error: MessageError) => Promise<void>; // 达到最大重试次数的回调
}
// 导出类型别名，方便使用
export type UploaderPlugin = PluginUploader;
export type LoginPlugin = PluginLogin;
export type ValidatorPlugin = PluginValidator;