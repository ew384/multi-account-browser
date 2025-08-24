// src/main/plugins/message/index.ts
// 消息插件统一导出和注册

import { WeChatChannelsMessage } from './tencent/WeChatChannelsMessage';
import { DouyinMessage } from './bytedance/DouyinMessage';
// import { XiaohongshuMessage } from './xiaohongshu/XiaohongshuMessage'; // 🔥 预留，后续实现
// import { KuaishouMessage } from './kuaishou/KuaishouMessage';     // 🔥 预留，后续实现

import { PluginMessage, MessagePlatform } from '../../../types/pluginInterface';
import { TabManager } from '../../TabManager';

// 🔥 消息插件构造器类型
type MessagePluginConstructor = new () => PluginMessage;

// 🔥 导出所有消息插件类
export { WeChatChannelsMessage };

// 🔥 消息插件配置数组
export const MESSAGE_PLUGINS: MessagePluginConstructor[] = [
    WeChatChannelsMessage,
    DouyinMessage,
    // XiaohongshuMessage,   // 🔥 预留，后续添加  
    // KuaishouMessage,      // 🔥 预留，后续添加
];

// 🔥 按平台映射插件类
export const MESSAGE_PLUGIN_MAP: Record<string, MessagePluginConstructor> = {
    'wechat': WeChatChannelsMessage,
    'douyin': DouyinMessage,           // 🔥 预留，后续添加
    // 'xiaohongshu': XiaohongshuMessage, // 🔥 预留，后续添加
    // 'kuaishou': KuaishouMessage,       // 🔥 预留，后续添加
};

// 🔥 平台配置信息
export const MESSAGE_PLATFORM_CONFIGS: Record<string, {
    name: string;
    description: string;
    features: string[];
    syncInterval: number;  // 默认同步间隔（分钟）
    maxConcurrency: number; // 最大并发数
}> = {
    'wechat': {
        name: '微信视频号',
        description: '微信视频号助手平台私信管理',
        features: ['私信同步', '消息发送', '图片发送', '用户列表'],
        syncInterval: 5,
        maxConcurrency: 3
    },
    'douyin': {
        name: '抖音',
        description: '抖音创作者中心私信管理',
        features: ['私信同步', '消息发送'],
        syncInterval: 5,
        maxConcurrency: 3
    },
    // 'xiaohongshu': {
    //     name: '小红书',
    //     description: '小红书创作者中心私信管理',
    //     features: ['私信同步', '消息发送'],
    //     syncInterval: 5,
    //     maxConcurrency: 2
    // },
    // 'kuaishou': {
    //     name: '快手',
    //     description: '快手创作者中心私信管理',
    //     features: ['私信同步', '消息发送'],
    //     syncInterval: 5,
    //     maxConcurrency: 3
    // }
};

// ==================== 插件管理功能 ====================

/**
 * 🔥 获取支持的消息平台列表
 * @returns 平台标识符数组
 */
export function getSupportedMessagePlatforms(): string[] {
    return Object.keys(MESSAGE_PLUGIN_MAP);
}

/**
 * 🔥 根据平台获取插件类
 * @param platform 平台标识符
 * @returns 插件构造器类或null
 */
export function getMessagePluginClass(platform: string): MessagePluginConstructor | null {
    return MESSAGE_PLUGIN_MAP[platform] || null;
}

/**
 * 🔥 检查平台是否支持消息功能
 * @param platform 平台标识符
 * @returns 是否支持
 */
export function isMessagePlatformSupported(platform: string): boolean {
    return platform in MESSAGE_PLUGIN_MAP;
}

/**
 * 🔥 获取平台配置信息
 * @param platform 平台标识符
 * @returns 平台配置或null
 */
export function getMessagePlatformConfig(platform: string) {
    return MESSAGE_PLATFORM_CONFIGS[platform] || null;
}

/**
 * 🔥 获取所有平台配置信息
 * @returns 所有平台配置
 */
export function getAllMessagePlatformConfigs() {
    return MESSAGE_PLATFORM_CONFIGS;
}

// ==================== 插件实例创建和管理 ====================

/**
 * 🔥 创建消息插件实例
 * @param platform 平台标识符
 * @param tabManager TabManager实例
 * @returns 插件实例或null
 */
export async function createMessagePlugin(platform: string, tabManager: TabManager): Promise<PluginMessage | null> {
    try {
        const PluginClass = getMessagePluginClass(platform);
        if (!PluginClass) {
            console.warn(`⚠️ 不支持的消息平台: ${platform}`);
            return null;
        }

        console.log(`🔌 正在创建 ${platform} 消息插件...`);
        
        const plugin = new PluginClass();
        await plugin.init(tabManager);
        
        console.log(`✅ ${platform} 消息插件创建成功`);
        console.log(`   插件名称: ${plugin.name}`);
        console.log(`   支持平台: ${plugin.platform}`);
        console.log(`   插件类型: ${plugin.type}`);
        
        return plugin;

    } catch (error) {
        console.error(`❌ 创建 ${platform} 消息插件失败:`, error);
        return null;
    }
}

