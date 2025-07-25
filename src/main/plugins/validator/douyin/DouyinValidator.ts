// src/main/plugins/validator/douyin/DouyinValidator.ts
import { PluginValidator, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';
export class DouyinValidator implements PluginValidator {
    public readonly platform = 'douyin';
    public readonly name = 'Douyin Validator';
    public readonly type = PluginType.VALIDATOR;

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
    }

    async validateCookie(cookieFile: string): Promise<boolean> {
        let tabId: string | null = null;
        try {
            tabId = await this.tabManager.createHeadlessTab('validator', 'douyin', 'https://creator.douyin.com/creator-micro/content/upload');

            await this.tabManager.loadAccountCookies(tabId, cookieFile);
            await this.tabManager.navigateTab(tabId, 'https://creator.douyin.com/creator-micro/content/upload');

            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 检查当前URL是否为目标URL
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');
            if (!currentUrl.includes('creator-micro/content/upload')) {
                return false; // 被重定向了，Cookie失效
            }

            // 检查是否有登录按钮
            const hasLoginButton = await this.tabManager.executeScript(tabId, `
                (function() {
                    try {
                        const bodyText = document.body.textContent || '';
                        return bodyText.includes('手机号登录') || 
                            bodyText.includes('扫码登录') ||
                            bodyText.includes('请登录');
                    } catch (error) {
                        console.error('检查登录状态出错:', error);
                        return true; // 出错时假设需要登录
                    }
                })()
            `);

            return !hasLoginButton; // 没有登录按钮 = Cookie有效

        } catch (error) {
            console.error('抖音Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId);
            }
        }
    }

}