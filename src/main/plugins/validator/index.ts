// src/main/plugins/validator/index.ts
import { WeChatValidator } from './tencent/WeChatValidator';
import { DouyinValidator } from './douyin/DouyinValidator';
import { XiaohongshuValidator } from './xiaohongshu/XiaohongshuValidator';
import { KuaishouValidator } from './kuaishou/KuaishouValidator';
import { PluginValidator } from '../../../types/pluginInterface';
import { TabManager } from '../../TabManager';

// 🔥 导出所有验证插件类
export { WeChatValidator, DouyinValidator, XiaohongshuValidator, KuaishouValidator };

// 🔥 验证插件配置数组
export const VALIDATOR_PLUGINS = [
    WeChatValidator,
    DouyinValidator,
    XiaohongshuValidator,
    KuaishouValidator,
];

// 🔥 按平台映射插件类
export const VALIDATOR_PLUGIN_MAP: Record<string, any> = {
    'wechat': WeChatValidator,
    'douyin': DouyinValidator,
    'xiaohongshu': XiaohongshuValidator,
    'kuaishou': KuaishouValidator,
};

// 🔥 获取支持的验证平台列表
export function getSupportedValidatorPlatforms(): string[] {
    return Object.keys(VALIDATOR_PLUGIN_MAP);
}

// 🔥 根据平台获取插件类
export function getValidatorPluginClass(platform: string): any | null {
    return VALIDATOR_PLUGIN_MAP[platform] || null;
}

// 🔥 创建插件实例
export async function createValidatorPlugin(platform: string, tabManager: TabManager): Promise<PluginValidator | null> {
    const PluginClass = getValidatorPluginClass(platform);
    if (!PluginClass) {
        console.warn(`⚠️ 不支持的验证平台: ${platform}`);
        return null;
    }

    const plugin = new PluginClass();
    await plugin.init(tabManager);
    console.log(`✅ ${platform} 验证插件创建成功`);
    return plugin;
}

// 🔥 批量测试所有验证插件
export async function testAllValidatorPlugins(tabManager: TabManager): Promise<void> {
    console.log('🧪 开始测试所有验证插件...');

    const platforms = getSupportedValidatorPlatforms();
    const results: Record<string, boolean> = {};

    for (const platform of platforms) {
        try {
            const plugin = await createValidatorPlugin(platform, tabManager);
            results[platform] = !!plugin;
        } catch (error) {
            console.error(`❌ ${platform} 验证插件测试失败:`, error);
            results[platform] = false;
        }
    }

    console.log('\n📊 验证插件测试结果:');
    for (const [platform, success] of Object.entries(results)) {
        console.log(`   ${platform}: ${success ? '✅ 通过' : '❌ 失败'}`);
    }

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🎯 总计: ${successCount}/${platforms.length} 个插件测试通过\n`);
}