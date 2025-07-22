// src/main/automation/LoginCompleteProcessor.ts
// 登录完成后的统一处理器，复用现有的账号信息提取功能

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { TabManager } from '../TabManager';
import { AccountStorage } from '../plugins/login/base/AccountStorage';
import { Config } from '../config/Config';
import { WeChatVideoUploader } from '../plugins/uploader/tencent/main';
import { AccountInfo } from '../../types/pluginInterface';

export interface ProcessLoginResult {
    success: boolean;
    cookiePath?: string;
    accountInfo?: AccountInfo & { localAvatarPath?: string };
    error?: string;
}

export class LoginCompleteProcessor {

    /**
     * 🔥 登录完成后的完整处理流程
     * 复用现有的账号信息提取和头像下载功能
     */
    static async processLoginComplete(
        tabId: string,
        userId: string,
        platform: string,
        tabManager: TabManager
    ): Promise<ProcessLoginResult> {
        try {
            console.log(`🎉 开始处理登录完成流程: ${platform} - ${userId}`);

            // 🔥 步骤1：保存Cookie
            const cookiePath = await this.saveCookieFile(tabId, userId, platform, tabManager);
            if (!cookiePath) {
                throw new Error('Cookie保存失败');
            }

            // 🔥 步骤2：等待页面稳定
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 🔥 步骤3：使用现有插件提取账号信息
            const accountInfo = await this.extractAccountInfoUsingPlugin(tabId, platform, tabManager);

            if (!accountInfo || !accountInfo.accountName) {
                console.warn(`⚠️ 未能提取到完整账号信息`);
                return {
                    success: true,
                    cookiePath: cookiePath
                };
            }

            // 🔥 步骤4：下载头像（浏览器内下载）
            let localAvatarPath: string | null = null;
            if (accountInfo.avatar) {
                localAvatarPath = await this.downloadAvatarInBrowser(
                    tabId,
                    accountInfo.avatar,
                    accountInfo.accountName,
                    platform,
                    tabManager
                );

                if (localAvatarPath) {
                    accountInfo.localAvatar = localAvatarPath;
                }
            }

            // 🔥 步骤5：保存到数据库
            const platformType = AccountStorage.getPlatformType(platform);
            const success = await AccountStorage.saveAccountToDatabase(
                userId,
                platformType,
                cookiePath,
                {
                    ...accountInfo,
                    localAvatar: localAvatarPath || undefined
                }
            );

            if (!success) {
                console.warn('⚠️ 数据库保存失败，但登录成功');
            }

            console.log(`🎉 登录完成流程处理成功: ${accountInfo.accountName}`);

            return {
                success: true,
                cookiePath: cookiePath,
                accountInfo: {
                    ...accountInfo,
                    localAvatarPath: localAvatarPath || undefined
                }
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
     * 🔥 保存Cookie文件
     */
    private static async saveCookieFile(
        tabId: string,
        userId: string,
        platform: string,
        tabManager: TabManager
    ): Promise<string | null> {
        try {
            // 确保Cookie目录存在
            await fs.promises.mkdir(Config.COOKIE_DIR, { recursive: true });

            // 生成Cookie文件名
            const timestamp = Date.now();
            const sanitizedUserId = userId.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            const filename = `${platform}_${sanitizedUserId}_${timestamp}.json`;
            const cookiePath = path.join(Config.COOKIE_DIR, filename);

            // 保存Cookie
            await tabManager.saveCookies(tabId, cookiePath);

            console.log(`✅ Cookie保存成功: ${filename}`);
            return cookiePath;

        } catch (error) {
            console.error(`❌ Cookie保存失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 使用现有插件提取账号信息
     */
    private static async extractAccountInfoUsingPlugin(
        tabId: string,
        platform: string,
        tabManager: TabManager
    ): Promise<AccountInfo | null> {
        try {
            console.log(`🔍 使用 ${platform} 插件提取账号信息...`);

            switch (platform.toLowerCase()) {
                case 'wechat':
                    // 🔥 复用现有的微信上传插件的账号信息提取功能
                    const wechatUploader = new WeChatVideoUploader();
                    await wechatUploader.init(tabManager);

                    const wechatInfo = await wechatUploader.getAccountInfo(tabId);
                    if (wechatInfo) {
                        console.log(`✅ 微信账号信息提取成功: ${wechatInfo.accountName}`);
                        return wechatInfo;
                    }
                    break;

                case 'douyin':
                    // TODO: 实现抖音插件调用
                    console.log('⚠️ 抖音账号信息提取待实现');
                    break;

                case 'xiaohongshu':
                    // TODO: 实现小红书插件调用
                    console.log('⚠️ 小红书账号信息提取待实现');
                    break;

                case 'kuaishou':
                    // TODO: 实现快手插件调用
                    console.log('⚠️ 快手账号信息提取待实现');
                    break;

                default:
                    console.warn(`⚠️ 不支持的平台: ${platform}`);
            }

            return null;

        } catch (error) {
            console.error(`❌ 账号信息提取失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 在浏览器内下载头像（更简单的方式）
     * 使用浏览器的 fetch + blob + FileSystem API
     */
    private static async downloadAvatarInBrowser(
        tabId: string,
        avatarUrl: string,
        accountName: string,
        platform: string,
        tabManager: TabManager
    ): Promise<string | null> {
        try {
            console.log(`📥 开始在浏览器内下载头像: ${avatarUrl}`);

            // 🔥 准备文件路径信息
            const timestamp = Date.now();
            const sanitizedName = accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            const extension = this.getImageExtension(avatarUrl) || 'jpg';
            const filename = `${platform}_${sanitizedName}_${timestamp}.${extension}`;

            // 🔥 目标目录（相对于项目根目录）
            const avatarRelativeDir = `sau_frontend/src/assets/avatar/${platform}/${sanitizedName}`;
            const avatarFileName = `avatar.${extension}`;

            // 🔥 在浏览器中执行下载脚本
            const downloadScript = `
                (async function() {
                    try {
                        console.log('🔥 开始浏览器内头像下载...');
                        
                        // 1. 获取图片数据
                        const response = await fetch('${avatarUrl}', {
                            method: 'GET',
                            mode: 'cors',
                            credentials: 'omit'
                        });

                        if (!response.ok) {
                            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                        }

                        // 2. 转换为 blob
                        const blob = await response.blob();
                        
                        if (blob.size === 0) {
                            throw new Error('头像文件大小为0');
                        }

                        // 3. 转换为 base64
                        const reader = new FileReader();
                        const base64Promise = new Promise((resolve, reject) => {
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                        });
                        
                        reader.readAsDataURL(blob);
                        const base64Data = await base64Promise;

                        console.log(\`✅ 头像下载完成: \${blob.size} bytes, type: \${blob.type}\`);
                        
                        return {
                            success: true,
                            data: base64Data,
                            size: blob.size,
                            type: blob.type,
                            filename: '${filename}'
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
            const result = await tabManager.executeScript(tabId, downloadScript);

            if (!result || !result.success) {
                console.warn(`⚠️ 浏览器内下载失败: ${result?.error}`);
                return null;
            }

            // 🔥 保存到本地文件系统
            const savedPath = await this.saveBase64ToFile(
                result.data,
                avatarRelativeDir,
                avatarFileName
            );

            if (savedPath) {
                console.log(`✅ 头像保存成功: ${savedPath}`);
                return savedPath;
            }

            return null;

        } catch (error) {
            console.error(`❌ 浏览器内头像下载失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 保存 base64 数据到文件
     */
    private static async saveBase64ToFile(
        base64Data: string,
        relativeDirPath: string,
        filename: string
    ): Promise<string | null> {
        try {
            // 移除 base64 前缀
            const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Content, 'base64');

            // 创建完整路径
            const fullDirPath = path.join(process.cwd(), relativeDirPath);
            const fullFilePath = path.join(fullDirPath, filename);

            // 确保目录存在
            await fs.promises.mkdir(fullDirPath, { recursive: true });

            // 写入文件
            await fs.promises.writeFile(fullFilePath, buffer);

            // 返回相对路径（供前端使用）
            const relativePath = `assets/avatar/${path.basename(path.dirname(relativeDirPath))}/${path.basename(relativeDirPath)}/${filename}`;

            console.log(`✅ 头像文件保存: ${relativePath} (${buffer.length} bytes)`);
            return relativePath;

        } catch (error) {
            console.error(`❌ 保存头像文件失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 获取图片扩展名
     */
    private static getImageExtension(url: string): string | null {
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

    /**
     * 🔥 验证头像URL是否有效
     */
    private static async validateAvatarUrl(avatarUrl: string): Promise<boolean> {
        try {
            const protocol = avatarUrl.startsWith('https:') ? https : http;

            return new Promise((resolve) => {
                const request = protocol.request(avatarUrl, { method: 'HEAD' }, (response) => {
                    const contentType = response.headers['content-type'];
                    const isValid = response.statusCode === 200 &&
                        contentType && contentType.startsWith('image/');
                    resolve(!!isValid); // 确保返回 boolean
                });

                request.on('error', () => resolve(false));
                request.setTimeout(5000, () => {
                    request.destroy();
                    resolve(false);
                });

                request.end();
            });
        } catch {
            return false;
        }
    }

    /**
     * 🔥 清理失败的下载文件
     */
    private static async cleanupFailedDownload(filePath: string): Promise<void> {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                console.log(`🧹 清理失败下载文件: ${filePath}`);
            }
        } catch (error) {
            console.warn(`⚠️ 清理文件失败: ${error}`);
        }
    }
}