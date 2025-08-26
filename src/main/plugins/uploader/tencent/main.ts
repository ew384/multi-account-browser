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

    async uploadVideoComplete(params: UploadParams, tabId: string): Promise<{ success: boolean; tabId?: string }> {
        try {
            console.log(`🎭 开始微信视频号完整上传流程... (${params.title})`);
            // 1. 文件上传
            await this.uploadFile(params.filePath, tabId);
            //const uploadStarted = await this.verifyUploadStarted(tabId);
            //if (!uploadStarted) {
            //    throw new Error("文件上传验证失败");
            //}
            // 2. 等待视频处理
            //await this.waitForVideoProcessing(tabId);
            // 3. 填写标题和标签
            await this.addTitleAndTags(params.title, params.tags, tabId);
            // 4. 填写地点
            if (params.location) {
                await this.setLocation(tabId, params.location);
            }
            // 5: 添加到合集（如果需要）
            if (params.addToCollection) {
                await this.addToCollection(tabId);
            }

            // 6: 处理原创声明（在发布前）
            if (params.enableOriginal) {
                await this.handleOriginalDeclaration(tabId, params.enableOriginal);
            }

            // 7:  处理定时发布
            if (params.publishDate) {
                console.log('🔧 开始处理定时发布，目标时间:', params.publishDate.toLocaleString('zh-CN'));
                await this.setScheduleTime(params.publishDate, tabId);
            }
            // 8: 设置封面（如果有）
            //if (params.thumbnailPath) {
            //    await this.setThumbnail(tabId, params.thumbnailPath);
            //}
            // 9: 等待上传完全完成
            await this.detectUploadStatusWithTimeout(tabId);
            // 9. 发布
            await this.clickPublish(tabId);

            return { success: true, tabId: tabId };
        } catch (error) {
            console.error('❌ 微信视频号流程失败:', error);
            throw error;
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

        // 🔥 步骤2：等待Shadow DOM准备好（新增）
        const shadowReady = await this.waitForShadowDOMReady(tabId);
        if (!shadowReady) {
            throw new Error('Shadow DOM准备超时');
        }
        console.log('✅ Shadow DOM已准备好');

        // 🔥 步骤3：等待文件输入框出现（新增）

        const inputReady = await this.waitForFileInput(tabId);
        if (!inputReady) {
            throw new Error('文件输入框准备超时');
        }
        console.log('✅ 文件输入框已准备好');

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
        const maxRetries = 20;  // 最多重试5次
        const retryDelay = 3000;  // 每次重试间隔3秒
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`⏳ 等待文件输入框准备... (第${attempt}/${maxRetries}次尝试)`);
                
                const waitScript = `
                    new Promise((resolve) => {
                        const timeout = 10000; // 每次尝试10秒超时
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

                const result = await this.tabManager.executeScript(tabId, waitScript);
                if (Boolean(result)) {
                    console.log(`✅ 文件输入框已准备好 (第${attempt}次尝试成功)`);
                    return true;
                }
                
                if (attempt < maxRetries) {
                    console.log(`⏳ 第${attempt}次尝试失败，${retryDelay/1000}秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                
            } catch (error) {
                console.error(`❌ 第${attempt}次尝试出错:`, error);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
            }
        }
        
        console.error('❌ 所有重试都失败了');
        return false;
    }
    private async setLocation(tabId: string, location?: string): Promise<void> {
        if (!location || location.trim() === '') {
            console.log('⏭️ 跳过位置设置 - 未提供位置信息');
            return;
        }

        console.log(`📍 设置微信视频号位置: ${location}`);

        const locationScript = `
        (async function setLocationForWechat() {
            try {
                console.log('🔍 开始设置位置为: ${location}');
                
                // 🔥 步骤1：检测Shadow DOM
                const wujieApp = document.querySelector('wujie-app');
                let searchDoc = document;
                
                if (wujieApp && wujieApp.shadowRoot) {
                    console.log('✅ 检测到Shadow DOM');
                    searchDoc = wujieApp.shadowRoot;
                }
                
                // 🔥 步骤2：查找并点击位置区域
                const possibleClickTargets = [
                    '.position-display-wrap',
                    '.position-display',
                    '.post-position-wrap .position-display',
                    '.place',
                    '[class*="position"]'
                ];
                
                let clickTarget = null;
                for (const selector of possibleClickTargets) {
                    clickTarget = searchDoc.querySelector(selector);
                    if (clickTarget) {
                        console.log('✅ 找到位置点击目标:', selector);
                        break;
                    }
                }
                
                if (!clickTarget) {
                    // 通过文本查找备选方案
                    const allElements = searchDoc.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.textContent && (el.textContent.includes('深圳市') || el.textContent.includes('位置'))) {
                            clickTarget = el.closest('.position-display-wrap') || el.closest('.position-display') || el;
                            break;
                        }
                    }
                }
                
                if (!clickTarget) {
                    console.log('⚠️ 未找到位置点击区域，跳过位置设置');
                    return { success: true, message: '位置区域未找到，跳过设置' };
                }
                
                // 点击展开位置选择框
                clickTarget.click();
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // 🔥 步骤3：查找搜索输入框
                const searchInput = searchDoc.querySelector('input[placeholder*="搜索"], input[placeholder*="位置"]');
                if (!searchInput) {
                    console.log('⚠️ 未找到搜索输入框，跳过位置设置');
                    return { success: true, message: '搜索框未找到，跳过设置' };
                }
                
                console.log('✅ 找到搜索输入框');
                
                // 🔥 步骤4：输入目标位置
                searchInput.focus();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 清空并输入位置
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 300));
                
                searchInput.value = '${location}';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                console.log('📝 已输入位置:', '${location}');
                
                // 🔥 步骤5：等待搜索结果加载
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 🔥 步骤6：智能选择位置
                const optionItems = searchDoc.querySelectorAll('.option-item:not(.active)');
                console.log('📋 找到位置选项数量:', optionItems.length);
                
                if (optionItems.length === 0) {
                    console.log('⚠️ 没有找到搜索结果，保持当前位置');
                    return { success: true, location: '保持原位置', message: '没有搜索结果' };
                }
                
                // 智能选择策略
                let selectedOption = null;
                let selectedLocation = '';
                
                // 策略1：查找精确匹配或包含目标关键词的选项
                for (const item of optionItems) {
                    const nameElement = item.querySelector('.name');
                    if (nameElement) {
                        const locationName = nameElement.textContent.trim();
                        
                        // 精确匹配优先
                        if (locationName === '${location}') {
                            selectedOption = item;
                            selectedLocation = locationName;
                            console.log('🎯 找到精确匹配:', locationName);
                            break;
                        }
                        
                        // 包含关键词匹配
                        if (locationName.includes('${location}') || '${location}'.includes(locationName)) {
                            selectedOption = item;
                            selectedLocation = locationName;
                            console.log('✅ 找到包含匹配:', locationName);
                            break;
                        }
                    }
                }
                
                // 策略2：如果没有匹配，选择第一个推荐选项
                if (!selectedOption) {
                    console.log('🔄 没有找到匹配项，选择第一个推荐位置...');
                    
                    for (const item of optionItems) {
                        const nameElement = item.querySelector('.name');
                        if (nameElement) {
                            const locationName = nameElement.textContent.trim();
                            
                            // 排除"不显示位置"等无效选项
                            if (!locationName.includes('不显示') && !locationName.includes('不显示位置') && locationName.length > 0) {
                                selectedOption = item;
                                selectedLocation = locationName;
                                console.log('📍 选择第一个推荐位置:', locationName);
                                break;
                            }
                        }
                    }
                }
                
                // 🔥 步骤7：点击选择的位置
                if (selectedOption) {
                    selectedOption.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    console.log('🎉 位置设置成功:', selectedLocation);
                    return { 
                        success: true, 
                        location: selectedLocation,
                        searchTerm: '${location}',
                        strategy: selectedLocation.includes('${location}') ? 'exact_match' : 'first_recommendation'
                    };
                } else {
                    console.log('⚠️ 没有找到任何可选择的位置选项');
                    return { success: true, message: '没有可选位置，保持默认' };
                }
                
            } catch (e) {
                console.error('❌ 位置设置失败:', e.message);
                return { success: false, error: e.message };
            }
        })()
        `;

        try {
            const result = await this.tabManager.executeScript(tabId, locationScript);
            if (result && result.success) {
                console.log(`✅ 位置设置完成: ${result.location || location}`);
            } else {
                console.warn(`⚠️ 位置设置异常: ${result?.error || result?.message || '未知错误'}`);
            }
        } catch (error) {
            console.error('❌ 位置设置脚本执行失败:', error);
            // 不抛出错误，允许上传流程继续
        }
    }
    private async addTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
        console.log('📝 填写标题和标签...');

        const titleTagScript = `(async function() { 
            try { 
                console.log("开始填写短标题、描述和标签..."); 
                const title = ${JSON.stringify(title)}; 
                const tags = ${JSON.stringify(tags)}; 
                // 修改：描述部分不再包含标题，只包含标签
                
                const wujieApp = document.querySelector("wujie-app"); 
                if (!wujieApp || !wujieApp.shadowRoot) { 
                    return { success: false, error: "未找到Shadow DOM" }; 
                } 
                
                const shadowDoc = wujieApp.shadowRoot; 
                const allInputs = shadowDoc.querySelectorAll("input[type=text], div[contenteditable], textarea"); 
                let shortTitleInput = null; 
                let descriptionEditor = null; 
                
                for (let i = 0; i < allInputs.length; i++) { 
                    const input = allInputs[i]; 
                    const placeholder = input.placeholder || input.getAttribute("data-placeholder") || ""; 
                    if (placeholder.includes("6-16") || placeholder.includes("短标题") || placeholder.includes("标题")) { 
                        shortTitleInput = input; 
                    } else if (placeholder.includes("添加描述") || placeholder.includes("描述")) { 
                        descriptionEditor = input; 
                    } 
                } 
                
                if (shortTitleInput) { 
                    let finalTitle = title; 
                    if (finalTitle.length < 6) { 
                        const spacesToAdd = 6 - finalTitle.length; 
                        finalTitle = finalTitle + " ".repeat(spacesToAdd); 
                        console.log("短标题不足6字符，已自动补齐:", finalTitle, "(长度:" + finalTitle.length + ")"); 
                    } else { 
                        console.log("短标题长度符合要求:", finalTitle, "(长度:" + finalTitle.length + ")"); 
                    } 
                    
                    shortTitleInput.scrollIntoView({ behavior: "smooth", block: "center" }); 
                    shortTitleInput.click(); 
                    shortTitleInput.focus(); 
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                    
                    if (shortTitleInput.tagName === "INPUT") { 
                        shortTitleInput.value = ""; 
                        shortTitleInput.value = finalTitle; 
                        shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); 
                        shortTitleInput.dispatchEvent(new Event("change", { bubbles: true })); 
                    } else { 
                        shortTitleInput.innerText = ""; 
                        shortTitleInput.textContent = finalTitle; 
                        shortTitleInput.dispatchEvent(new Event("input", { bubbles: true })); 
                    } 
                    console.log("短标题已填写:", finalTitle); 
                } else { 
                    console.log("警告：未找到短标题输入框"); 
                } 
                
                await new Promise(resolve => setTimeout(resolve, 500)); 
                
                if (descriptionEditor && tags.length > 0) { 
                    descriptionEditor.scrollIntoView({ behavior: "smooth", block: "center" }); 
                    descriptionEditor.click(); 
                    descriptionEditor.focus(); 
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                    
                    // 修改：只填入标签，不包含标题
                    const contentWithTags = tags.map(tag => "#" + tag).join(" "); 
                    
                    if (descriptionEditor.tagName === "INPUT") { 
                        descriptionEditor.value = ""; 
                        descriptionEditor.value = contentWithTags; 
                        descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); 
                        descriptionEditor.dispatchEvent(new Event("change", { bubbles: true })); 
                    } else { 
                        descriptionEditor.innerText = ""; 
                        descriptionEditor.textContent = contentWithTags; 
                        descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); 
                    } 
                    console.log("标签已填写到描述框:", contentWithTags); 
                } else if (descriptionEditor) { 
                    console.log("无标签，描述框留空"); 
                    // 修改：如果没有标签，描述框保持空白
                    descriptionEditor.scrollIntoView({ behavior: "smooth", block: "center" }); 
                    descriptionEditor.click(); 
                    descriptionEditor.focus(); 
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                    
                    if (descriptionEditor.tagName === "INPUT") { 
                        descriptionEditor.value = ""; 
                        descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); 
                        descriptionEditor.dispatchEvent(new Event("change", { bubbles: true })); 
                    } else { 
                        descriptionEditor.innerText = ""; 
                        descriptionEditor.textContent = ""; 
                        descriptionEditor.dispatchEvent(new Event("input", { bubbles: true })); 
                    } 
                } 
                
                return { 
                    success: true, 
                    shortTitleLength: shortTitleInput ? (shortTitleInput.value || shortTitleInput.textContent).length : 0 
                }; 
            } catch (error) { 
                console.error("填写失败:", error); 
                return { success: false, error: error.message }; 
            } 
        })()`;

        const result = await this.tabManager.executeScript(tabId, titleTagScript);
        if (!result || !result.success) {
            throw new Error('标题标签填写失败');
        }

        console.log('✅ 标题和标签填写完成，短标题长度:', result.shortTitleLength);
    }
    private async detectUploadStatusWithTimeout(tabId: string): Promise<void> {
        const startTime = Date.now();
        const timeoutMs = 5 * 60 * 1000; // 5分钟超时
        console.log("开始检测上传状态（5分钟超时）");

        while (true) {
            try {
                const elapsed = (Date.now() - startTime) / 1000;
                
                // 🔥 检查超时
                if (Date.now() - startTime > timeoutMs) {
                    console.log(`⏰ 上传状态检测超时 (${elapsed.toFixed(1)}秒)，继续下一步...`);
                    console.log("⚠️ 注意：可能上传未完全完成，但继续执行后续步骤");
                    break;
                }

                // 🔥 修复：改进的Shadow DOM检查发布按钮状态
                const checkButtonScript = `
                (function() {
                    try {
                        const wujieApp = document.querySelector('wujie-app');
                        if (!wujieApp || !wujieApp.shadowRoot) {
                            return { found: false, disabled: true, error: '未找到Shadow DOM' };
                        }
                        
                        const shadowDoc = wujieApp.shadowRoot;
                        const buttons = shadowDoc.querySelectorAll('button');
                        
                        let publishButton = null;
                        let hasDeleteBtn = false;
                        
                        // 遍历所有按钮，同时查找发表按钮和删除按钮
                        for (const btn of buttons) {
                            const buttonText = btn.textContent.trim();
                            
                            // 查找发表按钮
                            if (buttonText.includes('发表')) {
                                publishButton = btn;
                            }
                            
                            // 🔥 修复：直接通过按钮文本查找删除按钮
                            if (buttonText === '删除') {
                                hasDeleteBtn = true;
                            }
                        }
                        
                        if (!publishButton) {
                            return { found: false, disabled: true, error: '未找到发表按钮' };
                        }
                        
                        const isDisabled = publishButton.disabled || publishButton.className.includes('weui-desktop-btn_disabled');
                        
                        // 检查取消上传按钮是否消失
                        const cancelUploadElements = shadowDoc.querySelectorAll('.media-opr .finder-tag-wrap .tag-inner');
                        let isCancelUploadGone = true;
                        for (const el of cancelUploadElements) {
                            if (el.textContent && el.textContent.includes('取消上传')) {
                                isCancelUploadGone = false;
                                break;
                            }
                        }
                        
                        return {
                            found: true,
                            disabled: isDisabled,
                            hasDeleteBtn: hasDeleteBtn,
                            isCancelUploadGone: isCancelUploadGone,
                            buttonText: publishButton.textContent.trim(),
                            className: publishButton.className
                        };
                    } catch (e) {
                        return { found: false, disabled: true, error: e.message };
                    }
                })()
                `;

                const result = await this.tabManager.executeScript(tabId, checkButtonScript);

                if (result.found && !result.disabled && result.hasDeleteBtn && result.isCancelUploadGone) {
                    console.log(`✅ 发表按钮已激活、删除按钮存在且取消上传按钮已消失，视频上传完毕! (耗时: ${elapsed.toFixed(1)}秒)`);
                    break;
                }

                // 每30秒报告一次进度
                if (Math.floor(elapsed) % 30 === 0 && elapsed > 0) {
                    const remainingTime = (timeoutMs / 1000 - elapsed).toFixed(1);
                    console.log(`⏳ 上传中... (${elapsed.toFixed(1)}秒/${(timeoutMs/1000).toFixed(1)}秒) 剩余: ${remainingTime}秒`);
                    
                    // 🔥 输出当前检测状态用于调试
                    console.log(`📊 当前状态: 发表按钮${result.found ? '已找到' : '未找到'}, ${result.disabled ? '已禁用' : '未禁用'}, 删除按钮${result.hasDeleteBtn ? '存在' : '不存在'}, 取消上传${result.isCancelUploadGone ? '已消失' : '仍存在'}`);
                }

                await new Promise(resolve => setTimeout(resolve, 10000)); // 每10秒检查一次

            } catch (error) {
                console.warn(`状态检测异常: ${error}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        console.log("上传检测完成，继续下一步");
    }

    private async setThumbnail(tabId: string, thumbnailData?: string): Promise<void> {
        if (!thumbnailData || thumbnailData.trim() === '') {
            console.log('⏭️ 跳过封面设置 - 未提供封面数据');
            return;
        }

        console.log(`🖼️ 设置微信视频号封面，数据类型: ${thumbnailData.startsWith('data:') ? 'base64' : '文件路径'}`);

        const thumbnailScript = `
        (async function setWechatThumbnail() {
            try {
                console.log('🖼️ 开始设置微信视频号封面');
                
                // 检测Shadow DOM
                const wujieApp = document.querySelector('wujie-app');
                let searchDoc = document;
                
                if (wujieApp && wujieApp.shadowRoot) {
                    console.log('✅ 检测到Shadow DOM');
                    searchDoc = wujieApp.shadowRoot;
                }
                
                // 查找并点击"更换封面"按钮
                const changeCoverButton = searchDoc.querySelector('.finder-tag-wrap.btn .tag-inner');
                if (!changeCoverButton || !changeCoverButton.textContent.includes('更换封面')) {
                    console.log('⚠️ 未找到"更换封面"按钮，跳过封面设置');
                    return { success: true, message: '更换封面按钮未找到，跳过设置' };
                }
                
                changeCoverButton.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 查找上传封面区域
                const uploadCoverWrap = searchDoc.querySelector('.single-cover-uploader-wrap');
                if (!uploadCoverWrap) {
                    console.log('⚠️ 未找到上传封面区域，跳过封面设置');
                    return { success: true, message: '上传区域未找到，跳过设置' };
                }
                
                const fileInput = uploadCoverWrap.querySelector('input[type="file"]');
                if (!fileInput) {
                    console.log('⚠️ 未找到文件输入框，跳过封面设置');
                    return { success: true, message: '文件输入框未找到，跳过设置' };
                }
                
                // 🔥 关键修改：处理base64数据
                const thumbnailData = '${thumbnailData}';
                let blob;
                
                if (thumbnailData.startsWith('data:')) {
                    // 处理base64数据
                    console.log('📸 处理base64格式的封面数据');
                    const base64Data = thumbnailData.split(',')[1];
                    const mimeType = thumbnailData.match(/data:([^;]+)/)[1];
                    
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    blob = new Blob([bytes], { type: mimeType });
                } else {
                    // 处理文件路径（保持原有逻辑）
                    console.log('📁 处理文件路径格式的封面数据');
                    const response = await fetch(thumbnailData);
                    if (!response.ok) {
                        throw new Error('文件加载失败: ' + response.status);
                    }
                    blob = await response.blob();
                }
                
                // 创建File对象
                const file = new File([blob], 'cover.jpg', {
                    type: blob.type || 'image/jpeg'
                });
                
                console.log('✅ 文件对象创建成功:', file.name, file.size, 'bytes');
                
                // 设置文件到input
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                
                Object.defineProperty(fileInput, 'files', {
                    value: dataTransfer.files,
                    configurable: true
                });
                
                // 触发事件
                const changeEvent = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(changeEvent);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 查找并点击确认按钮
                const finalConfirmButton = searchDoc.querySelector('.cover-set-footer .weui-desktop-btn_primary');
                if (finalConfirmButton && finalConfirmButton.textContent.includes('确认')) {
                    finalConfirmButton.click();
                    console.log('✅ 封面设置完成');
                }
                
                return { success: true, message: '封面设置完成' };
                
            } catch (error) {
                console.error('❌ 封面设置失败:', error.message);
                return { success: false, error: error.message };
            }
        })()
        `;

        try {
            const result = await this.tabManager.executeScript(tabId, thumbnailScript);
            if (result && result.success) {
                console.log(`✅ 封面设置完成`);
            } else {
                console.warn(`⚠️ 封面设置异常: ${result?.error || result?.message || '未知错误'}`);
            }
        } catch (error) {
            console.error('❌ 封面设置脚本执行失败:', error);
        }
    }   
    private async setScheduleTime(publishDate: Date, tabId: string): Promise<void> {
        console.log('⏰ 设置定时发布...');

        const scheduleScript = `
        (async function() {
            try {
                console.log('🔥 开始设置定时发布...');
                
                const wujieApp = document.querySelector('wujie-app');
                if (!wujieApp || !wujieApp.shadowRoot) {
                    throw new Error('未找到Shadow DOM');
                }
                
                const shadowDoc = wujieApp.shadowRoot;
                
                // 步骤1：激活定时发布选项
                const timeSection = shadowDoc.querySelector('.post-time-wrap');
                if (!timeSection) {
                    throw new Error('未找到定时发表区域');
                }
                
                const scheduledRadio = timeSection.querySelector('input[type="radio"][value="1"]');
                if (!scheduledRadio) {
                    throw new Error('未找到定时发布单选按钮');
                }
                
                if (!scheduledRadio.checked) {
                    scheduledRadio.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log('✅ 已激活定时发布');
                }
                
                // 步骤2：等待时间选择器出现
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const targetMonth = ${publishDate.getMonth() + 1};
                const targetDay = ${publishDate.getDate()};
                const targetHour = ${publishDate.getHours()};
                const targetMinute = ${publishDate.getMinutes()};
                
                console.log('目标时间:', targetMonth + '月' + targetDay + '日 ' + targetHour + ':' + String(targetMinute).padStart(2, '0'));
                
                // 步骤3：查找并操作时间选择器
                const dateTimePicker = shadowDoc.querySelector('.weui-desktop-picker__date-time');
                if (!dateTimePicker) {
                    throw new Error('激活定时后未找到时间选择器');
                }
                
                const dateInput = dateTimePicker.querySelector('input');
                if (!dateInput) {
                    throw new Error('未找到日期输入框');
                }
                
                // 步骤4：点击日期输入框弹出日历
                dateInput.click();
                console.log('✅ 已点击日期输入框');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 检查日历是否已显示，如果未显示尝试其他点击方式
                const calendarPanel = shadowDoc.querySelector('.weui-desktop-picker__dd');
                if (calendarPanel && calendarPanel.style.display === 'none') {
                    const dateTimeArea = shadowDoc.querySelector('.weui-desktop-picker__dt');
                    if (dateTimeArea) {
                        dateTimeArea.click();
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 步骤5：选择日期
                const dayLinks = shadowDoc.querySelectorAll('a[href="javascript:;"]');
                const targetDayLink = Array.from(dayLinks).find(link => 
                    link.textContent.trim() === targetDay.toString() && 
                    !link.classList.contains('weui-desktop-picker__disabled') && 
                    !link.classList.contains('weui-desktop-picker__faded')
                );
                
                if (targetDayLink) {
                    targetDayLink.click();
                    console.log('✅ 已选择日期:', targetDay + '日');
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.log('⚠️ 未找到目标日期，使用当前选中日期');
                }
                
                // 步骤6：设置时间
                const timeInput = shadowDoc.querySelector('.weui-desktop-picker__time input');
                if (!timeInput) {
                    throw new Error('未找到时间输入框');
                }
                
                // 点击时间输入框显示时间选择面板
                timeInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 如果时间面板未显示，尝试点击时间图标
                let timePanel = shadowDoc.querySelector('.weui-desktop-picker__dd__time');
                if (timePanel && timePanel.style.display === 'none') {
                    const timeIcon = shadowDoc.querySelector('.weui-desktop-icon__time');
                    if (timeIcon) {
                        timeIcon.click();
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                
                // 设置小时
                const hourList = shadowDoc.querySelector('.weui-desktop-picker__time__hour');
                if (hourList) {
                    const hourItems = hourList.querySelectorAll('li');
                    if (hourItems[targetHour]) {
                        hourItems[targetHour].click();
                        console.log('✅ 已设置小时:', targetHour);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                
                // 设置分钟
                const minuteList = shadowDoc.querySelector('.weui-desktop-picker__time__minute');
                if (minuteList) {
                    const minuteItems = minuteList.querySelectorAll('li');
                    if (minuteItems[targetMinute]) {
                        minuteItems[targetMinute].click();
                        console.log('✅ 已设置分钟:', String(targetMinute).padStart(2, '0'));
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                
                // 步骤7：确认时间设置
                const dateInputForConfirm = shadowDoc.querySelector('.weui-desktop-picker__date-time input');
                if (dateInputForConfirm) {
                    dateInputForConfirm.click();
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // 点击页面其他区域确保设置生效
                const bodyArea = shadowDoc.querySelector('body') || shadowDoc;
                if (bodyArea) {
                    const event = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    bodyArea.dispatchEvent(event);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                console.log('✅ 定时发布设置完成:', targetMonth + '月' + targetDay + '日 ' + targetHour + ':' + String(targetMinute).padStart(2, '0'));
                return { success: true };

            } catch (e) {
                console.error('❌ 定时发布设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, scheduleScript);
        if (!result || !result.success) {
            throw new Error(`定时发布设置失败: ${result?.error || '未知错误'}`);
        }
    }

    private async handleOriginalDeclaration(tabId: string, enableOriginal: boolean = true): Promise<void> {
        if (!enableOriginal) {
            console.log('⏭️ 跳过原创声明');
            return;
        }
        
        console.log('📋 处理原创声明...');

        const originalScript = `
        (async function() {
            try {
                console.log('🔥 开始处理原创声明...');
                
                // 在Shadow DOM中查找原创声明复选框
                const wujieApp = document.querySelector('wujie-app');
                if (!wujieApp || !wujieApp.shadowRoot) {
                    throw new Error('未找到Shadow DOM');
                }
                
                const shadowDoc = wujieApp.shadowRoot;
                
                // 查找包含"声明后，作品将展示原创标记"的复选框
                const labels = shadowDoc.querySelectorAll('label.ant-checkbox-wrapper');
                let originalCheckbox = null;
                
                for (const label of labels) {
                    if (label.textContent && label.textContent.includes('声明后，作品将展示原创标记')) {
                        originalCheckbox = label.querySelector('input.ant-checkbox-input');
                        break;
                    }
                }
                
                if (originalCheckbox && !originalCheckbox.checked) {
                    originalCheckbox.click();
                    console.log('✅ 已点击原创声明复选框');
                    
                    // 等待可能的弹框
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    // 在对话框中查找并勾选"我已阅读并同意"的checkbox
                    const agreeCheckbox = shadowDoc.querySelector('.weui-desktop-dialog .ant-checkbox-wrapper input[type="checkbox"]');
                    if (agreeCheckbox && !agreeCheckbox.checked) {
                        agreeCheckbox.click();
                        console.log('✅ 已勾选我已阅读并同意');
                        
                        // 等待按钮激活
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // 点击对话框中的"声明原创"按钮
                    const dialogButtons = shadowDoc.querySelectorAll('.weui-desktop-dialog__ft button');
                    let originalButton = null;

                    for (const button of dialogButtons) {
                        console.log('找到按钮:', button.textContent.trim(), '禁用状态:', button.disabled);
                        if (button.textContent.trim() === '声明原创') {
                            originalButton = button;
                            break;
                        }
                    }

                    if (originalButton) {
                        if (!originalButton.disabled) {
                            originalButton.click();
                            console.log('✅ 已点击声明原创按钮');
                        } else {
                            console.log('⚠️ 声明原创按钮仍被禁用，等待后重试');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            if (!originalButton.disabled) {
                                originalButton.click();
                                console.log('✅ 延迟后成功点击声明原创按钮');
                            }
                        }
                    } else {
                        console.log('⚠️ 未找到声明原创按钮');
                        dialogButtons.forEach((btn, index) => {
                            console.log('按钮' + index + ': ' + btn.textContent.trim() + ' 禁用:' + btn.disabled);
                        });
                    }
                } else if (originalCheckbox && originalCheckbox.checked) {
                    console.log('✅ 原创声明已经勾选');
                } else {
                    console.log('⚠️ 未找到原创声明复选框');
                }

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

