/**
 * 渲染进程主文件
 * 负责UI初始化、事件处理和与主进程通信
 */

// ========================================
// 类型定义
// ========================================
interface TabData {
    id: string;
    accountName: string;        // 内部标识符
    displayTitle?: string;      // 页面标题（Chrome风格）
    displayFavicon?: string;    // 页面图标
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
 * 初始化标签页标题监听
 */
function setupTabTitleListeners(): void {
    // 监听标题更新
    window.electronAPI.onTabTitleUpdated(({ tabId, title }) => {
        console.log(`📝 收到标题更新: ${title} (${tabId})`);
        updateTabTitle(tabId, title);
    });

    // 监听图标更新
    window.electronAPI.onTabFaviconUpdated(({ tabId, favicon }) => {
        console.log(`🎭 收到图标更新: ${favicon} (${tabId})`);
        updateTabFavicon(tabId, favicon);
    });
}

/**
 * 更新标签页标题
 */
function updateTabTitle(tabId: string, title: string): void {
    // 更新内存中的数据
    const tab = currentTabs.find(t => t.id === tabId);
    if (tab) {
        tab.displayTitle = title;
    }

    // 更新DOM中的标签页标题
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
        const titleElement = tabElement.querySelector('.chrome-tab-title');
        if (titleElement) {
            titleElement.textContent = title;
            titleElement.setAttribute('title', title);
        }
    }

    // 如果是当前活动标签页，更新窗口标题
    if (tabId === activeTabId) {
        document.title = title + ' - Multi-Account Browser';
    }
}

/**
 * 更新标签页图标
 */
function updateTabFavicon(tabId: string, favicon: string): void {
    // 更新内存中的数据
    const tab = currentTabs.find(t => t.id === tabId);
    if (tab) {
        tab.displayFavicon = favicon;
    }

    // 更新DOM中的标签页图标
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
        const iconElement = tabElement.querySelector('.chrome-tab-icon');
        if (iconElement) {
            // 使用网站的 favicon，失败时显示默认图标
            iconElement.innerHTML = `<img src="${favicon}" alt="icon" style="width: 16px; height: 16px; border-radius: 2px;" 
                                     onerror="this.style.display='none'; this.parentElement.textContent='🌐';">`;
        }
    }
}

/**
 * 创建Chrome风格标签页 - 显示页面标题
 */
function createChromeTab(tab: TabData): HTMLElement {
    const tabElement = document.createElement('div');
    tabElement.className = `chrome-tab ${tab.id === activeTabId ? 'active' : ''}`;
    tabElement.setAttribute('data-tab-id', tab.id);

    // 优先使用页面标题，备选使用账号名
    const displayTitle = tab.displayTitle || tab.accountName || 'New Tab';
    // 图标：优先使用 favicon，备选使用加载动画
    let iconContent = '';
    if (tab.displayFavicon) {
        iconContent = `<img src="${tab.displayFavicon}" alt="icon" style="width: 16px; height: 16px; border-radius: 2px;" 
                    onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'tab-loading-spinner\\'></div>';">`;
    } else {
        iconContent = '<div class="tab-loading-spinner"></div>'; // 加载动画
    }

    tabElement.innerHTML = `
        <div class="chrome-tab-icon">${iconContent}</div>
        <div class="chrome-tab-title" title="${displayTitle}">${displayTitle}</div>
        <button class="chrome-tab-close" title="关闭标签页"></button>
    `;

    // 事件监听器
    tabElement.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).classList.contains('chrome-tab-close')) {
            switchTab(tab.id);
        }
    });


    const closeBtn = tabElement.querySelector('.chrome-tab-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });
    }

    return tabElement;
}
/**
 * 刷新标签页列表 - 获取包含显示信息的数据
 */
