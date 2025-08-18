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
        //console.log('✅ 小红书登录插件初始化完成');
    }

    async destroy(): Promise<void> {
        // 清理所有等待中的登录
        for (const [userId, pending] of this.pendingLogins) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('插件正在销毁'));
        }
        this.pendingLogins.clear();
        //console.log('🧹 小红书登录插件已销毁');
    }

    /**
     * 🔥 开始登录流程 - 获取二维码
     */
    async startLogin(params: LoginParams): Promise<LoginResult> {
        try {
            console.log(`🔐 开始小红书登录流程: ${params.userId}`);

            // 创建标签页
            const tabId = await this.tabManager.createTab(
                `小红书登录_${params.userId}`,
                'xiaohongshu',
                'https://www.xiaohongshu.com/login'
            );

            console.log(`📱 小红书登录标签页已创建: ${tabId}`);


            const qrCodeUrl = await this.getQRCode(tabId);

            if (!qrCodeUrl) {
                //await this.tabManager.closeTab(tabId);
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
     * 🔥 获取二维码
     */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找小红书登录二维码...');

        const qrCodeScript = `
            (async function() {
                console.log('🔍 开始查找小红书二维码...');
                
                // 直接查找二维码图片
                const qrImage = document.querySelector('.qrcode-img');
                
                if (qrImage && qrImage.src) {
                    console.log('✅ 找到二维码图片');
                    console.log('📏 图片尺寸:', qrImage.offsetWidth + 'x' + qrImage.offsetHeight);
                    
                    // 检查是否是base64格式的二维码
                    if (qrImage.src.startsWith('data:image/')) {
                        console.log('✅ 确认是base64格式的二维码');
                        return qrImage.src;
                    } else {
                        console.log('⚠️ 不是base64格式，返回URL:', qrImage.src.substring(0, 100));
                        return qrImage.src;
                    }
                } else {
                    console.log('❌ 未找到 .qrcode-img 元素');
                    
                    // 备选方案：查找父容器内的图片
                    const qrContainer = document.querySelector('.qrcode');
                    if (qrContainer) {
                        console.log('🔍 找到二维码容器，查找内部图片...');
                        const imgInContainer = qrContainer.querySelector('img');
                        if (imgInContainer && imgInContainer.src) {
                            console.log('✅ 在容器内找到图片');
                            return imgInContainer.src;
                        }
                    }
                    
                    console.log('❌ 完全未找到二维码');
                    return null;
                }
            })()
        `;

        try {
            const qrCodeUrl = await this.tabManager.executeScript(tabId, qrCodeScript);
            return qrCodeUrl;
        } catch (error) {
            console.warn('二维码获取失败:', error);
            return null;
        }
    }
    /*
    private async getQRCode_creatorPage(tabId: string): Promise<string | null> {
        console.log('🔍 查找小红书登录二维码...');

        const qrCodeScript = `
            (async function() {
                // 1. 点击登录按钮
                const clickElement = document.querySelector("img.css-wemwzq");
                if (!clickElement) {
                    console.log('未找到登录按钮');
                    return null;
                }
                
                console.log('点击登录按钮...');
                clickElement.click();
                
                // 2. 等待二维码出现，最多等待10秒
                for (let i = 0; i < 20; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // 查找二维码图片 - 160x160的正方形图片
                    const qrImage = document.querySelector('img.css-1lhmg90');
                    if (qrImage && qrImage.src) {
                        console.log('找到小红书二维码:', qrImage.src.substring(0, 100));
                        return qrImage.src;
                    }
                    
                    // 备选方案：查找所有新出现的大尺寸正方形图片
                    const allImages = document.querySelectorAll('img');
                    for (const img of allImages) {
                        if (img.className.includes('css-wemwzq')) continue; // 跳过按钮
                        
                        const width = img.offsetWidth;
                        const height = img.offsetHeight;
                        
                        // 查找大于100px的正方形图片
                        if (width > 100 && Math.abs(width - height) < 20 && img.src) {
                            console.log('通过尺寸找到二维码:', img.src.substring(0, 100));
                            return img.src;
                        }
                    }
                }
                
                console.log('10秒内未找到二维码');
                return null;
            })()
        `;

        try {
            const qrCodeUrl = await this.tabManager.executeScript(tabId, qrCodeScript);
            return qrCodeUrl;
        } catch (error) {
            console.warn('二维码获取失败:', error);
            return null;
        }
            
    }*/
        
}