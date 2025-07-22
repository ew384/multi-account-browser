// src/main/automation/AutomationEngine.ts

import { TabManager } from '../TabManager';
import { PluginManager } from '../PluginManager';

import {
    UploadParams,
    UploadResult,
    BatchUploadRequest,
    AccountInfo,
    LoginParams,
    LoginResult,
    LoginStatus
} from '../../types/pluginInterface';
import { PluginType, PluginUploader, PluginLogin } from '../../types/pluginInterface';
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
                this.startWaitingForLogin(userId, result.tabId!, platform);
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
    private async startWaitingForLogin(userId: string, tabId: string, platform: string): Promise<void> {
        try {
            const plugin = this.pluginManager.getPlugin<PluginLogin>(PluginType.LOGIN, platform);
            if (!plugin) return;

            console.log(`⏳ 开始等待登录完成: ${userId}`);

            // 在后台异步等待登录
            const result = await plugin.waitForLogin(tabId, userId);

            // 更新登录状态
            const loginStatus = this.activeLogins.get(userId);
            if (loginStatus) {
                loginStatus.status = result.success ? 'completed' : 'failed';
                loginStatus.endTime = new Date().toISOString();

                if (result.success) {
                    console.log(`✅ 登录成功: ${userId}`);
                    console.log(`   Cookie文件: ${result.cookieFile}`);
                    console.log(`   账号名: ${result.accountInfo?.accountName}`);
                } else {
                    console.log(`❌ 登录失败: ${userId} - ${result.error}`);
                }

                this.activeLogins.set(userId, loginStatus);
            }

        } catch (error) {
            console.error(`❌ 等待登录完成失败: ${userId}:`, error);

            const loginStatus = this.activeLogins.get(userId);
            if (loginStatus) {
                loginStatus.status = 'failed';
                loginStatus.endTime = new Date().toISOString();
                this.activeLogins.set(userId, loginStatus);
            }
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
            console.log(`🚀 开始批量上传: ${request.platform} 平台`);
            console.log(`   文件数: ${request.files.length}`);
            console.log(`   账号数: ${request.accounts.length}`);

            const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, request.platform);
            if (!uploader) {
                throw new Error(`不支持的平台: ${request.platform}`);
            }

            const results: UploadResult[] = [];
            let successCount = 0;
            let failedCount = 0;

            // 🔥 双重循环：每个文件对每个账号
            for (const file of request.files) {
                for (const account of request.accounts) {
                    try {
                        console.log(`📤 上传: ${file} -> ${account.accountName}`);

                        // 构造单次上传参数
                        const uploadParams: UploadParams = {
                            ...request.params,
                            cookieFile: account.cookieFile || `${account.accountName}.json`,
                            platform: request.platform,
                            filePath: file
                        };

                        // 执行上传
                        const success = await uploader.uploadVideoComplete(uploadParams);

                        results.push({
                            success,
                            file: file,
                            account: account.accountName,
                            platform: request.platform,
                            uploadTime: new Date().toISOString()
                        });

                        if (success) {
                            successCount++;
                            console.log(`✅ 成功: ${file} -> ${account.accountName}`);
                        } else {
                            failedCount++;
                            console.log(`❌ 失败: ${file} -> ${account.accountName}`);
                        }

                    } catch (error) {
                        failedCount++;
                        const errorMsg = error instanceof Error ? error.message : '未知错误';

                        results.push({
                            success: false,
                            error: errorMsg,
                            file: file,
                            account: account.accountName,
                            platform: request.platform,
                            uploadTime: new Date().toISOString()
                        });

                        console.error(`❌ 上传异常: ${file} -> ${account.accountName}:`, errorMsg);
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
            if (!uploader || !uploader.getAccountInfo) {
                throw new Error(`平台 ${platform} 不支持账号信息获取`);
            }

            const accountInfo = await uploader.getAccountInfo(tabId);

            if (accountInfo) {
                console.log(`✅ 账号信息获取成功: ${accountInfo.accountName}`);
            } else {
                console.log(`❌ 未获取到账号信息`);
            }

            return accountInfo;

        } catch (error) {
            console.error(`❌ 获取账号信息失败:`, error);
            throw error;
        }
    }

    /**
     * 🔥 新增：验证账号状态
     * @param platform 平台
     * @param tabId 标签页ID
     * @returns 是否有效
     */
    async validateAccount(platform: string, tabId: string): Promise<boolean> {
        try {
            console.log(`🔍 验证 ${platform} 账号状态...`);

            const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, platform);
            if (!uploader || !uploader.validateAccount) {
                // 如果插件不支持验证，尝试通过获取账号信息来判断
                const accountInfo = await this.getAccountInfo(platform, tabId);
                return !!accountInfo;
            }

            const isValid = await uploader.validateAccount(tabId);
            console.log(`${isValid ? '✅ 账号有效' : '❌ 账号无效'}`);

            return isValid;

        } catch (error) {
            console.error(`❌ 账号验证失败:`, error);
            return false;
        }
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
    /*
     * @param accounts 账号列表 (包含platform和tabId)
     * @returns 验证结果
     */
    async batchValidateAccounts(accounts: Array<{ platform: string, tabId: string, accountName?: string }>): Promise<Array<{ platform: string, tabId: string, accountName?: string, isValid: boolean }>> {
        console.log(`🔍 批量验证 ${accounts.length} 个账号...`);

        const results = [];

        for (const account of accounts) {
            try {
                const isValid = await this.validateAccount(account.platform, account.tabId);
                results.push({
                    ...account,
                    isValid
                });
            } catch (error) {
                console.error(`❌ 验证账号失败 ${account.accountName || account.tabId}:`, error);
                results.push({
                    ...account,
                    isValid: false
                });
            }

            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const validCount = results.filter(r => r.isValid).length;
        console.log(`📊 批量验证完成: ${validCount}/${accounts.length} 个账号有效`);

        return results;
    }
}

