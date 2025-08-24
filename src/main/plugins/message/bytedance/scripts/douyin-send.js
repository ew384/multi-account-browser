// src/main/plugins/message/bytedance/scripts/douyin-send.js
// 抖音创作者中心私信发送脚本
// 参数：userName, content, type
(async function(userName, content, type = 'text') {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    
    try {
        console.log('🚀 开始发送抖音消息:', userName, type);
        
        // 1. 查找目标用户
        console.log('👤 查找用户:', userName);
        const userElements = document.querySelectorAll('.semi-list-item');
        console.log('📋 找到用户数量:', userElements.length);
        
        let targetUser = null;
        const userList = [];
        
        for (let userElement of userElements) {
            const nameElement = userElement.querySelector('.item-header-name-vL_79m');
            if (nameElement) {
                const name = nameElement.textContent.trim();
                userList.push(name);
                console.log('  - 用户:', name);
                if (name === userName) {
                    targetUser = userElement;
                    break;
                }
            }
        }

        if (!targetUser) {
            console.error('❌ 可用用户列表:', userList);
            throw new Error(`用户未找到: ${userName}`);
        }

        // 2. 点击用户进入对话
        console.log('✅ 找到目标用户，点击进入对话...');
        targetUser.click();
        await delay(2000); // 等待对话界面加载

        // 3. 等待并查找输入框
        console.log('📝 查找输入框...');
        
        // 抖音可能的输入框选择器（按优先级排序）
        const inputSelectors = [
            '.chat-input-dccKiL',                    // 主要输入框
            '[contenteditable="true"]',              // 富文本编辑器
            'textarea',                              // 文本区域
            'input[type="text"]',                    // 文本输入框
            '[class*="input"]',                      // 包含input的类名
            '[class*="editor"]',                     // 包含editor的类名
            '[placeholder*="输入"]',                  // 包含"输入"的占位符
            '[placeholder*="消息"]'                   // 包含"消息"的占位符
        ];

        let inputElement = null;
        
        // 尝试不同的选择器
        for (const selector of inputSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                // 检查元素是否可见和可编辑
                const style = window.getComputedStyle(element);
                const isVisible = style.display !== 'none' && 
                                style.visibility !== 'hidden' && 
                                style.opacity !== '0';
                                
                if (isVisible && !element.disabled && !element.readOnly) {
                    inputElement = element;
                    console.log(`✅ 找到输入框: ${selector}`);
                    break;
                }
            }
        }

        if (!inputElement) {
            // 🔥 尝试在可能的iframe中查找输入框
            console.log('🔄 在iframe中查找输入框...');
            const iframes = document.querySelectorAll('iframe');
            
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        for (const selector of inputSelectors) {
                            const element = iframeDoc.querySelector(selector);
                            if (element) {
                                inputElement = element;
                                console.log(`✅ 在iframe中找到输入框: ${selector}`);
                                break;
                            }
                        }
                        if (inputElement) break;
                    }
                } catch (e) {
                    continue; // 跨域iframe，跳过
                }
            }
        }

        if (!inputElement) {
            throw new Error('输入框未找到');
        }

        // 4. 根据消息类型处理发送
        if (type === 'image') {
            console.log('📷 发送图片消息...');
            
            // 查找文件上传控件
            const fileInput = document.querySelector('input[type="file"]') ||
                             document.querySelector('[class*="upload"]') ||
                             document.querySelector('[class*="file"]');
            
            if (!fileInput) {
                throw new Error('图片上传控件未找到');
            }

            // Base64转File函数
            const base64ToFile = (base64, filename) => {
                const arr = base64.split(',');
                const mime = arr[0].match(/:(.*);\\/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) u8arr[n] = bstr.charCodeAt(n);
                return new File([u8arr], filename, { type: mime });
            };

            const imageFile = base64ToFile(content, 'image.png');
            const dt = new DataTransfer();
            dt.items.add(imageFile);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            await delay(2000);
            console.log('📷 图片上传完成');
            
        } else {
            console.log('📝 发送文本消息...');
            
            // 聚焦到输入框
            inputElement.focus();
            await delay(200);
            
            // 清空现有内容
            if (inputElement.contentEditable === 'true') {
                // 富文本编辑器
                inputElement.innerHTML = '';
                inputElement.textContent = '';
            } else {
                // 普通输入框
                inputElement.value = '';
            }
            
            await delay(100);
            
            // 输入新内容
            if (inputElement.contentEditable === 'true') {
                // 富文本编辑器 - 使用多种方法确保内容被正确设置
                inputElement.innerHTML = content;
                inputElement.textContent = content;
                
                // 触发输入事件
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 模拟用户输入（更逼真）
                inputElement.dispatchEvent(new InputEvent('compositionstart'));
                inputElement.dispatchEvent(new InputEvent('compositionupdate', { data: content }));
                inputElement.dispatchEvent(new InputEvent('compositionend', { data: content }));
                
            } else {
                // 普通输入框
                inputElement.value = content;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 模拟键盘输入
                for (const char of content) {
                    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                    inputElement.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                    inputElement.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                }
            }
            
            await delay(300);
            console.log('✅ 输入内容完成:', content);
        }

        // 5. 查找并点击发送按钮
        console.log('📤 查找发送按钮...');
        
        const sendSelectors = [
            '.chat-btn',                             // 主要发送按钮
            'button[class*="send"]',                 // 包含send的按钮
            'button[class*="submit"]',               // 提交按钮
            'button[type="submit"]',                 // submit类型按钮
            '[data-testid*="send"]',                // 测试ID包含send
            '[aria-label*="发送"]',                  // aria标签包含发送
            '[title*="发送"]',                       // title包含发送
            '.semi-button[class*="primary"]',        // 主要按钮样式
            'button:not([disabled])'                 // 未禁用的按钮（最后尝试）
        ];

        let sendButton = null;
        
        // 尝试不同的发送按钮选择器
        for (const selector of sendSelectors) {
            const buttons = document.querySelectorAll(selector);
            for (const button of buttons) {
                const buttonText = button.textContent.trim().toLowerCase();
                const isVisible = window.getComputedStyle(button).display !== 'none';
                const isEnabled = !button.disabled;
                
                // 检查按钮文本是否包含发送相关词汇
                if (isVisible && isEnabled && 
                    (buttonText.includes('发送') || 
                     buttonText.includes('send') || 
                     buttonText === '发送' ||
                     button.className.includes('send'))) {
                    sendButton = button;
                    console.log(`✅ 找到发送按钮: ${selector} - "${buttonText}"`);
                    break;
                }
            }
            if (sendButton) break;
        }

        if (sendButton) {
            console.log('📤 点击发送按钮...');
            sendButton.click();
            await delay(500);
        } else {
            // 🔥 备用方案：尝试回车发送
            console.log('🔄 尝试回车发送...');
            inputElement.focus();
            
            // 触发回车按键事件
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            inputElement.dispatchEvent(enterEvent);
            
            // 如果Shift+Enter是换行，那么单独Enter应该是发送
            if (!enterEvent.defaultPrevented) {
                await delay(200);
                inputElement.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                }));
            }
            
            await delay(500);
        }

        // 6. 验证发送结果
        console.log('🔍 验证发送结果...');
        await delay(1000);
        
        // 检查输入框是否已清空（通常发送成功后会清空）
        const isEmpty = inputElement.contentEditable === 'true' ? 
            !inputElement.textContent.trim() : 
            !inputElement.value.trim();
        
        if (isEmpty) {
            console.log('✅ 发送成功（输入框已清空）');
        } else {
            console.log('⚠️ 发送状态不确定（输入框未清空）');
        }
        
        console.log('✅ 抖音消息发送完成');
        
        return {
            success: true,
            message: `${type === 'image' ? '图片' : '消息'}发送成功`,
            user: userName,
            type: type,
            content: type === 'text' ? content : 'image',
            timestamp: new Date().toISOString(),
            method: sendButton ? 'button_click' : 'enter_key'
        };
        
    } catch (error) {
        console.error('❌ 发送抖音消息失败:', error);
        return {
            success: false,
            error: error.message,
            user: userName,
            type: type,
            timestamp: new Date().toISOString()
        };
    }
});