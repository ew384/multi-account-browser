
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
    isHeadless?: boolean;
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
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // 点击 URL 栏区域
    if (target.closest('#url-input') || target.closest('.toolbar')) {
        // 焦点应该在渲染进程
        console.log('🎯 用户点击了工具栏区域');
    } 
    // 点击标签页内容区域
    else if (target.closest('#tab-content') || !target.closest('.header')) {
        // 焦点应该在 WebContentsView
        console.log('🎯 用户点击了内容区域');
        // 可以通过 IPC 通知主进程
    }
});
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎨 渲染进程启动');

    try {
        await initializeApplication();
    } catch (error) {
        console.error('应用初始化失败:', error);
        //showNotification('应用初始化失败，请刷新页面重试', 'error');
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
        //console.log(`📝 收到标题更新: ${title} (${tabId})`);
        updateTabTitle(tabId, title);
    });

    // 监听图标更新
    window.electronAPI.onTabFaviconUpdated(({ tabId, favicon }) => {
        //console.log(`🎭 收到图标更新: ${favicon} (${tabId})`);
        updateTabFavicon(tabId, favicon);
    });
    window.electronAPI.onTabUrlUpdated(({ tabId, url }) => {
        //console.log(`🔗 收到URL更新: ${url} (${tabId})`);
        
        // 只更新当前活动标签页的URL输入框
        if (tabId === activeTabId) {
            const urlInput = document.getElementById('url-input') as HTMLInputElement;
            if (urlInput) {
                //console.log(`🔗 更新URL输入框: ${url}`);
                urlInput.value = url;
            }
        }
        
        // 更新内存中的标签页数据
        const tab = currentTabs.find(t => t.id === tabId);
        if (tab) {
            tab.url = url;
            tab.displayFavicon = undefined;
            
            // 立即更新DOM为加载状态
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                const iconElement = tabElement.querySelector('.chrome-tab-icon');
                if (iconElement) {
                    iconElement.innerHTML = '<div class="tab-loading-spinner"></div>';
                }
            }
        }
    });
}
let titleUpdateTimeout: NodeJS.Timeout | null = null;
let faviconUpdateTimeout: NodeJS.Timeout | null = null;
/**
 * 更新标签页标题
 */
function updateTabTitle(tabId: string, title: string): void {
    if (titleUpdateTimeout) {
        clearTimeout(titleUpdateTimeout);
    }
    titleUpdateTimeout = setTimeout(() => {
        // 原有的更新逻辑保持不变
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
        titleUpdateTimeout = null;
    }, 100); // 100ms防抖
    // 如果是当前活动标签页，更新窗口标题
    //if (tabId === activeTabId) {
    //    document.title = title + ' - Multi-Account Browser';
    //}
}

/**
 * 更新标签页图标
 */
