// src/main/plugins/validator/xiaohongshu/XiaohongshuValidator.ts
import { PluginValidator, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';
export class XiaohongshuValidator implements PluginValidator {
    public readonly platform = 'xiaohongshu';
    public readonly name = 'Xiaohongshu Validator';
    public readonly type = PluginType.VALIDATOR;

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
    }

    async validateCookie(cookieFile: string): Promise<boolean> {
        let tabId: string | null = null;
        try {
            tabId = await this.tabManager.createHeadlessTab('validator', 'xiaohongshu', 'https://creator.xiaohongshu.com/creator-micro/content/upload');
            await this.tabManager.loadAccountCookies(tabId, cookieFile);
            await this.tabManager.navigateTab(tabId, 'https://creator.xiaohongshu.com/creator-micro/content/upload');

            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 检查URL重定向
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');
            if (!currentUrl.includes('creator-micro/content/upload')) {
                return false;
            }

            // 检查登录按钮
            const hasLoginButton = await this.tabManager.executeScript(tabId, `
                !!(document.textContent.includes('手机号登录') ||
                   document.textContent.includes('扫码登录'))
            `);

            return !hasLoginButton;

        } catch (error) {
            console.error('小红书Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId);
            }
        }
    }

}