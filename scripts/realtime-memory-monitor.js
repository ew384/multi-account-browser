// 创建文件：realtime-memory-monitor.js
const axios = require('axios');

async function realtimeMemoryMonitor(tabId, intervalSeconds = 5) {
    console.log(`🔍 开始实时监控内存 (每${intervalSeconds}秒一次)...`);
    console.log('按 Ctrl+C 停止监控\n');

    let previousMemory = null;
    let monitorCount = 0;

    const monitor = async () => {
        try {
            const response = await axios.post('http://localhost:3000/api/account/execute', {
                tabId: tabId,
                script: `
                (function() {
                    if (performance.memory) {
                        return {
                            used: performance.memory.usedJSHeapSize,
                            total: performance.memory.totalJSHeapSize,
                            limit: performance.memory.jsHeapSizeLimit,
                            timestamp: Date.now()
                        };
                    } else {
                        return { error: 'Memory API not available' };
                    }
                })()
                `
            });

            if (response.data.success) {
                const memory = response.data.data;
                const usedMB = memory.used / 1024 / 1024;
                const totalMB = memory.total / 1024 / 1024;
                const usagePercent = (memory.used / memory.limit * 100);

                monitorCount++;

                let changeIndicator = '';
                if (previousMemory) {
                    const change = usedMB - previousMemory;
                    if (change > 0.5) {
                        changeIndicator = ` ⬆️ (+${change.toFixed(2)}MB)`;
                    } else if (change < -0.5) {
                        changeIndicator = ` ⬇️ (${change.toFixed(2)}MB)`;
                    } else {
                        changeIndicator = ` ➡️ (${change >= 0 ? '+' : ''}${change.toFixed(2)}MB)`;
                    }
                }

                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] #${monitorCount} 内存: ${usedMB.toFixed(2)}MB/${totalMB.toFixed(2)}MB (${usagePercent.toFixed(1)}%)${changeIndicator}`);

                previousMemory = usedMB;
            }

        } catch (error) {
            console.error(`❌ [${new Date().toLocaleTimeString()}] 监控失败:`, error.message);
        }
    };

    // 立即执行一次
    await monitor();

    // 设置定时器
    const intervalId = setInterval(monitor, intervalSeconds * 1000);

    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n📄 监控已停止');
        clearInterval(intervalId);
        process.exit(0);
    });
}

// 从命令行参数获取tabId
const tabId = process.argv[2];
const interval = parseInt(process.argv[3]) || 5;

if (!tabId) {
    console.log('使用方法: node realtime-memory-monitor.js <tabId> [intervalSeconds]');
    console.log('例如: node realtime-memory-monitor.js weixin-account-123 3');
    process.exit(1);
}

realtimeMemoryMonitor(tabId, interval);