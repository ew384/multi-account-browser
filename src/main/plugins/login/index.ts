// src/main/plugins/login/index.ts
// 登录插件统一导出和注册

import { WeChatLogin } from './tencent/WeChatLogin';
import { DouyinLogin } from './douyin/DouyinLogin';
import { XiaohongshuLogin } from './xiaohongshu/XiaohongshuLogin';
import { KuaishouLogin } from './kuaishou/KuaishouLogin';
import { PluginLogin } from '../../../types/pluginInterface';
import { TabManager } from '../../TabManager';
type LoginPluginConstructor = new () => PluginLogin;
// 🔥 导出所有登录插件类
export { WeChatLogin, DouyinLogin, XiaohongshuLogin };

// 🔥 登录插件配置数组
export const LOGIN_PLUGINS = [
    WeChatLogin,
    DouyinLogin,
    XiaohongshuLogin,
    KuaishouLogin,
];

// 🔥 按平台映射插件类
export const LOGIN_PLUGIN_MAP: Record<string, LoginPluginConstructor> = {
    'wechat': WeChatLogin,
    'douyin': DouyinLogin,
    'xiaohongshu': XiaohongshuLogin,
    'kuaishou': KuaishouLogin,
};

// 🔥 获取支持的登录平台列表
export function getSupportedLoginPlatforms(): string[] {
    return Object.keys(LOGIN_PLUGIN_MAP);
}

// 🔥 根据平台获取插件类
export function getLoginPluginClass(platform: string): LoginPluginConstructor | null {
    return LOGIN_PLUGIN_MAP[platform] || null;
}

// 🔥 创建插件实例（便于测试）
export async function createLoginPlugin(platform: string, tabManager: TabManager): Promise<PluginLogin | null> {
    const PluginClass = getLoginPluginClass(platform);
    if (!PluginClass) {
        console.warn(`⚠️ 不支持的登录平台: ${platform}`);
        return null;
    }

    const plugin = new PluginClass();
    await plugin.init(tabManager);
    //console.log(`✅ ${platform} 登录插件创建成功`);
    return plugin;
}

// 🔥 测试指定平台的登录插件
export async function testLoginPlugin(platform: string, tabManager: TabManager): Promise<boolean> {
    try {
        //console.log(`🧪 测试 ${platform} 登录插件...`);
        const plugin = await createLoginPlugin(platform, tabManager);

        if (!plugin) {
            return false;
        }

        // 基本功能测试
        //log(`   插件名称: ${plugin.name}`);
        //console.log(`   支持平台: ${plugin.platform}`);
        //console.log(`   插件类型: ${plugin.type}`);

        //console.log(`✅ ${platform} 登录插件测试通过`);
        return true;

    } catch (error) {
        console.error(`❌ ${platform} 登录插件测试失败:`, error);
        return false;
    }
}

// 🔥 批量测试所有登录插件
export async function testAllLoginPlugins(tabManager: TabManager): Promise<void> {
    //log('🧪 开始测试所有登录插件...');

    const platforms = getSupportedLoginPlatforms();
    const results: Record<string, boolean> = {};

    for (const platform of platforms) {
        results[platform] = await testLoginPlugin(platform, tabManager);
    }

    // 输出测试结果
    console.log('\n📊 登录插件测试结果:');
    for (const [platform, success] of Object.entries(results)) {
        console.log(`   ${platform}: ${success ? '✅ 通过' : '❌ 失败'}`);
    }

    const successCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🎯 总计: ${successCount}/${platforms.length} 个插件测试通过\n`);
}