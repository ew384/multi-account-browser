// multi-account-browser/src/main/plugins/uploader/kuaishou/main.ts
import { PluginUploader, UploadParams, PluginType } from '../../../../types/pluginInterface';
import { TabManager } from '../../../TabManager';

export class KuaiShouVideoUploader implements PluginUploader {
    public readonly type = PluginType.UPLOADER;
    public readonly platform = 'kuaishou';
    public readonly name = 'KuaiShou Video Uploader';

    private tabManager!: TabManager;

    async init(tabManager: TabManager): Promise<void> {
        this.tabManager = tabManager;
        //console.log(`✅ ${this.name} 初始化完成`);
    }

    async uploadVideoComplete(params: UploadParams, tabId: string): Promise<{ success: boolean; tabId?: string }> {
        try {
            // 1. 上传视频文件
            await this.uploadFile(params.filePath, tabId);

            // 2. 处理新功能提示
            await this.handleNewFeaturePrompt(tabId);

            // 3. 填写标题和标签
            await this.fillTitleAndTags(params.title, params.tags, tabId);

            // 4. 等待视频上传完成
            await this.waitForVideoUpload(tabId);

            // 5. 设置定时发布（如果有）
            if (params.publishDate) {
                await this.setScheduleTime(params.publishDate, tabId);
            }

            // 6. 点击发布
            await this.clickPublish(tabId);

            return { success: true, tabId: tabId };
        } catch (error) {
            console.error('❌ 快手视频上传流程失败:', error);
            throw error;
        }
    }

