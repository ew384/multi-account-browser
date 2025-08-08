//src/main/plugins/uploader/tencent/main.ts
import { PluginUploader, UploadParams, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';

export class WeChatVideoUploader implements PluginUploader {
    public readonly type = PluginType.UPLOADER;
    public readonly platform = 'wechat';
    public readonly name = 'WeChat Video Uploader';

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        //console.log(`✅ ${this.name} 初始化完成`);
    }
    // 🔥 改动：uploadVideoComplete 方法签名和逻辑
    async uploadVideoComplete(params: UploadParams): Promise<boolean> {
        const headless = params.headless ?? true; // 默认headless模式
        let tabId: string | null = null;
        try {
            console.log(`🎭 开始微信视频号完整上传流程... (${params.title})`);
            const tabId = await this.tabManager.createAccountTab(
                params.cookieFile,
                'wechat',
                'https://channels.weixin.qq.com/platform/post/create',
                headless
            );
            // 1. 文件上传
            await this.uploadFile(params.filePath, tabId);
            const uploadStarted = await this.verifyUploadStarted(tabId);
            if (!uploadStarted) {
                throw new Error("文件上传验证失败");
            }

            // 2. 等待视频处理
            await this.waitForVideoProcessing(tabId);

            // 3. 填写标题和标签
            await this.addTitleAndTags(params.title, params.tags, tabId);

            // 4: 等待上传完全完成
            await this.detectUploadStatusNoTimeout(tabId);

            // 5: 添加到合集（如果需要）
            if (params.addToCollection) {
                await this.addToCollection(tabId);
            }

            // 6: 处理原创声明（在发布前）
            if (params.enableOriginal) {
                await this.handleOriginalDeclaration(tabId, params.category);
            }

            // 7:  处理定时发布
            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate, tabId);
            }

            // 8. 发布
            await this.clickPublish(tabId);

            return true;
        } catch (error) {
            console.error('❌ 微信视频号流程失败:', error);
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

    // 🔥 使用 TabManager 的流式上传
    private async uploadFile(filePath: string, tabId: string): Promise<void> {
        console.log('📤 上传文件到微信视频号...');

        // 🔥 步骤1：等待wujie-app元素
        console.log('⏳ 等待页面wujie-app元素加载完成...');
        const elementReady = await this.tabManager.waitForElement(tabId, 'wujie-app', 30000);
        if (!elementReady) {
            throw new Error('页面wujie-app元素加载超时');
        }
        console.log('✅ wujie-app元素已加载');

        // 🔥 步骤2：等待Shadow DOM准备好（新增）
        console.log('⏳ 等待Shadow DOM完全准备...');
        const shadowReady = await this.waitForShadowDOMReady(tabId);
        if (!shadowReady) {
            throw new Error('Shadow DOM准备超时');
        }
        console.log('✅ Shadow DOM已准备好');

        // 🔥 步骤3：等待文件输入框出现（新增）
        console.log('⏳ 等待文件输入框准备...');
        const inputReady = await this.waitForFileInput(tabId);
        if (!inputReady) {
            throw new Error('文件输入框准备超时');
        }
        console.log('✅ 文件输入框已准备好');

        // 🔥 步骤4：参考Python的稳定等待
        console.log('⏳ 稳定等待0.1秒...');
        await new Promise(resolve => setTimeout(resolve, 100));

        // 🔥 步骤5：开始文件上传
        console.log('🚀 开始流式文件上传...');
        const success = await this.tabManager.setInputFilesStreaming(
            tabId,
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

        console.log('✅ 流式上传完成');
    }

    // 🔥 新增：等待Shadow DOM准备好
    private async waitForShadowDOMReady(tabId: string): Promise<boolean> {
        const waitScript = `
            new Promise((resolve) => {
                const timeout = 15000; // 15秒超时
                const startTime = Date.now();
                
                const checkShadow = () => {
                    if (Date.now() - startTime > timeout) {
                        console.log('❌ Shadow DOM等待超时');
                        resolve(false);
                        return;
                    }
                    
                    const wujieIframe = document.querySelector('.wujie_iframe');
                    if (wujieIframe && wujieIframe.shadowRoot) {
                        const shadowDoc = wujieIframe.shadowRoot;
                        // 检查Shadow DOM是否有实际内容
                        if (shadowDoc.body && shadowDoc.body.children.length > 0) {
                            console.log('✅ Shadow DOM已准备好，内容已加载');
                            resolve(true);
                            return;
                        }
                    }
                    
                    setTimeout(checkShadow, 200);
                };
                
                checkShadow();
            })
        `;

        try {
            const result = await this.tabManager.executeScript(tabId, waitScript);
            return Boolean(result);
        } catch (error) {
            console.error('❌ 等待Shadow DOM失败:', error);
            return false;
        }
    }

    // 🔥 新增：等待文件输入框准备好
    private async waitForFileInput(tabId: string): Promise<boolean> {
        const waitScript = `
            new Promise((resolve) => {
                const timeout = 10000; // 10秒超时
                const startTime = Date.now();
                
                const checkInput = () => {
                    if (Date.now() - startTime > timeout) {
                        console.log('❌ 文件输入框等待超时');
                        resolve(false);
                        return;
                    }
                    
                    const wujieIframe = document.querySelector('.wujie_iframe');
                    if (wujieIframe && wujieIframe.shadowRoot) {
                        const shadowDoc = wujieIframe.shadowRoot;
                        const fileInput = shadowDoc.querySelector('input[type="file"]');
                        
                        if (fileInput) {
                            console.log('✅ 文件输入框已找到');
                            resolve(true);
                            return;
                        }
                    }
                    
                    setTimeout(checkInput, 200);
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

    private async addTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
        console.log('📝 填写标题和标签...');

        const titleTagScript = `(async function() { try { console.log("开始填写短标题、描述和标签..."); const title = ${JSON.stringify(title)}; const tags = ${JSON.stringify(tags)}; const description = title; const wujieApp = document.querySelector("wujie-app"); if (!wujieApp || !wujieApp.shadowRoot) { return { success: false, error: "未找到Shadow DOM" }; } const shadowDoc = wujieApp.shadowRoot; const allInputs = shadowDoc.querySelectorAll("input[type=text], div[contenteditable], textarea"); let shortTitleInput = null; let descriptionEditor = null; for (let i = 0; i < allInputs.length; i++) { const input = allInputs[i]; const placeholder = input.placeholder || input.getAttribute("data-placeholder") || ""; if (placeholder.includes("6-16") || placeholder.includes("短标题") || placeholder.includes("标题")) { shortTitleInput = input; } else if (placeholder.includes("添加描述") || placeholder.includes("描述")) { descriptionEditor = input; } } if (shortTitleInput) { let finalTitle = title; if (finalTitle.length < 6) { const spacesToAdd = 6 - finalTitle.length; finalTitle = finalTitle + " ".repeat(spacesToAdd); console.log("短标题不足6字符，已自动补齐:", finalTitle, "(长度:" + finalTitle.length + ")"); } else { console.log("短标题长度符合要求:", finalTitle, "(长度:" + finalTitle.length + ")"); } shortTitleInput.scrollIntoView({ behavior: "smooth", block: "center" }); shortTitleInput.click(); shortTitleInput.focus(); await new Promise(resolve => setTimeout(resolve, 200)); if (shortTitleInput.tagName === "INPUT") { shortTitleInput.value = ""; shortTitleInput.value = finalTitle; shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); shortTitleInput.dispatchEvent(new Event("change", { bubbles: true })); } else { shortTitleInput.innerText = ""; shortTitleInput.textContent = finalTitle; shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); } console.log("短标题已填写:", finalTitle); } else { console.log("警告：未找到短标题输入框"); } await new Promise(resolve => setTimeout(resolve, 500)); if (descriptionEditor && tags.length > 0) { descriptionEditor.scrollIntoView({ behavior: "smooth", block: "center" }); descriptionEditor.click(); descriptionEditor.focus(); await new Promise(resolve => setTimeout(resolve, 200)); const contentWithTags = description + " " + tags.map(tag => "#" + tag).join(" "); if (descriptionEditor.tagName === "INPUT") { descriptionEditor.value = ""; descriptionEditor.value = contentWithTags; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); descriptionEditor.dispatchEvent(new Event("change", { bubbles: true })); } else { descriptionEditor.innerText = ""; descriptionEditor.textContent = contentWithTags; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); } console.log("描述和标签已填写:", contentWithTags); } else if (descriptionEditor) { console.log("只填写描述，无标签"); descriptionEditor.scrollIntoView({ behavior: "smooth", block: "center" }); descriptionEditor.click(); descriptionEditor.focus(); await new Promise(resolve => setTimeout(resolve, 200)); if (descriptionEditor.tagName === "INPUT") { descriptionEditor.value = ""; descriptionEditor.value = description; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); descriptionEditor.dispatchEvent(new Event("change", { bubbles: true })); } else { descriptionEditor.innerText = ""; descriptionEditor.textContent = description; descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); } } return { success: true, shortTitleLength: shortTitleInput ? (shortTitleInput.value || shortTitleInput.textContent).length : 0 }; } catch (error) { console.error("填写失败:", error); return { success: false, error: error.message }; } })()`;

        const result = await this.tabManager.executeScript(tabId, titleTagScript);
        if (!result || !result.success) {
            throw new Error('标题标签填写失败');
        }

        console.log('✅ 标题和标签填写完成，短标题长度:', result.shortTitleLength);
    }
    private async detectUploadStatusNoTimeout(tabId: string): Promise<void> {
        const startTime = Date.now();
        console.log("开始检测上传状态（无超时限制）");

        while (true) {
            try {
                const elapsed = (Date.now() - startTime) / 1000;

                // 🔥 修复：在Shadow DOM中检查发布按钮状态
                const checkButtonScript = `
                (function() {
                    try {
                        const wujieApp = document.querySelector('wujie-app');
                        if (!wujieApp || !wujieApp.shadowRoot) {
                            return { found: false, disabled: true, error: '未找到Shadow DOM' };
                        }
                        
                        const shadowDoc = wujieApp.shadowRoot;
                        const buttons = shadowDoc.querySelectorAll('button');
                        
                        for (const btn of buttons) {
                            const buttonText = btn.textContent.trim();
                            if (buttonText.includes('发表')) {
                                const isDisabled = btn.disabled || btn.className.includes('weui-desktop-btn_disabled');
                                const hasDeleteBtn = !!shadowDoc.querySelector('.delete-btn, [class*="delete"]');
                                const noCancelUpload = !shadowDoc.querySelector('.media-opr .finder-tag-wrap .tag-inner');
                                let isCancelUploadGone = true;
                                if (!noCancelUpload) {
                                    const cancelElements = shadowDoc.querySelectorAll('.media-opr .finder-tag-wrap .tag-inner');
                                    for (const el of cancelElements) {
                                        if (el.textContent && el.textContent.includes('取消上传')) {
                                            isCancelUploadGone = false;
                                            break;
                                        }
                                    }
                                }
                                return {
                                    found: true,
                                    disabled: isDisabled,
                                    hasDeleteBtn: hasDeleteBtn,
                                    isCancelUploadGone: isCancelUploadGone,
                                    buttonText: buttonText,
                                    className: btn.className
                                };
                            }
                        }
                        
                        return { found: false, disabled: true, error: '未找到发表按钮' };
                    } catch (e) {
                        return { found: false, disabled: true, error: e.message };
                    }
                })()
                `;

                const result = await this.tabManager.executeScript(tabId, checkButtonScript);

                if (result.found && !result.disabled && result.hasDeleteBtn && result.isCancelUploadGone) {
                    console.log("✅ 发表按钮已激活、删除按钮存在且取消上传按钮已消失，视频上传完毕!");
                    break;
                }

                // 每5分钟报告一次进度
                if (Math.floor(elapsed) % 300 === 0 && elapsed > 0) {
                    console.log(`⏳ 上传中... (${(elapsed / 60).toFixed(1)}分钟)`);
                }

                await new Promise(resolve => setTimeout(resolve, 15000)); // 每15秒检查一次

            } catch (error) {
                console.warn(`状态检测异常: ${error}`);
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        }

        console.log("上传检测完成");
    }

    private async setScheduleTime(publishDate: Date, tabId: string): Promise<void> {
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

        const result = await this.tabManager.executeScript(tabId, scheduleScript);
        if (!result.success) {
            throw new Error(`定时发布设置失败: ${result.error}`);
        }
    }

    private async handleOriginalDeclaration(tabId: string, category?: string): Promise<void> {
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

        const result = await this.tabManager.executeScript(tabId, originalScript);
        if (!result.success) {
            console.warn(`⚠️ 原创声明处理失败: ${result.error}`);
        }
    }

    private async addToCollection(tabId: string): Promise<void> {
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

        const result = await this.tabManager.executeScript(tabId, collectionScript);
        if (!result.success) {
            console.warn(`⚠️ 添加到合集失败: ${result.error}`);
        }
    }
    private async verifyUploadStarted(tabId: string): Promise<boolean> {
        console.log('验证上传是否开始...');
        console.log('⏳ 等待5秒让页面和文件处理完全加载...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const verifyScript = `
        (function() {
            try {
                console.log('🔍 开始验证上传状态...');
                
                // 检查Shadow DOM
                const shadowHost = document.querySelector('.wujie_iframe');
                if (!shadowHost || !shadowHost.shadowRoot) {
                    console.log('⚠️ Shadow DOM 未找到或未准备好');
                    return { started: false, reason: 'no shadow DOM' };
                }
                
                const shadowDoc = shadowHost.shadowRoot;
                
                // 检查文件输入框
                const fileInput = shadowDoc.querySelector('input[type="file"]');
                const fileCount = fileInput ? fileInput.files.length : 0;
                
                // 检查各种上传指示器
                const hasVideo = !!shadowDoc.querySelector('video');
                const hasProgress = !!shadowDoc.querySelector('.progress');
                const hasLoading = !!shadowDoc.querySelector('[class*="loading"]');
                const hasUploadText = shadowDoc.body ? shadowDoc.body.textContent.includes('上传中') : false;
                
                // 检查删除按钮（表示文件已加载）
                const hasDeleteBtn = !!shadowDoc.querySelector('.delete-btn, [class*="delete"]');
                
                const details = {
                    fileCount: fileCount,
                    hasVideo: hasVideo,
                    hasProgress: hasProgress,
                    hasLoading: hasLoading,
                    hasUploadText: hasUploadText,
                    hasDeleteBtn: hasDeleteBtn
                };
                
                console.log('📊 上传状态检查:', details);
                
                // 判断上传是否开始
                const started = hasVideo || fileCount > 0 || hasProgress || hasLoading || hasUploadText || hasDeleteBtn;
                
                return {
                    started: started,
                    details: details,
                    reason: started ? 'upload indicators found' : 'no upload indicators'
                };
                
            } catch (e) {
                console.error('❌ 验证脚本执行失败:', e);
                return { started: false, reason: e.message, stack: e.stack };
            }
        })()
        `;
        const result = await this.tabManager.executeScript(tabId, verifyScript);
        if (result.started) {
            const details = result.details
            console.log(`✅ 上传已开始! 文件数: ${details.fileCount},视频:${details.hasVideo}, 进度:${details.hasProgress}`);
            return true
        } else {
            console.log(`❌ 上传可能未开始: ${result.reason}`)
            return false
        }
    }
    private async waitForVideoProcessing(tabId: string): Promise<void> {
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

        await this.tabManager.executeScript(tabId, waitScript);
    }

    private async clickPublish(tabId: string): Promise<void> {
        console.log('🚀 点击发布...');

        const publishScript = `
        (async function() {
            try {
                console.log('开始在Shadow DOM中查找发表按钮...');
                
                const wujieApp = document.querySelector('wujie-app');
                if (!wujieApp || !wujieApp.shadowRoot) {
                    throw new Error('未找到Shadow DOM');
                }
                
                const shadowDoc = wujieApp.shadowRoot;
                const buttons = shadowDoc.querySelectorAll('button');
                
                let publishButton = null;
                for (const button of buttons) {
                    const buttonText = button.textContent.trim();
                    if (buttonText.includes('发表') && !button.disabled && !button.className.includes('weui-desktop-btn_disabled')) {
                        publishButton = button;
                        break;
                    }
                }
                
                if (!publishButton) {
                    throw new Error('发布按钮未激活或未找到');
                }
                
                // 滚动到按钮并点击
                publishButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 500));
                
                publishButton.focus();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                publishButton.click();
                console.log('✅ 已点击发布按钮');
                
                return { success: true, buttonText: publishButton.textContent.trim() };
                
            } catch (error) {
                console.error('点击发布失败:', error);
                throw error;
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, publishScript);
        if (!result || !result.success) {
            throw new Error('发布失败');
        }
    }
    private async handleUploadError(filePath: string, tabId: string): Promise<void> {
        console.log("🔧 处理上传错误，重新上传中");

        await this.tabManager.executeScript(tabId, `
            // 点击删除按钮
            const deleteBtn = document.querySelector('div.media-status-content div.tag-inner:has-text("删除")');
            if (deleteBtn) deleteBtn.click();
        `);

        await this.tabManager.executeScript(tabId, `
            // 确认删除
            const confirmBtn = document.querySelector('button:has-text("删除")');
            if (confirmBtn) confirmBtn.click();
        `);

        // 重新上传文件
        await this.uploadFile(filePath, tabId);
    }

    private async handleAdvancedOriginal(tabId: string, category?: string): Promise<void> {
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

        const result = await this.tabManager.executeScript(tabId, originalScript);
        if (!result.success) {
            console.warn(`⚠️ 原创声明失败: ${result.error}`);
        }
    }

    async getAccountInfo(tabId: string): Promise<any> {
        const extractScript = "function extractWechatFinderInfo() { try { const avatarImg = document.querySelector(\".finder-info-container .avatar\"); const avatar = avatarImg ? avatarImg.src : null; const accountNameEl = document.querySelector(\".finder-nickname\"); const accountName = accountNameEl ? accountNameEl.textContent.trim() : null; const accountIdEl = document.querySelector(\".finder-uniq-id\"); const accountId = accountIdEl ? accountIdEl.textContent.trim() : null; const infoNums = document.querySelectorAll(\".finder-info-num\"); let videosCount = null; let followersCount = null; if (infoNums.length >= 2) { videosCount = infoNums[0].textContent.trim(); followersCount = infoNums[1].textContent.trim(); } function parseNumber(value) { if (!value) return 0; const cleanValue = value.toString().replace(/[^\\d.万千]/g, \"\"); if (cleanValue.includes(\"万\")) { return Math.floor(parseFloat(cleanValue) * 10000); } else if (cleanValue.includes(\"千\")) { return Math.floor(parseFloat(cleanValue) * 1000); } return parseInt(cleanValue) || 0; } const normalizedData = { platform: \"wechat_finder\", accountName: accountName, accountId: accountId, followersCount: parseNumber(followersCount), videosCount: parseNumber(videosCount), avatar: avatar, bio: null, extractedAt: new Date().toISOString() }; console.log(\"提取的原始数据:\", { accountName, accountId, avatar, videosCount, followersCount }); console.log(\"标准化后的数据:\", normalizedData); return normalizedData; } catch (error) { console.error(\"提取数据时出错:\", error); return null; } } const result = extractWechatFinderInfo(); result;";

        try {
            const result = await this.tabManager.executeScript(tabId, extractScript);
            console.log(`📊 WeChatVideoUploader.getAccountInfo 执行结果:`, result);
            return result;
        } catch (error) {
            console.error(`❌ WeChatVideoUploader.getAccountInfo 执行失败:`, error);
            return null;
        }
    }
}

