/**
 * 测试面板组件
 * 负责各种测试功能的执行和结果显示
 */

interface TestResult {
    name: string;
    success: boolean;
    message: string;
    timestamp: string;
    duration?: number;
}

interface TestStats {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
}

class TestPanel {
    private resultsContainer: HTMLElement;
    private results: TestResult[] = [];
    private isRunning: boolean = false;

    constructor(resultsContainerId: string) {
        this.resultsContainer = document.getElementById(resultsContainerId)!;
        if (!this.resultsContainer) {
            throw new Error(`测试结果容器 ${resultsContainerId} 未找到`);
        }
        this.init();
    }

    /**
     * 初始化测试面板
     */
    private init(): void {
        this.setupEventListeners();
        this.renderEmptyState();
        console.log('🧪 测试面板初始化完成');
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 隔离测试按钮
        const isolationBtn = document.getElementById('run-isolation-test-btn');
        if (isolationBtn) {
            isolationBtn.addEventListener('click', () => this.runIsolationTest());
        }

        // Cookie测试按钮
        const cookieBtn = document.getElementById('run-cookie-test-btn');
        if (cookieBtn) {
            cookieBtn.addEventListener('click', () => this.runCookieTest());
        }

        // 综合测试按钮
        const comprehensiveBtn = document.getElementById('run-comprehensive-test-btn');
        if (comprehensiveBtn) {
            comprehensiveBtn.addEventListener('click', () => this.runComprehensiveTest());
        }

        // 清除结果按钮
        const clearBtn = document.getElementById('clear-test-results-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearResults());
        }
    }

