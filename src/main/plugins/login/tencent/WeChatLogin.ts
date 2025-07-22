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

export class WeChatLogin implements PluginLogin {
    public readonly platform = 'wechat';
    public readonly name = 'WeChat Login Plugin';
    public readonly type = PluginType.LOGIN;

    private tabManager!: TabManager;
    private currentTabId?: string;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        console.log(`✅ ${this.name} 初始化完成`);
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     * 对应 Python 的 get_tencent_cookie 前半部分
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始微信视频号登录: ${params.userId}`);

            // 1. 创建登录专用标签页
            const tabId = await this.tabManager.createAccountTab(
                `wechat_login_${params.userId}`,
                'wechat',
                'https://channels.weixin.qq.com'
            );

            this.currentTabId = tabId;
            console.log(`📋 登录标签页已创建: ${tabId}`);

            // 2. 等待页面加载完成
            await this.waitForPageLoad(tabId);

            // 3. 获取二维码
            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                // 清理资源
                await this.cleanup(tabId);
                throw new Error('未能获取二维码，请检查网络连接或稍后重试');
            }

            console.log(`✅ 二维码获取成功: ${params.userId}`);

            return {
                success: true,
                qrCodeUrl: qrCodeUrl,
                tabId: tabId
            };

        } catch (error) {
            console.error(`❌ 微信登录启动失败: ${params.userId}:`, error);

            // 清理资源
            if (this.currentTabId) {
                await this.cleanup(this.currentTabId);
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : '登录启动失败'
            };
        }
    }

    /**
     * 🔥 等待登录完成
     * 对应 Python 的 wait_for_url_change + process_login_success
     */
    async waitForLogin(tabId: string, userId: string): Promise<LoginResult> {
        try {
            console.log(`⏳ 等待用户扫码登录: ${userId}`);

            // 1. 等待URL变化 (用户扫码登录)
            const urlChanged = await this.tabManager.waitForUrlChange(tabId, 200000); // 200秒超时

            if (!urlChanged) {
                await this.cleanup(tabId);
                return {
                    success: false,
                    error: '登录超时，请重新尝试'
                };
            }

            console.log(`🔄 检测到URL变化，登录可能成功: ${userId}`);

            // 2. 等待页面稳定
            await this.waitForPageStable(tabId);

            // 3. 验证登录状态
            const isLoggedIn = await this.verifyLoginStatus(tabId);
            if (!isLoggedIn) {
                await this.cleanup(tabId);
                return {
                    success: false,
                    error: '登录验证失败，请确认是否正确扫码'
                };
            }

            console.log(`✅ 登录状态验证成功: ${userId}`);

            // 4. 生成Cookie文件名并保存
            const cookieFileName = AccountStorage.generateCookieFileName();
            const cookiePath = path.join(Config.COOKIE_DIR, cookieFileName);

            await this.tabManager.saveCookies(tabId, cookiePath);
            console.log(`💾 Cookies已保存: ${cookieFileName}`);

            // 5. 提取账号信息
            let accountInfo: AccountInfo | null = null;
            try {
                accountInfo = await this.extractAccountInfo(tabId);
                if (accountInfo) {
                    accountInfo.cookieFile = cookieFileName;
                    accountInfo.platform = 'wechat';
                    console.log(`📊 账号信息获取成功: ${accountInfo.accountName}`);
                }
            } catch (error) {
                console.warn(`⚠️ 获取账号信息失败，但登录成功: ${error}`);
            }

            // 6. 保存到数据库
            const platformType = AccountStorage.getPlatformType('wechat'); // 2
            const saveSuccess = await AccountStorage.saveAccountToDatabase(
                userId,
                platformType,
                cookieFileName,
                accountInfo || undefined
            );

            if (!saveSuccess) {
                console.warn(`⚠️ 数据库保存失败，但登录和Cookie保存成功`);
            }

            // 7. 清理登录标签页
            await this.cleanup(tabId);

            console.log(`🎉 微信登录完全成功: ${userId}`);

            return {
                success: true,
                cookieFile: cookieFileName,
                accountInfo: accountInfo || undefined
            };

        } catch (error) {
            console.error(`❌ 微信登录处理失败: ${userId}:`, error);

            // 清理资源
            await this.cleanup(tabId);

            return {
                success: false,
                error: error instanceof Error ? error.message : '登录处理失败'
            };
        }
    }

    /**
     * 🔥 取消登录
     */
    async cancelLogin(tabId: string): Promise<void> {
        try {
            await this.cleanup(tabId);
            console.log(`🚫 微信登录已取消: ${tabId}`);
        } catch (error) {
            console.error(`❌ 取消微信登录失败:`, error);
        }
    }

    /**
     * 🔥 检查登录状态
     */
    async checkLoginStatus(tabId: string): Promise<boolean> {
        try {
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');

            // 如果URL包含登录相关路径，说明还在登录页面
            if (typeof currentUrl === 'string') {
                return !currentUrl.includes('login') && !currentUrl.includes('qrcode');
            }

            return false;
        } catch (error) {
            console.error(`❌ 检查微信登录状态失败:`, error);
            return false;
        }
    }

    /**
     * 等待页面加载完成
     */
    private async waitForPageLoad(tabId: string): Promise<void> {
        console.log(`⏳ 等待页面加载完成...`);

        // 等待页面基本加载
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 等待页面完全加载
        try {
            const isReady = await this.tabManager.executeScript(tabId, `
                new Promise((resolve) => {
                    if (document.readyState === 'complete') {
                        resolve(true);
                    } else {
                        window.addEventListener('load', () => resolve(true));
                        setTimeout(() => resolve(false), 10000); // 10秒超时
                    }
                })
            `);

            if (isReady) {
                console.log(`✅ 页面加载完成`);
            } else {
                console.warn(`⚠️ 页面加载超时，继续执行`);
            }
        } catch (error) {
            console.warn(`⚠️ 页面加载检查失败:`, error);
        }

        // 额外等待确保iframe加载
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * 获取二维码
     */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log(`🔍 开始获取二维码...`);

        // 多次尝试获取二维码，因为iframe可能需要时间加载
        for (let attempt = 1; attempt <= 5; attempt++) {
            console.log(`🔍 尝试获取二维码 (${attempt}/5)...`);

            try {
                // 尝试多个可能的选择器
                const selectors = [
                    'iframe img',           // 主要选择器
                    'img[src*="qrcode"]',   // 备用选择器1
                    'img[src*="wx"]',       // 备用选择器2
                    '.qrcode img',          // 备用选择器3
                    '[class*="qr"] img'     // 备用选择器4
                ];

                for (const selector of selectors) {
                    const qrUrl = await this.tabManager.getQRCode(tabId, selector);
                    if (qrUrl && qrUrl.length > 0) {
                        console.log(`✅ 二维码获取成功 (选择器: ${selector})`);
                        return qrUrl;
                    }
                }

                // 如果都失败了，等待后重试
                if (attempt < 5) {
                    console.log(`⏳ 未找到二维码，等待 ${attempt * 2} 秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                }

            } catch (error) {
                console.warn(`⚠️ 获取二维码异常 (尝试 ${attempt}):`, error);

                if (attempt < 5) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        console.error(`❌ 所有尝试都失败，无法获取二维码`);
        return null;
    }

    /**
     * 等待页面稳定
     */
    private async waitForPageStable(tabId: string): Promise<void> {
        console.log(`⏳ 等待页面稳定...`);

        // 等待页面稳定，确保登录完成
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 检查页面是否还在加载
        try {
            const isStable = await this.tabManager.executeScript(tabId, `
                new Promise((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    const checkStable = () => {
                        attempts++;
                        
                        if (document.readyState === 'complete' && !document.querySelector('.loading')) {
                            resolve(true);
                        } else if (attempts >= maxAttempts) {
                            resolve(false);
                        } else {
                            setTimeout(checkStable, 500);
                        }
                    };
                    
                    checkStable();
                })
            `);

            if (isStable) {
                console.log(`✅ 页面已稳定`);
            } else {
                console.warn(`⚠️ 页面可能仍在加载，继续执行`);
            }
        } catch (error) {
            console.warn(`⚠️ 页面稳定性检查失败:`, error);
        }
    }

    /**
     * 验证登录状态
     */
    private async verifyLoginStatus(tabId: string): Promise<boolean> {
        console.log(`🔍 验证登录状态...`);

        try {
            const loginCheckResult = await this.tabManager.executeScript(tabId, `
                (function() {
                    try {
                        const currentUrl = window.location.href;
                        console.log('当前URL:', currentUrl);
                        
                        // 检查URL是否表明登录成功
                        const isLoggedInByUrl = !currentUrl.includes('login') && 
                                               !currentUrl.includes('qrcode') &&
                                               (currentUrl.includes('channels.weixin.qq.com') || 
                                                currentUrl.includes('platform'));
                        
                        // 检查页面元素是否表明登录成功
                        const hasUserElements = !!(
                            document.querySelector('.avatar') ||
                            document.querySelector('.user-info') ||
                            document.querySelector('.nickname') ||
                            document.querySelector('.user-name') ||
                            document.querySelector('[class*="user"]') ||
                            document.querySelector('[class*="profile"]')
                        );
                        
                        // 检查是否还有登录相关元素
                        const hasLoginElements = !!(
                            document.querySelector('.login') ||
                            document.querySelector('.qrcode') ||
                            document.querySelector('iframe[src*="login"]')
                        );
                        
                        const result = {
                            currentUrl: currentUrl,
                            isLoggedInByUrl: isLoggedInByUrl,
                            hasUserElements: hasUserElements,
                            hasLoginElements: hasLoginElements,
                            isLoggedIn: isLoggedInByUrl && (hasUserElements || !hasLoginElements)
                        };
                        
                        console.log('登录状态检查结果:', result);
                        return result;
                        
                    } catch (e) {
                        console.error('登录状态检查异常:', e);
                        return {
                            currentUrl: window.location.href,
                            isLoggedInByUrl: false,
                            hasUserElements: false,
                            hasLoginElements: true,
                            isLoggedIn: false,
                            error: e.message
                        };
                    }
                })()
            `);

            if (loginCheckResult && loginCheckResult.isLoggedIn) {
                console.log(`✅ 登录状态验证成功`);
                return true;
            } else {
                console.log(`❌ 登录状态验证失败:`, loginCheckResult);
                return false;
            }

        } catch (error) {
            console.error(`❌ 登录状态验证异常:`, error);
            return false;
        }
    }

    /**
     * 提取账号信息
     * 复用 WeChatVideoUploader 的逻辑
     */
    private async extractAccountInfo(tabId: string): Promise<AccountInfo | null> {
        console.log(`📊 开始提取账号信息...`);

        try {
            const extractScript = `
            (function extractWechatFinderInfo() {
                try {
                    // 提取头像URL
                    const avatarImg = document.querySelector('.finder-info-container .avatar');
                    const avatar = avatarImg ? avatarImg.src : null;
                    
                    // 提取账号名称
                    const accountNameEl = document.querySelector('.finder-nickname');
                    const accountName = accountNameEl ? accountNameEl.textContent.trim() : null;
                    
                    // 提取视频号ID
                    const accountIdEl = document.querySelector('.finder-uniq-id');
                    const accountId = accountIdEl ? accountIdEl.textContent.trim() : null;
                    
                    // 提取视频数和关注者数
                    const infoNums = document.querySelectorAll('.finder-info-num');
                    let videosCount = null;
                    let followersCount = null;
                    
                    if (infoNums.length >= 2) {
                        videosCount = infoNums[0].textContent.trim();
                        followersCount = infoNums[1].textContent.trim();
                    }
                    
                    // 解析数字的辅助函数
                    function parseNumber(value) {
                        if (!value) return 0;
                        const cleanValue = value.toString().replace(/[^\\d.万千]/g, '');
                        if (cleanValue.includes('万')) {
                            return Math.floor(parseFloat(cleanValue) * 10000);
                        } else if (cleanValue.includes('千')) {
                            return Math.floor(parseFloat(cleanValue) * 1000);
                        }
                        return parseInt(cleanValue) || 0;
                    }
                    
                    // 标准化数据
                    return {
                        platform: 'wechat',
                        accountName: accountName,
                        accountId: accountId,
                        followersCount: parseNumber(followersCount),
                        videosCount: parseNumber(videosCount),
                        avatar: avatar,
                        bio: null,
                        extractedAt: new Date().toISOString(),
                    };
                } catch (error) {
                    console.error('提取数据时出错:', error);
                    return null;
                }
            })()
            `;

            const result = await this.tabManager.executeScript(tabId, extractScript);

            if (result && result.accountName) {
                console.log(`✅ 账号信息提取成功: ${result.accountName}`);
                return result;
            } else {
                console.warn(`⚠️ 未能提取到完整账号信息`);
                return null;
            }

        } catch (error) {
            console.error(`❌ 提取账号信息失败:`, error);
            return null;
        }
    }

    /**
     * 清理资源
     */
    private async cleanup(tabId: string): Promise<void> {
        try {
            await this.tabManager.closeTab(tabId);
            console.log(`🧹 登录标签页已清理: ${tabId}`);
        } catch (error) {
            console.warn(`⚠️ 清理登录标签页失败:`, error);
        }
    }
}