function updateTabFavicon(tabId: string, favicon: string): void {
    if (faviconUpdateTimeout) {
        clearTimeout(faviconUpdateTimeout);
    }
    // 更新内存中的数据
    faviconUpdateTimeout = setTimeout(() => {
        const tab = currentTabs.find(t => t.id === tabId);
        if (tab) {
            tab.displayFavicon = favicon;
        }

        // 更新DOM中的标签页图标
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            const iconElement = tabElement.querySelector('.chrome-tab-icon');
            if (iconElement) {
                iconElement.innerHTML = `<img src="${favicon}" alt="icon" style="width: 16px; height: 16px; border-radius: 2px;" 
                        onerror="this.src='../../assets/tray-icon.png'; this.alt='browser';">`;
            }
        }
        titleUpdateTimeout = null;
    }, 100);
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
    
    // 🔥 修改图标逻辑：根据URL类型决定图标
    let iconContent = '';
    if (tab.displayFavicon) {
        // 有 favicon 时使用网站图标
        iconContent = `<img src="${tab.displayFavicon}" alt="icon" style="width: 16px; height: 16px; border-radius: 2px;" 
            onerror="this.src='../../assets/tray-icon.png'; this.alt='browser';">`;
    } else if (tab.url === 'about:blank' || !tab.url) {
        // 🔥 空白页面使用浏览器图标，不显示加载动画
        iconContent = '<img src="../../assets/tray-icon.png" style="width: 16px; height: 16px;" alt="browser">';
    } else {
        // 🔥 其他情况显示加载动画，但设置超时回退
        iconContent = '<div class="tab-loading-spinner" data-timeout="10000"></div>';
    }

    tabElement.innerHTML = `
        <div class="chrome-tab-icon">${iconContent}</div>
        <div class="chrome-tab-title" title="${displayTitle}">${displayTitle}</div>
        <button class="chrome-tab-close" title="关闭标签页"></button>
    `;

    // 🔥 为加载动画设置超时回退机制
    const spinner = tabElement.querySelector('.tab-loading-spinner[data-timeout]');
    if (spinner) {
        const timeout = parseInt(spinner.getAttribute('data-timeout') || '5000');
        setTimeout(() => {
            // 如果超时后还是加载动画，切换为浏览器图标
            if (spinner.parentElement && spinner.parentElement.contains(spinner)) {
                spinner.parentElement.innerHTML = '<img src="../../assets/tray-icon.png" style="width: 16px; height: 16px;" alt="browser">';
            }
        }, timeout);
    }

    // 其余事件监听器代码保持不变...
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
function setupNavigationButtons(): void {
    const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
    const forwardBtn = document.getElementById('forward-btn') as HTMLButtonElement;
    
    if (backBtn && forwardBtn) {
        backBtn.disabled = false;
        forwardBtn.disabled = false;
        
        // 确保光标始终为指针
        backBtn.style.cursor = 'pointer';
        forwardBtn.style.cursor = 'pointer';
        //console.log('🧭 导航按钮设置为始终启用（Chrome风格）');
    }
}

function updateConnectionStatus(): void {
    const connectionStatus = document.getElementById('connection-status');
    
    if (connectionStatus) {
        if (apiConnected) {
            connectionStatus.innerHTML = `
                <span class="status-dot online"></span>
                <span class="status-text">API服务正常</span>
            `;
        } else {
            connectionStatus.innerHTML = `
                <span class="status-dot offline"></span>
                <span class="status-text">API服务离线</span>
            `;
        }
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
        //console.log('🎯 开始设置事件监听器...');
        setupEventListeners();
        setupTabTitleListeners();
        setupMenuListeners();
        setupEventDrivenUpdates();
        setupErrorHandling();
        //setupContextMenu();
        //console.log(`🏠 初始化完成，立即更新欢迎页面状态`);
        updateNoTabsMessage();
        apiConnected = true;
        updateConnectionStatus();
        appInitialized = true;
        hideLoading();

        console.log('✅ 应用初始化完成');
        //showNotification('应用初始化完成', 'success');

    } catch (error) {
        hideLoading();
        console.error('应用初始化失败:', error);
        //showNotification(`应用初始化失败: ${handleError(error)}`, 'error');
        throw error;
    }
}
/**
 * 初始化组件
 */
async function initializeComponents(): Promise<void> {
    try {

        // 确保必要的DOM元素存在
        ensureRequiredElements();
        //console.log('✅ 组件初始化完成');
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
    if (!urlInput) {
        console.error('❌ URL input not found');
        return;
    }

    // 🔥 彻底清理：克隆节点移除所有事件监听器
    const newInput = urlInput.cloneNode(true) as HTMLInputElement;
    urlInput.parentNode?.replaceChild(newInput, urlInput);

    // 重新获取清理后的元素
    const cleanInput = document.getElementById('url-input') as HTMLInputElement;
    if (!cleanInput) return;

    // 🔥 只处理必要的按键，保持简洁
    cleanInput.addEventListener('keydown', (e: KeyboardEvent) => {
        // 只处理 Enter 键，其他按键完全不干扰
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateToUrl();
            return;
        }
        
        // 🔥 对于所有其他按键（包括方向键、复制粘贴等），完全不做处理
        // 让浏览器原生处理，确保功能正常
    });

    // 监听输入变化（用于 Go 按钮显示）
    cleanInput.addEventListener('input', () => {
        updateGoButtonVisibility();
    });

    // 焦点事件（用于调试）
    cleanInput.addEventListener('focus', () => {
        //console.log('🔍 URL input focused');
    });

    cleanInput.addEventListener('blur', () => {
        //console.log('🔍 URL input blurred');
    });

    console.log('✅ URL input events setup complete - 最简化版本');
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
    //console.log(`🔍 Go button should be ${hasContent ? 'visible' : 'hidden'}`);
}
(window as any).setupUrlInputEvents = setupUrlInputEvents;
/**
 * 设置事件监听器
 */
