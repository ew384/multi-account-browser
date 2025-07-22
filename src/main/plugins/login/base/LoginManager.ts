// src/main/plugins/login/base/LoginManager.ts
// ================================
import { TabManager } from '../../../TabManager';
import {
    PluginLogin,
    LoginParams,
    LoginResult,
    LoginStatus,
    AccountInfo
} from '../../../../types/pluginInterface';

export class LoginManager {
    private loginPlugins: Map<string, PluginLogin> = new Map();
    private activeLogins: Map<string, LoginStatus> = new Map(); // userId -> LoginStatus
    private tabManager: TabManager;

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
    }

    /**
     * 注册登录插件
     */
    async registerLoginPlugin(plugin: PluginLogin): Promise<void> {
        await plugin.init(this.tabManager);
        this.loginPlugins.set(plugin.platform, plugin);
        console.log(`🔐 登录插件已注册: ${plugin.platform} (${plugin.name})`);
    }

    /**
     * 获取登录插件
     */
    getLoginPlugin(platform: string): PluginLogin | null {
        return this.loginPlugins.get(platform) || null;
    }

    /**
     * 🔥 开始登录流程
     * 对应 Python 的 get_tencent_cookie 等函数的前半部分
     */
    async startLogin(platform: string, userId: string): Promise<LoginResult> {
        try {
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

            const plugin = this.getLoginPlugin(platform);
            if (!plugin) {
                throw new Error(`不支持的平台: ${platform}`);
            }

            console.log(`🔐 开始 ${platform} 登录: ${userId}`);

            // 记录登录开始状态
            const loginStatus: LoginStatus = {
                userId,
                platform,
                status: 'pending',
                startTime: new Date().toISOString()
            };
            this.activeLogins.set(userId, loginStatus);

            const loginParams: LoginParams = {
                platform,
                userId,
                loginUrl: this.getLoginUrl(platform)
            };

            const result = await plugin.startLogin(loginParams);

            if (result.success && result.qrCodeUrl) {
                // 更新登录状态
                loginStatus.tabId = result.tabId;
                loginStatus.qrCodeUrl = result.qrCodeUrl;
                this.activeLogins.set(userId, loginStatus);

                console.log(`✅ 二维码已生成: ${platform} - ${userId}`);

                // 🔥 启动后台等待登录完成的任务
                this.startWaitingForLogin(userId, result.tabId!, platform);
            } else {
                // 登录启动失败，移除状态
                this.activeLogins.delete(userId);
            }

            return result;

        } catch (error) {
            console.error(`❌ 登录启动失败: ${platform} - ${userId}:`, error);

            // 移除失败的登录状态
            this.activeLogins.delete(userId);

            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    /**
     * 🔥 启动后台等待登录完成任务
     * 对应 Python 的 wait_for_url_change + process_login_success
     */
    private async startWaitingForLogin(userId: string, tabId: string, platform: string): Promise<void> {
        try {
            const plugin = this.getLoginPlugin(platform);
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

            // 更新为失败状态
            const loginStatus = this.activeLogins.get(userId);
            if (loginStatus) {
                loginStatus.status = 'failed';
                loginStatus.endTime = new Date().toISOString();
                this.activeLogins.set(userId, loginStatus);
            }
        }
    }

    /**
     * 🔥 获取登录状态
     */
    getLoginStatus(userId: string): LoginStatus | null {
        return this.activeLogins.get(userId) || null;
    }

    /**
     * 🔥 取消登录
     */
    async cancelLogin(userId: string): Promise<boolean> {
        try {
            const loginStatus = this.activeLogins.get(userId);
            if (!loginStatus || !loginStatus.tabId) {
                return false;
            }

            const plugin = this.getLoginPlugin(loginStatus.platform);
            if (plugin) {
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

    /**
     * 🔥 清理已完成的登录状态
     */
    cleanupCompletedLogins(): void {
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

    /**
     * 🔥 获取所有登录状态
     */
    getAllLoginStatuses(): LoginStatus[] {
        return Array.from(this.activeLogins.values());
    }

    /**
     * 获取登录URL
     */
    private getLoginUrl(platform: string): string {
        const urls: Record<string, string> = {
            'wechat': 'https://channels.weixin.qq.com',
            'douyin': 'https://creator.douyin.com',
            'xiaohongshu': 'https://creator.xiaohongshu.com/',
            'kuaishou': 'https://cp.kuaishou.com'
        };
        return urls[platform] || '';
    }

    /**
     * 获取支持的平台列表
     */
    getSupportedPlatforms(): string[] {
        return Array.from(this.loginPlugins.keys());
    }

    /**
     * 检查平台是否支持登录
     */
    isPlatformSupported(platform: string): boolean {
        return this.loginPlugins.has(platform);
    }

    /**
     * 获取平台插件信息
     */
    getPluginInfo(platform: string): { name: string; platform: string } | null {
        const plugin = this.getLoginPlugin(platform);
        if (!plugin) return null;

        return {
            name: plugin.name,
            platform: plugin.platform
        };
    }
}