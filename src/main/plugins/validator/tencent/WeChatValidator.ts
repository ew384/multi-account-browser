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

    async validateTab(tabId: string): Promise<boolean> {
        try {
            // 等待页面加载完成
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 检查是否存在包含"微信小店"的元素
            const hasWeixinStore = await this.tabManager.executeScript(tabId, `
                Array.from(document.querySelectorAll('div.title-name'))
                    .some(el => el.textContent && el.textContent.includes('微信小店'))
            `) as boolean;

            if (hasWeixinStore) {
                console.error("[+] 微信Cookie失效");
                return false;
            } else {
                console.log("[+] 微信Cookie有效");
                return true;
            }
        } catch (error) {
            console.error('微信Tab验证失败:', error);
            return false;
        }
    }
}