// src/main/plugins/validator/kuaishou/KuaishouValidator.ts
import { PluginValidator, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';
export class KuaishouValidator implements PluginValidator {
    public readonly platform = 'kuaishou';
    public readonly name = 'Kuaishou Validator';
    public readonly type = PluginType.VALIDATOR;

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
    }

    async validateCookie(cookieFile: string): Promise<boolean> {
        let tabId: string | null = null;
        try {
            tabId = await this.tabManager.createHeadlessTab('validator', 'kuaishou', 'https://cp.kuaishou.com/article/publish/video');
            await this.tabManager.loadAccountCookies(tabId, cookieFile);
            await this.tabManager.navigateTab(tabId, 'https://cp.kuaishou.com/article/publish/video');

            // 等待"机构服务"元素，5秒超时
            const found = await this.tabManager.executeScript(tabId, `
                new Promise((resolve) => {
                    const timeout = setTimeout(() => resolve(false), 5000);
                    
                    const check = () => {
                        const element = document.querySelector('div.names div.container div.name');
                        if (element && element.textContent && element.textContent.includes('机构服务')) {
                            clearTimeout(timeout);
                            resolve(true);
                        } else {
                            setTimeout(check, 100);
                        }
                    };
                    check();
                })
            `);

            // 找到"机构服务" = Cookie失效
            return !found;

        } catch (error) {
            console.error('快手Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId);
            }
        }
    }

}