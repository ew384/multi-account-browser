// multi-account-browser/src/main/plugins/uploader/douyin/main.ts
import { PluginUploader, UploadParams, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';

export class DouyinVideoUploader implements PluginUploader {
    public readonly type = PluginType.UPLOADER;
    public readonly platform = 'douyin';
    public readonly name = 'Douyin Video Uploader';

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        //console.log(`✅ ${this.name} 初始化完成`);
    }

    async uploadVideoComplete(params: UploadParams, tabId: string): Promise<{ success: boolean; tabId?: string }> {
        try {

            // 1. 上传视频文件
            await this.uploadFile(params.filePath, tabId);

            // 2. 等待页面跳转到发布页面
            await this.waitForPublishPage(tabId);

            // 3. 填写标题和标签
            await this.fillTitleAndTags(params.title, params.tags, tabId);

            // 4. 等待视频上传完成
            await this.waitForVideoUpload(tabId);

            // 5. 上传缩略图（如果有）
            //if (params.thumbnailPath) {
            //    await this.setThumbnail(tabId, params.thumbnailPath);
            //}

            // 6. 设置地理位置
            if (params.location) {
                await this.setLocation(tabId, params.location);
            }

            // 7. 处理第三方平台同步
            await this.handleThirdPartySync(tabId);

            // 8. 设置定时发布（如果有）
            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate, tabId);
            }

            // 9. 点击发布
            await this.clickPublish(tabId);

            return { success: true, tabId: tabId };
        } catch (error) {
            console.error('❌ 抖音视频上传流程失败:', error);
            throw error;
        }
    }
    private async waitForFileInput(tabId: string): Promise<boolean> {
        const waitScript = `
            new Promise((resolve) => {
                const timeout = 50000; // 30秒超时
                const startTime = Date.now();
                
                const checkInput = () => {
                    if (Date.now() - startTime > timeout) {
                        console.log('❌ 文件输入框等待超时');
                        resolve(false);
                        return;
                    }
                    
                    // 查找抖音的文件输入框
                    let fileInput = document.querySelector('input[type="file"][accept*="video"]');
                    if (!fileInput) {
                        fileInput = document.querySelector('input[type="file"]');
                    }
                    
                    if (fileInput) {
                        console.log('✅ 文件输入框已找到');
                        resolve(true);
                        return;
                    }
                    
                    console.log('🔍 继续查找文件输入框...');
                    setTimeout(checkInput, 500);
                };
                
                checkInput();
            })
        `;

        try {
            const result = await this.tabManager.executeScript(tabId, waitScript);
            return Boolean(result);
        } catch (error) {
            console.error('❌ 等待文件输入框失败:', error);
            return false;
        }
    }
    private async uploadFile(filePath: string, tabId: string): Promise<void> {
        await this.tabManager.navigateTab(tabId, 'https://creator.douyin.com/creator-micro/content/upload');
        console.log('📤 上传文件到抖音...');
        // 🔥 步骤1：等待页面完全加载
        console.log('⏳ 等待抖音创作者页面完全加载...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 给页面3秒加载时间

        // 🔥 步骤2：等待文件输入框出现
        console.log('⏳ 等待文件输入框准备...');
        const inputReady = await this.waitForFileInput(tabId);
        if (!inputReady) {
            throw new Error('文件输入框准备超时');
        }
        console.log('✅ 文件输入框已准备好');
        const uploadScript = `
        (async function() {
            try {
                // 查找视频文件输入框
                let fileInput = document.querySelector('input[type="file"][accept*="video"]');
                if (!fileInput) {
                    fileInput = document.querySelector('input[type="file"]');
                }
                
                if (!fileInput) {
                    throw new Error('未找到文件输入框');
                }

                // 创建文件对象
                const response = await fetch('file://${filePath}');
                const arrayBuffer = await response.arrayBuffer();
                const file = new File([arrayBuffer], '${filePath.split('/').pop()}', {
                    type: 'video/mp4'
                });

                // 创建 DataTransfer 对象
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                // 设置文件
                Object.defineProperty(fileInput, 'files', {
                    value: dataTransfer.files,
                    configurable: true
                });

                // 触发事件
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                fileInput.dispatchEvent(new Event('input', { bubbles: true }));

                console.log('✅ 文件上传成功');
                return { success: true };
            } catch (e) {
                console.error('❌ 文件上传失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, uploadScript);
        if (!result.success) {
            throw new Error(`文件上传失败: ${result.error}`);
        }
    }

    private async waitForPublishPage(tabId: string): Promise<void> {
        console.log('⏳ 等待进入发布页面...');

        const waitScript = `
        new Promise((resolve, reject) => {
            const timeout = 30000; // 30秒超时
            const startTime = Date.now();
            
            const checkPage = () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('等待发布页面超时'));
                    return;
                }

                const url = window.location.href;
                if (url.includes('creator.douyin.com/creator-micro/content/publish') || 
                    url.includes('creator.douyin.com/creator-micro/content/post/video')) {
                    console.log('✅ 成功进入发布页面');
                    resolve(true);
                    return;
                }

                setTimeout(checkPage, 500);
            };

            checkPage();
        })
        `;

        await this.tabManager.executeScript(tabId, waitScript);
    }

    private async fillTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
        console.log('📝 填写标题和标签...');

        const fillScript = `
        (async function() {
            try {
                // 等待标题输入框出现
                let titleInput = null;
                for (let i = 0; i < 50; i++) {
                    titleInput = document.querySelector('input[placeholder="填写作品标题，为作品获得更多流量"]');
                    if (titleInput) break;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (titleInput) {
                    // 点击聚焦
                    titleInput.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 清空并填充标题
                    titleInput.value = '';
                    titleInput.value = '${title.substring(0, 30)}';
                    
                    // 触发事件
                    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    console.log('✅ 标题填充成功:', '${title}');
                } else {
                    // 备选方案：查找 .notranslate 元素
                    const titleContainer = document.querySelector('.notranslate');
                    if (titleContainer) {
                        titleContainer.click();
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                        // 模拟键盘操作清空并输入
                        document.execCommand('selectAll');
                        document.execCommand('delete');
                        document.execCommand('insertText', false, '${title}');
                        
                        // 按回车确认
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            keyCode: 13,
                            bubbles: true
                        });
                        titleContainer.dispatchEvent(enterEvent);
                        
                        console.log('✅ 标题填充成功（备选方案）');
                    } else {
                        throw new Error('未找到标题输入框');
                    }
                }

                // 添加标签到作品简介
                const tags = ${JSON.stringify(tags)};
                if (tags.length > 0) {
                    const zoneContainer = document.querySelector('.zone-container[data-placeholder="添加作品简介"]');
                    if (zoneContainer) {
                        // 点击聚焦到简介输入框
                        zoneContainer.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // 构建标签文本
                        const tagText = tags.map(tag => '#' + tag).join(' ') + ' ';
                        
                        // 直接设置内容
                        zoneContainer.innerHTML = '<div class="ace-line" data-node="true"><div data-line-wrapper="true" dir="auto"><span class="" data-leaf="true"><span data-string="true">' + tagText + '</span></span></div></div>';
                        
                        // 触发输入事件
                        zoneContainer.dispatchEvent(new Event('input', { bubbles: true }));
                        zoneContainer.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        console.log('✅ 标签添加成功，总共添加了', tags.length, '个标签');
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

    private async waitForVideoUpload(tabId: string): Promise<void> {
        console.log('⏳ 等待视频上传完成...');

        const waitScript = `
        new Promise((resolve, reject) => {
            const timeout = 300000; // 5分钟超时
            const startTime = Date.now();
            
            const checkUpload = async () => {
                if (Date.now() - startTime > timeout) {
                    console.log('⚠️ 视频上传超时，但继续后续流程（抖音支持上传中发布）');
                    resolve(true);
                    return;
                }

                // 检查重新上传按钮是否存在
                const textElements = document.querySelectorAll('div.text-JK4gL5');
                const reuploadElement = Array.from(textElements).find(el => el.textContent.trim() === '重新上传');
                if (reuploadElement) {
                    console.log('✅ 视频上传完成');
                    resolve(true);
                    return;
                }

                // 检查上传失败
                const progressDiv = document.querySelector('div.progress-div');
                const uploadFailed = progressDiv && Array.from(progressDiv.querySelectorAll('div')).some(div => div.textContent.includes('上传失败'));
                if (uploadFailed) {
                    console.log('❌ 发现上传失败，需要重新上传');
                    reject(new Error('视频上传失败'));
                    return;
                }

                console.log('📤 视频上传中...');
                setTimeout(checkUpload, 1000);
            };

            checkUpload();
        })
        `;

        await this.tabManager.executeScript(tabId, waitScript);
    }

    private async setThumbnail(tabId: string, thumbnailPath: string): Promise<void> {
        console.log('🖼️ 设置视频封面...');

        const thumbnailScript = `
        (async function() {
            try {
                // 点击选择封面按钮
                const coverButton = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '选择封面');
                if (coverButton) {
                    coverButton.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // 等待弹框出现
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 点击设置竖封面
                const verticalCoverButton = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '设置竖封面');
                if (verticalCoverButton) {
                    verticalCoverButton.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // 上传封面文件
                const fileInput = document.querySelector("div[class^='semi-upload upload'] input.semi-upload-hidden-input");
                const fileInput = document.querySelector("div[class^='semi-upload upload'] input.semi-upload-hidden-input");
                if (fileInput) {
                    // 创建文件对象并上传
                    const response = await fetch('file://${thumbnailPath}');
                    const arrayBuffer = await response.arrayBuffer();
                    const file = new File([arrayBuffer], '${thumbnailPath.split('/').pop()}', {
                        type: (() => {
                            const ext = '${thumbnailPath}'.toLowerCase().split('.').pop();
                            const mimeTypes = {
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'png': 'image/png',
                                'gif': 'image/gif',
                                'webp': 'image/webp',
                                'bmp': 'image/bmp'
                            };
                            return mimeTypes[ext] || 'image/jpeg';
                        })()
                    });
                
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                
                    Object.defineProperty(fileInput, 'files', {
                        value: dataTransfer.files,
                        configurable: true
                    });
                
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    console.log('✅ 封面上传完成');
                }

                // 点击完成按钮
                await new Promise(resolve => setTimeout(resolve, 2000));
                const finishButton = Array.from(document.querySelectorAll("div[class^='extractFooter'] button")).find(btn => btn.textContent.trim() === '完成');
                if (finishButton) {
                    finishButton.click();
                }

                return { success: true };
            } catch (e) {
                console.error('❌ 封面设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, thumbnailScript);
        if (!result.success) {
            console.warn(`⚠️ 封面设置失败: ${result.error}`);
        }
    }

    private async setLocation(tabId: string, location: string = "深圳市"): Promise<void> {
        console.log('📍 设置地理位置...');

        const locationScript = `
        (async function() {
            try {
                // 点击地理位置选择器
                const locationSelector = Array.from(document.querySelectorAll('div.semi-select span')).find(span => span.textContent.includes('输入地理位置'));
                if (locationSelector) {
                    locationSelector.click();
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // 清空并输入位置
                    const backspaceEvent = new KeyboardEvent('keydown', {
                        key: 'Backspace',
                        keyCode: 8,
                        bubbles: true
                    });
                    document.activeElement.dispatchEvent(backspaceEvent);

                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // 输入位置
                    document.execCommand('insertText', false, '${location}');

                    // 等待选项出现并选择第一个
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const firstOption = document.querySelector('div[role="listbox"] [role="option"]');
                    if (firstOption) {
                        firstOption.click();
                        console.log('✅ 地理位置设置成功:', '${location}');
                    }
                }

                return { success: true };
            } catch (e) {
                console.error('❌ 地理位置设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, locationScript);
        if (!result.success) {
            console.warn(`⚠️ 地理位置设置失败: ${result.error}`);
        }
    }

    private async handleThirdPartySync(tabId: string): Promise<void> {
        console.log('🔗 处理第三方平台同步...');

        const syncScript = `
        (function() {
            try {
                // 查找第三方平台同步开关
                const thirdPartyElement = document.querySelector('[class^="info"] > [class^="first-part"] div div.semi-switch');
                if (thirdPartyElement) {
                    // 检查是否已选中
                    const isChecked = thirdPartyElement.classList.contains('semi-switch-checked');
                    if (!isChecked) {
                        const switchInput = thirdPartyElement.querySelector('input.semi-switch-native-control');
                        if (switchInput) {
                            switchInput.click();
                            console.log('✅ 已开启第三方平台同步');
                        }
                    } else {
                        console.log('✅ 第三方平台同步已开启');
                    }
                }

                return { success: true };
            } catch (e) {
                console.error('❌ 第三方平台同步处理失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, syncScript);
        if (!result.success) {
            console.warn(`⚠️ 第三方平台同步失败: ${result.error}`);
        }
    }

    private async setScheduleTime(publishDate: Date, tabId: string): Promise<void> {
        console.log('⏰ 设置定时发布...');

        const scheduleScript = `
        (async function() {
            try {
                // 选择定时发布选项
                const scheduleLabel = Array.from(document.querySelectorAll("label[class^='radio']")).find(label => label.textContent.includes('定时发布'));
                if (scheduleLabel) {
                    scheduleLabel.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // 格式化发布时间
                const publishDateHour = '${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-${String(publishDate.getDate()).padStart(2, '0')} ${String(publishDate.getHours()).padStart(2, '0')}:${String(publishDate.getMinutes()).padStart(2, '0')}';

                // 点击时间输入框
                const timeInput = document.querySelector('.semi-input[placeholder="日期和时间"]');
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
                }

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

    private async clickPublish(tabId: string): Promise<void> {
        console.log('🚀 点击发布按钮...');

        const publishScript = `
        new Promise((resolve, reject) => {
            const timeout = 60000; // 1分钟超时
            const startTime = Date.now();
            
            const tryPublish = async () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('发布按钮等待超时'));
                    return;
                }

                // 查找发布按钮
                const publishButton = document.querySelector('button.button-dhlUZE.primary-cECiOJ') || 
                                    Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === '发布');
                
                if (publishButton && !publishButton.disabled) {
                    publishButton.click();
                    
                    // 等待跳转到作品管理页面
                    const checkRedirect = () => {
                        if (window.location.href.includes('creator.douyin.com/creator-micro/content/manage')) {
                            console.log('✅ 视频发布成功');
                            resolve(true);
                        } else {
                            setTimeout(checkRedirect, 500);
                        }
                    };
                    
                    setTimeout(checkRedirect, 1000);
                    return;
                }

                console.log('📤 等待发布按钮激活...');
                setTimeout(tryPublish, 500);
            };

            tryPublish();
        })
        `;

        await this.tabManager.executeScript(tabId, publishScript);
        console.log('✅ 视频发布流程完成');
    }

    private async handleUploadError(filePath: string, tabId: string): Promise<void> {
        console.log('🔧 处理上传错误，重新上传...');

        const retryScript = `
        (function() {
            try {
                // 查找重新上传按钮
                const retryButton = document.querySelector('div.progress-div [class^="upload-btn-input"]');
                if (retryButton) {
                    // 重新上传文件的逻辑
                    console.log('🔄 准备重新上传文件');
                    return { success: true };
                }
                return { success: false, error: '未找到重新上传按钮' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, retryScript);
        if (result.success) {
            // 重新调用上传方法
            await this.uploadFile(filePath, tabId);
        }
    }

    async getAccountInfo(tabId: string): Promise<any> {
        const extractScript = `
        (function extractDouyinInfo() {
            try {
                // 提取头像URL
                const avatarImg = document.querySelector('.avatar-XoPjK6 .img-PeynF_');
                const avatar = avatarImg ? avatarImg.src : null;
                
                // 提取账号名称
                const accountNameEl = document.querySelector('.name-_lSSDc');
                const accountName = accountNameEl ? accountNameEl.textContent.trim() : null;
                
                // 提取抖音号
                const uniqueIdEl = document.querySelector('.unique_id-EuH8eA');
                let accountId = null;
                if (uniqueIdEl && uniqueIdEl.textContent.includes('抖音号：')) {
                    accountId = uniqueIdEl.textContent.replace('抖音号：', '').trim();
                }
                
                // 提取个人签名
                const signatureEl = document.querySelector('.signature-HLGxt7');
                const bio = signatureEl ? signatureEl.textContent.trim() : null;
                
                // 提取统计数据
                const numberElements = document.querySelectorAll('.number-No6ev9');
                let followingCount = null; // 关注数
                let followersCount = null; // 粉丝数
                let likesCount = null; // 获赞数
                
                if (numberElements.length >= 3) {
                    followingCount = numberElements[0].textContent.trim();
                    followersCount = numberElements[1].textContent.trim();
                    likesCount = numberElements[2].textContent.trim();
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
                
                // 标准化数据
                return {
                    platform: 'douyin',
                    accountName: accountName,
                    accountId: accountId,
                    followersCount: parseNumber(followersCount),
                    followingCount: parseNumber(followingCount), // 抖音的关注数
                    likesCount: parseNumber(likesCount), // 抖音的获赞数
                    videosCount: null, // 这个页面没有显示作品数量
                    avatar: avatar,
                    bio: bio,
                    extractedAt: new Date().toISOString(),
                };
            } catch (error) {
                console.error('提取数据时出错:', error);
                return null;
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, extractScript);
        return result;
    }
}