async function refreshTabList(): Promise<void> {
    try {
        // 使用新的API获取包含显示信息的标签页数据
        const response = await fetch('http://localhost:3409/api/accounts-with-display');
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                currentTabs = result.data || [];
                updateTabBar();
                updateCurrentTabInfo();
                updateNoTabsMessage();
                console.log(`📑 刷新了 ${currentTabs.length} 个标签页（Chrome风格显示）`);
                return;
            }
        }

        // 备选：使用原始API
        console.warn('显示信息API不可用，使用原始API');
        const fallbackResult = await window.electronAPI.getAllTabs();
        if (fallbackResult.success) {
            currentTabs = fallbackResult.tabs || [];
            updateTabBar();
            updateCurrentTabInfo();
            updateNoTabsMessage();
        }
    } catch (error) {
        console.error('刷新标签页列表异常:', error);
    }
}

/**
 * 应用初始化时设置标题监听
 */
async function initializeApplication(): Promise<void> {
    if (appInitialized) return;

    try {
        showLoading('正在初始化应用...');
        await initializeComponents();
        setupEventListeners();
        setupTabTitleListeners();
        await checkAPIStatus();
        await refreshTabList();
        setupMenuListeners();
        setupPeriodicUpdates();
        setupErrorHandling();

        appInitialized = true;
        hideLoading();

        console.log('✅ 应用初始化完成（Chrome风格标签页）');
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
        // 初始化测试面板
        if (typeof (window as any).TestPanel !== 'undefined' &&
            typeof process !== 'undefined' &&
            process.env?.NODE_ENV === 'development') {

            // 检查测试结果容器是否存在
            const testResultsContainer = document.getElementById('test-results');
            if (testResultsContainer) {
                testPanel = new (window as any).TestPanel('test-results');
                console.log('✅ 测试面板初始化完成');
            } else {
                console.log('ℹ️ 测试结果容器不存在，跳过测试面板初始化');
            }
        }

        // 确保必要的DOM元素存在
        ensureRequiredElements();
        console.log('✅ 组件初始化完成');
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
        'tab-bar-content',        // 新的标签页容器
        'new-tab-btn',           // 新建标签页按钮
        'url-input',             // URL输入框
        'notification-container', // 通知容器
        'loading',               // 加载覆盖层
        'no-tabs-message'        // 无标签页消息
    ];

    for (const elementId of requiredElements) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`⚠️ 必需元素未找到: ${elementId}`);
        }
    }
}
function setupUrlInputEvents(): void {
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    if (!urlInput) return;

    // 阻止事件冒泡到 Electron，让浏览器处理标准快捷键
    urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
        // 允许标准的编辑快捷键
        const allowedKeys = [
            'KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ', 'KeyY', // 复制、粘贴、剪切、全选、撤销、重做
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End', 'Tab'
        ];

        const isStandardShortcut = (e.ctrlKey || e.metaKey) && allowedKeys.includes(e.code);
        const isNavigationKey = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(e.code);
        const isTyping = e.key.length === 1 || e.key === 'Space';

        if (isStandardShortcut || isNavigationKey || isTyping) {
            // 阻止事件冒泡到 Electron 主进程
            e.stopPropagation();
        }

        // Enter 键处理导航
        if (e.key === 'Enter') {
            e.stopPropagation();
            e.preventDefault();
            navigateToUrl();
        }

        // Escape 键取消焦点
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            urlInput.blur();
        }

        // Tab 键处理
        if (e.key === 'Tab') {
            e.stopPropagation();
            // 让浏览器处理 Tab 键的默认行为
        }
    });

    // 阻止某些事件冒泡
    urlInput.addEventListener('keypress', (e) => {
        e.stopPropagation();
    });

    urlInput.addEventListener('keyup', (e) => {
        const isStandardShortcut = (e.ctrlKey || e.metaKey) && ['KeyC', 'KeyV', 'KeyX', 'KeyA'].includes(e.code);
        if (isStandardShortcut) {
            e.stopPropagation();
        }
    });

    // 右键菜单支持 - 阻止冒泡让浏览器处理
    urlInput.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        // 允许浏览器默认的右键菜单（包含复制粘贴选项）
    });

    // 鼠标事件处理
    urlInput.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    urlInput.addEventListener('mouseup', (e) => {
        e.stopPropagation();
    });

    urlInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ❌ 移除这些 JavaScript 焦点样式设置
    // 焦点事件处理 - 不再设置内联样式
    urlInput.addEventListener('focus', () => {
        console.log('🔍 URL input focused');
        // ❌ 移除：添加焦点样式
        // urlInput.style.outline = '2px solid #1a73e8';
        // urlInput.style.outlineOffset = '-2px';

        // ✅ 让 CSS 处理焦点样式
    });

    urlInput.addEventListener('blur', () => {
        console.log('🔍 URL input blurred');
        // ❌ 移除：移除焦点样式
        // urlInput.style.outline = '';
        // urlInput.style.outlineOffset = '';

        // ✅ 让 CSS 处理焦点样式
    });

    // 输入事件处理
    urlInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        console.log('🔍 URL input changed:', target.value);
        e.stopPropagation();

        // 更新 Go 按钮显示状态
        updateGoButtonVisibility();
    });

    // 选择事件处理
    urlInput.addEventListener('select', (e) => {
        console.log('🔍 URL text selected');
        e.stopPropagation();
    });

    // 粘贴事件特殊处理
    urlInput.addEventListener('paste', (e) => {
        e.stopPropagation();
        console.log('📋 Paste event in URL input');

        // 延迟更新 Go 按钮状态
        setTimeout(() => updateGoButtonVisibility(), 10);
    });

    // 复制事件特殊处理
    urlInput.addEventListener('copy', (e) => {
        e.stopPropagation();
        console.log('📋 Copy event in URL input');
    });

    console.log('✅ URL input events setup complete');
}