    /**
     * 运行Session隔离测试
     */
    async runIsolationTest(): Promise<void> {
        if (this.isRunning) {
            this.addResult({
                name: '隔离测试',
                success: false,
                message: '⚠️ 测试正在进行中，请等待...',
                timestamp: this.getCurrentTime()
            });
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            this.addResult({
                name: '隔离测试',
                success: false,
                message: '🔍 开始Session隔离测试...',
                timestamp: this.getCurrentTime()
            });

            // 调用Electron API进行隔离测试
            if (!window.electronAPI) {
                throw new Error('Electron API不可用');
            }

            const result = await window.electronAPI.testIsolation();
            const duration = Date.now() - startTime;

            if (result.success && result.isolated) {
                this.addResult({
                    name: '隔离测试',
                    success: true,
                    message: '✅ Session隔离测试通过 - 不同标签页Session完全独立',
                    timestamp: this.getCurrentTime(),
                    duration
                });
            } else {
                this.addResult({
                    name: '隔离测试',
                    success: false,
                    message: `❌ Session隔离测试失败: ${result.error || '未知错误'}`,
                    timestamp: this.getCurrentTime(),
                    duration
                });
            }
        } catch (error) {
            this.addResult({
                name: '隔离测试',
                success: false,
                message: `❌ 测试异常: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: this.getCurrentTime(),
                duration: Date.now() - startTime
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 运行Cookie隔离测试
     */
    async runCookieTest(): Promise<void> {
        if (this.isRunning) {
            this.addResult({
                name: 'Cookie测试',
                success: false,
                message: '⚠️ 测试正在进行中，请等待...',
                timestamp: this.getCurrentTime()
            });
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            this.addResult({
                name: 'Cookie测试',
                success: false,
                message: '🍪 开始Cookie隔离测试...',
                timestamp: this.getCurrentTime()
            });

            // 获取所有标签页
            const tabsResult = await window.electronAPI.getAllTabs();
            if (!tabsResult.success || !tabsResult.tabs || tabsResult.tabs.length < 2) {
                this.addResult({
                    name: 'Cookie测试',
                    success: false,
                    message: '❌ 需要至少2个标签页才能进行Cookie隔离测试',
                    timestamp: this.getCurrentTime(),
                    duration: Date.now() - startTime
                });
                return;
            }

            const tabs = tabsResult.tabs.slice(0, 3); // 最多测试3个标签页
            let allPassed = true;

            // 第一阶段：为每个标签页设置唯一Cookie
            for (let i = 0; i < tabs.length; i++) {
                const tab = tabs[i];

                try {
                    const response = await fetch('http://localhost:3000/api/account/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tabId: tab.id,
                            script: `
                                // 设置测试Cookie
                                document.cookie = 'test_isolation_${i}=tab_${i}_value_${Date.now()}; path=/';
                                document.cookie = 'common_test=tab_${i}_common; path=/';
                                'Cookie设置完成';
                            `
                        })
                    });

                    const result = await response.json();
                    if (result.success) {
                        this.addResult({
                            name: `Cookie设置-标签页${i + 1}`,
                            success: true,
                            message: `✅ 标签页 "${tab.accountName}" Cookie设置成功`,
                            timestamp: this.getCurrentTime()
                        });
                    } else {
                        allPassed = false;
                        this.addResult({
                            name: `Cookie设置-标签页${i + 1}`,
                            success: false,
                            message: `❌ 标签页 "${tab.accountName}" Cookie设置失败: ${result.error}`,
                            timestamp: this.getCurrentTime()
                        });
                    }
                } catch (error) {
                    allPassed = false;
                    this.addResult({
                        name: `Cookie设置-标签页${i + 1}`,
                        success: false,
                        message: `❌ Cookie设置异常: ${error instanceof Error ? error.message : '未知错误'}`,
                        timestamp: this.getCurrentTime()
                    });
                }

                // 短暂延迟
                await this.delay(500);
            }

            // 第二阶段：验证Cookie隔离
            if (allPassed) {
                for (let i = 0; i < tabs.length; i++) {
                    const tab = tabs[i];

                    try {
                        const response = await fetch('http://localhost:3000/api/account/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                tabId: tab.id,
                                script: `
                              (function() {
                                const cookies = document.cookie;
                                const hasOwnCookie = cookies.includes('test_isolation_${i}=');
                                
                                // 修复：明确指定参数类型
                                let hasOtherCookies = false;
                                ${tabs.map((_: any, j: number) =>
                                    i !== j ? `if (cookies.includes('test_isolation_${j}=')) hasOtherCookies = true;` : ''
                                ).join('\n')}
                                
                                return {
                                  cookies: cookies,
                                  hasOwnCookie: hasOwnCookie,
                                  hasOtherCookies: hasOtherCookies,
                                  isolated: hasOwnCookie && !hasOtherCookies
                                };
                              })();
                            `
                            })
                        });

                        const result = await response.json();
                        if (result.success) {
                            const data = result.data;
                            if (data.isolated) {
                                this.addResult({
                                    name: `Cookie验证-标签页${i + 1}`,
                                    success: true,
                                    message: `✅ 标签页 "${tab.accountName}" Cookie隔离正常`,
                                    timestamp: this.getCurrentTime()
                                });
                            } else {
                                allPassed = false;
                                this.addResult({
                                    name: `Cookie验证-标签页${i + 1}`,
                                    success: false,
                                    message: `❌ 标签页 "${tab.accountName}" Cookie隔离失败 - 检测到其他标签页Cookie`,
                                    timestamp: this.getCurrentTime()
                                });
                            }
                        }
                    } catch (error) {
                        allPassed = false;
                        this.addResult({
                            name: `Cookie验证-标签页${i + 1}`,
                            success: false,
                            message: `❌ Cookie验证异常: ${error instanceof Error ? error.message : '未知错误'}`,
                            timestamp: this.getCurrentTime()
                        });
                    }
                }
            }

            // 总结
            const duration = Date.now() - startTime;
            this.addResult({
                name: 'Cookie测试',
                success: allPassed,
                message: allPassed ?
                    `🎉 Cookie隔离测试完成 - 所有${tabs.length}个标签页Cookie完全隔离` :
                    '❌ Cookie隔离测试失败 - 存在Cookie泄露问题',
                timestamp: this.getCurrentTime(),
                duration
            });

        } catch (error) {
            this.addResult({
                name: 'Cookie测试',
                success: false,
                message: `❌ 测试异常: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: this.getCurrentTime(),
                duration: Date.now() - startTime
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 运行综合测试
     */
    async runComprehensiveTest(): Promise<void> {
        if (this.isRunning) {
            this.addResult({
                name: '综合测试',
                success: false,
                message: '⚠️ 测试正在进行中，请等待...',
                timestamp: this.getCurrentTime()
            });
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            this.addResult({
                name: '综合测试',
                success: false,
                message: '🚀 开始运行综合测试套件...',
                timestamp: this.getCurrentTime()
            });

            // 测试1: API连接
            await this.testAPIConnection();
            await this.delay(1000);

            // 测试2: Session隔离
            await this.runIsolationTest();
            await this.delay(1000);

            // 测试3: Cookie隔离（如果有多个标签页）
            const tabsResult = await window.electronAPI.getAllTabs();
            if (tabsResult.success && tabsResult.tabs && tabsResult.tabs.length >= 2) {
                await this.runCookieTest();
            } else {
                this.addResult({
                    name: 'Cookie测试',
                    success: false,
                    message: '⚠️ 跳过Cookie隔离测试 - 需要至少2个标签页',
                    timestamp: this.getCurrentTime()
                });
            }

            await this.delay(1000);

            // 测试4: 基本功能测试
            await this.testBasicFunctionality();

            // 计算综合结果
            const duration = Date.now() - startTime;
            const stats = this.getStats();

            this.addResult({
                name: '综合测试',
                success: stats.passRate >= 80, // 80%通过率算成功
                message: `🎯 综合测试完成 - 通过率: ${stats.passRate}% (${stats.passed}/${stats.total})`,
                timestamp: this.getCurrentTime(),
                duration
            });

        } catch (error) {
            this.addResult({
                name: '综合测试',
                success: false,
                message: `❌ 综合测试异常: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: this.getCurrentTime(),
                duration: Date.now() - startTime
            });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 测试API连接
     */
    private async testAPIConnection(): Promise<void> {
        try {
            const response = await fetch('http://localhost:3000/api/health', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                this.addResult({
                    name: 'API连接测试',
                    success: true,
                    message: '✅ API服务连接正常',
                    timestamp: this.getCurrentTime()
                });

                // 获取API详细信息
                try {
                    const infoResponse = await fetch('http://localhost:3000/api/info');
                    if (infoResponse.ok) {
                        const infoResult = await infoResponse.json();
                        if (infoResult.success) {
                            this.addResult({
                                name: 'API信息获取',
                                success: true,
                                message: `✅ API信息获取成功 - 活跃标签页: ${infoResult.data.totalTabs}`,
                                timestamp: this.getCurrentTime()
                            });
                        }
                    }
                } catch (error) {
                    this.addResult({
                        name: 'API信息获取',
                        success: false,
                        message: '⚠️ API信息获取失败，但不影响主要功能',
                        timestamp: this.getCurrentTime()
                    });
                }
            } else {
                this.addResult({
                    name: 'API连接测试',
                    success: false,
                    message: '❌ API服务响应异常',
                    timestamp: this.getCurrentTime()
                });
            }
        } catch (error) {
            this.addResult({
                name: 'API连接测试',
                success: false,
                message: `❌ API连接失败: ${error instanceof Error ? error.message : '网络错误'}`,
                timestamp: this.getCurrentTime()
            });
        }
    }

    /**
     * 测试基本功能
     */
    private async testBasicFunctionality(): Promise<void> {
        try {
            // 测试获取标签页列表
            const tabsResult = await window.electronAPI.getAllTabs();
            this.addResult({
                name: '标签页列表获取',
                success: tabsResult.success,
                message: tabsResult.success ?
                    `✅ 成功获取${tabsResult.tabs?.length || 0}个标签页` :
                    `❌ 获取标签页列表失败: ${tabsResult.error}`,
                timestamp: this.getCurrentTime()
            });

            // 如果有标签页，测试切换和脚本执行功能
            if (tabsResult.success && tabsResult.tabs && tabsResult.tabs.length > 0) {
                const firstTab = tabsResult.tabs[0];

                // 测试标签页切换
                const switchResult = await window.electronAPI.switchTab(firstTab.id);
                this.addResult({
                    name: '标签页切换测试',
                    success: switchResult.success,
                    message: switchResult.success ?
                        `✅ 成功切换到标签页: ${firstTab.accountName}` :
                        `❌ 标签页切换失败: ${switchResult.error}`,
                    timestamp: this.getCurrentTime()
                });

                // 测试JavaScript执行
                try {
                    const response = await fetch('http://localhost:3000/api/account/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tabId: firstTab.id,
                            script: `
                                ({
                                    url: window.location.href,
                                    title: document.title,
                                    timestamp: new Date().toISOString(),
                                    userAgent: navigator.userAgent.substring(0, 50) + '...'
                                });
                            `
                        })
                    });

                    const result = await response.json();
                    this.addResult({
                        name: 'JavaScript执行测试',
                        success: result.success,
                        message: result.success ?
                            `✅ JavaScript执行成功 - 当前页面: ${result.data?.title || 'Unknown'}` :
                            `❌ JavaScript执行失败: ${result.error}`,
                        timestamp: this.getCurrentTime()
                    });
                } catch (error) {
                    this.addResult({
                        name: 'JavaScript执行测试',
                        success: false,
                        message: `❌ JavaScript执行异常: ${error instanceof Error ? error.message : '未知错误'}`,
                        timestamp: this.getCurrentTime()
                    });
                }
            }

        } catch (error) {
            this.addResult({
                name: '基本功能测试',
                success: false,
                message: `❌ 基本功能测试异常: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: this.getCurrentTime()
            });
        }
    }

    /**
     * 添加测试结果
     */
    addResult(result: TestResult): void {
        this.results.push(result);
        this.renderResult(result);
        this.scrollToBottom();

        // 控制台输出
        const emoji = result.success ? '✅' : '❌';
        console.log(`${emoji} [${result.name}] ${result.message}`);
    }

    /**
     * 渲染单个测试结果
     */
    private renderResult(result: TestResult): void {
        // 如果是第一个结果，清除空状态
        if (this.results.length === 1) {
            this.resultsContainer.innerHTML = '';
        }

        const resultElement = document.createElement('div');
        resultElement.className = `test-result ${result.success ? 'success' : 'failure'}`;

        const durationText = result.duration ? ` (${result.duration}ms)` : '';

        resultElement.innerHTML = `
            <div class="result-header">
                <span class="result-status">${result.success ? '✅' : '❌'}</span>
                <span class="result-name">${result.name}</span>
                <span class="result-time">${result.timestamp}${durationText}</span>
            </div>
            <div class="result-message">${result.message}</div>
        `;

        this.resultsContainer.appendChild(resultElement);
    }

    /**
     * 清除所有结果
     */
    clearResults(): void {
        this.results = [];
        this.resultsContainer.innerHTML = '';
        this.renderEmptyState();
        console.log('🧹 测试结果已清除');
    }

    /**
     * 渲染空状态
     */
    private renderEmptyState(): void {
        this.resultsContainer.innerHTML = `
            <div class="test-results-empty">
                <div class="empty-icon">🧪</div>
                <div class="empty-text">测试结果将显示在这里</div>
                <div class="empty-hint">点击上方按钮开始测试</div>
            </div>
        `;
    }

    /**
     * 滚动到底部
     */
    private scrollToBottom(): void {
        this.resultsContainer.scrollTop = this.resultsContainer.scrollHeight;
    }

    /**
     * 获取当前时间字符串
     */
    private getCurrentTime(): string {
        return new Date().toLocaleTimeString();
    }

    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 导出测试结果
     */
    exportResults(): string {
        const summary = {
            timestamp: new Date().toISOString(),
            totalTests: this.results.length,
            passedTests: this.results.filter(r => r.success).length,
            failedTests: this.results.filter(r => !r.success).length,
            results: this.results
        };

        return JSON.stringify(summary, null, 2);
    }

    /**
     * 获取测试统计
     */
    getStats(): TestStats {
        const total = this.results.length;
        const passed = this.results.filter(r => r.success).length;
        const failed = total - passed;
        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

        return { total, passed, failed, passRate };
    }

    /**
     * 获取测试状态
     */
    isTestRunning(): boolean {
        return this.isRunning;
    }

    /**
     * 销毁组件
     */
    destroy(): void {
        this.results = [];
        this.resultsContainer.innerHTML = '';
        this.isRunning = false;
        console.log('🗑️ 测试面板已销毁');
    }
}

// 导出供其他模块使用
if (typeof window !== 'undefined') {
    (window as any).TestPanel = TestPanel;
}

// 添加测试面板特定的CSS样式
const testPanelStyles = `
.test-result {
    margin-bottom: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--border-color);
    background: var(--bg-primary);
    transition: all 0.2s ease;
}

.test-result:hover {
    box-shadow: var(--shadow-sm);
}

.test-result.success {
    border-left-color: var(--success-color);
    background: rgba(39, 174, 96, 0.05);
}

.test-result.failure {
    border-left-color: var(--error-color);
    background: rgba(231, 76, 60, 0.05);
}

.result-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
    font-weight: 500;
}

.result-status {
    font-size: 12px;
    flex-shrink: 0;
}

.result-name {
    flex: 1;
    color: var(--text-primary);
    font-weight: 600;
}

.result-time {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    font-family: monospace;
    flex-shrink: 0;
}

.result-message {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.4;
    word-break: break-word;
}

.test-results-empty {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-muted);
}

.empty-icon {
    font-size: 2rem;
    margin-bottom: var(--spacing-md);
}

.empty-text {
    font-weight: 500;
    margin-bottom: var(--spacing-sm);
    color: var(--text-secondary);
}

.empty-hint {
    font-size: var(--font-size-sm);
    opacity: 0.8;
}

#run-isolation-test-btn:disabled,
#run-cookie-test-btn:disabled,
#run-comprehensive-test-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
`;

// 添加样式到页面
if (typeof document !== 'undefined') {
    const existingStyle = document.getElementById('test-panel-styles');
    if (!existingStyle) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'test-panel-styles';
        styleSheet.textContent = testPanelStyles;
        document.head.appendChild(styleSheet);
    }
}

export { TestPanel, TestResult, TestStats };