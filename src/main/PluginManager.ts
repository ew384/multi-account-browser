// src/main/plugins/PluginManager.ts
// 插件管理器 - 统一注册和管理所有插件

import { BasePlugin, PluginType } from '../types/pluginInterface';
import { TabManager } from './TabManager';

// 🔥 导入各类别插件
import {
    UPLOADER_PLUGINS,
    getSupportedUploadPlatforms,
    testAllUploaderPlugins,
    createUploaderPlugin
} from './plugins/uploader';

import {
    LOGIN_PLUGINS,
    getSupportedLoginPlatforms,
    testAllLoginPlugins,
    createLoginPlugin
} from './plugins/login';

import {
    VALIDATOR_PLUGINS,
    getSupportedValidatorPlatforms,
    testAllValidatorPlugins,
    createValidatorPlugin
} from './plugins/validator';

export class PluginManager {
    private tabManager: TabManager;
    private plugins: Map<string, BasePlugin> = new Map();

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
    }

    /**
     * 🔥 初始化所有插件（分层注册）
     */
    async initializeAllPlugins(): Promise<void> {
        console.log('🔌 开始初始化所有插件...');

        try {
            // 按类别依次初始化
            await this.initializeUploaderPlugins();
            await this.initializeLoginPlugins();
            await this.initializeValidatorPlugins();

            const totalPlugins = this.plugins.size;
            console.log(`🎉 插件初始化完成，共加载 ${totalPlugins} 个插件`);

            // 输出插件统计
            this.printPluginSummary();

        } catch (error) {
            console.error('❌ 插件初始化失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 初始化上传插件
     */
    async initializeUploaderPlugins(): Promise<void> {
        console.log('📤 初始化上传插件...');

        for (const PluginClass of UPLOADER_PLUGINS) {
            try {
                const plugin = new PluginClass();
                await plugin.init(this.tabManager);

                const key = `${plugin.type}-${plugin.platform}`;
                console.log(`🔧 插件注册 key: "${key}"`);
                console.log(`🔧 plugin.type: "${plugin.type}"`);
                console.log(`🔧 plugin.platform: "${plugin.platform}"`);
                this.plugins.set(key, plugin);

                console.log(`  ✅ ${plugin.name} (${plugin.platform})`);
            } catch (error) {
                console.error(`  ❌ 上传插件初始化失败 (${PluginClass.name}):`, error);
            }
        }
    }

    /**
     * 🔥 初始化登录插件
     */
    async initializeLoginPlugins(): Promise<void> {
        console.log('🔐 初始化登录插件...');

        for (const PluginClass of LOGIN_PLUGINS) {
            try {
                const plugin = new PluginClass();
                await plugin.init(this.tabManager);

                const key = `${plugin.type}-${plugin.platform}`;
                this.plugins.set(key, plugin);

                console.log(`  ✅ ${plugin.name} (${plugin.platform})`);
            } catch (error) {
                console.error(`  ❌ 登录插件初始化失败 (${PluginClass.name}):`, error);
            }
        }
    }

    /**
     * 🔥 初始化验证插件
     */
    async initializeValidatorPlugins(): Promise<void> {
        console.log('🔍 初始化验证插件...');

        if (VALIDATOR_PLUGINS.length === 0) {
            console.log('  ⚠️ 暂无验证插件');
            return;
        }

        for (const PluginClass of VALIDATOR_PLUGINS) {
            try {
                const plugin = new PluginClass();
                await plugin.init(this.tabManager);

                const key = `${plugin.type}-${plugin.platform}`;
                this.plugins.set(key, plugin);

                console.log(`  ✅ ${plugin.name} (${plugin.platform})`);
            } catch (error) {
                console.error(`  ❌ 验证插件初始化失败 (${PluginClass.name}):`, error);
            }
        }
    }

    /**
     * 🔥 获取指定类型和平台的插件
     */
    getPlugin<T extends BasePlugin>(type: PluginType, platform: string): T | null {
        const key = `${type}-${platform}`;

        // 🔥 详细调试
        console.log(`🔍 getPlugin 调用参数:`, {
            type: type,
            typeString: String(type),
            platform: platform,
            key: key
        });

        console.log(`🔍 当前注册的所有插件:`, [...this.plugins.entries()].map(([k, v]) => ({
            key: k,
            name: v.name,
            platform: v.platform,
            type: v.type
        })));

        const plugin = this.plugins.get(key) as T;
        console.log(`🔍 查找结果:`, {
            found: !!plugin,
            plugin: plugin ? {
                name: plugin.name,
                platform: plugin.platform,
                type: plugin.type
            } : null
        });

        return plugin || null;
    }

    /**
     * 🔥 获取所有指定类型的插件
     */
    getPluginsByType<T extends BasePlugin>(type: PluginType): T[] {
        return Array.from(this.plugins.values())
            .filter(plugin => plugin.type === type) as T[];
    }

    /**
     * 🔥 检查平台是否支持指定功能
     */
    isPlatformSupported(type: PluginType, platform: string): boolean {
        const key = `${type}-${platform}`;
        return this.plugins.has(key);
    }

    /**
     * 🔥 获取支持的平台列表
     */
    getSupportedPlatforms(type?: PluginType): string[] {
        if (!type) {
            // 返回所有平台
            const allPlatforms = new Set<string>();
            for (const plugin of this.plugins.values()) {
                allPlatforms.add(plugin.platform);
            }
            return Array.from(allPlatforms);
        }

        // 返回指定类型支持的平台
        return this.getPluginsByType(type).map(plugin => plugin.platform);
    }

    /**
     * 🔥 输出插件统计信息
     */
    printPluginSummary(): void {
        const uploaderCount = this.getPluginsByType(PluginType.UPLOADER).length;
        const loginCount = this.getPluginsByType(PluginType.LOGIN).length;
        const validatorCount = this.getPluginsByType(PluginType.VALIDATOR).length;

        console.log('\n📊 插件统计:');
        console.log(`   📤 上传插件: ${uploaderCount} 个`);
        console.log(`   🔐 登录插件: ${loginCount} 个`);
        console.log(`   🔍 验证插件: ${validatorCount} 个`);
        console.log(`   🎯 总计: ${this.plugins.size} 个插件\n`);

        // 输出支持的平台
        const uploadPlatforms = getSupportedUploadPlatforms();
        const loginPlatforms = getSupportedLoginPlatforms();
        const validatorPlatforms = getSupportedValidatorPlatforms();

        console.log('🎯 支持的平台:');
        console.log(`   📤 上传: ${uploadPlatforms.join(', ') || '无'}`);
        console.log(`   🔐 登录: ${loginPlatforms.join(', ') || '无'}`);
        console.log(`   🔍 验证: ${validatorPlatforms.join(', ') || '无'}\n`);
    }

    /**
     * 🔥 测试所有插件（分类测试）
     */
    async testAllPlugins(): Promise<void> {
        console.log('🧪 开始测试所有插件...\n');

        try {
            // 分类测试
            await testAllUploaderPlugins(this.tabManager);
            await testAllLoginPlugins(this.tabManager);
            await testAllValidatorPlugins(this.tabManager);

            console.log('🎉 所有插件测试完成\n');

        } catch (error) {
            console.error('❌ 插件测试过程中发生错误:', error);
        }
    }

    /**
     * 🔥 测试指定平台的插件
     */
    async testPlatformPlugins(platform: string): Promise<void> {
        console.log(`🧪 测试 ${platform} 平台的所有插件...\n`);

        const results: string[] = [];

        // 测试上传插件
        if (getSupportedUploadPlatforms().includes(platform)) {
            const uploader = await createUploaderPlugin(platform, this.tabManager);
            results.push(`📤 上传: ${uploader ? '✅' : '❌'}`);
        }

        // 测试登录插件
        if (getSupportedLoginPlatforms().includes(platform)) {
            const login = await createLoginPlugin(platform, this.tabManager);
            results.push(`🔐 登录: ${login ? '✅' : '❌'}`);
        }

        // 测试验证插件
        if (getSupportedValidatorPlatforms().includes(platform)) {
            const validator = await createValidatorPlugin(platform, this.tabManager);
            results.push(`🔍 验证: ${validator ? '✅' : '❌'}`);
        }

        console.log(`📊 ${platform} 平台测试结果:`);
        for (const result of results) {
            console.log(`   ${result}`);
        }
        console.log();
    }

    /**
     * 🔥 销毁所有插件
     */
    async destroyAllPlugins(): Promise<void> {
        console.log('🧹 开始销毁所有插件...');

        for (const [key, plugin] of this.plugins) {
            try {
                if (plugin.destroy) {
                    await plugin.destroy();
                }
                console.log(`  ✅ ${plugin.name} 已销毁`);
            } catch (error) {
                console.error(`  ❌ 销毁插件失败 (${key}):`, error);
            }
        }

        this.plugins.clear();
        console.log('🎉 所有插件已销毁');
    }
}