/**
 * 更新 Go 按钮的显示状态
 */
function updateGoButtonVisibility(): void {
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    const goBtn = document.getElementById('go-btn');

    if (!urlInput || !goBtn) return;

    // CSS 会自动处理显示隐藏，这里只是为了调试
    const hasContent = urlInput.value.trim().length > 0;
    console.log(`🔍 Go button should be ${hasContent ? 'visible' : 'hidden'}`);
}
(window as any).setupUrlInputEvents = setupUrlInputEvents;
/**
 * 设置事件监听器
 */
function setupEventListeners(): void {
    try {
        // 顶部按钮
        addEventListenerSafely('new-tab-btn', 'click', () => createNewTab());
        addEventListenerSafely('back-btn', 'click', () => navigateBack());
        addEventListenerSafely('forward-btn', 'click', () => navigateForward());
        addEventListenerSafely('refresh-btn', 'click', () => refreshCurrentTab());

        // 设置 URL 输入框事件 - 必须在其他事件之前设置
        setupUrlInputEvents();

        // Go 按钮
        addEventListenerSafely('go-btn', 'click', () => navigateToUrl());

        // 工具栏按钮
        addEventListenerSafely('cookie-btn', 'click', () => showCookieDialog());

        // 模态框相关
        setupModalEvents();

        // 右键菜单
        setupContextMenu();

        // 快捷键 - 在 URL 输入框事件之后设置
        setupKeyboardShortcuts();

        console.log('✅ 事件监听器设置完成');

    } catch (error) {
        console.error('事件监听器设置失败:', error);
        throw error;
    }
}

async function navigateBack(): Promise<void> {
    if (!activeTabId) return;

    try {
        const response = await fetch('http://localhost:3409/api/account/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                script: 'window.history.back(); true;'
            })
        });

        if (response.ok) {
            console.log('✅ 后退导航执行');
        }
    } catch (error) {
        console.error('后退导航失败:', error);
    }
}

async function navigateForward(): Promise<void> {
    if (!activeTabId) return;

    try {
        const response = await fetch('http://localhost:3409/api/account/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                script: 'window.history.forward(); true;'
            })
        });

        if (response.ok) {
            console.log('✅ 前进导航执行');
        }
    } catch (error) {
        console.error('前进导航失败:', error);
    }
}

