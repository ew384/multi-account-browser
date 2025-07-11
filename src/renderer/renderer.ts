/**
 * 渲染进程主文件
 * 负责UI初始化、事件处理和与主进程通信
 */

// ========================================
// 类型定义
// ========================================
interface TabData {
    id: string;
    accountName: string;
    platform: string;
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    url?: string;
    cookieFile?: string;
}

interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

// ========================================
// 全局状态
// ========================================
let currentTabs: TabData[] = [];
let activeTabId: string | null = null;
let tabBar: any = null;
let testPanel: any = null;
let apiConnected: boolean = false;
let appInitialized: boolean = false;

// ========================================
// 应用初始化
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎨 渲染进程启动');

    try {
        await initializeApplication();
    } catch (error) {
        console.error('应用初始化失败:', error);
        showNotification('应用初始化失败，请刷新页面重试', 'error');
    }
});
function handleError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : 'Unknown error';
}
/**
 * 初始化应用
 */
async function initializeApplication(): Promise<void> {
    if (appInitialized) return;

    try {
        showLoading('正在初始化应用...');
        await initializeComponents();
        setupEventListeners();
        await checkAPIStatus();
        await refreshTabList();
        setupMenuListeners();
        setupPeriodicUpdates();
        setupErrorHandling();

        appInitialized = true;
        hideLoading();

        console.log('✅ 应用初始化完成');
        showNotification('应用初始化完成', 'success');

    } catch (error) {
        hideLoading();
        console.error('应用初始化失败:', error);
        showNotification(`应用初始化失败: ${handleError(error)}`, 'error');
        throw error;
    }
}

/**
 * 初始化组件
 */
async function initializeComponents(): Promise<void> {
    try {
        // 初始化标签页栏
        if (typeof (window as any).TabBar !== 'undefined') {
            tabBar = new (window as any).TabBar('tab-bar');
            if (tabBar) {
                tabBar.onTabSwitchCallback(switchTab);
                tabBar.onTabCloseCallback(closeTab);
                console.log('✅ 标签页栏初始化完成');
            }
        }

        // 初始化测试面板
        if (typeof (window as any).TestPanel !== 'undefined') {
            testPanel = new (window as any).TestPanel('test-results');
            console.log('✅ 测试面板初始化完成');
        }

        // 确保必要的DOM元素存在
        ensureRequiredElements();

    } catch (error) {
        console.error('组件初始化失败:', error);
        throw new Error(`组件初始化失败: ${handleError(error)}`);
    }
}

/**
 * 确保必要的DOM元素存在
 */
function ensureRequiredElements(): void {
    const requiredElements = [
        'tab-bar',
        'test-results',
        'current-tab-name',
        'current-tab-platform',
        'current-tab-status',
        'current-tab-url',
        'api-connection-status',
        'notification-container'
    ];

    for (const elementId of requiredElements) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`⚠️ 必需元素未找到: ${elementId}`);
        }
    }
}

/**
 * 设置事件监听器
 */
function setupEventListeners(): void {
    try {
        // 顶部按钮
        addEventListenerSafely('new-tab-btn', 'click', () => showNewTabDialog());
        addEventListenerSafely('test-isolation-btn', 'click', () => testIsolation());

        // 侧边栏快速操作
        addEventListenerSafely('load-cookies-btn', 'click', () => loadCookies());
        addEventListenerSafely('save-cookies-btn', 'click', () => saveCookies());
        addEventListenerSafely('clear-cookies-btn', 'click', () => clearCookies());
        addEventListenerSafely('refresh-tab-btn', 'click', () => refreshCurrentTab());
        addEventListenerSafely('screenshot-btn', 'click', () => takeScreenshot());

        // 批量操作
        addEventListenerSafely('execute-batch-btn', 'click', () => executeBatchOperation());

        // API检查
        addEventListenerSafely('check-api-btn', 'click', () => checkAPIStatus());

        // 模态框相关
        setupModalEvents();

        // 右键菜单
        setupContextMenu();

        // 快捷键
        setupKeyboardShortcuts();

        // 文件选择 - 修复事件处理器类型
        addEventListenerSafely('cookie-file', 'change', (e: Event) => handleCookieFileSelect(e));

        console.log('✅ 事件监听器设置完成');

    } catch (error) {
        console.error('事件监听器设置失败:', error);
        throw error;
    }
}


