// src/main/plugins/login/tencent/WeChatLogin.ts
import {
    PluginLogin,
    LoginParams,
    LoginResult,
    PluginType
} from '../../../../types/pluginInterface';

export class WeChatLogin implements PluginLogin {
    public readonly platform = 'wechat';
    public readonly name = '微信视频号登录';
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
        //console.log('✅ 微信视频号登录插件初始化完成');
    }

    async destroy(): Promise<void> {
        // 清理所有等待中的登录
        for (const [userId, pending] of this.pendingLogins) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('插件正在销毁'));
        }
        this.pendingLogins.clear();
        //console.log('🧹 微信视频号登录插件已销毁');
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始微信视频号登录流程: ${params.userId}`);

            // 创建标签页
            const tabId = await this.tabManager.createTab(
                `微信登录_${params.userId}`,
                'wechat',
                'https://channels.weixin.qq.com'
            );

            console.log(`📱 微信登录标签页已创建: ${tabId}`);

            // 🔥 等待页面加载并获取二维码（复用 Python 验证的逻辑）
            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                await this.tabManager.closeTab(tabId);
                return {
                    success: false,
                    error: '未找到登录二维码'
                };
            }

            console.log(`🔍 微信登录二维码已找到`);

            return {
                success: true,
                qrCodeUrl: qrCodeUrl,
                tabId: tabId
            };

        } catch (error) {
            console.error('❌ 微信登录启动失败:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : '登录启动失败'
            };
        }
    }

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
            console.log(`🚫 微信登录已取消: ${tabId}`);

        } catch (error) {
            console.error('❌ 取消登录失败:', error);
        }
    }

    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找微信登录二维码...');
        //await new Promise(resolve => setTimeout(resolve, 500));
        const qrCodeScript = `
            new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 60;
                
                const checkIframe = () => {
                    console.log('🔍 查找iframe (' + (attempts + 1) + '/' + maxAttempts + ')');
                    
                    // 查找iframe元素
                    const iframe = document.querySelector('iframe.display');
                    if (!iframe) {
                        console.log('❌ 未找到iframe');
                        attempts++;
                        if (attempts >= maxAttempts) {
                            resolve(null);
                            return;
                        }
                        setTimeout(checkIframe, 100);
                        return;
                    }
                    
                    console.log('✅ 找到iframe:', iframe.src);
                    
                    try {
                        // 🔥 尝试访问iframe内容
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        
                        if (!iframeDoc) {
                            console.log('❌ 无法访问iframe内容 (跨域限制)');
                            resolve(null);
                            return;
                        }
                        
                        // 在iframe内查找二维码
                        const qrSelectors = [
                            'img.qrcode',
                            '.qrcode-wrap img',
                            '.qrcode-area img',
                            'img[src^="data:image/png;base64"]'
                        ];
                        
                        for (const selector of qrSelectors) {
                            const img = iframeDoc.querySelector(selector);
                            if (img && img.src && img.src.startsWith('data:image/png;base64') && img.src.length > 1000) {
                                console.log('✅ 在iframe中找到二维码');
                                resolve(img.src);
                                return;
                            }
                        }
                        
                        console.log('⏳ iframe内容已加载但未找到二维码');
                        
                    } catch (error) {
                        console.log('❌ 访问iframe失败:', error.message);
                        resolve(null);
                        return;
                    }
                    
                    attempts++;
                    if (attempts >= maxAttempts) {
                        resolve(null);
                        return;
                    }
                    
                    setTimeout(checkIframe, 100);
                };
                
                checkIframe();
            })
        `;
        // 🔥 等待二维码出现，最多尝试 20 次
        let attempts = 0;
        while (attempts < 30) {
            try {
                const qrCodeUrl = await this.tabManager.executeScript(tabId, qrCodeScript);
                if (qrCodeUrl) {
                    return qrCodeUrl;
                }
            } catch (error) {
                console.warn(`二维码查找失败 (尝试 ${attempts + 1}):`, error);
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        return null;
    }
}