async function navigateToUrl(): Promise<void> {
    const urlInput = document.getElementById('url-input') as HTMLInputElement;
    if (!urlInput) return;

    let url = urlInput.value.trim();
    if (!url) return;

    // 如果没有活动标签页，先创建一个
    if (!activeTabId) {
        await createNewTab();
        // 等待标签页创建完成
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!activeTabId) {
        showNotification('无法创建标签页', 'error');
        return;
    }

    // URL处理逻辑
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }

    try {
        showLoading('正在导航...');

        const response = await fetch('http://localhost:3409/api/account/navigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                url: url
            })
        });

        if (response.ok) {
            console.log('✅ 导航到:', url);
            // 更新 URL 输入框为实际的 URL
            urlInput.value = url;
            showNotification(`正在加载: ${url}`, 'info');

            // 模拟 Chrome 的行为：导航后选中整个 URL
            setTimeout(() => {
                urlInput.select();
            }, 100);
        } else {
            throw new Error('导航请求失败');
        }
    } catch (error) {
        console.error('导航失败:', error);
        showNotification('导航失败', 'error');
    } finally {
        hideLoading();
    }
}
(window as any).navigateToUrl = navigateToUrl;
async function showCookieDialog(): Promise<void> {
    try {
        // 先隐藏当前标签页，避免被遮挡
        await fetch('http://localhost:3409/api/ui/hide-tab-temporarily', { method: 'POST' });

        // 显示模态框
        const modal = document.getElementById('cookie-modal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('🍪 Cookie dialog shown');
        }
    } catch (error) {
        console.error('Failed to show cookie dialog:', error);
        showNotification('显示Cookie管理对话框失败', 'error');
    }
}

async function hideCookieDialog(): Promise<void> {
    try {
        // 隐藏模态框
        const modal = document.getElementById('cookie-modal');
        if (modal) {
            modal.style.display = 'none';
        }

        // 恢复标签页显示
        await fetch('http://localhost:3409/api/ui/show-current-tab', { method: 'POST' });

        console.log('🍪 Cookie dialog hidden');
    } catch (error) {
        console.error('Failed to hide cookie dialog:', error);
    }
}
/**
 * 加载Cookie文件
 */
