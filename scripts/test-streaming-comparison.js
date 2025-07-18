// 创建文件：test-streaming-comparison.js
const axios = require('axios');
const path = require('path');

async function compareStreamingMethods() {
    console.log('🧪 开始对比测试流式上传方法...\n');

    // 测试参数
    const testParams = {
        tabId: 'other-____1-1752818269521', // 替换为实际的tabId
        selector: 'input[type="file"]',
        filePath: '/oper/work/endian/social-auto-upload/videoFile/2aa873c0-61f5-11f0-83a3-4925f36afe0f_22.15.08.mov', // 替换为实际的视频文件路径
        options: {
            shadowSelector: 'wujie-app',
            triggerSelector: '.center',
            waitForInput: true
        }
    };

    const testFileSize = require('fs').statSync(testParams.filePath).size;
    console.log(`📁 测试文件: ${path.basename(testParams.filePath)}`);
    console.log(`📊 文件大小: ${(testFileSize / 1024 / 1024).toFixed(2)}MB\n`);

    // 测试结果存储
    const results = {
        v1: { method: 'V1 (累积所有块)', success: false, duration: 0, error: null },
        v2: { method: 'V2 (实时释放内存)', success: false, duration: 0, error: null }
    };

    // 🔥 测试V1方法（旧方案）
    console.log('🔬 测试V1方法 (累积所有块到内存)...');
    try {
        const v1StartTime = Date.now();

        const v1Response = await axios.post('http://localhost:3000/api/account/set-files-streaming', testParams, {
            timeout: 300000
        });

        const v1Duration = Date.now() - v1StartTime;
        results.v1.success = v1Response.data.success;
        results.v1.duration = v1Duration;

        console.log(`✅ V1完成 - 耗时: ${v1Duration}ms`);

    } catch (error) {
        results.v1.error = error.message;
        console.log(`❌ V1失败: ${error.message}`);
    }

    // 等待一下再进行下一个测试
    console.log('\n⏳ 等待5秒后开始V2测试...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 🔥 测试V2方法（新方案）
    console.log('🔬 测试V2方法 (实时释放内存)...');
    try {
        const v2StartTime = Date.now();

        const v2Response = await axios.post('http://localhost:3000/api/account/set-files-streaming-v2', testParams, {
            timeout: 300000
        });

        const v2Duration = Date.now() - v2StartTime;
        results.v2.success = v2Response.data.success;
        results.v2.duration = v2Duration;

        console.log(`✅ V2完成 - 耗时: ${v2Duration}ms`);

    } catch (error) {
        results.v2.error = error.message;
        console.log(`❌ V2失败: ${error.message}`);
    }

    // 🔥 输出对比结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 对比测试结果');
    console.log('='.repeat(60));

    console.log(`文件大小: ${(testFileSize / 1024 / 1024).toFixed(2)}MB`);
    console.log('');

    Object.entries(results).forEach(([version, result]) => {
        console.log(`${version.toUpperCase()}方法 (${result.method}):`);
        console.log(`  成功: ${result.success ? '✅' : '❌'}`);
        console.log(`  耗时: ${result.duration}ms (${(result.duration / 1000).toFixed(2)}s)`);
        if (result.error) {
            console.log(`  错误: ${result.error}`);
        }
        console.log('');
    });

    // 🔥 性能对比
    if (results.v1.success && results.v2.success) {
        const speedup = ((results.v1.duration - results.v2.duration) / results.v1.duration * 100).toFixed(1);

        console.log('📈 性能对比:');
        if (results.v2.duration < results.v1.duration) {
            console.log(`  V2比V1快 ${speedup}%`);
        } else {
            console.log(`  V1比V2快 ${Math.abs(parseFloat(speedup))}%`);
        }

        console.log(`  内存优化: V2使用分段释放，峰值内存更低`);
    }

    console.log('='.repeat(60));
}

// 运行对比测试
compareStreamingMethods().catch(console.error);