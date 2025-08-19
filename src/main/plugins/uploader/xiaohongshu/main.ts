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

    private async clickPublishButton(tabId: string): Promise<void> {
        console.log('🔍 点击小红书发布按钮...');

        const clickPublishScript = `
        (function() {
            console.log('🔍 查找小红书发布按钮...');
            
            const publishLink = document.querySelector('a[href*="creator.xiaohongshu.com/publish"]');
            
            if (publishLink) {
                console.log('✅ 找到发布按钮，准备点击');
                publishLink.click();
                console.log('✅ 发布按钮已点击');
                return true;
            } else {
                console.log('❌ 未找到发布按钮');
                return false;
            }
        })()
        `;

        const clickResult = await this.tabManager.executeScript(tabId, clickPublishScript);
        
        if (!clickResult) {
            throw new Error('未找到或点击发布按钮失败');
        }

        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('✅ 发布按钮点击完成，页面已加载');
    }
    async uploadVideoComplete(params: UploadParams, tabId: string): Promise<{ success: boolean; tabId?: string }> {
        try {
            // 🔥 0. 点击页面发布按钮
            await this.clickPublishButton(tabId);
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
            if (params.location) {
                await this.setLocation(tabId, params.location);
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
                
                // 步骤1：查找并点击"定时发布"选项
                console.log('📍 查找定时发布选项...');
                
                const scheduleLabels = Array.from(document.querySelectorAll('label.el-radio'));
                console.log('找到的所有radio label:', scheduleLabels.length);
                
                let scheduleLabel = null;
                for (const label of scheduleLabels) {
                    const spanText = label.querySelector('.el-radio__label');
                    console.log('检查label文本:', spanText?.textContent);
                    if (spanText && spanText.textContent.includes('定时发布')) {
                        scheduleLabel = label;
                        break;
                    }
                }
                
                if (!scheduleLabel) {
                    throw new Error('未找到定时发布选项');
                }
                
                console.log('✅ 找到定时发布选项，准备点击...');
                scheduleLabel.click();
                
                // 等待UI更新
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('✅ 已点击定时发布选项');

                // 步骤2：格式化发布时间
                const publishDateStr = '${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-${String(publishDate.getDate()).padStart(2, '0')} ${String(publishDate.getHours()).padStart(2, '0')}:${String(publishDate.getMinutes()).padStart(2, '0')}';
                console.log('格式化时间:', publishDateStr);

                // 步骤3：设置时间
                console.log('📅 开始设置时间...');
                
                // 查找时间输入框
                const timeInput = document.querySelector('.el-date-editor input.el-input__inner');
                if (!timeInput) {
                    throw new Error('未找到时间输入框');
                }
                
                console.log('✅ 找到时间输入框，当前值:', timeInput.value);
                
                // 点击输入框激活
                timeInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 清空输入框并设置新值
                timeInput.focus();
                timeInput.select(); // 全选
                
                // 使用 input 事件设置值
                timeInput.value = publishDateStr;
                
                // 触发必要的事件
                timeInput.dispatchEvent(new Event('input', { bubbles: true }));
                timeInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 按回车确认
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    bubbles: true
                });
                timeInput.dispatchEvent(enterEvent);
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 点击输入框外部关闭日期选择器
                document.body.click();
                
                console.log('✅ 定时发布设置成功:', publishDateStr);
                console.log('✅ 当前输入框值:', timeInput.value);

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
                    // 确定期望的按钮文本
                    const expectedButtonText = isScheduled ? '定时发布' : '发布';
                    console.log('查找发布按钮，期望文本:', expectedButtonText);
                    
                    let publishButton = null;
                    
                    // 方法1：在 .submit 容器中查找按钮
                    const submitButtons = document.querySelectorAll('.submit button');
                    console.log('找到', submitButtons.length, '个提交按钮');
                    
                    for (const button of submitButtons) {
                        const buttonText = button.textContent?.trim() || '';
                        console.log('检查按钮文本:', buttonText);
                        
                        if (buttonText === expectedButtonText) {
                            publishButton = button;
                            console.log('✅ 找到匹配的发布按钮');
                            break;
                        }
                    }
                    
                    // 方法2：如果没找到精确匹配，查找包含"发布"的按钮
                    if (!publishButton) {
                        console.log('未找到精确匹配，查找包含"发布"的按钮...');
                        
                        for (const button of submitButtons) {
                            const buttonText = button.textContent?.trim() || '';
                            
                            if (buttonText.includes('发布')) {
                                publishButton = button;
                                console.log('✅ 找到包含"发布"的按钮:', buttonText);
                                break;
                            }
                        }
                    }
                    
                    // 方法3：查找红色的主要按钮作为后备
                    if (!publishButton) {
                        console.log('仍未找到，查找红色主要按钮...');
                        
                        const redButtons = document.querySelectorAll('button[class*="red"]:not([class*="disabled"])');
                        for (const button of redButtons) {
                            const buttonText = button.textContent?.trim() || '';
                            
                            if (buttonText.includes('发布')) {
                                publishButton = button;
                                console.log('✅ 找到红色发布按钮:', buttonText);
                                break;
                            }
                        }
                    }
                    
                    if (!publishButton) {
                        console.log('📤 等待发布按钮出现...');
                        setTimeout(tryPublish, 500);
                        return;
                    }
                    
                    // 检查按钮是否可点击
                    const isDisabled = publishButton.disabled || publishButton.classList.contains('disabled');
                    if (isDisabled) {
                        console.log('📤 等待发布按钮激活...');
                        setTimeout(tryPublish, 500);
                        return;
                    }
                    
                    const buttonText = publishButton.textContent?.trim() || '';
                    console.log('✅ 准备点击发布按钮:', buttonText);
                    
                    // 点击发布按钮
                    publishButton.click();
                    console.log('✅ 已点击发布按钮');
                    
                    // 等待页面跳转或状态变化
                    const checkSuccess = () => {
                        // 检查是否跳转到成功页面
                        if (window.location.href.includes('creator.xiaohongshu.com/publish/success') ||
                            window.location.href.includes('/success')) {
                            console.log('✅ 检测到跳转到成功页面');
                            resolve(true);
                            return;
                        }
                        
                        // 检查是否有成功提示
                        const successMessages = document.querySelectorAll('[class*="success"], [class*="Success"]');
                        for (const msg of successMessages) {
                            if (msg.textContent && msg.textContent.includes('成功')) {
                                console.log('✅ 检测到成功提示:', msg.textContent.trim());
                                resolve(true);
                                return;
                            }
                        }
                        
                        // 检查是否有错误提示
                        const errorMessages = document.querySelectorAll('[class*="error"], [class*="Error"], [class*="fail"]');
                        for (const msg of errorMessages) {
                            if (msg.textContent && (
                                msg.textContent.includes('失败') || 
                                msg.textContent.includes('错误')
                            )) {
                                console.log('❌ 检测到错误提示:', msg.textContent.trim());
                                reject(new Error(\`发布失败: \${msg.textContent.trim()}\`));
                                return;
                            }
                        }
                        
                        // 如果按钮点击后在合理时间内没有明确的成功/失败信号，认为点击成功
                        if (Date.now() - startTime > 8000) { // 8秒后认为成功
                            console.log('✅ 发布按钮已点击，未检测到错误，认为成功');
                            resolve(true);
                            return;
                        }
                        
                        setTimeout(checkSuccess, 500);
                    };
                    
                    setTimeout(checkSuccess, 1000);
                    return;
                    
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

    private async setLocation(tabId: string, location: string): Promise<void> {
        console.log('📍 设置地理位置...');

        const locationScript = `
        (async function() {
            try {
                console.log('开始设置位置:', '${location}');
                
                // 步骤1：找到并点击"添加地点"下拉框
                const addressBox = document.querySelector('.address-box');
                if (!addressBox) {
                    throw new Error('未找到地点表单容器');
                }
                
                const locationDropdown = addressBox.querySelector('.d-select-wrapper .d-select');
                if (!locationDropdown) {
                    throw new Error('未找到地点下拉框');
                }
                
                console.log('✅ 找到"添加地点"下拉框，准备点击...');
                locationDropdown.click();
                
                // 步骤2：等待输入框激活并输入地点
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const inputElement = addressBox.querySelector('.d-select-input-filter:not(.hide) input') ||
                                    addressBox.querySelector('.d-select-input-filter input');
                
                if (!inputElement) {
                    throw new Error('下拉框点击后未找到输入框');
                }
                
                console.log('✅ 找到输入框，开始输入地点...');
                
                // 输入地点名称
                inputElement.focus();
                inputElement.value = '';
                inputElement.value = '${location}';
                
                // 触发输入事件
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                inputElement.dispatchEvent(new Event('keyup', { bubbles: true }));
                
                console.log('✅ 已输入地点:', '${location}');
                
                // 步骤3：触发地点选项列表显示
                inputElement.click();
                inputElement.focus();
                
                // 发送箭头下键触发下拉列表
                const arrowDownEvent = new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    keyCode: 40,
                    bubbles: true
                });
                inputElement.dispatchEvent(arrowDownEvent);
                
                // 等待地点选项列表加载
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // 步骤4：查找并显示地点选项列表
                const allDropdowns = document.querySelectorAll('.d-popover.d-dropdown');
                let locationOptionsDropdown = null;
                
                // 查找包含地点数据的下拉列表
                for (let i = 0; i < allDropdowns.length; i++) {
                    const dropdown = allDropdowns[i];
                    const style = window.getComputedStyle(dropdown);
                    const hasLocationData = dropdown.textContent.includes('${location.substring(0, 2)}') || 
                                        dropdown.querySelector('.item .name') !== null;
                    
                    if (style.display !== 'none' && hasLocationData) {
                        locationOptionsDropdown = dropdown;
                        console.log('✅ 找到可见的地点选项列表');
                        break;
                    }
                }
                
                // 如果没有找到可见的，强制显示隐藏的地点列表
                if (!locationOptionsDropdown) {
                    for (let i = 0; i < allDropdowns.length; i++) {
                        const dropdown = allDropdowns[i];
                        const hasLocationData = dropdown.textContent.includes('${location.substring(0, 2)}') || 
                                            dropdown.querySelector('.item .name') !== null;
                        
                        if (hasLocationData) {
                            console.log('✅ 找到隐藏的地点列表，强制显示...');
                            dropdown.style.display = 'block';
                            dropdown.style.visibility = 'visible';
                            dropdown.style.opacity = '1';
                            locationOptionsDropdown = dropdown;
                            break;
                        }
                    }
                }
                
                if (!locationOptionsDropdown) {
                    throw new Error('未找到地点选项下拉列表');
                }
                
                // 步骤5：选择第一个地点选项
                const locationOptions = locationOptionsDropdown.querySelectorAll('.d-grid-item .item .name');
                console.log('找到地点选项数量:', locationOptions.length);
                
                if (locationOptions.length > 0) {
                    const firstOption = locationOptions[0];
                    const optionText = firstOption.textContent.trim();
                    console.log('✅ 准备选择第一个地点:', optionText);
                    
                    // 找到可点击的容器并点击
                    const clickableContainer = firstOption.closest('.item') || 
                                            firstOption.closest('.d-grid-item');
                    
                    if (clickableContainer) {
                        clickableContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await new Promise(resolve => setTimeout(resolve, 300));
                        clickableContainer.click();
                    } else {
                        firstOption.click();
                    }
                    
                    console.log('✅ 已选择地点:', optionText);
                    
                    // 等待选择完成
                    await new Promise(resolve => setTimeout(resolve, 800));
                    
                    return { success: true, selectedLocation: optionText };
                } else {
                    throw new Error('在下拉列表中未找到地点选项');
                }
                
            } catch (e) {
                console.error('❌ 地理位置设置失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        const result = await this.tabManager.executeScript(tabId, locationScript);
        if (!result.success) {
            throw new Error(`地理位置设置失败: ${result.error}`);
        }
        
        console.log('✅ 地理位置设置成功:', result.selectedLocation);
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