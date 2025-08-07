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

    async uploadVideoComplete(params: UploadParams): Promise<boolean> {
        const headless = params.headless ?? true; // 默认headless模式
        let tabId: string | null = null;        
        try {
            console.log(`🎭 开始小红书视频完整上传流程... (${params.title})`);

            const tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                'xiaohongshu',
                'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video',
                headless
            );

            // 1. 上传视频文件
            await this.uploadFile(params.filePath, tabId);

            // 2. 等待上传成功
            await this.waitForUploadSuccess(tabId);

            // 3. 填写标题和标签
            await this.fillTitleAndTags(params.title, params.tags, tabId);

            // 4. 设置定时发布（如果有）
            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate, tabId);
            }

            // 5. 点击发布
            await this.clickPublish(tabId, !!params.publishDate);

            return true;
        } catch (error) {
            console.error('❌ 小红书视频上传流程失败:', error);
            throw error;
        }finally {
            // 🔥 自动关闭tab
            if (tabId) {
                try {
                    await this.tabManager.closeTab(tabId);
                    console.log(`✅ 已关闭微信视频号上传tab: ${tabId}`);
                } catch (closeError) {
                    console.warn(`⚠️ 关闭tab失败: ${closeError}`);
                }
            }
        }
    }

    private async uploadFile(filePath: string, tabId: string): Promise<void> {
        console.log('📤 上传文件到小红书...');

        const uploadScript = `
        (async function() {
            try {
                // 等待上传页面加载完成
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 查找文件输入框
                const fileInput = document.querySelector("div[class^='upload-content'] input[class='upload-input']");
                
                if (!fileInput) {
                    throw new Error('未找到文件输入框');
                }

                // 创建文件对象
                const response = await fetch('file://${filePath}');
                const arrayBuffer = await response.arrayBuffer();
                const fileName = '${filePath.split('/').pop()}';
                const file = new File([arrayBuffer], fileName, {
                    type: (() => {
                        const ext = fileName.toLowerCase().split('.').pop();
                        const videoTypes = {
                            'mp4': 'video/mp4',
                            'avi': 'video/x-msvideo',
                            'mov': 'video/quicktime',
                            'wmv': 'video/x-ms-wmv',
                            'flv': 'video/x-flv',
                            'webm': 'video/webm',
                            'mkv': 'video/x-matroska',
                            'm4v': 'video/x-m4v'
                        };
                        return videoTypes[ext] || 'video/mp4';
                    })()
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

    private async waitForUploadSuccess(tabId: string): Promise<void> {
        console.log('⏳ 等待视频上传成功...');

        const waitScript = `
        new Promise((resolve, reject) => {
            const timeout = 300000; // 5分钟超时
            const startTime = Date.now();
            
            const checkUploadSuccess = async () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('等待上传成功超时'));
                    return;
                }

                try {
                    // 等待upload-input元素出现
                    const uploadInput = document.querySelector('input.upload-input');
                    if (uploadInput) {
                        // 获取下一个兄弟元素
                        const previewNew = uploadInput.parentElement.querySelector('div[class*="preview-new"]');
                        if (previewNew) {
                            // 在preview-new元素中查找包含"上传成功"的stage元素
                            const stageElements = previewNew.querySelectorAll('div.stage');
                            let uploadSuccess = false;
                            
                            for (const stage of stageElements) {
                                if (stage.textContent && stage.textContent.includes('上传成功')) {
                                    uploadSuccess = true;
                                    break;
                                }
                            }
                            
                            if (uploadSuccess) {
                                console.log('✅ 检测到上传成功标识!');
                                resolve(true);
                                return;
                            }
                        }
                    }
                    
                    console.log('📤 等待上传完成...');
                    setTimeout(checkUploadSuccess, 1000);
                } catch (e) {
                    console.log('检测过程出错:', e.message, '重新尝试...');
                    setTimeout(checkUploadSuccess, 500);
                }
            };

            checkUploadSuccess();
        })
        `;

        await this.tabManager.executeScript(tabId, waitScript);
    }

    private async fillTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
        console.log('📝 填写标题和标签...');

        const fillScript = `
        (async function() {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 填写标题
                const titleContainer = document.querySelector('div.input.titleInput input.d-text');
                if (titleContainer) {
                    titleContainer.value = '';
                    titleContainer.value = '${title.substring(0, 30)}';
                    
                    // 触发事件
                    titleContainer.dispatchEvent(new Event('input', { bubbles: true }));
                    titleContainer.dispatchEvent(new Event('change', { bubbles: true }));
                    
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

                // 添加标签
                const tags = ${JSON.stringify(tags)};
                if (tags.length > 0) {
                    const contentEditor = document.querySelector('.ql-editor'); // 不能加上 .ql-blank 属性
                    if (contentEditor) {
                        contentEditor.focus();
                        
                        for (const tag of tags) {
                            const tagText = '#' + tag + ' ';
                            
                            // 输入标签文本
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
        (function extractXiaohongshuInfo() {
            try {
                // 提取头像URL
                const avatarImg = document.querySelector('.base .avatar img');
                const avatar = avatarImg ? avatarImg.src : null;
                
                // 提取账号名称
                const accountNameEl = document.querySelector('.account-name');
                const accountName = accountNameEl ? accountNameEl.textContent.trim() : null;
                
                // 提取小红书账号ID
                const accountIdElements = document.querySelectorAll('.others div');
                let accountId = null;
                
                // 遍历所有div元素，查找包含"小红书账号:"的元素
                for (let element of accountIdElements) {
                    if (element.textContent && element.textContent.includes('小红书账号:')) {
                        accountId = element.textContent.replace('小红书账号:', '').trim();
                        break;
                    }
                }
                
                // 提取统计数据
                const numericalElements = document.querySelectorAll('.numerical');
                let followingCount = null; // 关注数
                let followersCount = null; // 粉丝数
                let likesCount = null; // 获赞与收藏
                
                if (numericalElements.length >= 3) {
                    followingCount = numericalElements[0].textContent.trim();
                    followersCount = numericalElements[1].textContent.trim();
                    likesCount = numericalElements[2].textContent.trim();
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
                
                // 提取个人简介（如果有的话）
                const bioEl = document.querySelector('.others .description-text div:last-child');
                let bio = null;
                if (bioEl && bioEl.textContent && !bioEl.textContent.includes('小红书账号:')) {
                    bio = bioEl.textContent.trim();
                }
                
                // 标准化数据
                return {
                    platform: 'xiaohongshu',
                    accountName: accountName,
                    accountId: accountId,
                    followersCount: parseNumber(followersCount),
                    followingCount: parseNumber(followingCount), // 小红书特有的关注数
                    likesCount: parseNumber(likesCount), // 小红书特有的获赞与收藏
                    videosCount: null, // 小红书这个页面没有显示笔记数量
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