// src/main/plugins/login/xiaohongshu/XiaohongshuLogin.ts
import {
    PluginLogin,
    LoginParams,
    LoginResult,
    PluginType
} from '../../../../types/pluginInterface';

export class XiaohongshuLogin implements PluginLogin {
    public readonly platform = 'xiaohongshu';
    public readonly name = '小红书登录';
    public readonly type = PluginType.LOGIN;

    private tabManager!: any;  // TabManager 实例
    private pendingLogins: Map<string, {
        tabId: string;
        resolve: (result: LoginResult) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    async init(tabManager: any): Promise<void> {
        this.tabManager = tabManager;
        console.log('✅ 小红书登录插件初始化完成');
    }

    async destroy(): Promise<void> {
        // 清理所有等待中的登录
        for (const [userId, pending] of this.pendingLogins) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('插件正在销毁'));
        }
        this.pendingLogins.clear();
        console.log('🧹 小红书登录插件已销毁');
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始小红书登录流程: ${params.userId}`);

            // 创建标签页
            const tabId = await this.tabManager.createAccountTab(
                `小红书登录_${params.userId}`,
                'xiaohongshu',
                'https://creator.xiaohongshu.com/'
            );

            console.log(`📱 小红书登录标签页已创建: ${tabId}`);


            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                await this.tabManager.closeTab(tabId);
                return {
                    success: false,
                    error: '未找到登录二维码'
                };
            }

            console.log(`🔍 小红书登录二维码已找到`);

            return {
                success: true,
                qrCodeUrl: qrCodeUrl,
                tabId: tabId
            };

        } catch (error) {
            console.error('❌ 小红书登录启动失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '登录启动失败'
            };
        }
    }


    /**
     * 🔥 取消登录
     */
    async cancelLogin(tabId: string): Promise<void> {
        try {
            // 找到对应的等待中登录
            let userIdToCancel = null;
            for (const [userId, pending] of this.pendingLogins) {
                if (pending.tabId === tabId) {
                    userIdToCancel = userId;
                    break;
                }
            }

            if (userIdToCancel) {
                const pending = this.pendingLogins.get(userIdToCancel);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingLogins.delete(userIdToCancel);

                    pending.resolve({
                        success: false,
                        error: '用户取消登录'
                    });
                }
            }

            // 关闭标签页
            await this.tabManager.closeTab(tabId);
            console.log(`🚫 小红书登录已取消: ${tabId}`);

        } catch (error) {
            console.error('❌ 取消登录失败:', error);
        }
    }

    /**
     * 🔥 获取二维码（复用 Python 验证的逻辑）
     */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找小红书登录二维码...');

        const qrCodeScript = `
            (function() {
                // 🔥 使用 Python 验证的选择器：iframe img
                document.querySelector("img.css-wemwzq").click();
                const element = document.querySelector('img:nth-of-type(2)');
                if (element && element.src) {
                    console.log('找到小红书二维码:', element.src);
                    return element.src;
                }
                
                console.log('未找到小红书二维码');
                return null;
            })()
        `;

        // 🔥 等待二维码出现，最多尝试 20 次
        let attempts = 0;
        while (attempts < 20) {
            try {
                const qrCodeUrl = await this.tabManager.executeScript(tabId, qrCodeScript);
                if (qrCodeUrl) {
                    return qrCodeUrl;
                }
            } catch (error) {
                console.warn(`二维码查找失败 (尝试 ${attempts + 1}):`, error);
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return null;
    }
}