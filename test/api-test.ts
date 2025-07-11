interface TestResult {
    name: string;
    success: boolean;
    message: string;
}

async function runAPITests(): Promise<void> {
    console.log('🚀 开始API功能测试...');

    const baseURL = 'http://localhost:3000/api';
    const results: TestResult[] = [];

    // 测试1: 健康检查
    try {
        const response = await fetch(`${baseURL}/health`);
        const data = await response.json();

        results.push({
            name: 'API健康检查',
            success: data.success === true,
            message: data.success ? '✅ API服务正常' : '❌ API服务异常'
        });
    } catch (error) {
        results.push({
            name: 'API健康检查',
            success: false,
            message: `❌ 无法连接API: ${error.message}`
        });
    }

    // 测试2: 创建多个账号标签页
    const accountConfigs = [
        { accountName: '微信视频号-测试账号A', platform: 'weixin' },
        { accountName: '微信视频号-测试账号B', platform: 'weixin' },
        { accountName: '微信视频号-测试账号C', platform: 'weixin' }
    ];

    const tabIds: string[] = [];

    for (const config of accountConfigs) {
        try {
            const response = await fetch(`${baseURL}/account/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (data.success) {
                tabIds.push(data.data.tabId);
                results.push({
                    name: `创建账号: ${config.accountName}`,
                    success: true,
                    message: `✅ 创建成功 (ID: ${data.data.tabId})`
                });
            } else {
                results.push({
                    name: `创建账号: ${config.accountName}`,
                    success: false,
                    message: `❌ 创建失败: ${data.error}`
                });
            }
        } catch (error) {
            results.push({
                name: `创建账号: ${config.accountName}`,
                success: false,
                message: `❌ 请求失败: ${error.message}`
            });
        }
    }

    // 测试3: 获取所有账号
    try {
        const response = await fetch(`${baseURL}/accounts`);
        const data = await response.json();

        results.push({
            name: '获取账号列表',
            success: data.success && data.data.length === tabIds.length,
            message: data.success ?
                `✅ 获取到 ${data.data.length} 个账号` :
                `❌ 获取失败: ${data.error}`
        });
    } catch (error) {
        results.push({
            name: '获取账号列表',
            success: false,
            message: `❌ 请求失败: ${error.message}`
        });
    }

    // 测试4: 切换标签页
    for (const tabId of tabIds) {
        try {
            const response = await fetch(`${baseURL}/account/switch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabId })
            });

            const data = await response.json();

            results.push({
                name: `切换到标签页: ${tabId}`,
                success: data.success === true,
                message: data.success ? '✅ 切换成功' : `❌ 切换失败: ${data.error}`
            });

            // 等待一下再切换下一个
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            results.push({
                name: `切换到标签页: ${tabId}`,
                success: false,
                message: `❌ 请求失败: ${error.message}`
            });
        }
    }

    // 测试5: 执行JavaScript脚本
    if (tabIds.length > 0) {
        const testScript = `
            // 设置测试Cookie和数据
            document.cookie = 'test_api=api_test_${Date.now()}; path=/';
            localStorage.setItem('test_storage', 'api_test_value');
            
            // 返回测试结果
            ({
                url: window.location.href,
                cookie: document.cookie,
                localStorage: localStorage.getItem('test_storage'),
                timestamp: new Date().toISOString()
            });
        `;

        for (let i = 0; i < tabIds.length; i++) {
            try {
                const response = await fetch(`${baseURL}/account/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tabId: tabIds[i],
                        script: testScript
                    })
                });

                const data = await response.json();

                results.push({
                    name: `执行脚本 (标签页${i + 1})`,
                    success: data.success === true,
                    message: data.success ?
                        `✅ 脚本执行成功` :
                        `❌ 脚本执行失败: ${data.error}`
                });
            } catch (error) {
                results.push({
                    name: `执行脚本 (标签页${i + 1})`,
                    success: false,
                    message: `❌ 请求失败: ${error.message}`
                });
            }
        }
    }

    // 测试6: 导航测试
    if (tabIds.length > 0) {
        const testUrl = 'https://channels.weixin.qq.com';

        try {
            const response = await fetch(`${baseURL}/account/navigate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tabId: tabIds[0],
                    url: testUrl
                })
            });

            const data = await response.json();

            results.push({
                name: '页面导航测试',
                success: data.success === true,
                message: data.success ?
                    `✅ 导航成功到 ${testUrl}` :
                    `❌ 导航失败: ${data.error}`
            });
        } catch (error) {
            results.push({
                name: '页面导航测试',
                success: false,
                message: `❌ 请求失败: ${error.message}`
            });
        }
    }

    // 测试7: 清理 - 关闭所有标签页
    for (const tabId of tabIds) {
        try {
            const response = await fetch(`${baseURL}/account/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabId })
            });

            const data = await response.json();

            results.push({
                name: `关闭标签页: ${tabId}`,
                success: data.success === true,
                message: data.success ? '✅ 关闭成功' : `❌ 关闭失败: ${data.error}`
            });
        } catch (error) {
            results.push({
                name: `关闭标签页: ${tabId}`,
                success: false,
                message: `❌ 请求失败: ${error.message}`
            });
        }
    }

    // 输出测试结果
    console.log('\n📊 API测试结果汇总:');
    console.log('='.repeat(50));

    let passedCount = 0;
    let totalCount = results.length;

    results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.name}: ${result.message}`);
        if (result.success) passedCount++;
    });

    console.log('='.repeat(50));
    console.log(`📈 总计: ${passedCount}/${totalCount} 个测试通过 (${Math.round(passedCount / totalCount * 100)}%)`);

    if (passedCount === totalCount) {
        console.log('🎉 所有API测试均通过！');
    } else {
        console.log('⚠️  部分测试失败，请检查相关功能');
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAPITests().catch(console.error);
}

export { runAPITests };