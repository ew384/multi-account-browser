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
     * 🔥 获取二维码（增强版 - 多种备选方案 + 等待机制）
     */
    private async getQRCode(tabId: string): Promise<string | null> {
        console.log('🔍 查找小红书登录二维码...');

        const qrCodeScript = `
            (async function() {
                console.log('🔍 开始查找小红书二维码...');
                
                // 等待页面加载完成 - 重试机制，最多等待30秒
                console.log('⏳ 等待页面加载完成...');
                
                for (let waitAttempt = 1; waitAttempt <= 15; waitAttempt++) {
                    console.log('🔄 等待尝试第 ' + waitAttempt + '/15 次...');
                    
                    // 方案1: 直接查找 .qrcode-img 类的图片（主要方案）
                    console.log('🔍 方案1：查找 .qrcode-img 类的图片...');
                    const qrImage = document.querySelector('.qrcode-img');
                    
                    if (qrImage && qrImage.src) {
                        console.log('✅ 方案1成功：找到 .qrcode-img (第' + waitAttempt + '次尝试)');
                        console.log('📏 图片尺寸:', qrImage.offsetWidth + 'x' + qrImage.offsetHeight);
                        
                        if (qrImage.src.startsWith('data:image/')) {
                            console.log('✅ 方案1确认：base64格式的二维码');
                            return qrImage.src;
                        }
                    } else {
                        console.log('❌ 方案1失败：未找到 .qrcode-img (第' + waitAttempt + '次尝试)');
                    }
                    
                    // 方案2: 查找 .qrcode 容器内的图片
                    console.log('🔍 方案2：查找 .qrcode 容器内的图片...');
                    const qrContainer = document.querySelector('.qrcode');
                    if (qrContainer) {
                        console.log('✅ 找到 .qrcode 容器 (第' + waitAttempt + '次尝试)');
                        const imgInContainer = qrContainer.querySelector('img');
                        if (imgInContainer && imgInContainer.src && imgInContainer.src.startsWith('data:image/')) {
                            console.log('✅ 方案2成功：在容器内找到base64图片');
                            return imgInContainer.src;
                        }
                    }
                    console.log('❌ 方案2失败 (第' + waitAttempt + '次尝试)');
                    
                    // 方案3: 通过尺寸查找正方形二维码图片
                    console.log('🔍 方案3：通过尺寸查找正方形图片...');
                    const allImages = document.querySelectorAll('img');
                    
                    for (let i = 0; i < allImages.length; i++) {
                        const img = allImages[i];
                        const width = img.offsetWidth || img.naturalWidth;
                        const height = img.offsetHeight || img.naturalHeight;
                        
                        // 查找大于100px的正方形base64图片
                        if (width > 100 && Math.abs(width - height) < 20 && img.src && img.src.startsWith('data:image/')) {
                            console.log('✅ 方案3成功：找到正方形base64图片', width + 'x' + height + ' (第' + waitAttempt + '次尝试)');
                            return img.src;
                        }
                    }
                    console.log('❌ 方案3失败 (第' + waitAttempt + '次尝试)');
                    
                    // 方案4: 通过类名关键词查找
                    console.log('🔍 方案4：通过类名关键词查找...');
                    for (let i = 0; i < allImages.length; i++) {
                        const img = allImages[i];
                        const className = img.className.toLowerCase();
                        
                        if ((className.includes('qr') || className.includes('code')) && 
                            img.src && img.src.startsWith('data:image/')) {
                            console.log('✅ 方案4成功：找到关键词匹配的base64图片 (第' + waitAttempt + '次尝试)');
                            return img.src;
                        }
                    }
                    console.log('❌ 方案4失败 (第' + waitAttempt + '次尝试)');
                    
                    // 方案5: 查找所有base64图片中最可能的二维码
                    console.log('🔍 方案5：在所有base64图片中查找二维码...');
                    const base64Images = [];
                    
                    for (let i = 0; i < allImages.length; i++) {
                        const img = allImages[i];
                        if (img.src && img.src.startsWith('data:image/')) {
                            const width = img.offsetWidth || img.naturalWidth;
                            const height = img.offsetHeight || img.naturalHeight;
                            
                            base64Images.push({
                                img: img,
                                width: width,
                                height: height,
                                isSquare: Math.abs(width - height) < 20,
                                isBig: width > 100 && height > 100,
                                className: img.className
                            });
                        }
                    }
                    
                    console.log('🔍 找到 ' + base64Images.length + ' 个base64图片 (第' + waitAttempt + '次尝试)');
                    
                    // 优先选择大的正方形图片
                    for (let candidate of base64Images) {
                        if (candidate.isSquare && candidate.isBig) {
                            console.log('✅ 方案5成功：选择大正方形base64图片', candidate.width + 'x' + candidate.height + ' (第' + waitAttempt + '次尝试)');
                            return candidate.img.src;
                        }
                    }
                    
                    // 其次选择正方形图片
                    for (let candidate of base64Images) {
                        if (candidate.isSquare) {
                            console.log('✅ 方案5备选：选择正方形base64图片', candidate.width + 'x' + candidate.height + ' (第' + waitAttempt + '次尝试)');
                            return candidate.img.src;
                        }
                    }
                    
                    console.log('❌ 方案5失败 (第' + waitAttempt + '次尝试)');
                    
                    // 如果这不是最后一次尝试，等待2秒再重试
                    if (waitAttempt < 15) {
                        console.log('⏳ 等待2秒后进行第 ' + (waitAttempt + 1) + ' 次尝试...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                
                // 所有尝试都失败
                console.log('❌ 等待30秒后所有方案都失败，未找到二维码');
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
    }

        
}