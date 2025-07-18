// 创建文件：synchronized-test.js
const axios = require('axios');

async function synchronizedTest() {
    const testParams = {
        tabId: 'other-____1-1752818269521', // 你的实际tabId
        selector: 'input[type="file"]',
        filePath: '/oper/work/endian/social-auto-upload/videoFile/2aa873c0-61f5-11f0-83a3-4925f36afe0f_22.15.08.mov',
        options: {
            shadowSelector: 'wujie-app',
            triggerSelector: '.center',
            waitForInput: true
        }
    };

    console.log('🧪 开始同步监控测试...\n');

    // 🔥 内存监控函数
    async function getMemoryUsage(label = '') {
        try {
            const response = await axios.post('http://localhost:3000/api/account/execute', {
                tabId: testParams.tabId,
                script: `
                (function() {
                    if (performance.memory) {
                        return {
                            used: performance.memory.usedJSHeapSize,
                            total: performance.memory.totalJSHeapSize,
                            limit: performance.memory.jsHeapSizeLimit
                        };
                    }
                    return null;
                })()
                `
            });

            if (response.data.success && response.data.data) {
                const memory = response.data.data;
                const usedMB = memory.used / 1024 / 1024;
                const totalMB = memory.total / 1024 / 1024;

                console.log(`📊 ${label}: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB`);
                return usedMB;
            }
            return 0;
        } catch (error) {
            console.error(`❌ 内存监控失败: ${error.message}`);
            return 0;
        }
    }

    // 🔥 带监控的上传测试
    async function testWithMonitoring(method, endpoint) {
        console.log(`\n🔬 测试${method}方法，同步监控内存...`);

        // 基准内存
        const baseMemory = await getMemoryUsage('基准内存');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 开始上传，同时监控
        let maxMemory = baseMemory;
        let monitoringActive = true;

        // 🔥 启动内存监控（高频率）
        const monitoringPromise = (async () => {
            while (monitoringActive) {
                const currentMemory = await getMemoryUsage(`${method}实时`);
                maxMemory = Math.max(maxMemory, currentMemory);
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5秒间隔
            }
        })();

        // 🔥 执行上传
        const startTime = Date.now();
        let uploadSuccess = false;

        try {
            const response = await axios.post(endpoint, testParams, { timeout: 300000 });
            uploadSuccess = response.data.success;

        } catch (error) {
            console.error(`❌ ${method}上传失败: ${error.message}`);
        }

        const duration = Date.now() - startTime;

        // 停止监控
        monitoringActive = false;
        await monitoringPromise;

        // 最终内存
        await new Promise(resolve => setTimeout(resolve, 2000));
        const finalMemory = await getMemoryUsage('最终内存');

        return {
            method,
            success: uploadSuccess,
            duration,
            baseMemory,
            maxMemory,
            finalMemory,
            memoryIncrease: maxMemory - baseMemory
        };
    }

    // 🔥 测试V1
    const v1Result = await testWithMonitoring('V1', 'http://localhost:3000/api/account/set-files-streaming');

    // 等待内存释放
    console.log('\n⏳ 等待10秒内存释放...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 强制垃圾回收
    await axios.post('http://localhost:3000/api/account/execute', {
        tabId: testParams.tabId,
        script: 'if (window.gc) { window.gc(); console.log("垃圾回收执行"); }'
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // 🔥 测试V2
    const v2Result = await testWithMonitoring('V2', 'http://localhost:3000/api/account/set-files-streaming-v2');

    // 🔥 输出详细对比
    console.log('\n' + '='.repeat(70));
    console.log('📊 详细对比结果');
    console.log('='.repeat(70));

    console.log(`文件大小: 432.16MB\n`);

    [v1Result, v2Result].forEach(result => {
        console.log(`${result.method}方法:`);
        console.log(`  成功: ${result.success ? '✅' : '❌'}`);
        console.log(`  耗时: ${result.duration}ms (${(result.duration / 1000).toFixed(2)}s)`);
        console.log(`  基准内存: ${result.baseMemory.toFixed(2)}MB`);
        console.log(`  峰值内存: ${result.maxMemory.toFixed(2)}MB`);
        console.log(`  最终内存: ${result.finalMemory.toFixed(2)}MB`);
        console.log(`  内存增长: ${result.memoryIncrease.toFixed(2)}MB`);
        console.log('');
    });

    // 🔥 关键对比
    console.log('🎯 关键对比:');
    console.log(`  V1峰值内存: ${v1Result.maxMemory.toFixed(2)}MB`);
    console.log(`  V2峰值内存: ${v2Result.maxMemory.toFixed(2)}MB`);
    console.log(`  内存节省: ${(v1Result.maxMemory - v2Result.maxMemory).toFixed(2)}MB`);
    console.log(`  节省比例: ${((v1Result.maxMemory - v2Result.maxMemory) / v1Result.maxMemory * 100).toFixed(1)}%`);

    console.log('='.repeat(70));
}

synchronizedTest().catch(console.error);