/**
 * 安全地添加事件监听器
 */
function addEventListenerSafely(elementId: string, event: string, handler: (e: Event) => void): void {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn(`⚠️ 元素 ${elementId} 不存在，跳过事件监听器设置`);
    }
}

/**
 * 设置菜单监听器
 */
function setupMenuListeners(): void {
    if (window.electronAPI) {
        try {
            window.electronAPI.onMenuNewTab(() => {
                showNewTabDialog();
            });

            window.electronAPI.onMenuCloseTab(async () => {
                if (activeTabId) {
                    await closeTab(activeTabId);
                }
            });

            console.log('✅ 菜单监听器设置完成');
        } catch (error) {
            console.warn('⚠️ 菜单监听器设置失败:', error);
        }
    }
}

/**
 * 设置定期更新
 */
function setupPeriodicUpdates(): void {
    // 每5秒检查API状态
    setInterval(async () => {
        if (appInitialized) {
            await checkAPIStatus();
        }
    }, 5000);

    // 每10秒更新标签页状态
    setInterval(async () => {
        if (appInitialized && apiConnected) {
            await refreshTabList();
        }
    }, 10000);

    // 每30秒更新系统信息
    setInterval(async () => {
        if (appInitialized && apiConnected) {
            await updateSystemInfo();
        }
    }, 30000);

    console.log('✅ 定期更新任务设置完成');
}

/**
 * 设置错误处理
 */
function setupErrorHandling(): void {
    // 全局错误处理
    window.addEventListener('error', (event) => {
        console.error('渲染进程错误:', event.error);
        showNotification('应用发生错误，请查看控制台获取详细信息', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('未处理的Promise拒绝:', event.reason);
        showNotification('操作失败，请重试', 'error');
    });

    console.log('✅ 错误处理设置完成');
}

// ========================================
// 模态框管理
// ========================================

/**
 * 设置模态框事件
 */
function setupModalEvents(): void {
    // 新建标签页模态框
    const newTabModal = document.getElementById('new-tab-modal');
    if (newTabModal) {
        newTabModal.addEventListener('click', (e) => {
            if (e.target === newTabModal) {
                hideNewTabDialog();
            }
        });
    }

    // 截图模态框
    const screenshotModal = document.getElementById('screenshot-modal');
    if (screenshotModal) {
        screenshotModal.addEventListener('click', (e) => {
            if (e.target === screenshotModal) {
                hideScreenshotModal();
            }
        });
    }

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideNewTabDialog();
            hideScreenshotModal();
            hideContextMenu();
        }
    });
}

/**
 * 显示新建标签页对话框
 */
function showNewTabDialog(): void {
    const modal = document.getElementById('new-tab-modal');
    if (modal) {
        modal.style.display = 'flex';

        // 重置表单
        const form = document.getElementById('new-tab-form') as HTMLFormElement;
        if (form) {
            form.reset();
        }

        // 设置默认值
        const platformSelect = document.getElementById('platform') as HTMLSelectElement;
        const urlInput = document.getElementById('initial-url') as HTMLInputElement;
        const fileNameSpan = document.getElementById('cookie-file-name');

        if (platformSelect) platformSelect.value = 'weixin';
        if (urlInput) urlInput.value = 'https://channels.weixin.qq.com';
        if (fileNameSpan) fileNameSpan.textContent = '未选择文件';

        // 聚焦到账号名称输入框
        setTimeout(() => {
            const accountNameInput = document.getElementById('account-name');
            if (accountNameInput) {
                accountNameInput.focus();
            }
        }, 100);
    }
}

/**
 * 隐藏新建标签页对话框
 */
