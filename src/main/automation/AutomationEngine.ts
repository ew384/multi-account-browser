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

// 🔥 声明全局类型
declare global {
    var uploadProgressNotifier: ((recordId: number, progressData: any) => void) | undefined;
    var accountStatusNotifier: ((accountData: {
        cookieFile: string;
        accountName: string;
        platform: string;
        status: string;
        isValid: boolean;
        lastCheckTime: string;
    }) => void) | undefined;
}
export class AutomationEngine {
    private tabManager: TabManager;
    private pluginManager: PluginManager;
    private activeLogins: Map<string, LoginStatus> = new Map();
    // 🔥 新增：内存状态管理
    private uploadProgressMap: Map<string, {
        recordId: number;
        accountName: string;
        status: string;
        upload_status?: string;
        push_status?: string;
        review_status?: string;
        error_message?: string;
        timestamp: number;
    }> = new Map();

    // 在构造函数中启动清理任务
    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        this.pluginManager = new PluginManager(tabManager);        
        // 🔥 启动内存清理任务
        setInterval(() => {
            this.cleanupExpiredProgress();
        }, 60 * 60 * 1000); // 每小时清理一次
    }


    // 🔥 声明全局类型
    
    getPluginManager(): PluginManager {
        return this.pluginManager;
    }


    async startLogin(platform: string, userId: string, options?: {
        isRecover?: boolean;
        accountId?: number;
    }): Promise<LoginResult> {
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
                this.startWaitingForLoginWithProcessor(
                    userId, 
                    result.tabId!, 
                    platform,
                    options?.isRecover,
                    options?.accountId
                );
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
        platform: string,
        isRecover?: boolean,
        accountId?: number
    ): Promise<void> {
        try {
            // 🔥 首先等待URL变化
            const urlChanged = await this.tabManager.waitForUrlChange(tabId, 200000);
            
            if (urlChanged) {
                // 🔥 1. 立即更新登录状态为完成
                const loginStatus = this.activeLogins.get(userId);
                if (loginStatus) {
                    loginStatus.status = 'completed';
                    loginStatus.endTime = new Date().toISOString();
                    this.activeLogins.set(userId, loginStatus);
                    console.log(`✅ 登录状态已更新为完成: ${userId}`);
                }

                // 🔥 2. 立即将tab变为headless
                try {
                    await this.tabManager.makeTabHeadless(tabId);
                    console.log(`🔇 登录成功，tab已转为后台模式: ${userId}`);
                } catch (error) {
                    console.warn(`⚠️ 转换headless失败，但继续处理: ${error}`);
                }

                // 🔥 3. 获取processor并进行后台处理
                const processor = this.pluginManager.getProcessor('login');
                if (processor) {
                    const completeResult = await processor.process({
                        tabId,
                        userId,
                        platform,
                        isRecover: isRecover || false,
                        accountId: accountId
                    });

                    if (completeResult.success) {
                        // 更新登录状态的详细信息（但不改变completed状态）
                        if (loginStatus) {
                            loginStatus.cookieFile = completeResult.cookiePath;
                            loginStatus.accountInfo = completeResult.accountInfo;
                            this.activeLogins.set(userId, loginStatus);
                        }
                        console.log(`✅ 后台处理完成: ${userId}`);
                    }
                } else {
                    console.error('❌ 未找到登录处理器插件');
                }
            } else {
                // URL未变化，登录失败
                const loginStatus = this.activeLogins.get(userId);
                if (loginStatus) {
                    loginStatus.status = 'failed';
                    loginStatus.endTime = new Date().toISOString();
                    this.activeLogins.set(userId, loginStatus);
                }
            }
        } catch (error) {
            console.error(`❌ 登录处理失败: ${userId}:`, error);
            const loginStatus = this.activeLogins.get(userId);
            if (loginStatus) {
                loginStatus.status = 'failed';
                loginStatus.endTime = new Date().toISOString();
                this.activeLogins.set(userId, loginStatus);
            }
        } finally {
            // tab关闭逻辑移到这里
            try {
                await this.tabManager.closeTab(tabId);
                console.log(`🗑️ 登录完成，已关闭tab: ${tabId}`);
            } catch (error) {
                console.error(`❌ 关闭登录tab失败: ${tabId}:`, error);
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
    /**
     * 🔥 单个账号视频上传 - 完整流程包含tab管理
     * @param params 上传参数
     * @returns 上传结果
     */
    async uploadVideo(params: UploadParams, recordId?: number): Promise<UploadResult> {
        let tabId: string | null = null;
        const startTime = new Date().toISOString();
        let accountName: string;
        if (params.accountName) {
            accountName = params.accountName;
        } else {
            // 从cookieFile生成账号名作为备选
            accountName = path.basename(params.cookieFile, '.json');
            const parts = accountName.split('_');
            if (parts.length > 2) {
                // 格式如: platform_username_timestamp.json
                accountName = parts.slice(1, -1).join('_') || 'unknown';
            }
        }
        try {
            console.log(`🚀 开始 ${params.platform} 平台视频上传: ${params.title || params.filePath}`);

            // 🔥 步骤1：AutomationEngine 负责创建Tab
            tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                params.platform,
                this.getPlatformUrl(params.platform),
                params.headless ?? true
            );

            // 🔥 步骤2：等待页面加载
            console.log(`⏳ 等待页面加载完成...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 🔥 步骤3：Validator 专注验证逻辑
            const validator = this.pluginManager.getPlugin<PluginValidator>(PluginType.VALIDATOR, params.platform);
            if (validator) {
                const isValid = await validator.validateTab(tabId);
                
                if (!isValid) {
                    console.warn(`❌ 账号验证失败，Cookie已失效: ${params.platform}`);
                    
                    // 🔥 AutomationEngine 负责立即关闭失效的Tab
                    try {
                        await this.tabManager.closeTab(tabId);
                        console.log(`🗑️ 已关闭失效账号的Tab: ${tabId}`);
                        tabId = null; // 避免finally重复关闭
                    } catch (closeError) {
                        console.warn(`⚠️ 关闭失效Tab失败:`, closeError);
                    }
                    
                    // 🔥 立即更新数据库状态为无效
                    const currentTime = new Date().toISOString();
                    await AccountStorage.updateValidationStatus(params.cookieFile, false, currentTime);
                    // 🔥 新增：通知账号状态变化
                    if (global.accountStatusNotifier) {
                        global.accountStatusNotifier({
                            cookieFile: params.cookieFile,
                            accountName: accountName,
                            platform: params.platform,
                            status: '异常',
                            isValid: false,
                            lastCheckTime: currentTime
                        });
                        console.log(`📡 已推送账号失效通知: ${accountName}`);
                    }                    
                    // 🔥 更新上传进度状态
                    if (recordId) {
                        await this.updateUploadProgress(recordId, accountName, {
                            status: 'failed',
                            upload_status: '账号已失效',
                            push_status: '推送失败',
                            review_status: '发布失败',
                            error_message: 'Cookie已失效，需要重新登录'
                        });
                    }
                    
                    return {
                        success: false,
                        error: '账号已失效，请重新登录',
                        file: params.filePath,
                        account: accountName,
                        platform: params.platform,
                        uploadTime: startTime
                    };
                }
            } else {
                console.warn(`⚠️ 未找到 ${params.platform} 平台的验证器，跳过验证`);
            }

            // 🔥 步骤4：账号正常，继续上传流程
            console.log(`✅ 账号验证通过，开始上传流程`);
            
            if (recordId) {
                await this.updateUploadProgress(recordId, accountName, {
                    status: 'uploading',
                    upload_status: '上传中'
                });
            }

            const uploader = this.pluginManager.getPlugin<PluginUploader>(PluginType.UPLOADER, params.platform);
            if (!uploader) {
                throw new Error(`不支持的平台: ${params.platform}`);
            }

            // 🔥 调用uploader，传递已验证的tabId
            const result = await uploader.uploadVideoComplete(params, tabId);
            
            if (result.success && result.tabId) {
                tabId = result.tabId;
                
                // 🔥 步骤3：上传完成，开始推送
                if (recordId) {
                    await this.updateUploadProgress(recordId, accountName, {
                        status: 'uploading',
                        upload_status: '上传成功',
                        push_status: '推送中'
                    });
                }
                
                // 🔥 步骤4：等待URL跳转（推送完成）
                console.log(`⏳ 等待 ${params.platform} 上传完成，监听URL跳转...`);
                try {
                    const urlChanged = await this.tabManager.waitForUrlChange(tabId, 300000);
                    
                    if (urlChanged) {
                        // 🔥 步骤5：推送成功，进入审核
                        if (recordId) {
                            await this.updateUploadProgress(recordId, accountName, {
                                status: 'success',
                                upload_status: '上传成功',
                                push_status: '推送成功',
                                review_status: '发布成功'
                            });
                        }
                        console.log(`✅ ${params.platform} 视频发布成功，URL已跳转`);
                    } else {
                        // 推送超时
                        if (recordId) {
                            await this.updateUploadProgress(recordId, accountName, {
                                push_status: '推送超时',
                                review_status: '状态未知'
                            });
                        }
                        console.warn(`⚠️ ${params.platform} 上传超时，URL未跳转`);
                    }
                } catch (urlWaitError) {
                    if (recordId) {
                        await this.updateUploadProgress(recordId, accountName, {
                            push_status: '推送异常',
                            review_status: '发布失败'
                        });
                    }
                    console.error(`❌ 等待URL跳转异常:`, urlWaitError);
                }
            }
            
            return {
                success: result.success,
                error: result.success ? undefined : '上传失败',
                file: params.filePath,
                account: accountName,
                platform: params.platform,
                uploadTime: startTime
            };

        } catch (error) {
            // 🔥 异常处理：更新失败状态
            if (recordId) {
                await this.updateUploadProgress(recordId, accountName, {
                    status: 'failed',
                    upload_status: '上传失败',
                    push_status: '推送失败',
                    review_status: '发布失败',
                    error_message: error instanceof Error ? error.message : '未知错误'
                });
            }
            
            console.error(`❌ ${params.platform} 视频上传失败:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误',
                file: params.filePath,
                account: accountName,
                platform: params.platform,
                uploadTime: startTime
            };
        } finally {
            if (tabId) {
                try {
                    await this.tabManager.closeTab(tabId);
                    console.log(`🗑️ ${params.platform} 上传完成，已关闭tab: ${tabId}`);
                } catch (closeError) {
                    console.error(`❌ 关闭上传tab失败: ${tabId}:`, closeError);
                }
            }
        }
    }

    private async updateUploadProgress(recordId: number, accountName: string, statusData: any): Promise<void> {
        const key = `${recordId}-${accountName}`;
        
        // 🔥 修复：根据 statusData 内容正确映射到具体字段
        let mappedData = { ...statusData };
        
        // 🔥 关键修复：根据状态内容映射到正确的字段
        if (typeof statusData === 'string' || statusData.status) {
            const statusText = statusData.status || statusData;
            
            // 根据状态文本映射到具体字段
            if (statusText.includes('验证') || statusText === '验证账号中') {
                mappedData = {
                    status: 'uploading',
                    upload_status: '验证账号中',
                    push_status: '待推送',
                    review_status: '待审核'
                };
            } else if (statusText.includes('上传中')) {
                mappedData = {
                    status: 'uploading', 
                    upload_status: '上传中',
                    push_status: '待推送',
                    review_status: '待审核'
                };
            } else if (statusText.includes('上传成功')) {
                mappedData = {
                    status: 'uploading',
                    upload_status: '上传成功', 
                    push_status: '推送中',
                    review_status: '待审核'
                };
            } else if (statusText === 'success') {
                mappedData = {
                    status: 'success',
                    upload_status: '上传成功',
                    push_status: '推送成功', 
                    review_status: '发布成功'
                };
            } else if (statusText === 'failed') {
                mappedData = {
                    status: 'failed',
                    upload_status: '上传失败',
                    push_status: '推送失败',
                    review_status: '发布失败'
                };
            }
        }
        
        // 1. 更新内存状态
        this.uploadProgressMap.set(key, {
            recordId,
            accountName,
            ...mappedData, // 🔥 使用映射后的数据
            timestamp: Date.now()
        });

        console.log(`🔄 内存状态更新: ${accountName} - 上传:${mappedData.upload_status}, 推送:${mappedData.push_status}, 审核:${mappedData.review_status}`);

        // 2. 通知SSE客户端
        if (global.uploadProgressNotifier) {
            global.uploadProgressNotifier(recordId, {
                accountName,
                ...mappedData, // 🔥 使用映射后的数据
                timestamp: new Date().toISOString()
            });
        }

        // 3. 🔥 关键优化：只有最终状态才写入数据库
        if (mappedData.status === 'success' || mappedData.status === 'failed') {
            try {
                const { PublishRecordStorage } = await import('../plugins/uploader/base/PublishRecordStorage');
                await PublishRecordStorage.updateAccountPublishStatus(recordId, accountName, mappedData);
                console.log(`✅ 最终状态已保存到数据库: ${accountName} - ${mappedData.status}`);
            } catch (error) {
                console.error('❌ 保存最终状态失败:', error);
            }
        }
    }

    // 🔥 新增：获取内存中的进度状态
    getUploadProgress(recordId: number): any[] {
        const results = [];
        for (const [key, progress] of this.uploadProgressMap.entries()) {
            if (progress.recordId === recordId) {
                results.push({
                    ...progress,
                    timestamp: new Date(progress.timestamp).toISOString()
                });
            }
        }
        return results;
    }

    // 🔥 新增：清理过期的内存状态
    private cleanupExpiredProgress(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24小时

        for (const [key, progress] of this.uploadProgressMap.entries()) {
            if (now - progress.timestamp > maxAge) {
                this.uploadProgressMap.delete(key);
                console.log(`🧹 清理过期进度状态: ${key}`);
            }
        }
    }

    /**
     * 🔥 批量视频上传 - 委托给 uploadVideo 处理每个上传
     * @param request 批量上传请求
     * @returns 上传结果列表
     */
    async batchUpload(request: BatchUploadRequest, recordId?: number): Promise<UploadResult[]> {
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
                        // 🔥 从账号信息中获取平台和cookie信息
                        const accountPlatform = account.platform || request.platform;
                        const cookieFile = account.cookieFile || `${account.accountName}.json`;
                        const accountName = account.accountName || 'unknown';
                        
                        console.log(`📤 准备上传: ${file} -> ${accountName} (${accountPlatform}平台)`);

                        // 🔥 构造文件完整路径
                        let fullFilePath: string;
                        if (path.isAbsolute(file)) {
                            fullFilePath = file;
                        } else {
                            fullFilePath = path.join(Config.VIDEO_DIR, file);
                        }

                        // 🔥 构造单次上传参数
                        const uploadParams: UploadParams = {
                            ...request.params,
                            cookieFile: cookieFile,
                            platform: accountPlatform,
                            filePath: fullFilePath,
                            accountName: accountName
                        };

                        // 🔥 调用 uploadVideo 处理单个上传（包含完整的tab管理）
                        const result = await this.uploadVideo(uploadParams, recordId);
                        
                        results.push(result);

                        if (result.success) {
                            successCount++;
                            console.log(`✅ 成功: ${file} -> ${accountName} (${accountPlatform})`);
                        } else {
                            failedCount++;
                            console.log(`❌ 失败: ${file} -> ${accountName} (${accountPlatform}): ${result.error}`);
                        }

                    } catch (error) {
                        failedCount++;
                        const errorMsg = error instanceof Error ? error.message : '未知错误';

                        // 🔥 构造错误结果
                        results.push({
                            success: false,
                            error: errorMsg,
                            file: file,
                            account: account.accountName || 'unknown',
                            platform: account.platform || request.platform,
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
    async getAccountsWithGroupsForFrontend(forceCheck: boolean = false): Promise<any[]> {
        try {
            // 如果需要强制检查，先进行验证
            if (forceCheck) {
                await this.autoValidateExpiredAccounts();
            }
            
            // 返回最新的账号数据
            const accounts = AccountStorage.getAccountsWithGroupsForFrontend();
            return accounts;
        } catch (error) {
            console.error('❌ 获取分组账号失败:', error);
            throw error;
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
        let tabId: string | null = null;
        
        try {
            // 🔥 使用统一的URL
            tabId = await this.tabManager.createAccountTab(
                cookieFile,
                platform,
                this.getPlatformUrl(platform), // 使用统一方法
                true // headless模式
            );
            const validator = this.pluginManager.getPlugin<PluginValidator>(PluginType.VALIDATOR, platform);
            if (!validator) {
                console.warn(`⚠️ 平台 ${platform} 暂不支持验证功能`);
                return false;
            }

            const isValid = await validator.validateTab(tabId);

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
        }finally {
            // AutomationEngine 统一负责Tab关闭
            if (tabId) {
                try {
                    await this.tabManager.closeTab(tabId);
                } catch (closeError) {
                    console.error(`❌ 关闭验证Tab失败: ${tabId}:`, closeError);
                }
            }
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
     * 🔥 统一的平台功能页面URL配置
     * Validator和Uploader都使用相同的URL，因为都是检测同一个功能页面的访问权限
     */
    private getPlatformUrl(platform: string): string {
        const platformUrls: Record<string, string> = {
            'wechat': 'https://channels.weixin.qq.com/platform/post/create',
            'xiaohongshu': 'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
            'douyin': 'https://creator.douyin.com/creator-micro/content/upload',
            'kuaishou': 'https://cp.kuaishou.com/article/publish/video'
        };
        
        return platformUrls[platform] || 'about:blank';
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

