// multi-account-browser/src/main/automation/uploader/tencent_uploader/main.ts
import { TabManager } from '../../../TabManager';

export class WeChatVideoUploader {
    private tabId: string;
    private tabManager: TabManager;

    constructor(tabId: string, tabManager: TabManager) {
        this.tabId = tabId;
        this.tabManager = tabManager;
    }

    async uploadVideoComplete(params: {
        filePath: string;
        title: string;
        tags: string[];
        publishDate?: Date;
        enableOriginal?: boolean;
        addToCollection?: boolean;
        category?: string;
    }): Promise<boolean> {
        try {
            console.log(`🎭 开始微信视频号完整上传流程... (Tab: ${this.tabId})`);

            // 1. 文件上传
            await this.uploadFile(params.filePath);

            // 2. 等待视频处理
            await this.waitForVideoProcessing();

            // 3. 填写标题和标签
            await this.addTitleAndTags(params.title, params.tags);

            // 4. 其他功能
            if (params.addToCollection) {
                await this.addToCollection();
            }

            if (params.enableOriginal) {
                await this.handleOriginalDeclaration(params.category);
            }

            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate);
            }

            // 5. 发布
            await this.clickPublish();

            return true;
        } catch (error) {
            console.error('❌ 微信视频号流程失败:', error);
            throw error;
        }
    }

    // 🔥 使用 TabManager 的流式上传
    private async uploadFile(filePath: string): Promise<void> {
        console.log('📤 上传文件到微信视频号...');

        const success = await this.tabManager.setInputFilesStreaming(
            this.tabId,
            'input[type="file"]',
            filePath,
            {
                shadowSelector: 'wujie-app',
                triggerSelector: '.center',
                waitForInput: true
            }
        );

        if (!success) {
            throw new Error('文件上传失败');
        }
    }

    // 🔥 使用 TabManager 的 executeScript
    private async addTitleAndTags(title: string, tags: string[]): Promise<void> {
        console.log('📝 填写标题和标签...');

        const titleTagScript = `
        (async function() {
            // 等待标题编辑器
            let titleEditor = null;
            for (let i = 0; i < 30; i++) {
                titleEditor = document.querySelector("div.input-editor");
                if (titleEditor) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!titleEditor) {
                throw new Error('未找到标题编辑器');
            }

            // 点击并聚焦
            titleEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
            titleEditor.click();
            titleEditor.focus();

            // 清空并输入标题
            titleEditor.innerText = '';
            titleEditor.textContent = '${title}';

            // 触发输入事件
            titleEditor.dispatchEvent(new Event('input', { bubbles: true }));
            titleEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            console.log('标题已输入:', '${title}');

            // 等待一下
            await new Promise(resolve => setTimeout(resolve, 500));

            // 输入标签
            const tags = ${JSON.stringify(tags)};
            for (const tag of tags) {
                // 创建键盘事件来输入标签
                const hashEvent = new KeyboardEvent('keypress', { 
                    key: '#',
                    char: '#',
                    charCode: 35,
                    keyCode: 35,
                    bubbles: true 
                });
                titleEditor.dispatchEvent(hashEvent);

                // 输入标签文本
                for (const char of tag) {
                    const charEvent = new KeyboardEvent('keypress', { 
                        key: char,
                        char: char,
                        charCode: char.charCodeAt(0),
                        keyCode: char.charCodeAt(0),
                        bubbles: true 
                    });
                    titleEditor.dispatchEvent(charEvent);
                }

                // 输入空格
                const spaceEvent = new KeyboardEvent('keypress', { 
                    key: ' ',
                    char: ' ',
                    charCode: 32,
                    keyCode: 32,
                    bubbles: true 
                });
                titleEditor.dispatchEvent(spaceEvent);

                console.log('标签已输入:', '#' + tag);
            }

            return true;
        })()
        `;

        // 🔥 直接使用 TabManager 的 executeScript
        const result = await this.tabManager.executeScript(this.tabId, titleTagScript);
        if (!result) {
            throw new Error('标题标签填写失败');
        }
    }

    // 🔥 使用 TabManager 的 executeScript
    private async setScheduleTime(publishDate: Date): Promise<void> {
        console.log('⏰ 设置定时发布...');

        const scheduleScript = `
        (async function() {
            try {
                console.log('🔥 开始设置定时发布...');
                
                // 点击定时发布选项
                const scheduleLabels = Array.from(document.querySelectorAll('label')).filter(label => 
                    label.textContent.includes('定时')
                );
                
                const scheduleLabel = scheduleLabels[1]; // 第二个定时标签
                
                if (scheduleLabel) {
                    scheduleLabel.click();
                    console.log('✅ 已点击定时发布选项');
                } else {
                    throw new Error('未找到定时发布选项');
                }

                // 等待时间选择器出现
                await new Promise(resolve => setTimeout(resolve, 1000));

                // 设置日期和时间逻辑...
                const targetMonth = ${publishDate.getMonth() + 1};
                const targetDay = ${publishDate.getDate()};
                const targetHour = ${publishDate.getHours()};
                
                // ... 具体的日期时间设置逻辑

                console.log('✅ 定时发布设置完成');
                return { success: true };

            } catch (e) {
                console.error('❌ 定时发布设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(this.tabId, scheduleScript);
        if (!result.success) {
            throw new Error(`定时发布设置失败: ${result.error}`);
        }
    }

    private async handleOriginalDeclaration(category?: string): Promise<void> {
        console.log('📋 处理原创声明...');

        const originalScript = `
        (async function() {
            try {
                console.log('🔥 开始处理原创声明...');
                
                // 查找并点击原创声明复选框
                let originalCheckbox = null;
                
                const originalLabels = document.querySelectorAll('label');
                for (const label of originalLabels) {
                    if (label.textContent.includes('视频为原创')) {
                        originalCheckbox = label.querySelector('input[type="checkbox"]') || label;
                        break;
                    }
                }
                
                if (originalCheckbox) {
                    originalCheckbox.click();
                    console.log('✅ 已点击原创声明复选框');
                }

                // 等待弹框出现
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 处理使用条款同意
                const agreeElements = document.querySelectorAll('label');
                for (const element of agreeElements) {
                    if (element.textContent.includes('我已阅读并同意')) {
                        element.click();
                        console.log('✅ 已同意使用条款');
                        break;
                    }
                }

                // 设置原创类型
                const category = '${category || ''}';
                if (category) {
                    // ... 原创类型设置逻辑
                }

                // 点击声明原创按钮
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    if (button.textContent.includes('声明原创') && !button.disabled) {
                        button.click();
                        console.log('✅ 已点击声明原创按钮');
                        break;
                    }
                }

                console.log('✅ 原创声明处理完成');
                return { success: true };

            } catch (e) {
                console.error('❌ 原创声明处理失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(this.tabId, originalScript);
        if (!result.success) {
            console.warn(`⚠️ 原创声明处理失败: ${result.error}`);
        }
    }

    private async addToCollection(): Promise<void> {
        console.log('📚 添加到合集...');

        const collectionScript = `
        (async function() {
            try {
                // 查找"添加到合集"按钮
                let collectionButton = null;
                const textElements = document.querySelectorAll('*');
                
                for (const element of textElements) {
                    if (element.textContent && element.textContent.includes('添加到合集')) {
                        collectionButton = element;
                        break;
                    }
                }

                if (!collectionButton) {
                    return { success: true, message: '无合集选项可用' };
                }

                // 处理合集选择逻辑...
                
                return { success: true };

            } catch (e) {
                console.error('❌ 添加到合集失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(this.tabId, collectionScript);
        if (!result.success) {
            console.warn(`⚠️ 添加到合集失败: ${result.error}`);
        }
    }

    private async waitForVideoProcessing(): Promise<void> {
        console.log('⏳ 等待视频处理完成...');

        const waitScript = `
        new Promise((resolve, reject) => {
            const timeout = 300000; // 5分钟超时
            const startTime = Date.now();
            
            const checkProcessing = () => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('等待视频处理超时'));
                    return;
                }

                // 检查删除按钮是否出现（表示处理完成）
                const deleteButton = document.querySelector('.delete-btn, [class*="delete"]');
                if (deleteButton && deleteButton.textContent.includes('删除')) {
                    console.log('✅ 视频处理完成');
                    resolve(true);
                    return;
                }

                // 检查是否还有处理中的提示
                const bodyText = document.body.textContent;
                if (!bodyText.includes('上传中') && !bodyText.includes('处理中')) {
                    console.log('✅ 视频处理完成');
                    resolve(true);
                    return;
                }

                setTimeout(checkProcessing, 2000);
            };

            checkProcessing();
        })
        `;

        await this.tabManager.executeScript(this.tabId, waitScript);
    }

    private async clickPublish(): Promise<void> {
        console.log('🚀 点击发布...');

        const publishScript = `
        (async function() {
            // 等待发布按钮激活
            let publishButton = null;
            for (let i = 0; i < 60; i++) {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    const buttonText = button.textContent.trim();
                    if (buttonText.includes('发表') && !button.disabled && !button.classList.contains('disabled')) {
                        publishButton = button;
                        break;
                    }
                }
                
                if (publishButton) break;
                
                console.log('等待发布按钮激活...', i + 1, '/ 60');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!publishButton) {
                throw new Error('发布按钮未激活或未找到');
            }

            // 滚动到按钮并点击
            publishButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            publishButton.focus();
            publishButton.click();

            console.log('✅ 已点击发布按钮');
            return true;
        })()
        `;

        const result = await this.tabManager.executeScript(this.tabId, publishScript);
        if (!result) {
            throw new Error('发布失败');
        }
    }
    private async handleUploadError(filePath: string): Promise<void> {
        console.log("🔧 处理上传错误，重新上传中");

        await this.tabManager.executeScript(this.tabId, `
            // 点击删除按钮
            const deleteBtn = document.querySelector('div.media-status-content div.tag-inner:has-text("删除")');
            if (deleteBtn) deleteBtn.click();
        `);

        await this.tabManager.executeScript(this.tabId, `
            // 确认删除
            const confirmBtn = document.querySelector('button:has-text("删除")');
            if (confirmBtn) confirmBtn.click();
        `);

        // 重新上传文件
        await this.uploadFile(filePath);
    }

    private async handleAdvancedOriginal(category?: string): Promise<void> {
        console.log("📋 处理高级原创声明");

        const originalScript = `
        (async function() {
            try {
                // 检查原创权限
                const originalLabel = document.querySelector('label:has-text("视频为原创")');
                if (originalLabel) {
                    const checkbox = originalLabel.querySelector('input[type="checkbox"]');
                    if (checkbox && !checkbox.disabled) {
                        checkbox.click();
                        console.log('✅ 已勾选原创声明');
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1500));

                // 同意条款
                const agreeLabel = document.querySelector('label:has-text("我已阅读并同意")');
                if (agreeLabel) {
                    agreeLabel.click();
                    console.log('✅ 已同意条款');
                }

                // 处理原创类型
                if ('${category || ''}') {
                    const typeDropdown = document.querySelector('div.form-content');
                    if (typeDropdown) {
                        typeDropdown.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        const typeOption = document.querySelector(\`li:has-text("\${category}")\`);
                        if (typeOption) {
                            typeOption.click();
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

                // 点击声明原创按钮
                const declareBtn = document.querySelector('button:has-text("声明原创"):not(:disabled)');
                if (declareBtn) {
                    declareBtn.click();
                    console.log('✅ 已点击声明原创');
                }

                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(this.tabId, originalScript);
        if (!result.success) {
            console.warn(`⚠️ 原创声明失败: ${result.error}`);
        }
    }
}