function setupEventListeners(): void {
    try {
        // 设置 URL 输入框事件 - 必须在其他事件之前设置
        setupUrlInputEvents();
        addEventListenerSafely('new-tab-btn', 'click', () => createNewTab());
        addEventListenerSafely('back-btn', 'click', () => navigateBack());
        addEventListenerSafely('forward-btn', 'click', () => navigateForward());
        addEventListenerSafely('refresh-btn', 'click', () => refreshTab());
        addEventListenerSafely('go-btn', 'click', () => navigateToUrl());
        //addEventListenerSafely('cookie-btn', 'click', () => showCookieDialog());

        // 模态框相关
        setupModalEvents();

        // 右键菜单
        //setupContextMenu();

        // 快捷键 - 在 URL 输入框事件之后设置
        setupKeyboardShortcuts();

        //console.log('✅ 事件监听器设置完成');

    } catch (error) {
        console.error('事件监听器设置失败:', error);
        throw error;
    }
}

async function navigateBack(): Promise<void> {
    //console.log(`⬅️ navigateBack 被调用`);
    //console.log(`⬅️ 当前活动标签页ID: ${activeTabId}`);
    
    if (!activeTabId) {
        console.warn('⚠️ 没有活动标签页，无法后退');
        return;
    }

    try {
        //console.log('⬅️ 开始执行后退导航...');
        //console.log('⬅️ 即将调用 IPC: window.electronAPI.navigateBack');
        
        const result = await window.electronAPI.navigateBack(activeTabId);
        
        //console.log('⬅️ IPC 调用结果:', result);

        if (result.success) {
            console.log('✅ 后退导航成功');
        } else {
            console.warn('⚠️ 后退导航失败:', result.error);
        }
    } catch (error) {
        console.error('❌ 后退导航异常:', error);
    }
}

async function navigateForward(): Promise<void> {
    //console.log(`➡️ navigateForward 被调用`);
    //console.log(`➡️ 当前活动标签页ID: ${activeTabId}`);
    
    if (!activeTabId) {
        console.warn('⚠️ 没有活动标签页，无法前进');
        return;
    }

    try {
        //console.log('➡️ 开始执行前进导航...');
        //console.log('➡️ 即将调用 IPC: window.electronAPI.navigateForward');
        
        const result = await window.electronAPI.navigateForward(activeTabId);
        
        //console.log('➡️ IPC 调用结果:', result);

        if (result.success) {
            console.log('✅ 前进导航成功');
        } else {
            console.warn('⚠️ 前进导航失败:', result.error);
        }
    } catch (error) {
        console.error('❌ 前进导航异常:', error);
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
        console.log('无法创建标签页');
        return;
    }

    // URL处理逻辑
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            // 检查是否已经包含www，如果不包含则添加
            if (!url.startsWith('www.')) {
                url = 'https://www.' + url;
            } else {
                url = 'https://' + url;
            }
        }
        else if (url.includes('localhost') && !url.includes(' ')) {
            url = 'http://' + url;
        }
        else {
            url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(url);
        }
    }

    try {
        const result = await window.electronAPI.navigateTab(activeTabId, url);
        if (result.success) {
            urlInput.value = url;
            // 模拟 Chrome 的行为：导航后选中整个 URL
            setTimeout(() => {
                urlInput.select();
            }, 100);
        } else {
            throw new Error('导航请求失败');
        }
    } catch (error) {
        console.error('导航失败:', error);
    } finally {
        hideLoading();
    }
}
(window as any).navigateToUrl = navigateToUrl;

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

    //console.log(`📑 更新了 ${currentTabs.length} 个标签页`);
}


