// src/main/plugins/processor/LoginCompleteProcessor.ts
import * as fs from 'fs';
import * as path from 'path';
import {
    PluginProcessor,
    PluginType,
    ProcessorDependencies,
    LoginCompleteParams,
    LoginCompleteResult,
    LoginAccountInfo,
    AccountInfo
} from '../../../types/pluginInterface';
import { AccountStorage } from '../login/base/AccountStorage';
import { Config } from '../../config/Config';

export class LoginCompleteProcessor implements PluginProcessor {
    public readonly name = '登录完成处理器';
    public readonly type = PluginType.PROCESSOR;
    public readonly scenario = 'login';
    public readonly platform = 'login';  // 🔥 新增：处理器的 platform 等于 scenario

    private tabManager!: any;  // TabManager 实例
    private pluginManager!: any;  // PluginManager 实例

    async init(dependencies: ProcessorDependencies): Promise<void> {
        this.tabManager = dependencies.tabManager;
        this.pluginManager = dependencies.pluginManager;
        console.log('✅ 登录完成处理器初始化完成');
    }

    async destroy(): Promise<void> {
        console.log('🧹 登录完成处理器已销毁');
    }

    /**
     * 🔥 处理登录完成的统一流程
     */
    async process(params: LoginCompleteParams): Promise<LoginCompleteResult> {
        try {
            console.log(`🎉 开始处理登录完成流程: ${params.platform} - ${params.userId}`);

            // 1. 🔥 等待 URL 变化（登录成功标志）
            console.log(`⏳ 等待 ${params.platform} 页面 URL 变化: ${params.userId}`);
            const urlChanged = await this.tabManager.waitForUrlChange(params.tabId, 200000); // 200秒超时

            if (!urlChanged) {
                return {
                    success: false,
                    error: '登录超时，URL 未变化'
                };
            }

            console.log(`✅ ${params.platform} 登录成功，URL 已变化: ${params.userId}`);

            // 2. 提取账号信息（通过插件管理器）
            const accountInfo = await this.extractAccountInfo(params.platform, params.tabId);

            const realAccountName = accountInfo?.accountName || params.userId;

            // 3. 下载头像（如果有）
            let localAvatarPath: string | null = null;
            if (accountInfo?.avatar && realAccountName) {  // 🔥 确保账号名称存在
                localAvatarPath = await this.downloadAvatar(
                    params.tabId,
                    accountInfo.avatar,
                    realAccountName,  // 🔥 使用确保非 undefined 的值
                    params.platform
                );

                if (localAvatarPath) {
                    accountInfo.localAvatar = localAvatarPath;
                }
            }

            // 4. 保存Cookie
            const cookiePath = await this.saveCookieFile(
                params.tabId,
                params.userId,
                params.platform,
                realAccountName  // 🔥 使用确保非 undefined 的值
            );

            if (!cookiePath) {
                throw new Error('Cookie保存失败');
            }

            // 5. 保存到数据库
            const platformType = AccountStorage.getPlatformType(params.platform);
            // 🔥 构造用于数据库保存的账号信息
            const dbAccountInfo: AccountInfo = {
                platform: params.platform,
                cookieFile: path.basename(cookiePath),
                accountName: realAccountName,  // 使用真实账号名
                accountId: accountInfo?.accountId,
                followersCount: accountInfo?.followersCount,
                videosCount: accountInfo?.videosCount,
                avatar: accountInfo?.avatar,
                bio: accountInfo?.bio,
                localAvatar: localAvatarPath || undefined,
                extractedAt: new Date().toISOString()
            };

            const success = await AccountStorage.saveAccountToDatabase(
                realAccountName,  // 🔥 使用真实账号名而不是临时ID
                platformType,
                cookiePath,
                dbAccountInfo
            );

            if (!success) {
                console.warn('⚠️ 数据库保存失败，但登录成功');
            }

            // 🔥 构造返回给调用方的账号信息
            const resultAccountInfo: LoginAccountInfo = {
                platform: params.platform,
                cookieFile: path.basename(cookiePath),
                accountName: accountInfo?.accountName || params.userId,
                accountId: accountInfo?.accountId,
                followersCount: accountInfo?.followersCount,
                videosCount: accountInfo?.videosCount,
                avatar: accountInfo?.avatar,
                bio: accountInfo?.bio,
                localAvatar: localAvatarPath || undefined,
                localAvatarPath: localAvatarPath || undefined,  // 兼容字段
                extractedAt: new Date().toISOString()
            };

            console.log(`🎉 登录完成流程处理成功: ${resultAccountInfo.accountName}`);

            return {
                success: true,
                cookiePath: cookiePath,
                accountInfo: resultAccountInfo
            };

        } catch (error) {
            console.error(`❌ 登录完成流程处理失败:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    /**
     * 🔥 提取账号信息（通过插件管理器）
     */
    private async extractAccountInfo(platform: string, tabId: string): Promise<AccountInfo | null> {
        try {
            console.log(`🔍 提取 ${platform} 账号信息...`);

            // 通过插件管理器获取上传插件（复用其账号信息提取功能）
            const uploader = this.pluginManager.getPlugin(PluginType.UPLOADER, platform);

            if (uploader && uploader.getAccountInfo) {
                const accountInfo = await uploader.getAccountInfo(tabId);
                if (accountInfo) {
                    console.log(`✅ ${platform} 账号信息提取成功: ${accountInfo.accountName}`);
                    return accountInfo;
                }
            } else {
                console.warn(`⚠️ ${platform} 平台暂不支持账号信息提取`);
            }

            return null;

        } catch (error) {
            console.error(`❌ 账号信息提取失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 保存Cookie文件
     */
    private async saveCookieFile(
        tabId: string,
        userId: string,
        platform: string,
        realAccountName?: string  // 🔥 新增参数
    ): Promise<string | null> {
        try {
            // 确保Cookie目录存在
            await fs.promises.mkdir(Config.COOKIE_DIR, { recursive: true });

            // 🔥 使用真实账号名或临时用户ID
            const accountName = realAccountName || userId;
            const timestamp = Date.now();
            const sanitizedAccountName = accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            const filename = `${platform}_${sanitizedAccountName}_${timestamp}.json`;
            const cookiePath = path.join(Config.COOKIE_DIR, filename);

            // 保存Cookie
            await this.tabManager.saveCookies(tabId, cookiePath);

            console.log(`✅ Cookie保存成功: ${filename}`);
            return cookiePath;

        } catch (error) {
            console.error(`❌ Cookie保存失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 在浏览器内下载头像
     */
    private async downloadAvatar(
        tabId: string,
        avatarUrl: string,
        accountName: string,
        platform: string
    ): Promise<string | null> {
        try {
            console.log(`📥 开始下载头像: ${avatarUrl}`);

            const timestamp = Date.now();
            const sanitizedName = accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            const extension = this.getImageExtension(avatarUrl) || 'jpg';

            // 在浏览器中执行下载脚本
            const downloadScript = `
                (async function() {
                    try {
                        console.log('🔥 开始浏览器内头像下载...');
                        
                        const response = await fetch('${avatarUrl}', {
                            method: 'GET',
                            mode: 'cors',
                            credentials: 'omit'
                        });

                        if (!response.ok) {
                            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                        }

                        const blob = await response.blob();
                        
                        if (blob.size === 0) {
                            throw new Error('头像文件大小为0');
                        }

                        const reader = new FileReader();
                        const base64Promise = new Promise((resolve, reject) => {
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                        });
                        
                        reader.readAsDataURL(blob);
                        const base64Data = await base64Promise;

                        console.log(\`✅ 头像下载完成: \${blob.size} bytes\`);
                        
                        return {
                            success: true,
                            data: base64Data,
                            size: blob.size,
                            type: blob.type
                        };

                    } catch (error) {
                        console.error('❌ 浏览器内下载失败:', error);
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                })()
            `;

            // 执行下载脚本
            const result = await this.tabManager.executeScript(tabId, downloadScript);

            if (!result || !result.success) {
                console.warn(`⚠️ 浏览器内下载失败: ${result?.error}`);
                return null;
            }

            // 保存到本地文件系统
            const savedPath = await this.saveBase64ToFile(
                result.data,
                platform,
                sanitizedName,
                extension
            );

            if (savedPath) {
                console.log(`✅ 头像保存成功: ${savedPath}`);
                return savedPath;
            }

            return null;

        } catch (error) {
            console.error(`❌ 头像下载失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 保存 base64 数据到文件
     */
    private async saveBase64ToFile(
        base64Data: string,
        platform: string,
        sanitizedName: string,
        extension: string
    ): Promise<string | null> {
        try {
            // 移除 base64 前缀
            const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Content, 'base64');

            // 使用配置目录
            const avatarDir = Config.AVATAR_DIR;
            const platformDir = path.join(avatarDir, platform);
            const accountDir = path.join(platformDir, sanitizedName);
            const avatarFileName = `avatar.${extension}`;
            const fullFilePath = path.join(accountDir, avatarFileName);

            // 确保目录存在
            await fs.promises.mkdir(accountDir, { recursive: true });

            // 写入文件
            await fs.promises.writeFile(fullFilePath, buffer);

            // 返回相对路径
            const relativePath = `assets/avatar/${platform}/${sanitizedName}/${avatarFileName}`;

            console.log(`✅ 头像文件保存: ${fullFilePath}`);
            return relativePath;

        } catch (error) {
            console.error(`❌ 保存头像文件失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 获取图片扩展名
     */
    private getImageExtension(url: string): string | null {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.toLowerCase();

            if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg';
            if (pathname.endsWith('.png')) return 'png';
            if (pathname.endsWith('.gif')) return 'gif';
            if (pathname.endsWith('.webp')) return 'webp';

            return 'jpg'; // 默认
        } catch {
            return 'jpg';
        }
    }
}