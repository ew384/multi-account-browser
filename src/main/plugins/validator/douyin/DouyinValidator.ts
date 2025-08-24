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

    async validateTab(tabId: string): Promise<boolean> {
        try {
            // 等待页面加载
            await new Promise(resolve => setTimeout(resolve, 4000));

            // 多次检测登录状态，确保页面完全加载
            let hasLoginButton = false;
            for (let i = 0; i < 8; i++) {
                hasLoginButton = await this.tabManager.executeScript(tabId, `
                    (function() {
                        try {
                            
                            // 备用检测方法：文本检测（保留原有逻辑）
                            const bodyText = document.body.textContent || '';
                            if (bodyText.includes('手机号登录') || 
                                bodyText.includes('扫码登录') ||
                                bodyText.includes('请登录')) {
                                console.log('通过文本内容检测到登录界面');
                                return true;
                            }
                            
                            return false; // 都没检测到，认为已登录
                            
                        } catch (error) {
                            console.error('检查登录状态出错:', error);
                            return true; // 出错时假设需要登录
                        }
                    })()
                `);

                if (hasLoginButton) {
                    console.log(`第${i + 1}次检测发现登录界面，Cookie无效`);
                    return false;
                }

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            return !hasLoginButton; // 3次检测都没有登录按钮 = Cookie有效

        } catch (error) {
            console.error('抖音Tab验证失败:', error);
            return false;
        }
    }
}