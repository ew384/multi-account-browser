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

    async validateTab(tabId: string): Promise<boolean> {
        try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 检查URL是否包含登录相关路径
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');
            if (currentUrl.includes('/login')) {
                return false; // 如果在登录页面，说明未登录
            }
            
            // 检查页面文本内容
            const hasLoginText = await this.tabManager.executeScript(tabId, `
                const textContent = document.body?.textContent || document.documentElement?.textContent || '';
                textContent.includes('手机号登录') || textContent.includes('新用户可直接登录')
            `);
            
            return !hasLoginText; // 有登录文本则返回false（未登录）
        } catch (error) {
            console.error('小红书Tab验证失败:', error);
            return false;
        }
    }
}