function hideNewTabDialog(): void {
    const modal = document.getElementById('new-tab-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 创建新标签页
 */
async function createNewTab(): Promise<void> {
    const accountNameInput = document.getElementById('account-name') as HTMLInputElement;
    const platformSelect = document.getElementById('platform') as HTMLSelectElement;
    const urlInput = document.getElementById('initial-url') as HTMLInputElement;
    const cookieFileInput = document.getElementById('cookie-file') as HTMLInputElement;

    const accountName = accountNameInput?.value?.trim() || '';
    const platform = platformSelect?.value || '';
    const initialUrl = urlInput?.value?.trim() || '';

    // 验证输入
    if (!accountName) {
        showNotification('请输入账号名称', 'warning');
        accountNameInput?.focus();
        return;
    }

    if (!platform) {
        showNotification('请选择平台类型', 'warning');
        platformSelect?.focus();
        return;
    }

    try {
        showLoading('正在创建标签页...');

        console.log('创建标签页:', { accountName, platform, initialUrl });

        // 检查API连接
        if (!apiConnected) {
            throw new Error('API服务未连接，请检查服务状态');
        }

        // 创建标签页
        const result = await window.electronAPI.createAccountTab(accountName, platform, initialUrl);

        if (result.success) {
            const tabId = result.tabId;

            // 如果有Cookie文件，加载Cookie
            if (cookieFileInput?.files && cookieFileInput.files[0]) {
                const file = cookieFileInput.files[0];
                console.log('加载Cookie文件:', file.name);

                try {
                    const cookieResult = await window.electronAPI.loadCookies(tabId, file.path);
                    if (cookieResult.success) {
                        showNotification('Cookie加载成功', 'success');
                    } else {
                        console.warn('Cookie加载失败:', cookieResult.error);
                        showNotification(`Cookie加载失败: ${cookieResult.error}`, 'warning');
                    }
                } catch (error) {
                    console.warn('Cookie加载异常:', error);
                    showNotification('Cookie加载异常，但标签页已创建', 'warning');
                }
            }

            // 切换到新标签页
            await window.electronAPI.switchTab(tabId);
            activeTabId = tabId;

            // 刷新标签页列表
            await refreshTabList();

            hideNewTabDialog();
            showNotification(`成功创建标签页: ${accountName}`, 'success');

            console.log('✅ 标签页创建成功:', tabId);
        } else {
            throw new Error(result.error || '创建失败');
        }
    } catch (error) {
        console.error('创建标签页失败:', error);
        showNotification(`创建标签页失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// 标签页管理
// ========================================

/**
 * 切换标签页
 */
async function switchTab(tabId: string): Promise<void> {
    if (activeTabId === tabId) return;

    try {
        const result = await window.electronAPI.switchTab(tabId);
        if (result.success) {
            activeTabId = tabId;
            updateCurrentTabInfo();
            updateNoTabsMessage();

            if (tabBar) {
                tabBar.setActiveTab(tabId);
            }

            console.log('✅ 切换到标签页:', tabId);
        } else {
            throw new Error(result.error || '切换失败');
        }
    } catch (error) {
        console.error('切换标签页失败:', error);
        showNotification(`切换标签页失败: ${handleError(error)}`, 'error');
    }
}

/**
 * 关闭标签页
 */
async function closeTab(tabId: string): Promise<void> {
    const tab = currentTabs.find(t => t.id === tabId);
    if (!tab) {
        showNotification('标签页不存在', 'warning');
        return;
    }

    const confirmed = confirm(`确定要关闭标签页 "${tab.accountName}" 吗？`);
    if (!confirmed) return;

    try {
        showLoading('正在关闭标签页...');

        const result = await window.electronAPI.closeTab(tabId);
        if (result.success) {
            if (activeTabId === tabId) {
                activeTabId = null;
            }

            await refreshTabList();
            showNotification(`已关闭标签页: ${tab.accountName}`, 'info');

            console.log('✅ 标签页已关闭:', tabId);
        } else {
            throw new Error(result.error || '关闭失败');
        }
    } catch (error) {
        console.error('关闭标签页失败:', error);
        showNotification(`关闭标签页失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 刷新标签页列表
 */
async function refreshTabList(): Promise<void> {
    try {
        const result = await window.electronAPI.getAllTabs();
        if (result.success) {
            currentTabs = result.tabs || [];

            // 更新标签页栏
            if (tabBar) {
                tabBar.setTabs(currentTabs);
                if (activeTabId) {
                    tabBar.setActiveTab(activeTabId);
                }
            }

            updateCurrentTabInfo();
            updateNoTabsMessage();

        } else {
            console.error('获取标签页列表失败:', result.error);
        }
    } catch (error) {
        console.error('刷新标签页列表异常:', error);
    }
}

/**
 * 更新当前标签页信息显示
 */
function updateCurrentTabInfo(): void {
    const currentTab = currentTabs.find(tab => tab.id === activeTabId);

    const nameElement = document.getElementById('current-tab-name');
    const platformElement = document.getElementById('current-tab-platform');
    const statusElement = document.getElementById('current-tab-status');
    const urlElement = document.getElementById('current-tab-url');

    if (currentTab) {
        if (nameElement) nameElement.textContent = currentTab.accountName;
        if (platformElement) platformElement.textContent = currentTab.platform;
        if (statusElement) {
            statusElement.textContent = getStatusText(currentTab.loginStatus);
            statusElement.className = `value status-${currentTab.loginStatus}`;
        }
        if (urlElement) {
            const url = currentTab.url || '-';
            urlElement.textContent = url;
            urlElement.title = url;
        }
    } else {
        if (nameElement) nameElement.textContent = '未选择';
        if (platformElement) platformElement.textContent = '-';
        if (statusElement) {
            statusElement.textContent = '未知';
            statusElement.className = 'value status-unknown';
        }
        if (urlElement) {
            urlElement.textContent = '-';
            urlElement.title = '';
        }
    }
}

/**
 * 更新无标签页消息显示
 */
function updateNoTabsMessage(): void {
    const noTabsMessage = document.getElementById('no-tabs-message');
    if (noTabsMessage) {
        noTabsMessage.style.display = currentTabs.length === 0 ? 'flex' : 'none';
    }
}

// ========================================
// 测试功能
// ========================================

/**
 * 测试Session隔离
 */
async function testIsolation(): Promise<void> {
    try {
        showLoading('正在测试Session隔离...');

        const result = await window.electronAPI.testIsolation();

        if (result.success) {
            const message = result.isolated ?
                'Session隔离测试通过 - 不同标签页Session完全独立' :
                'Session隔离测试失败 - 存在Session泄露问题';

            showNotification(message, result.isolated ? 'success' : 'error');

            if (testPanel && typeof testPanel.addResult === 'function') {
                testPanel.addResult({
                    name: 'Session隔离测试',
                    success: result.isolated,
                    message: (result.isolated ? '✅ ' : '❌ ') + message,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        } else {
            throw new Error(result.error || '测试失败');
        }
    } catch (error) {
        console.error('隔离测试失败:', error);
        showNotification(`隔离测试失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}
// ========================================
// Cookie管理
// ========================================

/**
 * 加载Cookie
 */
async function loadCookies(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                try {
                    showLoading('正在加载Cookie...');

                    const loadResult = await window.electronAPI.loadCookies(activeTabId!, file.path);

                    if (loadResult.success) {
                        showNotification('Cookie加载成功', 'success');
                        await refreshCurrentTab();
                    } else {
                        throw new Error(loadResult.error || '加载失败');
                    }
                } catch (error) {
                    console.error('加载Cookie失败:', error);
                    showNotification(`Cookie加载失败: ${handleError(error)}`, 'error');
                } finally {
                    hideLoading();
                }
            }
        };

        input.click();

    } catch (error) {
        console.error('加载Cookie异常:', error);
        showNotification(`加载Cookie时发生错误: ${handleError(error)}`, 'error');
    }
}


/**
 * 保存Cookie
 */
async function saveCookies(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        const currentTab = currentTabs.find(tab => tab.id === activeTabId);
        const defaultName = currentTab ?
            `${currentTab.accountName}-cookies-${new Date().toISOString().slice(0, 10)}.json` :
            `cookies-${new Date().toISOString().slice(0, 10)}.json`;

        showLoading('正在保存Cookie...');

        const response = await fetch('http://localhost:3000/api/account/save-cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                cookieFile: `./cookies/${defaultName}`
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Cookie保存成功', 'success');
        } else {
            throw new Error(result.error || '保存失败');
        }

    } catch (error) {
        console.error('保存Cookie失败:', error);
        showNotification(`保存Cookie失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 清除Cookie
 */
async function clearCookies(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    const confirmed = confirm('确定要清除当前标签页的所有Cookie和存储数据吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
        showLoading('正在清除Cookie...');

        const response = await fetch('http://localhost:3000/api/account/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                script: `
                    // 清除所有Cookie
                    document.cookie.split(";").forEach(function(c) { 
                        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                    });
                    
                    // 清除存储数据
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                        console.log('Storage cleared');
                    } catch(e) {
                        console.warn('清除存储数据时出错:', e);
                    }
                    
                    'Cookie和存储数据已清除';
                `
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Cookie和存储数据已清除', 'success');

            // 刷新页面
            await refreshCurrentTab();
        } else {
            throw new Error(result.error || '清除失败');
        }

    } catch (error) {
        console.error('清除Cookie失败:', error);
        showNotification(`清除Cookie失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// 标签页操作
// ========================================

/**
 * 刷新当前标签页
 */
async function refreshCurrentTab(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/account/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId: activeTabId })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('页面已刷新', 'info');
        } else {
            throw new Error(result.error || '刷新失败');
        }

    } catch (error) {
        console.error('刷新页面失败:', error);
        showNotification(`刷新页面失败: ${handleError(error)}`, 'error');
    }
}

/**
 * 截图
 */
async function takeScreenshot(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        showLoading('正在截图...');

        const response = await fetch('http://localhost:3000/api/account/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId: activeTabId })
        });

        const result = await response.json();

        if (result.success) {
            showScreenshot(result.data.screenshot);
            showNotification('截图完成', 'success');
        } else {
            throw new Error(result.error || '截图失败');
        }

    } catch (error) {
        console.error('截图失败:', error);
        showNotification(`截图失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 显示截图
 */
function showScreenshot(screenshotData: string): void {
    const modal = document.getElementById('screenshot-modal');
    const image = document.getElementById('screenshot-image') as HTMLImageElement;

    if (modal && image) {
        image.src = screenshotData;
        modal.style.display = 'flex';

        // 保存截图数据供下载使用
        (window as any).currentScreenshot = screenshotData;
    }
}

/**
 * 隐藏截图模态框
 */
function hideScreenshotModal(): void {
    const modal = document.getElementById('screenshot-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 下载截图
 */
function downloadScreenshot(): void {
    const screenshotData = (window as any).currentScreenshot;
    if (!screenshotData) {
        showNotification('没有可下载的截图', 'warning');
        return;
    }

    try {
        const link = document.createElement('a');
        link.href = screenshotData;
        link.download = `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('截图已下载', 'success');
    } catch (error) {
        console.error('下载截图失败:', error);
        showNotification('下载截图失败', 'error');
    }
}

// ========================================
// 批量操作
// ========================================

/**
 * 执行批量操作
 */
async function executeBatchOperation(): Promise<void> {
    const operationSelect = document.getElementById('batch-operation') as HTMLSelectElement;
    const inputElement = document.getElementById('batch-input') as HTMLInputElement;

    const operation = operationSelect?.value || '';
    const input = inputElement?.value?.trim() || '';

    if (!operation) {
        showNotification('请选择批量操作类型', 'warning');
        operationSelect?.focus();
        return;
    }

    if (!input) {
        showNotification('请输入操作参数', 'warning');
        inputElement?.focus();
        return;
    }

    if (currentTabs.length === 0) {
        showNotification('没有可操作的标签页', 'warning');
        return;
    }

    const confirmed = confirm(`确定要对所有 ${currentTabs.length} 个标签页执行 "${operation}" 操作吗？`);
    if (!confirmed) return;

    try {
        showLoading(`正在执行批量${operation}操作...`);

        const tabIds = currentTabs.map(tab => tab.id);
        let data: any = {};

        switch (operation) {
            case 'navigate':
                data.url = input;
                break;
            case 'execute':
                data.script = input;
                break;
        }

        const response = await fetch('http://localhost:3000/api/accounts/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation, tabIds, data })
        });

        const result = await response.json();

        if (result.success) {
            const successCount = result.data.filter((r: any) => r.success).length;
            showNotification(`批量操作完成: ${successCount}/${tabIds.length} 个标签页操作成功`, 'success');

            // 显示详细结果到测试面板
            if (testPanel && typeof testPanel.addResult === 'function') {
                result.data.forEach((r: any) => {
                    const tab = currentTabs.find(t => t.id === r.tabId);
                    testPanel.addResult({
                        name: `批量${operation} - ${tab?.accountName || r.tabId}`,
                        success: r.success,
                        message: r.success ? '✅ 操作成功' : `❌ ${r.error}`,
                        timestamp: new Date().toLocaleTimeString()
                    });
                });
            }
        } else {
            throw new Error(result.error || '批量操作失败');
        }

    } catch (error) {
        console.error('批量操作失败:', error);
        showNotification(`批量操作失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

// ========================================
// API状态管理
// ========================================

/**
 * 检查API状态
 */
async function checkAPIStatus(): Promise<void> {
    const statusElement = document.getElementById('api-connection-status');
    const connectionStatus = document.getElementById('connection-status');

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
            apiConnected = true;

            if (statusElement) {
                statusElement.textContent = '已连接';
                statusElement.className = 'value status-logged_in';
            }

            if (connectionStatus) {
                connectionStatus.innerHTML = `
                    <span class="status-dot online"></span>
                    <span class="status-text">API服务正常</span>
                `;
            }

            // 获取API详细信息
            try {
                const infoResponse = await fetch('http://localhost:3000/api/info');
                if (infoResponse.ok) {
                    const infoResult = await infoResponse.json();
                    if (infoResult.success) {
                        updateSystemInfo(infoResult.data);
                    }
                }
            } catch (error) {
                console.warn('获取API信息失败:', error);
            }
        } else {
            apiConnected = false;
            updateAPIOfflineStatus();
        }
    } catch (error) {
        apiConnected = false;
        updateAPIOfflineStatus();
        console.warn('API连接检查失败:', error);
    }
}

/**
 * 更新API离线状态
 */
function updateAPIOfflineStatus(): void {
    const statusElement = document.getElementById('api-connection-status');
    const connectionStatus = document.getElementById('connection-status');

    if (statusElement) {
        statusElement.textContent = '未连接';
        statusElement.className = 'value status-logged_out';
    }

    if (connectionStatus) {
        connectionStatus.innerHTML = `
            <span class="status-dot offline"></span>
            <span class="status-text">API服务离线</span>
        `;
    }
}

/**
 * 更新系统信息
 */
async function updateSystemInfo(apiData?: any): Promise<void> {
    const memoryElement = document.getElementById('memory-usage');
    const uptimeElement = document.getElementById('uptime');
    const activeTabsElement = document.getElementById('api-active-tabs');

    if (apiData) {
        if (memoryElement && apiData.memory) {
            const memoryMB = Math.round(apiData.memory.heapUsed / 1024 / 1024);
            memoryElement.textContent = `${memoryMB} MB`;
        }

        if (uptimeElement && typeof apiData.uptime === 'number') {
            const hours = Math.floor(apiData.uptime / 3600);
            const minutes = Math.floor((apiData.uptime % 3600) / 60);
            uptimeElement.textContent = `${hours}h ${minutes}m`;
        }

        if (activeTabsElement && typeof apiData.totalTabs === 'number') {
            activeTabsElement.textContent = apiData.totalTabs.toString();
        }
    }

    // 更新本地标签页计数
    if (activeTabsElement && !apiData) {
        activeTabsElement.textContent = currentTabs.length.toString();
    }
}

// ========================================
// 右键菜单
// ========================================

/**
 * 设置右键菜单
 */
function setupContextMenu(): void {
    // 标签页右键菜单
    document.addEventListener('contextmenu', (e) => {
        const tab = (e.target as HTMLElement).closest('.tab');
        if (tab) {
            e.preventDefault();
            const tabId = tab.getAttribute('data-tab-id');
            if (tabId) {
                showTabContextMenu(e, tabId);
            }
        }
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        hideContextMenu();
    });
}

/**
 * 显示标签页右键菜单
 */
function showTabContextMenu(event: MouseEvent, tabId: string): void {
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) return;

    const tab = currentTabs.find(t => t.id === tabId);
    if (!tab) return;

    // 更新菜单内容
    contextMenu.innerHTML = `
        <div class="menu-item" onclick="switchTab('${tabId}')">
            <span class="icon">🔄</span>
            切换到此标签页
        </div>
        <div class="menu-item" onclick="refreshTab('${tabId}')">
            <span class="icon">🔄</span>
            刷新页面
        </div>
        <div class="menu-item" onclick="duplicateTab('${tabId}')">
            <span class="icon">📋</span>
            复制标签页
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" onclick="closeTab('${tabId}')">
            <span class="icon">🗑️</span>
            关闭标签页
        </div>
    `;

    // 显示菜单
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    // 确保菜单在屏幕内
    const rect = contextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (rect.right > windowWidth) {
        contextMenu.style.left = `${windowWidth - rect.width - 10}px`;
    }

    if (rect.bottom > windowHeight) {
        contextMenu.style.top = `${windowHeight - rect.height - 10}px`;
    }
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu(): void {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

/**
 * 刷新指定标签页
 */
async function refreshTab(tabId: string): Promise<void> {
    try {
        const response = await fetch('http://localhost:3000/api/account/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId })
        });

        const result = await response.json();

        if (result.success) {
            const tab = currentTabs.find(t => t.id === tabId);
            showNotification(`已刷新标签页: ${tab?.accountName || tabId}`, 'info');
        } else {
            throw new Error(result.error || '刷新失败');
        }
    } catch (error) {
        console.error('刷新标签页失败:', error);
        showNotification(`刷新标签页失败: ${handleError(error)}`, 'error');
    }

    hideContextMenu();
}

/**
 * 复制标签页
 */
async function duplicateTab(tabId: string): Promise<void> {
    const tab = currentTabs.find(t => t.id === tabId);
    if (!tab) {
        showNotification('标签页不存在', 'warning');
        return;
    }

    const newName = `${tab.accountName} - 副本`;

    try {
        showLoading('正在复制标签页...');

        const result = await window.electronAPI.createAccountTab(newName, tab.platform, tab.url);

        if (result.success) {
            await refreshTabList();
            showNotification(`已复制标签页: ${newName}`, 'success');
        } else {
            throw new Error(result.error || '复制失败');
        }
    } catch (error) {
        console.error('复制标签页失败:', error);
        showNotification(`复制标签页失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }

    hideContextMenu();
}

// ========================================
// 快捷键
// ========================================

/**
 * 设置键盘快捷键
 */
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + T: 新建标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            showNewTabDialog();
        }

        // Ctrl/Cmd + W: 关闭当前标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            if (activeTabId) {
                closeTab(activeTabId);
            }
        }

        // Ctrl/Cmd + R: 刷新当前标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            refreshCurrentTab();
        }

        // F5: 刷新当前标签页
        if (e.key === 'F5') {
            e.preventDefault();
            refreshCurrentTab();
        }

        // Ctrl/Cmd + 数字键: 切换到对应标签页
        if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
            e.preventDefault();
            const index = parseInt(e.key) - 1;
            if (currentTabs[index]) {
                switchTab(currentTabs[index].id);
            }
        }

        // Ctrl/Cmd + Shift + I: 测试隔离
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            testIsolation();
        }
    });
}