async function loadCookieFile(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        // 使用Electron的文件对话框
        const result = await window.electronAPI.showOpenDialog({
            title: '选择Cookie文件',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }

        const cookieFile = result.filePaths[0];

        showLoading('正在加载Cookie...');

        // 🔥 使用现有的API端点
        const response = await fetch('http://localhost:3409/api/account/load-cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                cookieFile: cookieFile  // 注意参数名是 cookieFile，不是 cookieFilePath
            })
        });

        const result2 = await response.json();

        if (result2.success) {
            showNotification(`Cookie加载成功: ${cookieFile.split('/').pop()}`, 'success');

            // 刷新当前标签页
            setTimeout(() => {
                refreshCurrentTab();
            }, 1000);
        } else {
            throw new Error(result2.error || '加载失败');
        }

    } catch (error) {
        console.error('加载Cookie失败:', error);
        showNotification(`加载Cookie失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 保存Cookie文件
 */
async function saveCookieFile(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        const currentTab = currentTabs.find(tab => tab.id === activeTabId);
        const defaultName = currentTab
            ? `${currentTab.accountName}-cookies-${new Date().toISOString().slice(0, 10)}.json`
            : `cookies-${new Date().toISOString().slice(0, 10)}.json`;

        // 使用Electron的保存对话框
        const result = await window.electronAPI.showSaveDialog({
            title: '保存Cookie文件',
            defaultPath: defaultName,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return;
        }

        const cookieFile = result.filePath;

        showLoading('正在保存Cookie...');

        // 🔥 使用现有的API端点
        const response = await fetch('http://localhost:3409/api/account/save-cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tabId: activeTabId,
                cookieFile: cookieFile  // 注意参数名是 cookieFile，不是 cookieFilePath
            })
        });

        const result2 = await response.json();

        if (result2.success) {
            showNotification(`Cookie保存成功: ${cookieFile.split('/').pop()}`, 'success');
        } else {
            throw new Error(result2.error || '保存失败');
        }

    } catch (error) {
        console.error('保存Cookie失败:', error);
        showNotification(`保存Cookie失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}


function updateTabBar(): void {
    const tabBarContent = document.getElementById('tab-bar-content');
    const tabCount = document.getElementById('tab-count');

    if (!tabBarContent) {
        console.warn('⚠️ 标签页容器不存在');
        return;
    }

    // 清空现有标签页
    tabBarContent.innerHTML = '';

    // 更新标签页计数
    if (tabCount) {
        tabCount.textContent = currentTabs.length.toString();
    }

    // 创建标签页元素
    currentTabs.forEach(tab => {
        const tabElement = createChromeTab(tab);
        tabBarContent.appendChild(tabElement);
    });

    console.log(`📑 更新了 ${currentTabs.length} 个标签页`);
}


// 全局函数
(window as any).hideCookieDialog = hideCookieDialog;
(window as any).createChromeTab = createChromeTab;
(window as any).updateTabBar = updateTabBar;
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
 * 创建新标签页 - 简化版本，直接创建空白标签页
 */
async function createNewTab(): Promise<void> {
    try {
        showLoading('正在创建标签页...');

        // 🔥 修复1：先实时检查API状态，不依赖全局变量
        console.log('🔍 创建标签页前检查API状态...');
        await checkAPIStatus();

        console.log('🔍 当前 apiConnected 状态:', apiConnected);

        // 🔥 修复2：如果API检查失败，尝试直接测试连接
        if (!apiConnected) {
            console.log('⚠️ API状态显示未连接，尝试直接测试...');

            try {
                const testResponse = await fetch('http://localhost:3409/health');
                const testResult = await testResponse.json();

                if (testResult.success) {
                    console.log('✅ 直接测试成功，更新状态');
                    apiConnected = true;
                } else {
                    throw new Error('API测试失败');
                }
            } catch (testError) {
                console.error('❌ 直接API测试失败:', testError);
                throw new Error('API服务未连接，请检查服务状态');
            }
        }

        // 生成简单的标签页名称
        const tabNumber = currentTabs.length + 1;
        const accountName = `标签页 ${tabNumber}`;

        console.log('🔍 调用 electronAPI.createAccountTab:', {
            accountName,
            platform: 'other',
            url: 'about:blank'
        });

        // 🔥 修复3：创建标签页 - 使用默认值
        const result = await window.electronAPI.createAccountTab(
            accountName,
            'other',  // 默认平台类型
            'about:blank'  // 空白页面
        );

        console.log('🔍 electronAPI.createAccountTab 结果:', result);

        if (result.success) {
            const tabId = result.tabId;
            activeTabId = tabId;

            // 刷新标签页列表
            await refreshTabList();

            // 聚焦到URL输入框
            setTimeout(() => {
                const urlInput = document.getElementById('url-input') as HTMLInputElement;
                if (urlInput) {
                    urlInput.focus();
                    urlInput.select();
                }
            }, 800);

            showNotification(`已创建新标签页: ${accountName}`, 'success');
            console.log('✅ 标签页创建成功:', tabId);
        } else {
            throw new Error(result.error || '创建失败');
        }
    } catch (error) {
        console.error('❌ 创建标签页失败:', error);
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
            updateTabBar();
            console.log('✅ Switched to tab:', tabId);
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
 * 更新当前标签页信息显示
 */
function updateCurrentTabInfo(): void {
    const currentTab = currentTabs.find(tab => tab.id === activeTabId);
    const urlInput = document.getElementById('url-input') as HTMLInputElement;

    // 只有在URL真正变化时才更新输入框，避免清空用户正在输入的内容
    if (urlInput && currentTab) {
        // 检查输入框是否有焦点，如果有焦点说明用户正在输入，不要覆盖
        if (document.activeElement !== urlInput) {
            const newUrl = currentTab.url || '';
            if (urlInput.value !== newUrl) {
                urlInput.value = newUrl;
            }
        }
    } else if (urlInput && !currentTab) {
        // 只有在没有标签页时才清空
        if (document.activeElement !== urlInput) {
            urlInput.value = '';
        }
    }

    // 更新导航按钮状态
    updateNavigationButtons();
}
function updateNavigationButtons(): void {
    const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
    const forwardBtn = document.getElementById('forward-btn') as HTMLButtonElement;

    // 这里可以根据实际需要启用/禁用按钮
    // 暂时保持按钮可用状态
    if (backBtn) backBtn.disabled = !activeTabId;
    if (forwardBtn) forwardBtn.disabled = !activeTabId;
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
 * 加载Cookie - 使用 Electron 对话框
 */
async function loadCookies(): Promise<void> {
    if (!activeTabId) {
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        // 使用 Electron 的原生文件对话框
        const result = await window.electronAPI.showOpenDialog({
            title: '选择 Cookie 文件',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }

        const cookieFilePath = result.filePaths[0];

        try {
            showLoading('正在加载Cookie...');

            const loadResult = await window.electronAPI.loadCookies(activeTabId!, cookieFilePath);

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

    } catch (error) {
        console.error('打开文件对话框失败:', error);
        showNotification(`打开文件对话框失败: ${handleError(error)}`, 'error');
    }
}

/**
 * 保存Cookie - 使用 Electron 对话框
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

        // 使用 Electron 的原生保存对话框
        const result = await window.electronAPI.showSaveDialog({
            title: '保存 Cookie 文件',
            defaultPath: defaultName,
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return;
        }

        const cookieFilePath = result.filePath;

        try {
            showLoading('正在保存Cookie...');

            const saveResult = await window.electronAPI.saveCookies(activeTabId!, cookieFilePath);

            if (saveResult.success) {
                showNotification(`Cookie已保存到: ${cookieFilePath}`, 'success');
            } else {
                throw new Error(saveResult.error || '保存失败');
            }

        } catch (error) {
            console.error('保存Cookie失败:', error);
            showNotification(`保存Cookie失败: ${handleError(error)}`, 'error');
        } finally {
            hideLoading();
        }

    } catch (error) {
        console.error('打开保存对话框失败:', error);
        showNotification(`打开保存对话框失败: ${handleError(error)}`, 'error');
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

        const response = await fetch('http://localhost:3409/api/account/execute', {
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

/**
 * 批量加载 Cookie - 为多个标签页加载相同的 Cookie 文件
 */
async function batchLoadCookies(): Promise<void> {
    if (currentTabs.length === 0) {
        showNotification('没有可操作的标签页', 'warning');
        return;
    }

    try {
        // 选择 Cookie 文件
        const result = await window.electronAPI.showOpenDialog({
            title: '选择要批量加载的 Cookie 文件',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }

        const cookieFilePath = result.filePaths[0];

        // 选择要操作的标签页
        const selectedTabs = currentTabs.filter(tab =>
            confirm(`是否为标签页 "${tab.accountName}" 加载 Cookie？`)
        );

        if (selectedTabs.length === 0) {
            showNotification('没有选择任何标签页', 'info');
            return;
        }

        showLoading(`正在为 ${selectedTabs.length} 个标签页加载Cookie...`);

        let successCount = 0;
        let errorCount = 0;

        for (const tab of selectedTabs) {
            try {
                const loadResult = await window.electronAPI.loadCookies(tab.id, cookieFilePath);
                if (loadResult.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to load cookies for ${tab.accountName}:`, loadResult.error);
                }
            } catch (error) {
                errorCount++;
                console.error(`Error loading cookies for ${tab.accountName}:`, error);
            }
        }

        showNotification(
            `批量加载完成: ${successCount} 成功, ${errorCount} 失败`,
            errorCount === 0 ? 'success' : 'warning'
        );

        // 刷新所有成功加载的标签页
        if (successCount > 0) {
            await refreshCurrentTab();
        }

    } catch (error) {
        console.error('批量加载Cookie失败:', error);
        showNotification(`批量加载Cookie失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 导出 Cookie 管理功能到全局
 */
(window as any).loadCookies = loadCookies;
(window as any).saveCookies = saveCookies;
(window as any).clearCookies = clearCookies;
(window as any).batchLoadCookies = batchLoadCookies;

// 为模态框中的按钮提供全局访问
(window as any).handleCookieAction = async (action: string) => {
    switch (action) {
        case 'load':
            await loadCookies();
            break;
        case 'save':
            await saveCookies();
            break;
        case 'clear':
            await clearCookies();
            break;
        case 'batch-load':
            await batchLoadCookies();
            break;
        default:
            console.warn('Unknown cookie action:', action);
    }

    // 关闭模态框
    hideCookieDialog();
};
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
        const response = await fetch('http://localhost:3409/api/account/refresh', {
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

        const response = await fetch('http://localhost:3409/api/account/screenshot', {
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

        const response = await fetch('http://localhost:3409/api/accounts/batch', {
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
        const response = await fetch('http://localhost:3409/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('🔍 API响应状态:', response.status, response.statusText);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('🔍 API响应数据:', result);
        if (result.success) {
            apiConnected = true;
            console.log('✅ API连接成功，设置 apiConnected = true');
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
                const infoResponse = await fetch('http://localhost:3409/api/info');
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
            console.log('❌ API响应失败，设置 apiConnected = false');
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
        <div class="menu-item" onclick="openTabDevTools('${tabId}')">
            <span class="icon">🛠️</span>
            开发者工具
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
        const response = await fetch('http://localhost:3409/api/account/refresh', {
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
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        // 检查当前焦点元素 - 修复类型错误
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            (activeElement as HTMLElement).contentEditable === 'true' // ✅ 类型断言修复
        );

        // 如果输入框有焦点，只处理特定的全局快捷键
        if (isInputFocused) {
            // 只允许这些全局快捷键在输入框焦点时工作
            const allowedGlobalShortcuts = ['t', 'w', 'F5'];
            const key = e.key.toLowerCase();

            if (!allowedGlobalShortcuts.includes(key) && !allowedGlobalShortcuts.includes(e.key)) {
                return; // 让输入框处理其他快捷键
            }
        }

        // Ctrl/Cmd + T: 新建标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
            e.preventDefault();
            e.stopPropagation();
            createNewTab();
        }

        // Ctrl/Cmd + L: 聚焦到地址栏
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            e.stopPropagation();
            const urlInput = document.getElementById('url-input') as HTMLInputElement;
            if (urlInput) {
                urlInput.focus();
                urlInput.select();
            }
        }

        // Ctrl/Cmd + W: 关闭当前标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            e.preventDefault();
            e.stopPropagation();
            if (activeTabId) {
                closeTab(activeTabId);
            }
        }

        // Ctrl/Cmd + R: 刷新当前标签页
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            e.stopPropagation();
            refreshCurrentTab();
        }

        // F5: 刷新当前标签页
        if (e.key === 'F5') {
            e.preventDefault();
            e.stopPropagation();
            refreshCurrentTab();
        }

        // Ctrl/Cmd + 数字键: 切换到对应标签页
        if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(e.key) - 1;
            if (currentTabs[index]) {
                switchTab(currentTabs[index].id);
            }
        }
        if (e.key === 'F12') {
            console.log('🔧 F12 pressed, activeTabId:', activeTabId);
            e.preventDefault();
            e.stopPropagation();
            openCurrentTabDevTools();
        }
        // Ctrl/Cmd + Shift + I: 测试隔离
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            e.stopPropagation();
            testIsolation();
        }
    });

    console.log('✅ 键盘快捷键设置完成');
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

/**
 * 打开当前标签页的开发者工具
 */
async function openCurrentTabDevTools(): Promise<void> {
    console.log('🔧 openCurrentTabDevTools called, activeTabId:', activeTabId);

    if (!activeTabId) {
        console.log('❌ No active tab');
        showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        console.log('🔧 Sending request to open devtools for tab:', activeTabId);

        showLoading('正在打开开发者工具...');

        const response = await fetch('http://localhost:3409/api/account/open-devtools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId: activeTabId })
        });

        console.log('🔧 Response status:', response.status);

        const result = await response.json();
        console.log('🔧 Response result:', result);

        if (result.success) {
            showNotification('开发者工具已在独立窗口中打开', 'success');
        } else {
            throw new Error(result.error || '打开失败');
        }
    } catch (error) {
        console.error('❌ 打开开发者工具失败:', error);
        showNotification(`打开开发者工具失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 为指定标签页打开开发者工具（用于右键菜单）
 */
async function openTabDevTools(tabId: string): Promise<void> {
    try {
        showLoading('正在打开开发者工具...');

        const response = await fetch('http://localhost:3409/api/account/open-devtools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId })
        });

        const result = await response.json();
        if (result.success) {
            showNotification('开发者工具已在独立窗口中打开', 'success');
        } else {
            throw new Error(result.error || '打开失败');
        }
    } catch (error) {
        console.error('打开开发者工具失败:', error);
        showNotification('打开开发者工具失败', 'error');
    } finally {
        hideLoading();
    }

    hideContextMenu();
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

(window as any).openTabDevTools = async (tabId: string) => {
    try {
        const response = await fetch('http://localhost:3409/api/account/open-devtools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId })
        });

        const result = await response.json();
        if (result.success) {
            showNotification('开发者工具已打开', 'info');
        }
    } catch (error) {
        console.error('打开开发者工具失败:', error);
        showNotification('打开开发者工具失败', 'error');
    }
    hideContextMenu();
};
// ========================================
// 页面生命周期
// ========================================

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    try {
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
(window as any).debugAPI = {
    checkAPIStatus: async () => {
        console.log('🔧 手动检查API状态...');
        await checkAPIStatus();
        console.log('🔧 当前 apiConnected:', apiConnected);
        return apiConnected;
    },

    testAPIConnection: async () => {
        console.log('🔧 直接测试API连接...');
        try {
            const response = await fetch('http://localhost:3409/health');
            const result = await response.json();
            console.log('🔧 API测试结果:', result);
            return result;
        } catch (error) {
            console.error('🔧 API测试失败:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    forceCreateTab: async () => {
        console.log('🔧 强制创建标签页（忽略API状态）...');
        try {
            const result = await window.electronAPI.createAccountTab(
                `强制标签页 ${Date.now()}`,
                'other',
                'about:blank'
            );
            console.log('🔧 强制创建结果:', result);
            return result;
        } catch (error) {
            console.error('🔧 强制创建失败:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
};

/**
 * 导出应用状态（调试用）
 */
(window as any).getAppState = getAppState;
(window as any).getCurrentTabs = () => currentTabs;
(window as any).getActiveTabId = () => activeTabId;
// 添加调试函数
(window as any).debugBrowserView = async () => {
    if (!activeTabId) {
        console.log('No active tab');
        return;
    }

    const response = await fetch('http://localhost:3409/api/account/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tabId: activeTabId,
            script: `
                console.log('BrowserView info:', {
                    url: window.location.href,
                    title: document.title,
                    visible: document.visibilityState,
                    dimensions: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                });
                'Debug info logged';
            `
        })
    });

    const result = await response.json();
    console.log('Debug result:', result);
};
console.log('🎨 渲染进程脚本加载完成');

// 暴露调试接口
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
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
(window as any).openCurrentTabDevTools = openCurrentTabDevTools;
(window as any).openTabDevTools = openTabDevTools;