/**
 * 🔥 批量创建多个平台的消息插件
 * @param platforms 平台列表
 * @param tabManager TabManager实例
 * @returns 插件实例映射
 */
export async function createMultipleMessagePlugins(
    platforms: string[], 
    tabManager: TabManager
): Promise<Record<string, PluginMessage>> {
    console.log(`🔌 批量创建消息插件: ${platforms.join(', ')}`);
    
    const plugins: Record<string, PluginMessage> = {};
    const results: Array<{ platform: string; success: boolean; error?: string }> = [];

    for (const platform of platforms) {
        try {
            const plugin = await createMessagePlugin(platform, tabManager);
            if (plugin) {
                plugins[platform] = plugin;
                results.push({ platform, success: true });
            } else {
                results.push({ platform, success: false, error: '插件类不存在' });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'unknown error';
            results.push({ platform, success: false, error: errorMsg });
            console.error(`❌ 创建 ${platform} 插件失败:`, errorMsg);
        }
    }

    // 输出创建结果摘要
    const successCount = results.filter(r => r.success).length;
    console.log(`📊 批量创建结果: ${successCount}/${platforms.length} 个插件创建成功`);
    
    for (const result of results) {
        const status = result.success ? '✅' : '❌';
        const message = result.success ? '成功' : `失败: ${result.error}`;
        console.log(`   ${status} ${result.platform}: ${message}`);
    }

    return plugins;
}

// ==================== 插件验证和测试 ====================

/**
 * 🔥 测试指定平台的消息插件
 * @param platform 平台标识符
 * @param tabManager TabManager实例
 * @returns 测试是否通过
 */
export async function testMessagePlugin(platform: string, tabManager: TabManager): Promise<boolean> {
    try {
        console.log(`🧪 测试 ${platform} 消息插件...`);
        
        const plugin = await createMessagePlugin(platform, tabManager);
        if (!plugin) {
            console.error(`❌ ${platform} 插件创建失败`);
            return false;
        }

        // 基本功能测试
        console.log(`   插件名称: ${plugin.name}`);
        console.log(`   支持平台: ${plugin.platform}`);
        console.log(`   插件类型: ${plugin.type}`);

        // 检查核心方法是否存在
        const requiredMethods: (keyof PluginMessage)[] = ['syncMessages', 'sendMessage'];
        const optionalMethods: (keyof PluginMessage)[] = ['getUserList', 'validateTabContext', 'getPlatformConfig'];

        for (const method of requiredMethods) {
            if (typeof plugin[method] !== 'function') {
                console.error(`❌ ${platform} 插件缺少必需方法: ${method}`);
                return false;
            }
        }

        console.log(`   ✅ 必需方法检查通过: ${requiredMethods.join(', ')}`);

        // 检查可选方法
        const availableOptionalMethods = optionalMethods.filter(method => 
            plugin[method] && typeof plugin[method] === 'function'
        );
        if (availableOptionalMethods.length > 0) {
            console.log(`   📝 可选方法可用: ${availableOptionalMethods.join(', ')}`);
        }

        // 清理插件实例
        if (plugin.destroy) {
            await plugin.destroy();
        }

        console.log(`✅ ${platform} 消息插件测试通过`);
        return true;

    } catch (error) {
        console.error(`❌ ${platform} 消息插件测试失败:`, error);
        return false;
    }
}

/**
 * 🔥 批量测试所有消息插件
 * @param tabManager TabManager实例
 * @returns 测试结果摘要
 */
export async function testAllMessagePlugins(tabManager: TabManager): Promise<{
    totalPlugins: number;
    passedPlugins: number;
    failedPlugins: string[];
    results: Record<string, boolean>;
}> {
    console.log('🧪 开始测试所有消息插件...\n');

    const platforms = getSupportedMessagePlatforms();
    const results: Record<string, boolean> = {};
    const failedPlugins: string[] = [];

    for (const platform of platforms) {
        const success = await testMessagePlugin(platform, tabManager);
        results[platform] = success;
        
        if (!success) {
            failedPlugins.push(platform);
        }
        
        console.log(''); // 添加空行分隔
    }

    // 输出测试结果摘要
    const passedPlugins = Object.values(results).filter(Boolean).length;
    
    console.log('📊 消息插件测试结果摘要:');
    console.log(`   总插件数: ${platforms.length}`);
    console.log(`   测试通过: ${passedPlugins}`);
    console.log(`   测试失败: ${failedPlugins.length}`);
    
    if (failedPlugins.length > 0) {
        console.log(`   失败插件: ${failedPlugins.join(', ')}`);
    }

    console.log('\n📋 详细结果:');
    for (const [platform, success] of Object.entries(results)) {
        const status = success ? '✅ 通过' : '❌ 失败';
        const config = getMessagePlatformConfig(platform);
        console.log(`   ${platform} (${config?.name || '未知'}): ${status}`);
    }

    return {
        totalPlugins: platforms.length,
        passedPlugins,
        failedPlugins,
        results
    };
}

// ==================== 插件信息查询 ====================

/**
 * 🔥 获取插件运行时信息
 * @param platform 平台标识符
 * @returns 运行时信息
 */
export function getMessagePluginInfo(platform: string): {
    platform: string;
    isSupported: boolean;
    config?: any;
    pluginClass?: string;
} {
    const isSupported = isMessagePlatformSupported(platform);
    const config = getMessagePlatformConfig(platform);
    const pluginClass = getMessagePluginClass(platform);

    return {
        platform,
        isSupported,
        config,
        pluginClass: pluginClass?.name
    };
}

/**
 * 🔥 获取所有消息插件的运行时信息
 * @returns 所有插件信息
 */
export function getAllMessagePluginInfo(): Record<string, any> {
    const platforms = getSupportedMessagePlatforms();
    const pluginInfo: Record<string, any> = {};

    for (const platform of platforms) {
        pluginInfo[platform] = getMessagePluginInfo(platform);
    }

    return pluginInfo;
}

/**
 * 🔥 获取消息插件系统状态
 * @returns 系统状态信息
 */
export function getMessagePluginSystemStatus(): {
    supportedPlatforms: string[];
    totalPlugins: number;
    platformConfigs: Record<string, any>;
    features: {
        syncMessages: string[];
        sendMessage: string[];
        getUserList: string[];
    };
} {
    const supportedPlatforms = getSupportedMessagePlatforms();
    const platformConfigs = getAllMessagePlatformConfigs();
    
    // 统计各功能支持的平台
    const features = {
        syncMessages: supportedPlatforms, // 所有插件都必须支持同步
        sendMessage: supportedPlatforms,  // 所有插件都必须支持发送
        getUserList: supportedPlatforms.filter(platform => {
            // 这里可以根据实际插件实现情况过滤
            return true; // 暂时假设都支持
        })
    };

    return {
        supportedPlatforms,
        totalPlugins: supportedPlatforms.length,
        platformConfigs,
        features
    };
}

// ==================== 插件生命周期管理 ====================

/**
 * 🔥 消息插件管理器类
 */
export class MessagePluginManager {
    private plugins: Record<string, PluginMessage> = {};
    private tabManager: TabManager | null = null;

    constructor(tabManager?: TabManager) {
        if (tabManager) {
            this.tabManager = tabManager;
        }
    }

    /**
     * 设置TabManager实例
     */
    setTabManager(tabManager: TabManager): void {
        this.tabManager = tabManager;
    }

    /**
     * 初始化指定平台的插件
     */
    async initializePlugin(platform: string): Promise<boolean> {
        if (!this.tabManager) {
            console.error('❌ TabManager未设置，无法初始化插件');
            return false;
        }

        try {
            const plugin = await createMessagePlugin(platform, this.tabManager);
            if (plugin) {
                this.plugins[platform] = plugin;
                console.log(`✅ ${platform} 消息插件已初始化`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ 初始化 ${platform} 插件失败:`, error);
            return false;
        }
    }

    /**
     * 获取指定平台的插件实例
     */
    getPlugin(platform: string): PluginMessage | null {
        return this.plugins[platform] || null;
    }

    /**
     * 检查插件是否已初始化
     */
    isPluginInitialized(platform: string): boolean {
        return platform in this.plugins;
    }

    /**
     * 获取所有已初始化的插件
     */
    getAllPlugins(): Record<string, PluginMessage> {
        return { ...this.plugins };
    }

    /**
     * 销毁指定平台的插件
     */
    async destroyPlugin(platform: string): Promise<void> {
        const plugin = this.plugins[platform];
        if (plugin) {
            try {
                if (plugin.destroy) {
                    await plugin.destroy();
                }
                delete this.plugins[platform];
                console.log(`✅ ${platform} 消息插件已销毁`);
            } catch (error) {
                console.error(`❌ 销毁 ${platform} 插件失败:`, error);
            }
        }
    }

    /**
     * 销毁所有插件
     */
    async destroyAllPlugins(): Promise<void> {
        const platforms = Object.keys(this.plugins);
        
        for (const platform of platforms) {
            await this.destroyPlugin(platform);
        }
        
        console.log('✅ 所有消息插件已销毁');
    }

    /**
     * 获取管理器状态
     */
    getManagerStatus(): {
        totalInitialized: number;
        initializedPlatforms: string[];
        availablePlatforms: string[];
    } {
        return {
            totalInitialized: Object.keys(this.plugins).length,
            initializedPlatforms: Object.keys(this.plugins),
            availablePlatforms: getSupportedMessagePlatforms()
        };
    }
}

// ==================== 默认导出 ====================

export default {
    // 插件类
    MESSAGE_PLUGINS,
    MESSAGE_PLUGIN_MAP,
    MESSAGE_PLATFORM_CONFIGS,
    
    // 核心功能
    getSupportedMessagePlatforms,
    getMessagePluginClass,
    isMessagePlatformSupported,
    getMessagePlatformConfig,
    getAllMessagePlatformConfigs,
    
    // 插件管理
    createMessagePlugin,
    createMultipleMessagePlugins,
    testMessagePlugin,
    testAllMessagePlugins,
    
    // 信息查询
    getMessagePluginInfo,
    getAllMessagePluginInfo,
    getMessagePluginSystemStatus,
    
    // 管理器类
    MessagePluginManager
};
