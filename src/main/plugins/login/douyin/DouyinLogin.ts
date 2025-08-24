// src/main/plugins/login/douyin/DouyinLogin.ts
import {
    PluginLogin,
    LoginParams,
    LoginResult,
    PluginType
} from '../../../../types/pluginInterface';

export class DouyinLogin implements PluginLogin {
    public readonly platform = 'douyin';
    public readonly name = '抖音登录';
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
        //console.log('✅ 抖音登录插件初始化完成');
    }

    async destroy(): Promise<void> {
        // 清理所有等待中的登录
        for (const [userId, pending] of this.pendingLogins) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('插件正在销毁'));
        }
        this.pendingLogins.clear();
        //console.log('🧹 抖音登录插件已销毁');
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始抖音登录流程: ${params.userId}`);

            // 创建标签页
            const tabId = await this.tabManager.createTab(
                `抖音登录_${params.userId}`,
                'douyin',
                'https://creator.douyin.com/'
            );

            console.log(`📱 抖音登录标签页已创建: ${tabId}`);


            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                await this.tabManager.closeTab(tabId);
                return {
                    success: false,
                    error: '未找到登录二维码'
                };
            }

            console.log(`🔍 抖音登录二维码已找到`);

            return {
                success: true,
                qrCodeUrl: qrCodeUrl,
                tabId: tabId
            };

        } catch (error) {
            console.error('❌ 抖音登录启动失败:', error);
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
            console.log(`🚫 抖音登录已取消: ${tabId}`);

        } catch (error) {
            console.error('❌ 取消登录失败:', error);
        }
    }
    /**
     * 🔥 获取二维码
     * https://www.douyin.com/?recommend=1
     
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找抖音登录二维码...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const qrCodeScript = `
            (function() {
                // 方法1: 查找扫码登录容器中的二维码图片
                const qrCodeImg1 = document.querySelector('#douyin_login_comp_scan_code img[src^="data:image/png;base64"]');
                if (qrCodeImg1 && qrCodeImg1.src) {
                    console.log('✅ 找到抖音二维码 (扫码登录容器):', qrCodeImg1.src.substring(0, 50) + '...');
                    return qrCodeImg1.src;
                }
                
                // 方法2: 查找动画二维码容器中的图片
                const qrCodeImg2 = document.querySelector('#animate_qrcode_container img[src^="data:image/png;base64"]');
                if (qrCodeImg2 && qrCodeImg2.src) {
                    console.log('✅ 找到抖音二维码 (动画容器):', qrCodeImg2.src.substring(0, 50) + '...');
                    return qrCodeImg2.src;
                }
                
                console.log('❌ 未找到抖音二维码');
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
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return null;
    }*/

    /**
     * 🔥 获取二维码
     * 'https://creator.douyin.com/'
    */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找抖音登录二维码...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const qrCodeScript = `
            (function() {
                const element = document.querySelector('img[aria-label="二维码"]');
                if (element && element.src) {
                    console.log('✅ 找到抖音二维码 (aria-label):', element.src);
                    return element.src;
                }
                console.log('❌ 未找到抖音二维码 (aria-label)');
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
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return null;
    }
    
}