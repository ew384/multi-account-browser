// src/main/automation/AutomationEngine.ts
import { WeChatVideoUploader } from '../plugins/uploader/tencent/main';
import { TabManager } from '../../main/TabManager';
export class AutomationEngine {
    private tabManager: TabManager;

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
    }

    async uploadVideo(tabId: string, platform: string, params: {
        filePath: string;
        title: string;
        tags: string[];
        publishDate?: Date;
        enableOriginal?: boolean;
        addToCollection?: boolean;
        category?: string;
    }): Promise<boolean> {

        console.log(`🚀 开始 ${platform} 平台视频上传...`);

        switch (platform) {
            case 'wechat':
                const wechatUploader = new WeChatVideoUploader(tabId, this.tabManager);
                return await wechatUploader.uploadVideoComplete(params);

            case 'douyin':
                // 未来扩展
                throw new Error('抖音平台暂未实现');

            default:
                throw new Error(`不支持的平台: ${platform}`);
        }
    }
    async getAccountInfo(tabId: string, platform: string) {
        console.log(`🔍 开始提取 ${platform} 平台账号信息...`);

        switch (platform) {
            case 'wechat':
                const wechatUploader = new WeChatVideoUploader(tabId, this.tabManager);
                return await wechatUploader.AccountInfo(tabId, this.tabManager);

            case 'douyin':
                // 未来扩展
                throw new Error('抖音平台暂未实现');

            case 'xiaohongshu':
                // 未来扩展
                throw new Error('小红书平台暂未实现');

            default:
                throw new Error(`不支持的平台: ${platform}`);
        }
    }
}