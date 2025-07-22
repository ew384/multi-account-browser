// src/main/plugins/validator/index.ts
// 验证插件统一导出和注册

import { PluginValidator } from '../../../types/pluginInterface';
import { TabManager } from '../../TabManager';

// 🔥 导出所有验证插件类（目前还没有实现）
// export { WeChatValidator } from './WeChatValidator';

// 🔥 验证插件配置数组
export const VALIDATOR_PLUGINS: any[] = [
    // TODO: 添加验证插件
    // WeChatValidator,
    // DouyinValidator,
    // XiaohongshuValidator,
    // KuaishouValidator,
];

// 🔥 按平台映射插件类
export const VALIDATOR_PLUGIN_MAP: Record<string, any> = {
    // 'wechat': WeChatValidator,
    // 'douyin': DouyinValidator,
    // 'xiaohongshu': XiaohongshuValidator,
    // 'kuaishou': KuaishouValidator,
};

// 🔥 获取支持的验证平台列表
export function getSupportedValidatorPlatforms(): string[] {
    return Object.keys(VALIDATOR_PLUGIN_MAP);
}

// 🔥 根据平台获取插件类
export function getValidatorPluginClass(platform: string): any | null {
    return VALIDATOR_PLUGIN_MAP[platform] || null;
}

// 🔥 创建插件实例（便于测试）
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

// 🔥 测试指定平台的验证插件
export async function testValidatorPlugin(platform: string, tabManager: TabManager): Promise<boolean> {
    try {
        console.log(`🧪 测试 ${platform} 验证插件...`);
        const plugin = await createValidatorPlugin(platform, tabManager);

        if (!plugin) {
            return false;
        }

        // 基本功能测试
        console.log(`   插件名称: ${plugin.name}`);
        console.log(`   支持平台: ${plugin.platform}`);
        console.log(`   插件类型: ${plugin.type}`);

        console.log(`✅ ${platform} 验证插件测试通过`);
        return true;

    } catch (error) {
        console.error(`❌ ${platform} 验证插件测试失败:`, error);
        return false;
    }
}

// 🔥 批量测试所有验证插件
export async function testAllValidatorPlugins(tabManager: TabManager): Promise<void> {
    console.log('🧪 开始测试所有验证插件...');

    const platforms = getSupportedValidatorPlatforms();

    if (platforms.length === 0) {
        console.log('⚠️ 暂无验证插件可测试');
        return;
    }

    const results: Record<string, boolean> = {};

    for (const platform of platforms) {
        results[platform] = await testValidatorPlugin(platform, tabManager);
    }

    // 输出测试结果
    console.log('\n📊 验证插件测试结果:');
    for (const [platform, success] of Object.entries(results)) {
        console.log(`   ${platform}: ${success ? '✅ 通过' : '❌ 失败'}`);
    }

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🎯 总计: ${successCount}/${platforms.length} 个插件测试通过\n`);
}