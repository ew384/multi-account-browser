// src/main/plugins/processor/xiaohongshu/XiaohongshuProcessor.ts
import {
    PluginProcessor,
    PluginType,
    ProcessorDependencies
} from '../../../../types/pluginInterface';

export class XiaohongshuProcessor implements PluginProcessor {
    public readonly name = '小红书处理器';
    public readonly type = PluginType.PROCESSOR;
    public readonly scenario = 'xiaohongshu';
    public readonly platform = 'xiaohongshu';

    private tabManager!: any;

    async init(dependencies: ProcessorDependencies): Promise<void> {
        this.tabManager = dependencies.tabManager;
        console.log('✅ 小红书处理器初始化完成');
    }

    async destroy(): Promise<void> {
        console.log('🧹 小红书处理器已销毁');
    }

    async process(params: any): Promise<any> {
        // 这里可以实现小红书的通用处理逻辑
        return { success: true };
    }

    /**
     * 🔥 小红书创作者首页导航
     * @param tabId 标签页ID
     * @returns 是否成功
     */
    async creatorHomeNavigate(tabId: string): Promise<boolean> {
        try {
            console.log('🔗 小红书登录完成，正在点击发布按钮...');
            
            // 第一步：点击发布按钮
            const clickPublishScript = `
                (function() {
                    console.log('🔍 查找小红书发布按钮...');
                    
                    const publishLink = document.querySelector('a[href*="creator.xiaohongshu.com/publish"]');
                    
                    if (publishLink) {
                        console.log('✅ 找到发布按钮，准备点击');
                        publishLink.click();
                        console.log('✅ 发布按钮已点击');
                        return true;
                    } else {
                        console.log('❌ 未找到发布按钮');
                        return false;
                    }
                })()
            `;

            const clickResult = await this.tabManager.executeScript(tabId, clickPublishScript);
            
            if (clickResult) {
                console.log('✅ 小红书发布按钮点击成功');
                
                // 等待页面跳转完成
                console.log('⏳ 等待发布页面加载完成...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // 增加到5秒
                
                console.log('🔗 直接导航到小红书首页...');
                try {
                    await this.tabManager.navigateTab(tabId, 'https://creator.xiaohongshu.com/new/home?source=official');
                    console.log('✅ 小红书首页导航成功');
                    return true;
                } catch (navError) {
                    console.warn('⚠️ 小红书首页导航失败:', navError);
                    return false;
                }
            }
            
            return false;

        } catch (error) {
            console.warn('⚠️ 小红书创作者首页导航异常:', error);
            return false;
        }
    }
}