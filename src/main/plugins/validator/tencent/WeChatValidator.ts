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
            tabId = await this.tabManager.createAccountTab(cookieFile, 'wechat','https://channels.weixin.qq.com/platform/post/create',true);
            // 等待页面加载完成
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 检查是否存在包含"微信小店"的元素
            const hasWeixinStore = await this.tabManager.executeScript(tabId, `
                Array.from(document.querySelectorAll('div.title-name'))
                    .some(el => el.textContent && el.textContent.includes('微信小店'))
            `) as boolean;

            if (hasWeixinStore) {
                console.error("[+] cookie 失效");
                return false;
            } else {
                console.log("[+] cookie 有效");
                return true;
            }

        } catch (error) {
            console.error('微信Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId).catch(err =>
                    console.warn('关闭tab失败:', err)
                );
            }
        }
    }

}
