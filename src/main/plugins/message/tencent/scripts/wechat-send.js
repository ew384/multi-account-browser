// 微信视频号助手私信发送脚本
// 参数：userName, content, type
(async function(userName, content, type = 'text') {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    
    const getDoc = () => {
        const iframes = document.querySelectorAll('iframe');
        for (let iframe of iframes) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc && doc.querySelectorAll('.private-msg-list').length > 0) return doc;
            } catch (e) { continue; }
        }
        return document;
    };

    try {
        console.log('🚀 开始发送消息:', userName, type);
        const doc = getDoc();
        
        // 1. 确保在私信标签
        const currentTab = doc.querySelector('li.weui-desktop-tab__nav_current a');
        if (!currentTab || currentTab.textContent.trim() !== '私信') {
            console.log('🔄 切换到私信标签...');
            const privateTab = Array.from(doc.querySelectorAll('li.weui-desktop-tab__nav a'))
                .find(tab => tab.textContent.trim() === '私信');
            if (privateTab) {
                privateTab.click();
                await delay(1000);
            } else {
                throw new Error('未找到私信标签');
            }
        }

        // 2. 查找目标用户
        console.log('👤 查找用户:', userName);
        const userElements = doc.querySelectorAll('.session-wrap');
        console.log('📋 找到用户数量:', userElements.length);
        
        let targetUser = null;
        const userList = [];
        for (let userElement of userElements) {
            const nameElement = userElement.querySelector('.name');
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

        // 3. 点击用户进入对话
        console.log('✅ 找到目标用户，点击进入对话...');
        targetUser.click();
        await delay(1500);

        // 4. 根据消息类型处理
        if (type === 'image') {
            console.log('📷 发送图片消息...');
            
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

            const fileInput = doc.querySelector('input.file-uploader[type="file"]');
            if (!fileInput) {
                throw new Error('文件上传控件未找到');
            }

            const imageFile = base64ToFile(content, 'image.png');
            const dt = new DataTransfer();
            dt.items.add(imageFile);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            await delay(2000);
            
        } else {
            console.log('📝 发送文本消息...');
            
            // 查找输入框
            const textarea = doc.querySelector('textarea.edit_area');
            if (!textarea) {
                // 尝试其他可能的选择器
                const altTextarea = doc.querySelector('textarea') || doc.querySelector('[contenteditable="true"]');
                if (!altTextarea) {
                    throw new Error('输入框未找到');
                }
                console.log('⚠️ 使用备用输入框选择器');
            }

            const inputElement = textarea || doc.querySelector('textarea') || doc.querySelector('[contenteditable="true"]');
            
            // 清空并输入内容
            inputElement.value = '';
            inputElement.focus();
            await delay(200);
            
            inputElement.value = content;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            await delay(300);
            
            console.log('✅ 输入内容完成:', content);
        }

        // 5. 查找并点击发送按钮
        console.log('📤 查找发送按钮...');
        
        const sendButton = doc.querySelector('button.weui-desktop-btn.weui-desktop-btn_default');
        if (!sendButton) {
            // 尝试其他可能的发送按钮选择器
            const altSendButton = doc.querySelector('button[type="submit"]') || 
                                doc.querySelector('.send-btn') || 
                                doc.querySelector('[data-action="send"]');
            if (!altSendButton) {
                throw new Error('发送按钮未找到');
            }
            console.log('⚠️ 使用备用发送按钮选择器');
            altSendButton.click();
        } else {
            sendButton.click();
        }

        // 6. 等待发送完成
        const waitTime = type === 'image' ? 2000 : 800;
        await delay(waitTime);
        
        console.log('✅ 消息发送完成');
        
        return {
            success: true,
            message: `${type === 'image' ? '图片' : '消息'}发送成功`,
            user: userName,
            type: type,
            content: type === 'text' ? content : 'image',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ 发送消息失败:', error);
        return {
            success: false,
            error: error.message,
            user: userName,
            type: type
        };
    }
})