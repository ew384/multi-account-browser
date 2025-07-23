// src/main/plugins/login/tencent/WeChatLogin.ts
import {
    PluginLogin,
    LoginParams,
    LoginResult,
    AccountInfo,
    PluginType
} from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';
import { AccountStorage } from '../base/AccountStorage';
import { Config } from '../../../config/Config';
import * as path from 'path';
import { LoginCompleteProcessor } from '../../../automation/LoginCompleteProcessor';
export class WeChatLogin implements PluginLogin {
    public readonly platform = 'wechat';
    public readonly name = '微信视频号登录';
    public readonly type = PluginType.LOGIN;

    private tabManager!: TabManager;
    private pendingLogins: Map<string, {
        tabId: string;
        resolve: (result: LoginResult) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        console.log('✅ 微信视频号登录插件初始化完成');
    }

    async destroy(): Promise<void> {
        // 清理所有等待中的登录
        for (const [userId, pending] of this.pendingLogins) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('插件正在销毁'));
        }
        this.pendingLogins.clear();
        console.log('🧹 微信视频号登录插件已销毁');
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始微信视频号登录流程: ${params.userId}`);

            // 创建标签页
            const tabId = await this.tabManager.createAccountTab(
                `微信登录_${params.userId}`,
                'wechat',
                'https://channels.weixin.qq.com'
            );

            console.log(`📱 微信登录标签页已创建: ${tabId}`);

            // 等待页面加载并查找二维码
            await this.waitForPageLoad(tabId);

            // 查找二维码
            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                await this.tabManager.closeTab(tabId);
                return {
                    success: false,
                    error: '未找到登录二维码'
                };
            }

            console.log(`🔍 微信登录二维码已找到`);

            return {
                success: true,
                qrCodeUrl: qrCodeUrl,
                tabId: tabId
            };

        } catch (error) {
            console.error('❌ 微信登录启动失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '登录启动失败'
            };
        }
    }

    /**
     * 🔥 等待登录完成
     */
    async waitForLogin(tabId: string, userId: string): Promise<LoginResult> {
        return new Promise((resolve, reject) => {
            console.log(`⏳ 等待微信登录完成: ${userId}`);

            // 设置超时
            const timeout = setTimeout(() => {
                this.pendingLogins.delete(userId);
                resolve({
                    success: false,
                    error: '登录超时'
                });
            }, 300000); // 5分钟超时

            // 保存等待状态
            this.pendingLogins.set(userId, {
                tabId,
                resolve,
                reject,
                timeout
            });

            // 开始监听登录状态
            this.monitorLoginStatus(tabId, userId);
        });
    }

    /**
     * 🔥 取消登录
     */
    async cancelLogin(tabId: string): Promise<void> {
        try {
            // 找到对应的等待中登录
            let userIdToCancel = null;
            for (const [userId, pending] of this.pendingLogins) {
                if (pending.tabId === tabId) {
                    userIdToCancel = userId;
                    break;
                }
            }

            if (userIdToCancel) {
                const pending = this.pendingLogins.get(userIdToCancel);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingLogins.delete(userIdToCancel);

                    pending.resolve({
                        success: false,
                        error: '用户取消登录'
                    });
                }
            }

            // 关闭标签页
            await this.tabManager.closeTab(tabId);
            console.log(`🚫 微信登录已取消: ${tabId}`);

        } catch (error) {
            console.error('❌ 取消登录失败:', error);
        }
    }

    /**
     * 🔥 等待页面加载
     */
    private async waitForPageLoad(tabId: string): Promise<void> {
        console.log('⏳ 等待微信页面加载...');

        // 等待页面基本加载
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 检查页面是否加载完成
        const checkScript = `
            (function() {
                return document.readyState === 'complete' && 
                       document.body && 
                       document.body.innerHTML.length > 0;
            })()
        `;

        let attempts = 0;
        while (attempts < 30) {
            try {
                const isReady = await this.tabManager.executeScript(tabId, checkScript);
                if (isReady) {
                    console.log('✅ 微信页面加载完成');
                    return;
                }
            } catch (error) {
                console.warn(`页面检查失败 (尝试 ${attempts + 1}):`, error);
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('⚠️ 页面加载检查超时，继续执行');
    }

    /**
     * 🔥 查找二维码
     */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找微信登录二维码...');

        const qrCodeScript = `
            (function() {
                // 多种二维码选择器
                const selectors = [
                    'img[src*="qrcode"]',
                    'img[src*="qr"]', 
                    '.qrcode img',
                    '.qr-code img',
                    '.login-qr img',
                    'canvas',
                    '[class*="qr"] img',
                    '[class*="code"] img'
                ];

                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        if (element.tagName === 'IMG' && element.src) {
                            console.log('找到二维码图片:', element.src);
                            return element.src;
                        } else if (element.tagName === 'CANVAS') {
                            console.log('找到二维码Canvas');
                            return element.toDataURL();
                        }
                    }
                }

                // 查找包含二维码的iframe
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const qrImg = iframeDoc.querySelector('img');
                        if (qrImg && qrImg.src) {
                            console.log('在iframe中找到二维码:', qrImg.src);
                            return qrImg.src;
                        }
                    } catch (e) {
                        // 跨域访问限制，忽略
                    }
                }

                console.log('未找到二维码');
                return null;
            })()
        `;

        let attempts = 0;
        while (attempts < 20) {
            try {
                const qrCodeUrl = await this.tabManager.executeScript(tabId, qrCodeScript);
                if (qrCodeUrl) {
                    return qrCodeUrl;
                }
            } catch (error) {
                console.warn(`二维码查找失败 (尝试 ${attempts + 1}):`, error);
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return null;
    }

    /**
     * 🔥 监听登录状态变化
     */
    private async monitorLoginStatus(tabId: string, userId: string): Promise<void> {
        const checkInterval = setInterval(async () => {
            try {
                const pending = this.pendingLogins.get(userId);
                if (!pending) {
                    clearInterval(checkInterval);
                    return;
                }

                // 检查URL是否变化（登录成功的标志）
                const urlChanged = await this.checkLoginSuccess(tabId);

                if (urlChanged) {
                    console.log(`✅ 微信登录成功: ${userId}`);
                    clearInterval(checkInterval);
                    clearTimeout(pending.timeout);

                    // 🔥 使用 LoginCompleteProcessor 处理登录完成流程
                    await this.handleLoginComplete(tabId, userId, pending);
                }

            } catch (error) {
                console.error('❌ 监听登录状态失败:', error);
                const pending = this.pendingLogins.get(userId);
                if (pending) {
                    clearInterval(checkInterval);
                    clearTimeout(pending.timeout);
                    this.pendingLogins.delete(userId);

                    pending.resolve({
                        success: false,
                        error: '登录状态检查失败'
                    });
                }
            }
        }, 2000);
    }

    /**
     * 🔥 检查登录是否成功
     */
    private async checkLoginSuccess(tabId: string): Promise<boolean> {
        const checkScript = `
            (function() {
                const currentUrl = window.location.href;
                
                // 检查URL变化 - 登录成功通常会跳转
                const loginSuccessIndicators = [
                    'platform', 'creator', 'dashboard', 'main',
                    'home', 'account', 'profile'
                ];

                const hasSuccessIndicator = loginSuccessIndicators.some(indicator => 
                    currentUrl.toLowerCase().includes(indicator)
                );

                // 检查页面内容变化
                const hasLoginElements = !document.querySelector('.qrcode, .qr-code, .login-qr');
                const hasUserInfo = document.querySelector('.user-info, .avatar, .username, .nickname');

                console.log('登录检查:', {
                    url: currentUrl,
                    hasSuccessIndicator,
                    hasLoginElements,
                    hasUserInfo: !!hasUserInfo
                });

                return hasSuccessIndicator || (hasLoginElements && hasUserInfo);
            })()
        `;

        try {
            return await this.tabManager.executeScript(tabId, checkScript);
        } catch (error) {
            console.warn('登录状态检查失败:', error);
            return false;
        }
    }

    /**
     * 🔥 处理登录完成流程
     */
    private async handleLoginComplete(
        tabId: string,
        userId: string,
        pending: { resolve: (result: LoginResult) => void; reject: (error: Error) => void }
    ): Promise<void> {
        try {
            console.log(`🎉 开始处理微信登录完成流程: ${userId}`);

            // 🔥 使用 LoginCompleteProcessor 处理完整流程
            const result = await LoginCompleteProcessor.processLoginComplete(
                tabId,
                userId,
                'wechat',
                this.tabManager
            );

            this.pendingLogins.delete(userId);

            if (result.success) {
                pending.resolve({
                    success: true,
                    cookieFile: result.cookiePath,
                    accountInfo: result.accountInfo
                });
            } else {
                pending.resolve({
                    success: false,
                    error: result.error || '登录处理失败'
                });
            }

        } catch (error) {
            console.error(`❌ 微信登录完成处理失败:`, error);
            this.pendingLogins.delete(userId);

            pending.resolve({
                success: false,
                error: error instanceof Error ? error.message : '登录处理异常'
            });
        }
    }
}