// ========================================
// 文件处理
// ========================================

/**
 * 处理Cookie文件选择
 */
function handleCookieFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileNameElement = document.getElementById('cookie-file-name');

    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        if (fileNameElement) {
            fileNameElement.textContent = file.name;
        }
    } else {
        if (fileNameElement) {
            fileNameElement.textContent = '未选择文件';
        }
    }
}

/**
 * 选择Cookie文件
 */
function selectCookieFile(): void {
    const input = document.getElementById('cookie-file') as HTMLInputElement;
    if (input) {
        input.click();
    }
}

// ========================================
// 快速功能
// ========================================

/**
 * 运行快速测试
 */
async function runQuickTest(): Promise<void> {
    if (testPanel && typeof testPanel.runComprehensiveTest === 'function') {
        await testPanel.runComprehensiveTest();
    } else {
        // 如果测试面板不可用，运行基础测试
        await testIsolation();
        await checkAPIStatus();
    }
}

// ========================================
// 通知系统
// ========================================

/**
 * 显示通知
 */
function showNotification(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.warn('通知容器不存在');
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        success: '✅',
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌'
    };

    const titles = {
        success: '成功',
        info: '提示',
        warning: '警告',
        error: '错误'
    };

    notification.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${icons[type]} ${titles[type]}</span>
            <button class="notification-close">&times;</button>
        </div>
        <div class="notification-body">${message}</div>
    `;

    container.appendChild(notification);

    // 关闭按钮事件
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            removeNotification(notification);
        });
    }

    // 自动关闭
    setTimeout(() => {
        removeNotification(notification);
    }, 5000);

    console.log(`📢 通知[${type}]: ${message}`);
}

/**
 * 移除通知
 */
function removeNotification(notification: HTMLElement): void {
    if (notification.parentNode) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// ========================================
// 加载状态管理
// ========================================

/**
 * 显示加载状态
 */
function showLoading(text: string = '处理中...'): void {
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');

    if (loading) {
        loading.style.display = 'flex';
    }

    if (loadingText) {
        loadingText.textContent = text;
    }
}

/**
 * 隐藏加载状态
 */
function hideLoading(): void {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

// ========================================
// 工具函数
// ========================================

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
    const statusTexts: Record<string, string> = {
        'logged_in': '已登录',
        'logged_out': '未登录',
        'unknown': '未知'
    };
    return statusTexts[status] || '未知';
}

/**
 * 格式化时间
 */
function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// 全局函数供HTML调用
// ========================================
(window as any).showNewTabDialog = showNewTabDialog;
(window as any).hideNewTabDialog = hideNewTabDialog;
(window as any).createNewTab = createNewTab;
(window as any).closeTab = closeTab;
(window as any).switchTab = switchTab;
(window as any).refreshTab = refreshTab;
(window as any).duplicateTab = duplicateTab;
(window as any).selectCookieFile = selectCookieFile;
(window as any).runQuickTest = runQuickTest;
(window as any).hideScreenshotModal = hideScreenshotModal;
(window as any).downloadScreenshot = downloadScreenshot;
(window as any).refreshCurrentTab = refreshCurrentTab;
(window as any).closeCurrentTab = () => {
    if (activeTabId) {
        closeTab(activeTabId);
    }
};
(window as any).duplicateCurrentTab = () => {
    if (activeTabId) {
        duplicateTab(activeTabId);
    }
};

// ========================================
// 页面生命周期
// ========================================

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    try {
        if (tabBar && typeof tabBar.destroy === 'function') {
            tabBar.destroy();
        }

        if (testPanel && typeof testPanel.destroy === 'function') {
            testPanel.destroy();
        }

        // 清理事件监听器
        if (window.electronAPI) {
            window.electronAPI.removeAllListeners('menu-new-tab');
            window.electronAPI.removeAllListeners('menu-close-tab');
        }

        console.log('🧹 页面资源清理完成');
    } catch (error) {
        console.error('页面清理时发生错误:', error);
    }
});

// 页面可见性变化处理
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && appInitialized) {
        // 页面重新可见时刷新状态
        setTimeout(async () => {
            await checkAPIStatus();
            if (apiConnected) {
                await refreshTabList();
            }
        }, 1000);
    }
});

// ========================================
// 应用状态监控
// ========================================

/**
 * 获取应用状态
 */
function getAppState(): object {
    return {
        initialized: appInitialized,
        apiConnected: apiConnected,
        activeTabId: activeTabId,
        totalTabs: currentTabs.length,
        timestamp: new Date().toISOString()
    };
}

/**
 * 导出应用状态（调试用）
 */
(window as any).getAppState = getAppState;
(window as any).getCurrentTabs = () => currentTabs;
(window as any).getActiveTabId = () => activeTabId;

console.log('🎨 渲染进程脚本加载完成');

// 暴露调试接口
if (process.env.NODE_ENV === 'development') {
    (window as any).debugAPI = {
        showNotification,
        showLoading,
        hideLoading,
        checkAPIStatus,
        refreshTabList,
        getAppState,
        testIsolation
    };
    console.log('🛠️ 调试接口已暴露到 window.debugAPI');
}