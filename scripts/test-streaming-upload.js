// 创建文件：test-streaming-upload.js
const axios = require('axios');
const path = require('path');

async function testStreamingUpload() {
    try {
        console.log('🧪 开始测试流式上传API...\n');

        // 测试参数
        const testParams = {
            tabId: 'other-____1-1752816083919', // 替换为实际的tabId
            selector: 'input[type="file"]',
            filePath: '/oper/work/endian/social-auto-upload/videoFile/2aa873c0-61f5-11f0-83a3-4925f36afe0f_22.15.08.mov', // 替换为实际的视频文件路径
            options: {
                shadowSelector: 'wujie-app',
                triggerSelector: '.center',
                waitForInput: true
            }
        };

        console.log('📋 测试参数:');
        console.log(`   Tab ID: ${testParams.tabId}`);
        console.log(`   选择器: ${testParams.selector}`);
        console.log(`   Shadow选择器: ${testParams.options.shadowSelector}`);
        console.log(`   文件路径: ${testParams.filePath}`);
        console.log('');

        // 发送请求
        console.log('🚀 发送流式上传请求...');
        const response = await axios.post('http://localhost:3000/api/account/set-files-streaming', testParams, {
            timeout: 300000 // 5分钟超时
        });

        console.log('📥 API响应:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.success) {
            console.log('\n✅ 流式上传测试成功！');
        } else {
            console.log('\n❌ 流式上传测试失败！');
        }

    } catch (error) {
        console.error('\n❌ 测试过程中出现错误:');
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('响应数据:', error.response.data);
        } else {
            console.error('错误信息:', error.message);
        }
    }
}

// 运行测试
testStreamingUpload();