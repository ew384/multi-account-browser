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
            await new Promise(resolve => setTimeout(resolve, 6000));

            // 检查当前URL是否为目标URL
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');
            if (!currentUrl.includes('creator-micro/content/upload')) {
                return false; // 被重定向了，Cookie失效
            }

            // 多次检测登录状态，确保页面完全加载
            let hasLoginButton = false;
            for (let i = 0; i < 8; i++) {
                hasLoginButton = await this.tabManager.executeScript(tabId, `
                    (function() {
                        try {
                            // 主要检测方法：检测登录页面特有的元素
                            const loginPageTitle = document.querySelector('.title-Y3NVRC .name-iixoUN');
                            if (loginPageTitle && loginPageTitle.textContent.includes('抖音创作者中心·创作者')) {
                                console.log('通过登录页面标题元素检测到登录界面');
                                return true;
                            }
                            
                            // 辅助检测：检测登录相关class容器
                            if (document.querySelector('.title-Y3NVRC')) {
                                console.log('通过登录页面容器元素检测到登录界面');
                                return true;
                            }
                            
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
            console.error('抖音Cookie验证失败:', error);
            return false;
        } finally {
            if (tabId) {
                await this.tabManager.closeTab(tabId);
            }
        }
    }
}