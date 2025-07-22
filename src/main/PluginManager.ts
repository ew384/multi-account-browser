// src/main/PluginManager.ts

import { TabManager } from './TabManager';
import {
    PluginUploader,
    PluginLogin,
    PluginValidator,
    BasePlugin,
    PluginType,
    PluginRegistration
} from '../types/pluginInterface';

// 导入具体的插件实现
// 上传插件
import { WeChatVideoUploader } from './plugins/uploader/tencent/main';
// TODO: 导入其他上传插件
// import { DouyinVideoUploader } from './plugins/uploader/douyin/main';
// import { XiaohongshuVideoUploader } from './plugins/uploader/xiaohongshu/main';
// import { KuaishouVideoUploader } from './plugins/uploader/kuaishou/main';

// 登录插件
import { WeChatLogin } from './plugins/login/tencent/WeChatLogin';
// TODO: 导入其他登录插件
// import { DouyinLogin } from './plugins/login/douyin/DouyinLogin';
// import { XiaohongshuLogin } from './plugins/login/xiaohongshu/XiaohongshuLogin';
// import { KuaishouLogin } from './plugins/login/kuaishou/KuaishouLogin';

/**
 * 插件管理器
 * 负责注册、管理和调度所有类型的插件
 */
export class PluginManager {
    private tabManager: TabManager;

    // 分类存储不同类型的插件
    private uploaderPlugins: Map<string, PluginUploader> = new Map();
    private loginPlugins: Map<string, PluginLogin> = new Map();
    private validatorPlugins: Map<string, PluginValidator> = new Map();

    // 所有已注册插件的统一注册表
    private allPlugins: Map<string, PluginRegistration> = new Map();

