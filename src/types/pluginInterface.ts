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
}

/**
 * 视频上传参数接口
 */
export interface UploadParams {
    // 账号相关
    cookieFile: string;        // Cookie文件路径，如 'wechat_account1.json'
    platform: string;         // 平台标识，如 'wechat', 'douyin', 'xiaohongshu'

    // 视频相关
    filePath: string;          // 视频文件路径
    title: string;             // 视频标题
    tags: string[];            // 标签数组，如 ['生活', '分享']

    // 可选参数
    publishDate?: Date;        // 定时发布时间
    enableOriginal?: boolean;  // 是否启用原创声明
    addToCollection?: boolean; // 是否添加到合集
    category?: string;         // 视频分类，如 '生活', '美食' 等
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
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    startTime: string;
    endTime?: string;
    tabId?: string;
    qrCodeUrl?: string;
    cookieFile?: string;        // 🔥 新增
    accountInfo?: LoginAccountInfo;  // 🔥 新增
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
    uploadVideoComplete(params: UploadParams): Promise<boolean>;

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
    validateCookie(cookieFile: string): Promise<boolean>;
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

// 导出类型别名，方便使用
export type UploaderPlugin = PluginUploader;
export type LoginPlugin = PluginLogin;
export type ValidatorPlugin = PluginValidator;