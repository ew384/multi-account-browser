// src/main/plugins/validator/tencent/WeChatValidator.ts
import { PluginValidator, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';

export class WeChatValidator implements PluginValidator {
    public readonly platform = 'wechat';
    public readonly name = 'WeChat Validator';
    public readonly type = PluginType.VALIDATOR;

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
    }

    async validateCookie(cookieFile: string): Promise<boolean> {
        let tabId: string | null = null;
        try {
            // 创建headless tab
            tabId = await this.tabManager.createHeadlessTab(
                `wechat_validator_${Date.now()}`,
                'wechat',
                'https://channels.weixin.qq.com/platform/post/create'
            );

            // 加载Cookie
            await this.tabManager.loadAccountCookies(tabId, cookieFile);

            // 导航到验证页面
            await this.tabManager.navigateTab(tabId, 'https://channels.weixin.qq.com/platform/post/create');

            // 等待"微信小店"元素，5秒超时
            const found = await this.tabManager.waitForElement(
                tabId,
                'div.title-name',
                5000
            );

            // 如果找到元素，检查是否包含"微信小店"文本
            if (found) {
                const hasText = await this.tabManager.executeScript(tabId, `
                    document.querySelector('div.title-name')?.textContent?.includes('微信小店') || false
                `);
                // 找到"微信小店" = Cookie失效
                return !hasText;
            }

            // 找不到元素 = Cookie有效
            return true;

        } catch (error) {
            console.error('微信Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId);
            }
        }
    }

}
