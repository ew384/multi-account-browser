// src/main/automation/AutomationEngine.ts
import { TabManager } from '../TabManager';
import { PluginManager } from '../PluginManager';
import { AccountStorage } from '../plugins/login/base/AccountStorage';
import { Config } from '../config/Config';
import {
    UploadParams,
    UploadResult,
    BatchUploadRequest,
    AccountInfo,
    LoginParams,
    LoginResult,
    LoginStatus
} from '../../types/pluginInterface';
import { PluginType, PluginUploader, PluginLogin, PluginValidator } from '../../types/pluginInterface';
import * as path from 'path';
import * as fs from 'fs';
export class AutomationEngine {
    private tabManager: TabManager;
    private pluginManager: PluginManager;


    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        this.pluginManager = new PluginManager(tabManager);
    }

    getPluginManager(): PluginManager {
        return this.pluginManager;
    }

    private activeLogins: Map<string, LoginStatus> = new Map();

    async startLogin(platform: string, userId: string): Promise<LoginResult> {
        try {
            console.log(`🔐 AutomationEngine: 开始 ${platform} 登录流程`);

            // 检查是否已有进行中的登录
            if (this.activeLogins.has(userId)) {
                const status = this.activeLogins.get(userId)!;
                if (status.status === 'pending') {
                    return {
                        success: false,
                        error: `用户 ${userId} 已有进行中的登录`
                    };
                }
            }

            const plugin = this.pluginManager.getPlugin<PluginLogin>(PluginType.LOGIN, platform);
            if (!plugin) {
                throw new Error(`不支持的平台: ${platform}`);
            }

            // 记录登录开始状态
            const loginStatus: LoginStatus = {
                userId,
                platform,
                status: 'pending',
                startTime: new Date().toISOString()
            };
            this.activeLogins.set(userId, loginStatus);

            const result = await plugin.startLogin({ platform, userId });

            if (result.success && result.qrCodeUrl) {
                // 更新登录状态
                loginStatus.tabId = result.tabId;
                loginStatus.qrCodeUrl = result.qrCodeUrl;
                this.activeLogins.set(userId, loginStatus);

                // 🔥 启动后台等待登录完成的任务
                this.startWaitingForLoginWithProcessor(userId, result.tabId!, platform);
            } else {
                // 登录启动失败，移除状态
                this.activeLogins.delete(userId);
            }

            return result;

        } catch (error) {
            console.error(`❌ AutomationEngine: 登录启动失败:`, error);
            this.activeLogins.delete(userId);

            return {
                success: false,
                error: error instanceof Error ? error.message : '登录启动失败'
            };
        }
    }


    // 🔥 启动后台等待登录完成任务
    private async startWaitingForLoginWithProcessor(
        userId: string,
        tabId: string,
        platform: string
    ): Promise<void> {
        try {
            // 🔥 使用 getProcessor 方法
            const processor = this.pluginManager.getProcessor('login');

            if (processor) {
                const completeResult = await processor.process({
                    tabId,
                    userId,
                    platform
                });

                // 更新登录状态
                const loginStatus = this.activeLogins.get(userId);
                if (loginStatus) {
                    loginStatus.status = completeResult.success ? 'completed' : 'failed';
                    loginStatus.endTime = new Date().toISOString();

                    if (completeResult.success) {
                        loginStatus.cookieFile = completeResult.cookiePath;
                        loginStatus.accountInfo = completeResult.accountInfo;
                        console.log(`✅ 登录处理成功: ${userId}`);
                    }

                    this.activeLogins.set(userId, loginStatus);
                }
            } else {
                console.error('❌ 未找到登录处理器插件');
            }
        } catch (error) {
            console.error(`❌ 登录处理失败: ${userId}:`, error);
        }
    }

    getLoginStatus(userId: string): LoginStatus | null {
        return this.activeLogins.get(userId) || null;
    }

    async cancelLogin(userId: string): Promise<boolean> {
        try {
            const loginStatus = this.activeLogins.get(userId);
            if (!loginStatus || !loginStatus.tabId) {
                return false;
            }

            const plugin = this.pluginManager.getPlugin<PluginLogin>(PluginType.LOGIN, loginStatus.platform);
            if (plugin && plugin.cancelLogin) {
                await plugin.cancelLogin(loginStatus.tabId);
            }

            // 更新状态
            loginStatus.status = 'cancelled';
            loginStatus.endTime = new Date().toISOString();
            this.activeLogins.set(userId, loginStatus);

            console.log(`🚫 登录已取消: ${userId}`);
            return true;

        } catch (error) {
            console.error(`❌ 取消登录失败: ${userId}:`, error);
            return false;
        }
    }

    getAllLoginStatuses(): LoginStatus[] {
        return Array.from(this.activeLogins.values());
    }

    cleanupExpiredLogins(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24小时

        for (const [userId, status] of this.activeLogins.entries()) {
            if (status.status !== 'pending') {
                const statusTime = status.endTime ? new Date(status.endTime).getTime() : new Date(status.startTime).getTime();
                if (now - statusTime > maxAge) {
                    this.activeLogins.delete(userId);
                    console.log(`🧹 清理过期登录状态: ${userId}`);
                }
            }
        }
    }

    getSupportedLoginPlatforms(): string[] {
        return this.pluginManager.getSupportedPlatforms(PluginType.LOGIN);
    }


    /**
     * 🔥 新增：检查平台是否支持登录
     * @param platform 平台名称
     * @returns 是否支持登录
     */
    isLoginSupported(platform: string): boolean {
        return this.pluginManager.isPlatformSupported(PluginType.LOGIN, platform);
    }
    /*
     * @param params 上传参数
     * @returns 是否成功
     */
    async uploadVideo(params: UploadParams): Promise<boolean> {
        try {
            console.log(`🚀 开始 ${params.platform} 平台视频上传: ${params.title}`);

            // 🔥 通过插件管理器获取对应平台的上传器
            const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, params.platform);
            if (!uploader) {
                throw new Error(`不支持的平台: ${params.platform}`);
            }

            // 🔥 调用插件的上传方法
            const result = await uploader.uploadVideoComplete(params);

            console.log(`${result ? '✅ 上传成功' : '❌ 上传失败'}: ${params.title}`);
            return result;

        } catch (error) {
            console.error(`❌ ${params.platform} 视频上传失败:`, error);
            throw error;
        }
    }

    /**
     * 🔥 改造：批量视频上传 - 支持多文件、多账号
     * @param request 批量上传请求
     * @returns 上传结果列表
     */
    async batchUpload(request: BatchUploadRequest): Promise<UploadResult[]> {
        try {
            console.log(`🚀 开始批量上传`);
            console.log(`   文件数: ${request.files.length}`);
            console.log(`   账号数: ${request.accounts.length}`);

            const results: UploadResult[] = [];
            let successCount = 0;
            let failedCount = 0;

            // 🔥 双重循环：每个文件对每个账号
            for (const file of request.files) {
                for (const account of request.accounts) {
                    try {
                        // 🔥 关键修改：从账号信息中获取平台类型
                        let accountPlatform = '';
                        let cookieFile = '';
                        let accountName = '';

                        if (typeof account === 'string') {
                            // 如果account是字符串（filePath），从文件名解析平台和账号名
                            cookieFile = account;
                            const fileName = path.basename(account, '.json');
                            const parts = fileName.split('_');

                            if (parts.length >= 2) {
                                const platformPrefix = parts[0]; // douyin, wechat等
                                accountName = parts.slice(1, -1).join('_');

                                // 🔥 映射文件前缀到平台名
                                const platformMap: Record<string, string> = {
                                    'douyin': 'douyin',
                                    'wechat': 'wechat',
                                    'kuaishou': 'kuaishou',
                                    'xiaohongshu': 'xiaohongshu'
                                };

                                accountPlatform = platformMap[platformPrefix] || request.platform;
                            } else {
                                accountPlatform = request.platform;
                                accountName = 'unknown';
                            }
                        } else {
                            // 🔥 修正：使用AccountInfo接口的正确属性名
                            accountPlatform = account.platform || request.platform;
                            cookieFile = account.cookieFile || `${account.accountName}.json`;
                            accountName = account.accountName || 'unknown';
                        }

                        console.log(`📤 上传: ${file} -> ${accountName} (${accountPlatform}平台)`);

                        // 🔥 动态获取对应平台的uploader
                        const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, accountPlatform);
                        if (!uploader) {
                            throw new Error(`不支持的平台: ${accountPlatform}`);
                        }
                        console.log(`🔍 准备上传参数:`);
                        console.log(`   cookieFile: ${cookieFile}`);
                        console.log(`   完整路径: ${path.join(Config.COOKIE_DIR, cookieFile)}`);
                        console.log(`   文件是否存在: ${require('fs').existsSync(path.join(Config.COOKIE_DIR, cookieFile))}`);

                        // 构造单次上传参数
                        let fullFilePath: string;
                        if (path.isAbsolute(file)) {
                            // 如果已经是绝对路径，直接使用
                            fullFilePath = file;
                        } else {
                            // 如果是文件名，构造完整路径
                            fullFilePath = path.join(Config.VIDEO_DIR, file);
                        }

                        console.log(`🔍 视频文件路径处理:`);
                        console.log(`   原始file: ${file}`);
                        console.log(`   完整路径: ${fullFilePath}`);
                        console.log(`   文件是否存在: ${fs.existsSync(fullFilePath)}`);

                        // 构造单次上传参数
                        const uploadParams: UploadParams = {
                            ...request.params,
                            cookieFile: cookieFile,
                            platform: accountPlatform,
                            filePath: fullFilePath  // 🔥 使用完整路径
                        };

                        // 执行上传
                        const success = await uploader.uploadVideoComplete(uploadParams);

                        results.push({
                            success,
                            file: file,
                            account: accountName,
                            platform: accountPlatform, // 🔥 记录实际使用的平台
                            uploadTime: new Date().toISOString()
                        });

                        if (success) {
                            successCount++;
                            console.log(`✅ 成功: ${file} -> ${accountName} (${accountPlatform})`);
                        } else {
                            failedCount++;
                            console.log(`❌ 失败: ${file} -> ${accountName} (${accountPlatform})`);
                        }

                    } catch (error) {
                        failedCount++;
                        const errorMsg = error instanceof Error ? error.message : '未知错误';

                        results.push({
                            success: false,
                            error: errorMsg,
                            file: file,
                            account: typeof account === 'string' ?
                                path.basename(account, '.json').split('_').slice(1, -1).join('_') :
                                account.accountName,  // 🔥 修正：使用accountName
                            platform: typeof account === 'string' ?
                                path.basename(account, '.json').split('_')[0] :
                                (account.platform || request.platform),
                            uploadTime: new Date().toISOString()
                        });

                        console.error(`❌ 上传异常: ${file} -> ${typeof account === 'string' ? account : account.accountName}:`, errorMsg);  // 🔥 修正：使用accountName
                    }

                    // 🔥 添加间隔，避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`📊 批量上传完成: 成功 ${successCount}, 失败 ${failedCount}`);
            return results;

        } catch (error) {
            console.error(`❌ 批量上传失败:`, error);
            throw error;
        }
    }
    /**
     * 🔥 新增：批量账号登录
     * @param requests 登录请求列表 [{platform: 'wechat', userId: 'user1'}, ...]
     * @returns 登录结果列表
     */
    async batchLogin(requests: Array<{ platform: string, userId: string }>): Promise<LoginResult[]> {
        try {
            console.log(`🔐 AutomationEngine: 开始批量登录 ${requests.length} 个账号`);

            const results: LoginResult[] = [];

            // 串行处理登录请求，避免资源冲突
            for (const request of requests) {
                try {
                    console.log(`🔐 处理登录: ${request.platform} - ${request.userId}`);

                    const result = await this.startLogin(request.platform, request.userId);
                    results.push(result);

                    if (result.success) {
                        console.log(`✅ 登录启动成功: ${request.userId}`);
                    } else {
                        console.log(`❌ 登录启动失败: ${request.userId} - ${result.error}`);
                    }

                    // 短暂延迟，避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : '未知错误';
                    results.push({
                        success: false,
                        error: errorMsg
                    });

                    console.error(`❌ 批量登录异常: ${request.userId}:`, errorMsg);
                }
            }

            const successCount = results.filter(r => r.success).length;
            console.log(`📊 批量登录完成: ${successCount}/${requests.length} 成功启动`);

            return results;

        } catch (error) {
            console.error(`❌ AutomationEngine: 批量登录失败:`, error);
            throw error;
        }
    }

    /**
     * 🔥 新增：等待批量登录完成
     * @param userIds 用户ID列表
     * @param timeout 超时时间（毫秒）
     * @returns 完成的登录结果
     */
    async waitForBatchLoginComplete(userIds: string[], timeout: number = 300000): Promise<{ completed: LoginStatus[], pending: LoginStatus[], failed: LoginStatus[] }> {
        console.log(`⏳ AutomationEngine: 等待批量登录完成 (${userIds.length} 个账号)`);

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const statuses = userIds.map(userId => this.getLoginStatus(userId)).filter(Boolean) as LoginStatus[];

            const completed = statuses.filter(s => s.status === 'completed');
            const failed = statuses.filter(s => s.status === 'failed' || s.status === 'cancelled');
            const pending = statuses.filter(s => s.status === 'pending');

            // 如果所有登录都完成了（成功或失败）
            if (pending.length === 0) {
                console.log(`✅ 批量登录全部完成: 成功 ${completed.length}, 失败 ${failed.length}`);
                return { completed, pending, failed };
            }

            // 每5秒检查一次
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // 超时处理
        const statuses = userIds.map(userId => this.getLoginStatus(userId)).filter(Boolean) as LoginStatus[];
        const completed = statuses.filter(s => s.status === 'completed');
        const failed = statuses.filter(s => s.status === 'failed' || s.status === 'cancelled');
        const pending = statuses.filter(s => s.status === 'pending');

        console.log(`⏰ 批量登录等待超时: 完成 ${completed.length}, 失败 ${failed.length}, 待定 ${pending.length}`);

        return { completed, pending, failed };
    }
    /*
     * @param platform 平台
     * @param tabId 标签页ID
     * @returns 账号信息
     */
    async getAccountInfo(platform: string, tabId: string): Promise<AccountInfo | null> {
        try {
            console.log(`🔍 获取 ${platform} 平台账号信息...`);

            const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, platform);

            // 🔥 详细调试信息
            console.log(`📋 插件查找结果:`, {
                uploader: !!uploader,
                platform: platform,
                uploaderName: uploader?.name,
                uploaderPlatform: uploader?.platform,
                hasGetAccountInfo: !!uploader?.getAccountInfo,
                getAccountInfoType: typeof uploader?.getAccountInfo
            });

            if (uploader && uploader.getAccountInfo) {
                console.log(`✅ 找到插件和方法，开始调用...`);
                const accountInfo = await uploader.getAccountInfo(tabId);
                console.log(`📊 账号信息提取结果:`, accountInfo);
                return accountInfo;
            } else {
                console.error(`❌ 插件或方法不存在`);
                throw new Error(`平台 ${platform} 不支持账号信息获取`);
            }

        } catch (error) {
            console.error(`❌ 获取账号信息失败:`, error);
            throw error;
        }
    }


    /**
     * 🔥 获取需要验证的账号列表
     */
    async getAccountsNeedingValidation(): Promise<Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        lastCheckTime: string;
    }>> {
        try {
            return await AccountStorage.getValidAccountsNeedingRevalidation();
        } catch (error) {
            console.error('❌ AutomationEngine: 获取需验证账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取所有有效账号
     */
    async getValidAccounts(): Promise<Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        status: number;
        lastCheckTime: string;
    }>> {
        try {
            return await AccountStorage.getValidAccounts();
        } catch (error) {
            console.error('❌ AutomationEngine: 获取有效账号失败:', error);
            return [];
        }
    }

    async getValidAccountsForFrontend(forceCheck: boolean = false): Promise<any[]> {
        try {
            const accounts = await AccountStorage.getValidAccountsForFrontend();

            if (!forceCheck) {
                return accounts;
            }

            console.log(`🔍 强制验证 ${accounts.length} 个账号...`);

            for (const account of accounts) {
                try {
                    // 🔥 使用 AccountStorage 的静态方法
                    const platform = AccountStorage.getPlatformName(account.type);
                    const cookieFile = path.join(Config.COOKIE_DIR, account.filePath);

                    const isValid = await this.validateAccount(platform, cookieFile);
                    account.status = isValid ? '正常' : '异常';

                } catch (error) {
                    console.error(`❌ 验证账号失败 ${account.userName}:`, error);
                    account.status = '异常';
                }
            }

            return accounts;

        } catch (error) {
            console.error('❌ 获取有效账号失败:', error);
            throw error;
        }
    }
    /**
     * 🔥 获取分组账号信息 - 用于后端自动化调度
     */
    async getAccountsWithGroups(): Promise<Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        status: number;
        lastCheckTime: string;
        groupId: number | null;
        groupName: string | null;
        groupColor: string | null;
    }>> {
        try {
            return await AccountStorage.getAccountsWithGroups();
        } catch (error) {
            console.error('❌ AutomationEngine: 获取分组账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 前端兼容：获取带分组信息的账号列表（含验证逻辑）
     */
    async getAccountsWithGroupsForFrontend(forceCheck: boolean = false): Promise<any[]> {
        try {
            const accounts = await AccountStorage.getAccountsWithGroupsForFrontend();

            if (!forceCheck) {
                return accounts;
            }

            // 强制验证逻辑（与上面类似）
            for (const account of accounts) {
                try {
                    const platform = AccountStorage.getPlatformName(account.type);
                    const cookieFile = path.join(Config.COOKIE_DIR, account.filePath);

                    const isValid = await this.validateAccount(platform, cookieFile);
                    account.status = isValid ? '正常' : '异常';

                } catch (error) {
                    console.error(`❌ 验证账号失败 ${account.userName}:`, error);
                    account.status = '异常';
                }
            }

            return accounts;

        } catch (error) {
            console.error('❌ 获取分组账号失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 手动验证指定账号
     */
    async validateAccountManually(accountId: number): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }> {
        try {
            // 1. 通过 AccountStorage 获取账号信息
            const account = await AccountStorage.getAccountById(accountId);

            if (!account) {
                return {
                    success: false,
                    message: '账号不存在'
                };
            }

            // 2. 调用验证插件进行验证
            const platform = AccountStorage.getPlatformName(account.type);
            const cookieFile = path.join(Config.COOKIE_DIR, account.filePath);

            // 🔥 关键：调用已有的 validateAccount 方法（它会调用验证插件）
            const isValid = await this.validateAccount(platform, cookieFile);

            // 3. 通过 AccountStorage 更新数据库
            const currentTime = new Date().toISOString();
            const updated = await AccountStorage.updateValidationStatusById(
                accountId,
                isValid,
                currentTime
            );

            if (!updated) {
                return {
                    success: false,
                    message: '更新验证状态失败'
                };
            }

            return {
                success: true,
                message: `验证完成: ${isValid ? '有效' : '无效'}`,
                data: {
                    accountId: accountId,
                    userName: account.userName,
                    platform: platform,
                    isValid: isValid,
                    verifiedAt: currentTime
                }
            };

        } catch (error) {
            console.error(`❌ 手动验证账号失败:`, error);
            return {
                success: false,
                message: `验证失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 批量手动验证账号
     */
    async validateAccountsBatchManually(accountIds: number[]): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }> {
        try {
            console.log(`🔍 手动批量验证 ${accountIds.length} 个账号...`);

            // 1. 通过 AccountStorage 获取所有账号信息
            const accounts = await AccountStorage.getAccountsByIds(accountIds);

            if (accounts.length === 0) {
                return {
                    success: false,
                    message: '没有找到要验证的账号'
                };
            }

            const results = [];
            const currentTime = new Date().toISOString();
            const batchUpdates = [];

            // 2. 逐个验证账号
            for (const account of accounts) {
                try {
                    const platform = AccountStorage.getPlatformName(account.type);
                    const cookieFile = path.join(Config.COOKIE_DIR, account.filePath);

                    // 🔥 调用验证插件
                    const isValid = await this.validateAccount(platform, cookieFile);

                    // 收集批量更新数据
                    batchUpdates.push({
                        accountId: account.id,
                        isValid: isValid,
                        validationTime: currentTime
                    });

                    results.push({
                        accountId: account.id,
                        userName: account.userName,
                        platform: platform,
                        success: true,
                        isValid: isValid,
                        message: `验证完成: ${isValid ? '有效' : '无效'}`
                    });

                } catch (error) {
                    results.push({
                        accountId: account.id,
                        userName: account.userName,
                        success: false,
                        error: error instanceof Error ? error.message : 'unknown error',
                        message: '验证失败'
                    });
                }
            }

            // 3. 批量更新数据库（通过 AccountStorage）
            const updatedCount = await AccountStorage.batchUpdateValidationStatus(batchUpdates);
            const successCount = results.filter(r => r.success).length;

            return {
                success: true,
                message: `批量验证完成: ${successCount}/${accountIds.length} 个账号验证成功，${updatedCount} 个状态已更新`,
                data: {
                    total: accountIds.length,
                    success: successCount,
                    failed: accountIds.length - successCount,
                    updated: updatedCount,
                    results: results
                }
            };

        } catch (error) {
            console.error('❌ 批量手动验证失败:', error);
            return {
                success: false,
                message: `批量验证失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }
    /**
     * 🔥 自动验证过期账号（优化版）
     * 只验证当前有效但超过1小时未验证的账号
     */
    async autoValidateExpiredAccounts(): Promise<{
        validatedCount: number;
        validCount: number;
        invalidCount: number;
    }> {
        try {
            console.log('🔍 AutomationEngine: 开始自动验证过期的有效账号...');

            // 🔥 使用优化后的方法：只获取有效且需要验证的账号
            const needValidation = await AccountStorage.getValidAccountsNeedingRevalidation();

            if (needValidation.length === 0) {
                console.log('✅ 没有有效账号需要重新验证');
                return { validatedCount: 0, validCount: 0, invalidCount: 0 };
            }

            console.log(`🔍 发现 ${needValidation.length} 个有效账号需要重新验证`);

            // 2. 批量验证
            const validationResults = await this.batchValidateAccounts(
                needValidation.map(account => ({
                    platform: account.platform,
                    accountName: account.userName,
                    cookieFile: path.join(Config.COOKIE_DIR, account.filePath)
                }))
            );

            // 3. 统计结果
            const validCount = validationResults.filter(r => r.isValid).length;
            const invalidCount = needValidation.length - validCount;

            console.log(`✅ 自动验证完成: ${validCount}/${needValidation.length} 个账号仍然有效，${invalidCount} 个账号已失效`);

            return {
                validatedCount: needValidation.length,
                validCount: validCount,
                invalidCount: invalidCount
            };

        } catch (error) {
            console.error('❌ AutomationEngine: 自动验证失败:', error);
            throw error;
        }
    }

    async validateAccount(platform: string, cookieFile: string): Promise<boolean> {
        try {
            // 1. 调用验证插件（只做验证，不操作数据库）
            const validator = this.pluginManager.getPlugin<PluginValidator>(PluginType.VALIDATOR, platform);
            if (!validator) {
                console.warn(`⚠️ 平台 ${platform} 暂不支持验证功能`);
                return false;
            }

            const isValid = await validator.validateCookie(cookieFile);

            // 2. 统一处理数据库更新
            const currentTime = new Date().toISOString();
            await AccountStorage.updateValidationStatus(cookieFile, isValid, currentTime);

            console.log(`${platform} Cookie验证${isValid ? '有效' : '无效'}${isValid ? '✅' : '❌'}: ${path.basename(cookieFile)}`);
            return isValid;

        } catch (error) {
            console.error(`❌ AutomationEngine: Cookie验证异常:`, error);

            // 验证失败时也要更新数据库状态
            try {
                await AccountStorage.updateValidationStatus(cookieFile, false, new Date().toISOString());
            } catch (dbError) {
                console.error(`❌ 更新验证状态失败:`, dbError);
            }

            return false;
        }
    }

    /**
     * 🔥 批量验证账号Cookie
     */
    async batchValidateAccounts(accounts: Array<{
        platform: string,
        accountName: string,
        cookieFile: string
    }>): Promise<Array<{
        platform: string,
        accountName: string,
        cookieFile: string,
        isValid: boolean
    }>> {
        console.log(`🔍 AutomationEngine: 批量验证 ${accounts.length} 个账号Cookie...`);

        const results = [];

        for (const account of accounts) {
            try {
                const isValid = await this.validateAccount(account.platform, account.cookieFile);

                results.push({
                    ...account,
                    isValid
                });
            } catch (error) {
                console.error(`❌ 验证账号失败 ${account.accountName}:`, error);
                results.push({
                    ...account,
                    isValid: false
                });
            }

            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const validCount = results.filter(r => r.isValid).length;
        console.log(`📊 AutomationEngine: 批量验证完成: ${validCount}/${accounts.length} 个账号有效`);

        return results;
    }
    /**
     * 🔥 新增：获取支持的平台列表
     * @returns 平台列表
     */
    getSupportedPlatforms(): string[] {
        return this.pluginManager.getSupportedPlatforms(PluginType.UPLOADER);
    }

    /**
     * 🔥 新增：检查平台是否支持
     * @param platform 平台名称
     * @returns 是否支持
     */
    isPlatformSupported(platform: string): boolean {
        return this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, platform) !== null;
    }

    /**
     * 🔥 新增：获取平台插件信息
     * @param platform 平台名称
     * @returns 插件信息
     */
    getPluginInfo(platform: string): { name: string; platform: string } | null {
        const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, platform);
        if (!uploader) return null;

        return {
            name: uploader.name,
            platform: uploader.platform
        };
    }

    /**
     * 🔥 新增：获取综合平台支持信息
     * @returns 平台支持信息
     */
    getPlatformSupportInfo(): Record<string, { upload: boolean, login: boolean, validation: boolean }> {
        const uploadPlatforms = this.getSupportedPlatforms();
        const loginPlatforms = this.getSupportedLoginPlatforms();

        const allPlatforms = new Set([...uploadPlatforms, ...loginPlatforms]);
        const supportInfo: Record<string, { upload: boolean, login: boolean, validation: boolean }> = {};

        for (const platform of allPlatforms) {
            supportInfo[platform] = {
                upload: uploadPlatforms.includes(platform),
                login: loginPlatforms.includes(platform),
                validation: this.isPlatformSupported(platform) // 复用上传支持检查作为基础验证
            };
        }

        return supportInfo;
    }

    /**
     * 🔥 新增：获取系统状态总览
     * @returns 系统状态信息
     */
    getSystemStatus(): {
        uploaders: { total: number, platforms: string[] },
        logins: { total: number, platforms: string[], active: number },
        activeLogins: LoginStatus[]
    } {
        const uploaderPlatforms = this.getSupportedPlatforms();
        const loginPlatforms = this.getSupportedLoginPlatforms();
        const activeLogins = this.getAllLoginStatuses();

        return {
            uploaders: {
                total: uploaderPlatforms.length,
                platforms: uploaderPlatforms
            },
            logins: {
                total: loginPlatforms.length,
                platforms: loginPlatforms,
                active: activeLogins.filter(login => login.status === 'pending').length
            },
            activeLogins: activeLogins
        };
    }

}