// 全局函数
//(window as any).hideCookieDialog = hideCookieDialog;
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
 * 设置错误处理
 */
function setupErrorHandling(): void {
    // 全局错误处理
    window.addEventListener('error', (event) => {
        console.error('渲染进程错误:', event.error);
        //showNotification('应用发生错误，请查看控制台获取详细信息', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('未处理的Promise拒绝:', event.reason);
        //showNotification('操作失败，请重试', 'error');
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
// 添加这4个函数（直接复制paste.txt中的）：

/**
 * 设置事件驱动更新机制
 */
function setupEventDrivenUpdates(): void {
    // 1. 监听主进程的标签页变化事件
    if (window.electronAPI) {
        window.electronAPI.onTabCreated?.(({ tabId, tab }) => {
            addTabToUI(tab);
            if (!activeTabId && !(tab as any).isHeadless) {
                //console.log('📋 设置为活动标签页:', tabId);
                activeTabId = tabId;
                updateCurrentTabInfo();
                updateNoTabsMessage();
            }
        });
        window.electronAPI.onTabMadeHeadless?.(({ tabId, accountName }) => {
            console.log(`🔇 标签页变为headless: ${accountName}`);
            hideTabHeaderOnly(tabId); // 只隐藏头部，保留数据
        });
        // 标签页关闭事件  
        window.electronAPI.onTabClosed?.(({ tabId }) => {
            //console.log('📋 收到标签页关闭事件:', tabId);
            removeTabFromUI(tabId);
        });

        // 标签页切换事件
        window.electronAPI.onTabSwitched?.(({ tabId }) => {
            //console.log('📋 收到标签页切换事件:', tabId);
            updateActiveTabInUI(tabId);
        });
    }

    //console.log('✅ 事件驱动更新机制设置完成');
}

function hideTabHeaderOnly(tabId: string): void {
    // 1. 从UI显示中移除，但保留在 currentTabs 数组中（脚本需要）
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement;
    if (tabElement) {
        tabElement.style.display = 'none'; // 现在不会报错
    }
    
    // 2. 如果是当前活动标签页，切换到其他可见标签页
    if (activeTabId === tabId) {
        const visibleTabs = currentTabs.filter(t => {
            const element = document.querySelector(`[data-tab-id="${t.id}"]`) as HTMLElement;
            return element && element.style.display !== 'none';
        });
        
        if (visibleTabs.length > 0) {
            switchTab(visibleTabs[0].id);
        } else {
            activeTabId = null;
            updateCurrentTabInfo();
        }
    }
    
    // 3. 更新显示状态
    updateNoTabsMessage();
}
/**
 * 添加标签页到UI
 */
function addTabToUI(tab: TabData): void {
    if ((tab as any).isHeadless) {
        console.log(`跳过headless tab: ${tab.accountName}`);
        return;
    }
    const existingIndex = currentTabs.findIndex(t => t.id === tab.id);
    if (existingIndex >= 0) {
        // 更新现有标签页
        currentTabs[existingIndex] = tab;
    } else {
        // 添加新标签页
        currentTabs.push(tab);
    }
    
    // 立即更新UI
    updateTabBar();
    updateCurrentTabInfo();
    updateNoTabsMessage();
}

/**
 * 从UI移除标签页（同步操作）
 */
function removeTabFromUI(tabId: string): void {
    const tabIndex = currentTabs.findIndex(t => t.id === tabId);
    if (tabIndex >= 0) {
        const removedTab = currentTabs.splice(tabIndex, 1)[0];
        
        // 如果关闭的是当前活动标签页
        if (activeTabId === tabId) {
            // 切换到下一个标签页
            if (currentTabs.length > 0) {
                const nextTabId = currentTabs[Math.min(tabIndex, currentTabs.length - 1)].id;
                activeTabId = nextTabId;
            } else {
                activeTabId = null;
            }
        }
        
        // 立即更新UI
        updateTabBar();
        updateCurrentTabInfo();
        updateNoTabsMessage();
        
        //console.log(`✅ 标签页已同步移除: ${removedTab.accountName}`);
    }
}

/**
 * 更新活动标签页（同步操作）
 */
function updateActiveTabInUI(tabId: string): void {
    if (activeTabId !== tabId) {
        activeTabId = tabId;
        updateTabBar();
        updateCurrentTabInfo();
        //console.log(`✅ 活动标签页已切换: ${tabId}`);
    }
}

async function createNewTab(): Promise<void> {
    try {
        // 🚀 第一阶段：立即反馈（0ms）
        const tempTab: TabData = {
            id: 'temp-' + Date.now(),
            accountName: '新标签页',
            platform: 'other',
            loginStatus: 'unknown',
            url: 'about:blank',
            displayTitle: '新标签页'
        };
        
        addTabToUI(tempTab);
        activeTabId = tempTab.id;

        // 🎯 用户立即可以操作
        const urlInput = document.getElementById('url-input') as HTMLInputElement;
        if (urlInput) {
            urlInput.focus();
            urlInput.select();
        }

        // 🔄 第二阶段：异步创建实际标签页
        const result = await window.electronAPI.createTab(
            '标签页',
            'other',
            'about:blank'
        );

        if (result.success) {
            // 🎯 第三阶段：替换临时标签页
            removeTabFromUI(tempTab.id);
            
            // 真实标签页会通过事件自动添加到UI
            // 无需手动调用 addTabToUI 或 refreshTabList
            activeTabId = result.tabId;
            
            //console.log('✅ 新标签页创建完成，无需刷新');
        } else {
            // 创建失败，移除临时标签页
            removeTabFromUI(tempTab.id);
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('创建标签页失败:', error);
        // 确保移除临时标签页
        const tempTabs = currentTabs.filter(t => t.id.startsWith('temp-'));
        tempTabs.forEach(t => removeTabFromUI(t.id));
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
            //console.log('✅ Switched to tab:', tabId);
        } else {
            throw new Error(result.error || '切换失败');
        }
    } catch (error) {
        console.error('切换标签页失败:', error);
        //showNotification(`切换标签页失败: ${handleError(error)}`, 'error');
    }
}

/**
 * 关闭标签页
 */
async function closeTab(tabId: string): Promise<void> {
    const tab = currentTabs.find(t => t.id === tabId);
    if (!tab) {
        //showNotification('标签页不存在', 'warning');
        return;
    }
    try {
        showLoading('正在关闭标签页...');

        const result = await window.electronAPI.closeTab(tabId);
        if (result.success) {
            if (activeTabId === tabId) {
                activeTabId = null;
            }
        } else {
            throw new Error(result.error || '关闭失败');
        }
    } catch (error) {
        console.error('关闭标签页失败:', error);
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
    // 🔥 如果活动标签页是 headless，清空 activeTabId 和地址栏
    if (currentTab && (currentTab as any).isHeadless) {
        activeTabId = null;
        if (urlInput && document.activeElement !== urlInput) {
            urlInput.value = '';
        }
        return;
    }
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

}

/**
 * 更新无标签页消息显示
 */
function updateNoTabsMessage(): void {
    const noTabsMessage = document.getElementById('no-tabs-message');
    if (noTabsMessage) {
        const shouldShow = currentTabs.length === 0;
        //console.log(`🏠 updateNoTabsMessage: 标签页数量=${currentTabs.length}, 是否显示欢迎页=${shouldShow}`);
        //console.log(`🏠 当前欢迎页面元素:`, noTabsMessage);
        //console.log(`🏠 当前欢迎页面样式:`, window.getComputedStyle(noTabsMessage).display);
        
        noTabsMessage.style.display = shouldShow ? 'flex' : 'none';
    }
}

// ========================================
// Cookie管理
// ========================================
async function loadCookies(): Promise<void> {
    if (!activeTabId) {
        console.warn('⚠️ 没有活动标签页，无法加载Cookie');
        // showNotification('请先选择一个标签页', 'warning');
        return;
    }

    try {
        // 🔥 使用 Electron 的原生文件对话框
        const result = await window.electronAPI.showOpenDialog({
            title: '选择 Cookie 文件',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            //console.log('用户取消了文件选择');
            return;
        }

        const cookieFilePath = result.filePaths[0];
        const fileName = cookieFilePath.split('/').pop() || cookieFilePath;

        // 🔥 添加 loading 状态（从 loadCookieFile 学习）
        showLoading('正在加载Cookie...');

        //console.log(`🍪 开始加载Cookie文件: ${fileName}`);

        // 🔥 使用 IPC 调用（保持架构一致性）
        const loadResult = await window.electronAPI.loadCookies(activeTabId, cookieFilePath);

        if (loadResult.success) {
            //console.log(`✅ Cookie加载成功: ${fileName}`);
            // showNotification(`Cookie加载成功: ${fileName}`, 'success');

            // 🔥 延迟刷新，给Cookie生效一些时间
            setTimeout(() => {
                refreshTab(); // 使用合并后的 refreshTab 方法
            }, 1000);
        } else {
            throw new Error(loadResult.error || '加载失败');
        }

    } catch (error) {
        console.error('❌ 加载Cookie失败:', error);
        // showNotification(`Cookie加载失败: ${handleError(error)}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 保存Cookie - 使用 Electron 对话框
 */
async function saveCookies(): Promise<void> {
    if (!activeTabId) {
        //showNotification('请先选择一个标签页', 'warning');
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
                //showNotification(`Cookie已保存到: ${cookieFilePath}`, 'success');
            } else {
                throw new Error(saveResult.error || '保存失败');
            }

        } catch (error) {
            console.error('保存Cookie失败:', error);
            //showNotification(`保存Cookie失败: ${handleError(error)}`, 'error');
        } finally {
            hideLoading();
        }

    } catch (error) {
        console.error('打开保存对话框失败:', error);
        //showNotification(`打开保存对话框失败: ${handleError(error)}`, 'error');
    }
}

/**
 * 导出 Cookie 管理功能到全局
 */
(window as any).loadCookies = loadCookies;
(window as any).saveCookies = saveCookies;

/*
// 为模态框中的按钮提供全局访问
(window as any).handleCookieAction = async (action: string) => {
    switch (action) {
        case 'load':
            await loadCookies();
            break;
        case 'save':
            await saveCookies();
            break;
        default:
            console.warn('Unknown cookie action:', action);
    }

    // 关闭模态框
    hideCookieDialog();
};
*/
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
 * 设置右键菜单 - 简化版本（只处理URL输入框）

function setupContextMenu(): void {
    document.addEventListener('contextmenu', (e) => {
        const urlInput = (e.target as HTMLElement).closest('#url-input');
        const isUrlInput = (e.target as HTMLElement).id === 'url-input';
        
        if (urlInput || isUrlInput) {
            // URL输入框 - 让浏览器显示原生菜单
            console.log('🔍 URL input context menu - using browser default');
            return; // 不阻止默认行为
        } else {
            // 页面其他区域 - 阻止默认菜单，因为我们使用顶部菜单栏
            e.preventDefault();
            console.log('🚫 页面右键已禁用，请使用顶部编辑菜单');
        }
    });

    console.log('✅ 右键菜单设置完成（仅保留URL输入框）');
}
 */
/**
 * 隐藏右键菜单
 */
function hideContextMenu(): void {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}


async function refreshTab(tabId?: string): Promise<void> {
    // 如果没有指定 tabId，使用当前活动标签页
    const targetTabId = tabId || activeTabId;
    
    if (!targetTabId) {
        //console.warn('⚠️ 没有可刷新的标签页');
        return;
    }

    try {
        //console.log(`🔄 执行标签页刷新: ${targetTabId}`);
        
        const result = await window.electronAPI.refreshTab(targetTabId);

        if (result.success) {
            const tab = currentTabs.find(t => t.id === targetTabId);
            //console.log(`✅ 标签页刷新成功: ${tab?.accountName || targetTabId}`);

        } else {
            throw new Error(result.error || '刷新失败');
        }
    } catch (error) {
        console.error('❌ 标签页刷新异常:', error);
    }

    hideContextMenu();
}

// ========================================
// 快捷键
// ========================================
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        const target = e.target as HTMLElement;
        const activeElement = document.activeElement;

        const logKey = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.key}`;
        //console.log(`⚡ KeyDown: ${logKey}, target:`, target?.tagName, 'activeElement:', activeElement?.tagName);

        // 如果是 WebView 触发的事件，应该会看到 activeElement === 'WEBVIEW'
        if (activeElement && activeElement.tagName === 'WEBVIEW') {
            //console.log('🚫 Focus is in webview, skipping global shortcut handling');
            return;
        }
        if (e.key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
            if (activeTabId) {
                openDevTools(activeTabId);
            }
            return;
        }
        // 打印剪贴板类
        if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
            //console.log(`✂️ Clipboard key pressed: ${logKey}`);
            return;
        }

        // 🔒 如果焦点在 input/textarea/contentEditable
        const isInput = target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.contentEditable === 'true';

        if (isInput) {
            // 只允许少量全局快捷键
            const globalKeys = ['t', 'w', 'l'];
            if ((e.ctrlKey || e.metaKey) && globalKeys.includes(e.key.toLowerCase())) {
                // fallthrough
            } else {
                return; // 其它全部放行
            }
        }

        const key = e.key.toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === 't') {
            e.preventDefault();
            e.stopPropagation();
            createNewTab();
        }

        if ((e.ctrlKey || e.metaKey) && key === 'w') {
            e.preventDefault();
            e.stopPropagation();
            if (activeTabId) {
                closeTab(activeTabId);
            }
        }

        if ((e.ctrlKey || e.metaKey) && key === 'l') {
            e.preventDefault();
            e.stopPropagation();
            const urlInput = document.getElementById('url-input') as HTMLInputElement;
            if (urlInput) {
                urlInput.focus();
                urlInput.select();
            }
        }
    });

    //console.log('✅ 全局快捷键设置完成 - 安全兼容 WebView 剪贴板');
}

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

async function openDevTools(tabId?: string): Promise<void> {
    // 如果没有指定 tabId，使用当前活动标签页
    const targetTabId = tabId || activeTabId;
    if (!targetTabId) {
        return;
    }
    try {
        //console.log(`🔧 为标签页 ${targetTabId} 打开开发者工具`);
        const result = await window.electronAPI.openDevTools(targetTabId);
        if (result.success) {
            console.log('✅ 开发者工具已打开');

        } else {
            throw new Error(result.error || '打开失败');
        }
    } catch (error) {
        console.error('❌ 打开开发者工具失败:', error);
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


    //console.log(`📢 通知[${type}]: ${message}`);
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
//(window as any).duplicateTab = duplicateTab;
(window as any).selectCookieFile = selectCookieFile;
(window as any).hideScreenshotModal = hideScreenshotModal;

(window as any).closeCurrentTab = () => {
    if (activeTabId) {
        closeTab(activeTabId);
    }
};

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

        //console.log('🧹 页面资源清理完成');
    } catch (error) {
        console.error('页面清理时发生错误:', error);
    }
});
/*
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
*/
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

//console.log('🎨 渲染进程脚本加载完成');

(window as any).openDevTools = openDevTools;