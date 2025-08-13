// multi-account-browser/src/main/plugins/uploader/xiaohongshu/main.ts
import { PluginUploader, UploadParams, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';

export class XiaoHongShuVideoUploader implements PluginUploader {
    public readonly type = PluginType.UPLOADER;
    public readonly platform = 'xiaohongshu';
    public readonly name = 'XiaoHongShu Video Uploader';

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        //console.log(`✅ ${this.name} 初始化完成`);
    }

    private async uploadFile(filePath: string, tabId: string): Promise<void> {
        console.log('📤 上传文件到小红书...');

        try {
            // 步骤1：等待页面加载
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 步骤2：等待上传元素准备好
            const elementsReady = await this.waitForUploadElements(tabId);
            if (!elementsReady) {
                throw new Error('上传元素未准备好');
            }

            // 步骤3：🔥 使用TabManager流式上传（已验证可以成功传输）
            console.log('🌊 开始流式文件上传...');
            const success = await this.tabManager.setInputFilesStreaming(
                tabId,
                'input.upload-input',
                filePath,
                {
                    triggerSelector: '.upload-button',
                    waitForInput: true
                }
            );

            if (!success) {
                throw new Error('流式上传失败');
            }

            console.log('✅ 流式上传完成');

        } catch (error) {
            console.error('❌ 文件上传失败:', error);
            throw error;
        }
    }

    // 🔥 新增：等待上传元素准备好
    private async waitForUploadElements(tabId: string): Promise<boolean> {
        const waitScript = `
        new Promise((resolve) => {
            const timeout = 30000;
            const startTime = Date.now();
            
            const checkElements = () => {
                if (Date.now() - startTime > timeout) {
                    resolve(false);
                    return;
                }
                
                const fileInput = document.querySelector('input.upload-input');
                const uploadButton = document.querySelector('button.upload-button');
                const dragArea = document.querySelector('.drag-over');
                
                if (fileInput && uploadButton && dragArea) {
                    console.log('✅ 上传元素已准备好');
                    resolve(true);
                    return;
                }
                
                setTimeout(checkElements, 500);
            };
            
            checkElements();
        })
        `;

        const result = await this.tabManager.executeScript(tabId, waitScript);
        return Boolean(result);
    }


    // 🔥 修复版的等待上传成功方法
    private async waitForUploadSuccess(tabId: string): Promise<void> {
        console.log('⏳ 等待视频上传成功...');

        const waitScript = `
        new Promise((resolve, reject) => {
            const timeout = 500000; // 5分钟超时
            const startTime = Date.now();
            
            const checkUploadSuccess = async () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('等待上传成功超时'));
                    return;
                }

                try {
                    // 检查是否进入编辑状态（已经在前面实现了）
                    const titleInput = document.querySelector('.titleInput input, input[placeholder*="标题"], .d-text');
                    const editor = document.querySelector('.ql-editor');
                    
                    if (titleInput && editor) {
                        console.log('✅ 视频上传成功，已进入编辑状态');
                        resolve(true);
                        return;
                    }

                    // 检查是否有上传失败的错误信息
                    const errorMessages = document.querySelectorAll('[class*="error"], [class*="fail"]');
                    for (const errorEl of errorMessages) {
                        const errorText = errorEl.textContent || '';
                        if (errorText.includes('上传失败') || errorText.includes('无视频流')) {
                            console.log('❌ 检测到上传错误:', errorText);
                            reject(new Error(\`上传失败: \${errorText}\`));
                            return;
                        }
                    }
                    
                    setTimeout(checkUploadSuccess, 2000);
                } catch (e) {
                    console.log('检测过程出错:', e.message, '重新尝试...');
                    setTimeout(checkUploadSuccess, 1000);
                }
            };

            checkUploadSuccess();
        })
        `;

        await this.tabManager.executeScript(tabId, waitScript);
    }

    // 🔥 修复版的主要上传流程
    async uploadVideoComplete(params: UploadParams): Promise<{ success: boolean; tabId?: string }> {
        const headless = params.headless ?? true;
        let tabId: string | null = null;        
        
        try {
            console.log(`🎭 开始小红书视频完整上传流程... (${params.title})`);

            tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                'xiaohongshu',
                'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
                headless
            );

            // 🔥 1. 使用修复版的文件上传
            await this.uploadFile(params.filePath, tabId);

            // 🔥 2. 等待上传成功
            await this.waitForUploadSuccess(tabId);

            // 🔥 3. 填写标题和标签
            await this.fillTitleAndTags(params.title, params.tags, tabId);

            // 🔥 4. 设置定时发布（如果有）
            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate, tabId);
            }

            // 🔥 5. 点击发布
            await this.clickPublish(tabId, !!params.publishDate);

            return { success: true, tabId: tabId };
        } catch (error) {
            console.error('❌ 小红书视频上传流程失败:', error);
            throw error;
        }
        // 注意：不要在这里关闭tab，让AutomationEngine处理
    }

    private async fillTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
            console.log('📝 填写标题和标签...');

            const fillScript = `
            (async function() {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // 填写标题 - 使用测试验证过的选择器
                    const titleInput = document.querySelector('input[placeholder*="标题"]');
                    if (titleInput) {
                        // 聚焦输入框
                        titleInput.focus();
                        
                        // 清空并设置新值
                        titleInput.value = '';
                        titleInput.value = '${title.substring(0, 30)}';
                        
                        // 触发必要的事件
                        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
                        titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
                        
                        console.log('✅ 标题填充成功:', titleInput.value);
                    } else {
                        throw new Error('未找到标题输入框');
                    }

                    // 添加标签 - 使用测试验证过的方法
                    const tags = ${JSON.stringify(tags)};
                    if (tags.length > 0) {
                        const contentEditor = document.querySelector('.ql-editor');
                        if (contentEditor) {
                            contentEditor.focus();
                            
                            for (const tag of tags) {
                                const tagText = '#' + tag + ' ';
                                
                                // 使用 execCommand 输入标签文本
                                document.execCommand('insertText', false, tagText);
                                
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                            
                            console.log('✅ 标签添加成功，总共添加了', tags.length, '个标签');
                        } else {
                            console.warn('⚠️ 未找到内容编辑器');
                        }
                    }

                    return { success: true };
                } catch (e) {
                    console.error('❌ 标题标签填写失败:', e);
                    return { success: false, error: e.message };
                }
            })()
            `;

            const result = await this.tabManager.executeScript(tabId, fillScript);
            if (!result.success) {
                throw new Error(`标题标签填写失败: ${result.error}`);
            }
        }

    private async setScheduleTime(publishDate: Date, tabId: string): Promise<void> {
        console.log('⏰ 设置定时发布...');

        const scheduleScript = `
        (async function() {
            try {
                console.log('开始设置定时发布时间...');
                
                // 选择定时发布选项
                const scheduleLabel = document.querySelector('label:has-text("定时发布")');
                if (scheduleLabel) {
                    scheduleLabel.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('✅ 已选择定时发布');
                } else {
                    throw new Error('未找到定时发布选项');
                }

                // 格式化发布时间
                const publishDateHour = '${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-${String(publishDate.getDate()).padStart(2, '0')} ${String(publishDate.getHours()).padStart(2, '0')}:${String(publishDate.getMinutes()).padStart(2, '0')}';
                console.log('格式化时间:', publishDateHour);

                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 点击时间输入框
                const timeInput = document.querySelector('.el-input__inner[placeholder="选择日期和时间"]');
                if (timeInput) {
                    timeInput.click();
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // 全选并输入时间
                    const selectAllEvent = new KeyboardEvent('keydown', {
                        key: 'a',
                        ctrlKey: true,
                        bubbles: true
                    });
                    timeInput.dispatchEvent(selectAllEvent);

                    document.execCommand('insertText', false, publishDateHour);

                    // 按回车确认
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        keyCode: 13,
                        bubbles: true
                    });
                    timeInput.dispatchEvent(enterEvent);

                    console.log('✅ 定时发布设置成功:', publishDateHour);
                } else {
                    throw new Error('未找到时间输入框');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

                return { success: true };
            } catch (e) {
                console.error('❌ 定时发布设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, scheduleScript);
        if (!result.success) {
            throw new Error(`定时发布设置失败: ${result.error}`);
        }
    }

    private async clickPublish(tabId: string, isScheduled: boolean): Promise<void> {
        console.log('🚀 点击发布按钮...');

        const publishScript = `
        new Promise((resolve, reject) => {
            const timeout = 60000; // 1分钟超时
            const startTime = Date.now();
            const isScheduled = ${isScheduled};
            
            const tryPublish = async () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('发布按钮等待超时'));
                    return;
                }

                try {
                    // 根据是否定时发布选择不同的按钮文本
                    const buttonText = isScheduled ? '定时发布' : '发布';
                    const publishButton = document.querySelector(\`button:has-text("\${buttonText}")\`);
                    
                    if (publishButton && !publishButton.disabled) {
                        publishButton.click();
                        console.log(\`✅ 已点击\${buttonText}按钮\`);
                        
                        // 等待跳转到成功页面
                        const checkSuccess = () => {
                            if (window.location.href.includes('creator.xiaohongshu.com/publish/success')) {
                                console.log('✅ 视频发布成功');
                                resolve(true);
                            } else {
                                setTimeout(checkSuccess, 500);
                            }
                        };
                        
                        setTimeout(checkSuccess, 1000);
                        return;
                    }

                    console.log(\`📤 等待\${buttonText}按钮激活...\`);
                    setTimeout(tryPublish, 500);
                } catch (e) {
                    console.log('发布过程出错:', e.message, '重新尝试...');
                    setTimeout(tryPublish, 500);
                }
            };

            tryPublish();
        })
        `;

        await this.tabManager.executeScript(tabId, publishScript);
        console.log('✅ 小红书视频发布流程完成');
    }

    private async setLocation(tabId: string, location: string = "青岛市"): Promise<void> {
        console.log('📍 设置地理位置...');

        const locationScript = `
        (async function() {
            try {
                console.log('开始设置位置:', '${location}');
                
                // 点击地点输入框
                console.log('等待地点输入框加载...');
                const locElement = document.querySelector('div.d-text.d-select-placeholder.d-text-ellipsis.d-text-nowrap');
                if (!locElement) {
                    throw new Error('未找到地点输入框');
                }
                
                await locElement.click();
                console.log('点击地点输入框完成');
                
                // 输入位置名称
                console.log('等待1秒后输入位置名称:', '${location}');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                document.execCommand('insertText', false, '${location}');
                console.log('位置名称输入完成:', '${location}');
                
                // 等待下拉列表加载
                console.log('等待下拉列表加载...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // 尝试定位包含位置名称的选项
                console.log('尝试定位包含位置的选项...');
                const flexibleXpath = \`//div[contains(@class, "d-popover") and contains(@class, "d-dropdown")]//div[contains(@class, "d-options-wrapper")]//div[contains(@class, "d-grid") and contains(@class, "d-options")]//div[contains(@class, "name") and text()="\${location}"]\`;
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // 查找选项元素
                const locationOption = document.evaluate(
                    flexibleXpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;
                
                if (locationOption) {
                    console.log('定位成功，准备点击');
                    locationOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(resolve => setTimeout(resolve, 500));
                    locationOption.click();
                    console.log('成功选择位置:', '${location}');
                    return { success: true };
                } else {
                    console.warn('未找到匹配的位置选项');
                    return { success: false, error: '未找到匹配的位置选项' };
                }
                
            } catch (e) {
                console.error('设置位置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, locationScript);
        if (!result.success) {
            console.warn(`⚠️ 地理位置设置失败: ${result.error}`);
        }
    }

    async getAccountInfo(tabId: string): Promise<any> {
        const extractScript = `
        (async function extractXiaohongshuInfo() {
            try {
                console.log('🔍 开始提取小红书账号信息...');
                console.log('当前页面URL:', window.location.href);
                
                // 🔥 等待页面关键元素加载完成
                console.log('⏳ 等待页面关键元素加载...');
                
                let retryCount = 0;
                const maxRetries = 30; // 最多等待30秒
                
                while (retryCount < maxRetries) {
                    // 检查关键元素是否已加载
                    const userAvatar = document.querySelector('.user_avatar');
                    const accountName = document.querySelector('.account-name');
                    const othersContainer = document.querySelector('.others');
                    
                    if (userAvatar && accountName && othersContainer) {
                        console.log('✅ 关键元素已加载完成');
                        break;
                    }
                    
                    console.log(\`📍 等待关键元素加载... (\${retryCount + 1}/\${maxRetries})\`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retryCount++;
                }
                
                if (retryCount >= maxRetries) {
                    console.warn('⚠️ 等待超时，但继续尝试提取...');
                }
                
                // 提取头像URL - 适配创作者页面
                let avatar = null;
                
                // 优先使用 user_avatar 类名的图片
                const userAvatarImg = document.querySelector('.user_avatar');
                if (userAvatarImg && userAvatarImg.src) {
                    avatar = userAvatarImg.src;
                    console.log('✅ 找到user_avatar头像:', avatar);
                } else {
                    // 备选方案：查找第一个头像图片
                    const avatarImg = document.querySelector('.avatar img, img[src*="avatar"]');
                    if (avatarImg && avatarImg.src) {
                        avatar = avatarImg.src;
                        console.log('✅ 找到备选头像:', avatar);
                    }
                }
                
                // 提取账号名称
                const accountNameEl = document.querySelector('.account-name');
                const accountName = accountNameEl ? accountNameEl.textContent.trim() : null;
                console.log('账号名称:', accountName);
                
                // 提取小红书账号ID
                const othersContainer = document.querySelector('.others');
                let accountId = null;
                
                if (othersContainer) {
                    const othersText = othersContainer.textContent || '';
                    console.log('others容器内容:', othersText);
                    
                    // 解析账号ID
                    const accountIdMatch = othersText.match(/小红书账号:?\s*(\w+)/);
                    if (accountIdMatch) {
                        accountId = accountIdMatch[1];
                        console.log('✅ 提取到账号ID:', accountId);
                    }
                }
                
                // 提取统计数据
                const numericalElements = document.querySelectorAll('.numerical');
                let followingCount = null; // 关注数
                let followersCount = null; // 粉丝数
                let likesCount = null; // 获赞与收藏
                
                console.log('找到统计元素数量:', numericalElements.length);
                
                if (numericalElements.length >= 3) {
                    followingCount = numericalElements[0].textContent.trim();
                    followersCount = numericalElements[1].textContent.trim();
                    likesCount = numericalElements[2].textContent.trim();
                    
                    console.log('统计数据 - 关注:', followingCount, '粉丝:', followersCount, '获赞:', likesCount);
                }
                
                // 解析数字的辅助函数
                function parseNumber(value) {
                    if (!value) return 0;
                    const cleanValue = value.toString().replace(/[^\d.万千]/g, '');
                    if (cleanValue.includes('万')) {
                        return Math.floor(parseFloat(cleanValue) * 10000);
                    } else if (cleanValue.includes('千')) {
                        return Math.floor(parseFloat(cleanValue) * 1000);
                    }
                    return parseInt(cleanValue) || 0;
                }
                
                // 提取个人简介（创作者页面可能没有）
                let bio = null;
                const bioEl = document.querySelector('.others .description-text div:last-child');
                if (bioEl && bioEl.textContent && !bioEl.textContent.includes('小红书账号:')) {
                    bio = bioEl.textContent.trim();
                    console.log('个人简介:', bio);
                }
                
                // 构建结果对象
                const result = {
                    platform: 'xiaohongshu',
                    accountName: accountName,
                    accountId: accountId,
                    followersCount: parseNumber(followersCount),
                    followingCount: parseNumber(followingCount),
                    likesCount: parseNumber(likesCount),
                    videosCount: null, // 创作者首页没有显示笔记数量
                    avatar: avatar,
                    bio: bio,
                    extractedAt: new Date().toISOString(),
                };
                
                console.log('✅ 提取结果:', result);
                
                // 验证关键字段
                if (!accountName && !accountId) {
                    console.warn('⚠️ 关键信息缺失，可能页面还未加载完成');
                    return null;
                }
                
                return result;
                
            } catch (error) {
                console.error('❌ 提取数据时出错:', error);
                return null;
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, extractScript);
        return result;
    }
}