    private async uploadFile(filePath: string, tabId: string): Promise<void> {
        console.log('📤 上传文件到快手...');

        const uploadScript = `
        new Promise(async (resolve, reject) => {
            try {
                // 等待页面加载完成
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 查找上传按钮
                const uploadButton = document.querySelector("button[class^='_upload-btn']");
                if (!uploadButton) {
                    throw new Error('未找到上传按钮');
                }

                // 等待按钮可见
                while (!uploadButton.offsetParent) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                console.log('✅ 找到上传按钮，准备点击');

                // 创建文件输入框
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'video/*';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

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

                // 设置文件
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                Object.defineProperty(fileInput, 'files', {
                    value: dataTransfer.files,
                    configurable: true
                });

                // 监听文件输入变化
                fileInput.addEventListener('change', () => {
                    console.log('✅ 文件选择完成');
                    resolve({ success: true });
                });

                // 点击上传按钮触发文件选择器
                uploadButton.click();
                
                // 模拟文件选择
                setTimeout(() => {
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                }, 1000);

            } catch (e) {
                console.error('❌ 文件上传失败:', e);
                reject({ success: false, error: e.message });
            }
        })
        `;

        const result = await this.tabManager.executeScript(tabId, uploadScript);
        if (!result.success) {
            throw new Error(`文件上传失败: ${result.error}`);
        }

        // 等待页面处理文件
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    private async handleNewFeaturePrompt(tabId: string): Promise<void> {
        console.log('🔔 处理新功能提示...');

        const promptScript = `
        (async function() {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 查找"我知道了"按钮
                const newFeatureButton = document.querySelector('button[type="button"] span:has-text("我知道了")');
                if (newFeatureButton) {
                    const button = newFeatureButton.closest('button');
                    if (button) {
                        button.click();
                        console.log('✅ 已点击"我知道了"按钮');
                    }
                }
                
                return { success: true };
            } catch (e) {
                console.error('处理新功能提示失败:', e);
                return { success: false, error: e.message };
            }
        })()
        `;

        await this.tabManager.executeScript(tabId, promptScript);
    }

    private async fillTitleAndTags(title: string, tags: string[], tabId: string): Promise<void> {
        console.log('📝 填写标题和标签...');

        const fillScript = `
        (async function() {
            try {
                console.log('正在填充标题和话题...');
                
                // 点击描述输入框
                const descElements = Array.from(document.querySelectorAll('*')).filter(el => 
                    el.textContent && el.textContent.trim() === '描述'
                );
                
                if (descElements.length > 0) {
                    const descElement = descElements[0];
                    const nextSibling = descElement.nextElementSibling;
                    if (nextSibling) {
                        nextSibling.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        console.log('清空现有标题');
                        // 清空现有内容
                        document.execCommand('selectAll');
                        document.execCommand('delete');
                        
                        console.log('填写新标题');
                        // 输入新标题
                        document.execCommand('insertText', false, '${title}');
                        
                        // 按回车
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            keyCode: 13,
                            bubbles: true
                        });
                        document.activeElement.dispatchEvent(enterEvent);
                        
                        console.log('✅ 标题填写完成:', '${title}');
                    }
                }

                // 添加标签（快手只能添加3个话题）
                const tags = ${JSON.stringify(tags.slice(0, 3))};
                for (let i = 0; i < tags.length; i++) {
                    const tag = tags[i];
                    console.log(\`正在添加第\${i + 1}个话题: \${tag}\`);
                    
                    const tagText = '#' + tag + ' ';
                    document.execCommand('insertText', false, tagText);
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                console.log('✅ 标签添加完成，总共添加了', tags.length, '个标签');
                
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
            const maxRetries = 60; // 最大重试次数,最大等待时间为 2 分钟
            let retryCount = 0;
            
            const checkUpload = async () => {
                if (retryCount >= maxRetries) {
                    console.warn('超过最大重试次数，视频上传可能未完成');
                    resolve(true); // 即使超时也继续流程
                    return;
                }

                try {
                    // 获取包含 '上传中' 文本的元素数量
                    const uploadingElements = document.querySelectorAll('*');
                    let hasUploading = false;
                    
                    for (const element of uploadingElements) {
                        if (element.textContent && element.textContent.includes('上传中')) {
                            hasUploading = true;
                            break;
                        }
                    }

                    if (!hasUploading) {
                        console.log('✅ 视频上传完毕');
                        resolve(true);
                        return;
                    } else {
                        if (retryCount % 5 === 0) {
                            console.log('📤 正在上传视频中...');
                        }
                        retryCount++;
                        setTimeout(checkUpload, 2000);
                    }
                } catch (e) {
                    console.error('检查上传状态时发生错误:', e);
                    retryCount++;
                    setTimeout(checkUpload, 2000);
                }
            };

            checkUpload();
        })
        `;

        await this.tabManager.executeScript(tabId, waitScript);
    }

    private async setScheduleTime(publishDate: Date, tabId: string): Promise<void> {
        console.log('⏰ 设置定时发布...');

        const scheduleScript = `
        (async function() {
            try {
                console.log('设置定时发布时间');
                
                // 格式化发布时间
                const publishDateHour = '${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-${String(publishDate.getDate()).padStart(2, '0')} ${String(publishDate.getHours()).padStart(2, '0')}:${String(publishDate.getMinutes()).padStart(2, '0')}:${String(publishDate.getSeconds()).padStart(2, '0')}';
                console.log('格式化时间:', publishDateHour);
                
                // 查找"发布时间"标签并点击第二个单选按钮
                const publishTimeLabels = Array.from(document.querySelectorAll('*')).filter(el => 
                    el.textContent && el.textContent.trim() === '发布时间'
                );
                
                if (publishTimeLabels.length > 0) {
                    const label = publishTimeLabels[0];
                    const nextSibling = label.nextElementSibling;
                    if (nextSibling) {
                        const radioInputs = nextSibling.querySelectorAll('.ant-radio-input');
                        if (radioInputs.length > 1) {
                            radioInputs[1].click(); // 点击第二个单选按钮（定时发布）
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            console.log('✅ 已选择定时发布');
                        }
                    }
                }

                // 点击时间选择器
                const timeInput = document.querySelector('div.ant-picker-input input[placeholder="选择日期时间"]');
                if (timeInput) {
                    timeInput.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));

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

                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('✅ 定时发布设置成功:', publishDateHour);
                } else {
                    throw new Error('未找到时间输入框');
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
                    reject(new Error('发布流程等待超时'));
                    return;
                }

                try {
                    // 查找发布按钮
                    const publishButtons = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.textContent && el.textContent.trim() === '发布' && el.tagName !== 'SPAN'
                    );
                    
                    if (publishButtons.length > 0) {
                        const publishButton = publishButtons[0];
                        publishButton.click();
                        console.log('✅ 已点击发布按钮');
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // 查找确认发布按钮
                        const confirmButtons = Array.from(document.querySelectorAll('*')).filter(el => 
                            el.textContent && el.textContent.includes('确认发布')
                        );
                        
                        if (confirmButtons.length > 0) {
                            confirmButtons[0].click();
                            console.log('✅ 已点击确认发布按钮');
                        }
                        
                        // 等待跳转到管理页面
                        const checkRedirect = () => {
                            if (window.location.href.includes('cp.kuaishou.com/article/manage/video')) {
                                console.log('✅ 视频发布成功');
                                resolve(true);
                            } else {
                                setTimeout(checkRedirect, 1000);
                            }
                        };
                        
                        setTimeout(checkRedirect, 2000);
                        return;
                    }

                    console.log('📤 等待发布按钮激活...');
                    setTimeout(tryPublish, 1000);
                } catch (e) {
                    console.log('发布过程出错:', e.message, '重新尝试...');
                    setTimeout(tryPublish, 1000);
                }
            };

            tryPublish();
        })
        `;

        await this.tabManager.executeScript(tabId, publishScript);
        console.log('✅ 快手视频发布流程完成');
    }

    private async handleUploadError(filePath: string, tabId: string): Promise<void> {
        console.log('🔧 处理上传错误，重新上传...');

        const retryScript = `
        (function() {
            try {
                // 查找重新上传按钮
                const retryButton = document.querySelector('div.progress-div [class^="upload-btn-input"]');
                if (retryButton) {
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
        // 暂不实现，预留接口
        return null;
    }
}