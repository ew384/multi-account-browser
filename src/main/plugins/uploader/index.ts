// src/main/plugins/uploader/index.ts
// 上传插件统一导出和注册

import { WeChatVideoUploader } from './tencent/main';
import { DouyinVideoUploader } from './douyin/main';
import { XiaoHongShuVideoUploader } from './xiaohongshu/main';
import { KuaiShouVideoUploader } from './kuaishou/main'
import { PluginUploader } from '../../../types/pluginInterface';
import { TabManager } from '../../TabManager';

// 🔥 导出所有上传插件类
export { WeChatVideoUploader, DouyinVideoUploader, XiaoHongShuVideoUploader, KuaiShouVideoUploader };

// 🔥 上传插件配置数组
export const UPLOADER_PLUGINS = [
    WeChatVideoUploader,
    DouyinVideoUploader,
    XiaoHongShuVideoUploader,
    KuaiShouVideoUploader,
];

// 🔥 按平台映射插件类
export const UPLOADER_PLUGIN_MAP: Record<string, any> = {
    'wechat': WeChatVideoUploader,
    'douyin': DouyinVideoUploader,
    'xiaohongshu': XiaoHongShuVideoUploader,
    'kuaishou': KuaiShouVideoUploader,
};

// 🔥 获取支持的上传平台列表
export function getSupportedUploadPlatforms(): string[] {
    return Object.keys(UPLOADER_PLUGIN_MAP);
}

// 🔥 根据平台获取插件类
export function getUploaderPluginClass(platform: string): any | null {
    return UPLOADER_PLUGIN_MAP[platform] || null;
}

// 🔥 创建插件实例（便于测试）
export async function createUploaderPlugin(platform: string, tabManager: TabManager): Promise<PluginUploader | null> {
    const PluginClass = getUploaderPluginClass(platform);
    if (!PluginClass) {
        console.warn(`⚠️ 不支持的上传平台: ${platform}`);
        return null;
    }

    const plugin = new PluginClass();
    await plugin.init(tabManager);
    console.log(`✅ ${platform} 上传插件创建成功`);
    return plugin;
}

// 🔥 测试指定平台的上传插件
export async function testUploaderPlugin(platform: string, tabManager: TabManager): Promise<boolean> {
    try {
        console.log(`🧪 测试 ${platform} 上传插件...`);
        const plugin = await createUploaderPlugin(platform, tabManager);

        if (!plugin) {
            return false;
        }

        // 基本功能测试
        console.log(`   插件名称: ${plugin.name}`);
        console.log(`   支持平台: ${plugin.platform}`);
        console.log(`   插件类型: ${plugin.type}`);

        // 可以在这里添加更多测试逻辑
        // 比如测试 getAccountInfo 方法等

        console.log(`✅ ${platform} 上传插件测试通过`);
        return true;

    } catch (error) {
        console.error(`❌ ${platform} 上传插件测试失败:`, error);
        return false;
    }
}

// 🔥 批量测试所有上传插件
export async function testAllUploaderPlugins(tabManager: TabManager): Promise<void> {
    console.log('🧪 开始测试所有上传插件...');

    const platforms = getSupportedUploadPlatforms();
    const results: Record<string, boolean> = {};

    for (const platform of platforms) {
        results[platform] = await testUploaderPlugin(platform, tabManager);
    }

    // 输出测试结果
    console.log('\n📊 上传插件测试结果:');
    for (const [platform, success] of Object.entries(results)) {
        console.log(`   ${platform}: ${success ? '✅ 通过' : '❌ 失败'}`);
    }

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🎯 总计: ${successCount}/${platforms.length} 个插件测试通过\n`);
}