    // 插件初始化状态
    private initializationStatus: Map<string, 'pending' | 'success' | 'failed'> = new Map();

    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
    }

    /**
     * 🔥 初始化所有插件
     * 在应用启动时调用
     */
    async initializeAllPlugins(): Promise<void> {
        console.log(`🔌 PluginManager: 开始初始化所有插件...`);

        try {
            // 注册上传插件
            await this.registerUploaderPlugins();

            // 注册登录插件
            await this.registerLoginPlugins();

            // 注册验证插件（如果有的话）
            await this.registerValidatorPlugins();

            console.log(`✅ PluginManager: 所有插件初始化完成`);
            console.log(`   上传插件: ${this.uploaderPlugins.size} 个`);
            console.log(`   登录插件: ${this.loginPlugins.size} 个`);
            console.log(`   验证插件: ${this.validatorPlugins.size} 个`);

        } catch (error) {
            console.error(`❌ PluginManager: 插件初始化失败:`, error);
            throw error;
        }
    }

    /**
     * 🔥 注册上传插件
     */
    private async registerUploaderPlugins(): Promise<void> {
        console.log(`📤 注册上传插件...`);

        const uploaders: PluginUploader[] = [
            new WeChatVideoUploader(),
            // TODO: 添加其他平台的上传插件
            // new DouyinVideoUploader(),
            // new XiaohongshuVideoUploader(),
            // new KuaishouVideoUploader()
        ];

        for (const uploader of uploaders) {
            try {
                await this.registerUploaderPlugin(uploader);
            } catch (error) {
                console.error(`❌ 注册上传插件失败 ${uploader.platform}:`, error);
            }
        }
    }

    /**
     * 🔥 注册登录插件
     */
    private async registerLoginPlugins(): Promise<void> {
        console.log(`🔐 注册登录插件...`);

        const logins: PluginLogin[] = [
            new WeChatLogin(),
            // TODO: 添加其他平台的登录插件
            // new DouyinLogin(),
            // new XiaohongshuLogin(),
            // new KuaishouLogin()
        ];

        for (const login of logins) {
            try {
                await this.registerLoginPlugin(login);
            } catch (error) {
                console.error(`❌ 注册登录插件失败 ${login.platform}:`, error);
            }
        }
    }

    /**
     * 🔥 注册验证插件
     */
    private async registerValidatorPlugins(): Promise<void> {
        console.log(`🔍 注册验证插件...`);

        // TODO: 如果有验证插件的话
        // const validators: PluginValidator[] = [];
        // for (const validator of validators) {
        //     await this.registerValidatorPlugin(validator);
        // }
    }

    /**
     * 🔥 注册单个上传插件
     */
    async registerUploaderPlugin(plugin: PluginUploader): Promise<void> {
        const key = `uploader_${plugin.platform}`;

        try {
            this.initializationStatus.set(key, 'pending');

            // 初始化插件
            await plugin.init(this.tabManager);

            // 注册到分类存储
            this.uploaderPlugins.set(plugin.platform, plugin);

            // 注册到统一注册表
            this.allPlugins.set(key, {
                type: PluginType.UPLOADER,
                platform: plugin.platform,
                plugin: plugin
            });

            this.initializationStatus.set(key, 'success');
            console.log(`✅ 上传插件已注册: ${plugin.platform} (${plugin.name})`);

        } catch (error) {
            this.initializationStatus.set(key, 'failed');
            console.error(`❌ 上传插件注册失败 ${plugin.platform}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 注册单个登录插件
     */
    async registerLoginPlugin(plugin: PluginLogin): Promise<void> {
        const key = `login_${plugin.platform}`;

        try {
            this.initializationStatus.set(key, 'pending');

            // 初始化插件
            await plugin.init(this.tabManager);

            // 注册到分类存储
            this.loginPlugins.set(plugin.platform, plugin);

            // 注册到统一注册表
            this.allPlugins.set(key, {
                type: PluginType.LOGIN,
                platform: plugin.platform,
                plugin: plugin
            });

            this.initializationStatus.set(key, 'success');
            console.log(`✅ 登录插件已注册: ${plugin.platform} (${plugin.name})`);

        } catch (error) {
            this.initializationStatus.set(key, 'failed');
            console.error(`❌ 登录插件注册失败 ${plugin.platform}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 注册单个验证插件
     */
    async registerValidatorPlugin(plugin: PluginValidator): Promise<void> {
        const key = `validator_${plugin.platform}`;

        try {
            this.initializationStatus.set(key, 'pending');

            // 初始化插件
            await plugin.init(this.tabManager);

            // 注册到分类存储
            this.validatorPlugins.set(plugin.platform, plugin);

            // 注册到统一注册表
            this.allPlugins.set(key, {
                type: PluginType.VALIDATOR,
                platform: plugin.platform,
                plugin: plugin
            });

            this.initializationStatus.set(key, 'success');
            console.log(`✅ 验证插件已注册: ${plugin.platform} (${plugin.name})`);

        } catch (error) {
            this.initializationStatus.set(key, 'failed');
            console.error(`❌ 验证插件注册失败 ${plugin.platform}:`, error);
            throw error;
        }
    }

    // ================================
    // 获取插件的方法
    // ================================

    /**
     * 🔥 获取上传插件
     */
    getUploader(platform: string): PluginUploader | null {
        return this.uploaderPlugins.get(platform) || null;
    }

    /**
     * 🔥 获取登录插件
     */
    getLogin(platform: string): PluginLogin | null {
        return this.loginPlugins.get(platform) || null;
    }

    /**
     * 🔥 获取验证插件
     */
    getValidator(platform: string): PluginValidator | null {
        return this.validatorPlugins.get(platform) || null;
    }

    /**
     * 🔥 获取任意类型的插件
     */
    getPlugin(type: PluginType, platform: string): BasePlugin | null {
        const key = `${type}_${platform}`;
        const registration = this.allPlugins.get(key);
        return registration ? registration.plugin : null;
    }

    // ================================
    // 查询和状态方法
    // ================================

    /**
     * 🔥 获取支持上传的平台列表
     */
    getSupportedPlatforms(): string[] {
        return Array.from(this.uploaderPlugins.keys());
    }

    /**
     * 🔥 获取支持登录的平台列表
     */
    getSupportedLoginPlatforms(): string[] {
        return Array.from(this.loginPlugins.keys());
    }

    /**
     * 🔥 获取支持验证的平台列表
     */
    getSupportedValidatorPlatforms(): string[] {
        return Array.from(this.validatorPlugins.keys());
    }

    /**
     * 🔥 获取所有支持的平台（去重）
     */
    getAllSupportedPlatforms(): string[] {
        const allPlatforms = new Set([
            ...this.getSupportedPlatforms(),
            ...this.getSupportedLoginPlatforms(),
            ...this.getSupportedValidatorPlatforms()
        ]);
        return Array.from(allPlatforms);
    }

    /**
     * 🔥 检查平台是否支持指定功能
     */
    isPlatformSupported(platform: string, type?: PluginType): boolean {
        if (!type) {
            // 检查是否支持任意功能
            return this.uploaderPlugins.has(platform) ||
                this.loginPlugins.has(platform) ||
                this.validatorPlugins.has(platform);
        }

        switch (type) {
            case PluginType.UPLOADER:
                return this.uploaderPlugins.has(platform);
            case PluginType.LOGIN:
                return this.loginPlugins.has(platform);
            case PluginType.VALIDATOR:
                return this.validatorPlugins.has(platform);
            default:
                return false;
        }
    }

    /**
     * 🔥 获取平台插件信息
     */
    getPlatformInfo(platform: string): {
        platform: string;
        uploader?: { name: string, status: string };
        login?: { name: string, status: string };
        validator?: { name: string, status: string };
    } | null {
        const uploaderKey = `uploader_${platform}`;
        const loginKey = `login_${platform}`;
        const validatorKey = `validator_${platform}`;

        const hasAnyPlugin = this.uploaderPlugins.has(platform) ||
            this.loginPlugins.has(platform) ||
            this.validatorPlugins.has(platform);

        if (!hasAnyPlugin) {
            return null;
        }

        const info: any = { platform };

        const uploader = this.uploaderPlugins.get(platform);
        if (uploader) {
            info.uploader = {
                name: uploader.name,
                status: this.initializationStatus.get(uploaderKey) || 'unknown'
            };
        }

        const login = this.loginPlugins.get(platform);
        if (login) {
            info.login = {
                name: login.name,
                status: this.initializationStatus.get(loginKey) || 'unknown'
            };
        }

        const validator = this.validatorPlugins.get(platform);
        if (validator) {
            info.validator = {
                name: validator.name,
                status: this.initializationStatus.get(validatorKey) || 'unknown'
            };
        }

        return info;
    }

    /**
     * 🔥 获取所有插件的状态总览
     */
    getPluginStatusOverview(): {
        total: number;
        byType: Record<PluginType, number>;
        byStatus: Record<'success' | 'failed' | 'pending', number>;
        platforms: string[];
        details: Array<{
            key: string;
            type: PluginType;
            platform: string;
            name: string;
            status: 'success' | 'failed' | 'pending' | 'unknown';
        }>;
    } {
        const details: Array<{
            key: string;
            type: PluginType;
            platform: string;
            name: string;
            status: 'success' | 'failed' | 'pending' | 'unknown';
        }> = [];

        const byType: Record<PluginType, number> = {
            [PluginType.UPLOADER]: 0,
            [PluginType.LOGIN]: 0,
            [PluginType.VALIDATOR]: 0,
            [PluginType.DOWNLOADER]: 0
        };

        const byStatus: Record<'success' | 'failed' | 'pending', number> = {
            success: 0,
            failed: 0,
            pending: 0
        };

        for (const [key, registration] of this.allPlugins.entries()) {
            const plugin = registration.plugin;
            const status = this.initializationStatus.get(key) || 'unknown';

            details.push({
                key,
                type: registration.type,
                platform: registration.platform,
                name: plugin.name,
                status: status as any
            });

            byType[registration.type]++;

            if (status === 'success' || status === 'failed' || status === 'pending') {
                byStatus[status]++;
            }
        }

        return {
            total: this.allPlugins.size,
            byType,
            byStatus,
            platforms: this.getAllSupportedPlatforms(),
            details
        };
    }

    /**
     * 🔥 重新初始化失败的插件
     */
    async retryFailedPlugins(): Promise<void> {
        console.log(`🔄 PluginManager: 重新初始化失败的插件...`);

        const failedPlugins = Array.from(this.initializationStatus.entries())
            .filter(([_, status]) => status === 'failed')
            .map(([key, _]) => key);

        if (failedPlugins.length === 0) {
            console.log(`✅ 没有需要重新初始化的插件`);
            return;
        }

        for (const key of failedPlugins) {
            try {
                const registration = this.allPlugins.get(key);
                if (!registration) continue;

                console.log(`🔄 重新初始化插件: ${key}`);

                this.initializationStatus.set(key, 'pending');
                await registration.plugin.init(this.tabManager);
                this.initializationStatus.set(key, 'success');

                console.log(`✅ 插件重新初始化成功: ${key}`);

            } catch (error) {
                this.initializationStatus.set(key, 'failed');
                console.error(`❌ 插件重新初始化失败 ${key}:`, error);
            }
        }
    }

    /**
     * 🔥 销毁所有插件（应用关闭时调用）
     */
    async destroyAllPlugins(): Promise<void> {
        console.log(`🗑️ PluginManager: 销毁所有插件...`);

        for (const [key, registration] of this.allPlugins.entries()) {
            try {
                if (registration.plugin.destroy) {
                    await registration.plugin.destroy();
                    console.log(`🗑️ 插件已销毁: ${key}`);
                }
            } catch (error) {
                console.error(`❌ 插件销毁失败 ${key}:`, error);
            }
        }

        // 清空所有注册表
        this.uploaderPlugins.clear();
        this.loginPlugins.clear();
        this.validatorPlugins.clear();
        this.allPlugins.clear();
        this.initializationStatus.clear();

        console.log(`✅ 所有插件已销毁`);
    }
}