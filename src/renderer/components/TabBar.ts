/**
 * 标签页栏组件
 * 负责标签页的显示、切换、管理等功能
 */

interface TabData {
    id: string;
    accountName: string;        // 内部标识符
    displayTitle?: string;      // 页面标题
    displayFavicon?: string;    // 页面图标
    platform: string;
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    url?: string;
    cookieFile?: string;
    isHeadless?: boolean;
}

class TabBar {
    private container: HTMLElement;
    private tabBarContent: HTMLElement;
    private tabs: Map<string, TabData> = new Map();
    private activeTabId: string | null = null;
    private onTabSwitch?: (tabId: string) => void;
    private onTabClose?: (tabId: string) => void;
    private onTabCreate?: () => void;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId)!;
        this.tabBarContent = this.container.querySelector('.tab-bar-content')!;
        this.init();
    }

    private init(): void {
        this.setupEventListeners();
        this.render();
    }

    private setupEventListeners(): void {
        // 关闭所有标签页按钮
        const closeAllBtn = document.getElementById('close-all-tabs-btn');
        if (closeAllBtn) {
            closeAllBtn.addEventListener('click', () => {
                this.closeAllTabs();
            });
        }

        // 标签页栏右键菜单
        this.tabBarContent.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e);
        });

        // 标签页拖拽排序
        this.setupDragAndDrop();
    }

    private setupDragAndDrop(): void {
        let draggedTab: HTMLElement | null = null;

        this.tabBarContent.addEventListener('dragstart', (e) => {
            const target = e.target as HTMLElement;
            const tabElement = target.closest('.tab') as HTMLElement;
            if (tabElement) {
                draggedTab = tabElement;
                tabElement.style.opacity = '0.5';
                e.dataTransfer!.effectAllowed = 'move';
            }
        });

        this.tabBarContent.addEventListener('dragend', () => {
            if (draggedTab) {
                draggedTab.style.opacity = '1';
                draggedTab = null;
            }
        });

        this.tabBarContent.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
        });

        this.tabBarContent.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedTab) return;

            const target = e.target as HTMLElement;
            const targetTab = target.closest('.tab') as HTMLElement;

            if (targetTab && targetTab !== draggedTab) {
                const rect = targetTab.getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;

                if (e.clientX < midpoint) {
                    this.tabBarContent.insertBefore(draggedTab, targetTab);
                } else {
                    this.tabBarContent.insertBefore(draggedTab, targetTab.nextSibling);
                }
            }
        });
    }

    private showContextMenu(e: MouseEvent): void {
        const contextMenu = document.getElementById('context-menu');
        if (!contextMenu) return;

        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;

        // 点击外部关闭菜单
        const closeMenu = () => {
            contextMenu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    /**
     * 设置标签页数据
     */
    setTabs(tabs: TabData[]): void {
        this.tabs.clear();
        tabs.forEach(tab => {
            this.tabs.set(tab.id, tab);
        });
        this.render();
    }

    /**
     * 添加标签页
     */
    addTab(tab: TabData): void {
        this.tabs.set(tab.id, tab);
        this.render();
    }

    /**
     * 更新标签页
     */
    updateTab(tabId: string, updates: Partial<TabData>): void {
        const tab = this.tabs.get(tabId);
        if (tab) {
            Object.assign(tab, updates);
            this.render();
        }
    }

    /**
     * 移除标签页
     */
    removeTab(tabId: string): void {
        this.tabs.delete(tabId);
        if (this.activeTabId === tabId) {
            this.activeTabId = null;
        }
        this.render();
    }

    /**
     * 设置活动标签页
     */
    setActiveTab(tabId: string): void {
        this.activeTabId = tabId;
        this.render();
    }

    /**
     * 获取活动标签页ID
     */
    getActiveTabId(): string | null {
        return this.activeTabId;
    }

    /**
     * 获取所有标签页
     */
    getAllTabs(): TabData[] {
        return Array.from(this.tabs.values());
    }

    /**
     * 关闭所有标签页
     */
    private async closeAllTabs(): Promise<void> {
        if (this.tabs.size === 0) return;

        const confirmed = confirm(`确定要关闭所有 ${this.tabs.size} 个标签页吗？`);
        if (!confirmed) return;

        const tabIds = Array.from(this.tabs.keys());

        for (const tabId of tabIds) {
            if (this.onTabClose) {
                await this.onTabClose(tabId);
            }
        }

        this.tabs.clear();
        this.activeTabId = null;
        this.render();

        // 显示通知
        this.showNotification('已关闭所有标签页', 'success');
    }

    /**
     * 渲染标签页
     */
    private render(): void {
        this.tabBarContent.innerHTML = '';

        if (this.tabs.size === 0) {
            this.renderEmptyState();
            return;
        }

        this.tabs.forEach(tab => {
            const tabElement = this.createTabElement(tab);
            this.tabBarContent.appendChild(tabElement);
        });

        // 更新标签页计数
        this.updateTabCount();
    }

    private renderEmptyState(): void {
        const emptyState = document.createElement('div');
        emptyState.className = 'tab-bar-empty';
        emptyState.innerHTML = `
            <span class="empty-text">暂无标签页</span>
            <button class="btn btn-sm btn-primary" onclick="showNewTabDialog()">
                <span class="icon">➕</span>
                创建第一个
            </button>
        `;
        this.tabBarContent.appendChild(emptyState);
    }

    private createTabElement(tab: TabData): HTMLElement {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${tab.id === this.activeTabId ? 'active' : ''}`;
        tabElement.draggable = true;
        tabElement.setAttribute('data-tab-id', tab.id);

        // 优先使用页面标题，备选使用账号名
        const displayTitle = tab.displayTitle || tab.accountName || 'New Tab';

        // 状态指示器颜色
        const statusClass = `status-${tab.loginStatus}`;

        // 图标：优先使用 favicon，备选使用默认图标
        let iconContent = '';
        if (tab.displayFavicon) {
            iconContent = `<img src="${tab.displayFavicon}" alt="icon" style="width: 14px; height: 14px; border-radius: 2px; object-fit: cover;" 
                           onerror="this.style.display='none'; this.parentElement.textContent='🌐';">`;
        } else {
            iconContent = '🌐'; // 默认图标
        }

        tabElement.innerHTML = `
        <span class="tab-icon">${iconContent}</span>
        <span class="tab-name" title="${displayTitle}">${displayTitle}</span>
        <span class="tab-status ${statusClass}" title="登录状态: ${this.getStatusText(tab.loginStatus)}"></span>
        <button class="tab-close" title="关闭标签页">×</button>
        `;

        // 添加事件监听器
        this.setupTabEventListeners(tabElement, tab);

        return tabElement;
    }

    private setupTabEventListeners(tabElement: HTMLElement, tab: TabData): void {
        // 点击切换标签页
        tabElement.addEventListener('click', (e) => {
            if (!(e.target as HTMLElement).classList.contains('tab-close')) {
                this.switchToTab(tab.id);
            }
        });

        // 关闭按钮
        const closeBtn = tabElement.querySelector('.tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });
        }

        // 双击重命名
        tabElement.addEventListener('dblclick', () => {
            this.renameTab(tab.id);
        });

        // 鼠标中键关闭
        tabElement.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // 中键
                e.preventDefault();
                this.closeTab(tab.id);
            }
        });
    }

    private async switchToTab(tabId: string): Promise<void> {
        if (this.activeTabId === tabId) return;

        this.activeTabId = tabId;
        this.render();

        if (this.onTabSwitch) {
            await this.onTabSwitch(tabId);
        }

        // 更新当前标签页信息显示
        this.updateCurrentTabInfo(tabId);
    }

    private async closeTab(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // 确认关闭
        const confirmed = confirm(`确定要关闭标签页 "${tab.accountName}" 吗？`);
        if (!confirmed) return;

        if (this.onTabClose) {
            await this.onTabClose(tabId);
        }

        this.removeTab(tabId);

        // 修复：安全地切换到下一个标签页
        if (this.activeTabId === tabId && this.tabs.size > 0) {
            const nextTab = this.tabs.values().next().value;
            if (nextTab) {  // 确保nextTab存在
                this.switchToTab(nextTab.id);
            }
        }

        this.showNotification(`已关闭标签页: ${tab.accountName}`, 'info');
    }

    private renameTab(tabId: string): void {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        const newName = prompt('请输入新的标签页名称:', tab.accountName);
        if (newName && newName.trim() !== tab.accountName) {
            this.updateTab(tabId, { accountName: newName.trim() });
            this.showNotification('标签页已重命名', 'success');
        }
    }

    private getStatusText(status: string): string {
        const statusTexts: Record<string, string> = {
            'logged_in': '已登录',
            'logged_out': '未登录',
            'unknown': '未知'
        };
        return statusTexts[status] || '未知';
    }
    /**
     * 更新标签页标题（从外部调用）
     */
    updateTabTitle(tabId: string, title: string): void {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.displayTitle = title;

            // 更新DOM中的显示
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                const nameElement = tabElement.querySelector('.tab-name');
                if (nameElement) {
                    nameElement.textContent = title;
                    nameElement.setAttribute('title', title);
                }
            }
        }
    }

    /**
     * 更新标签页图标（从外部调用）
     */
    updateTabFavicon(tabId: string, favicon: string): void {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.displayFavicon = favicon;

            // 更新DOM中的显示
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                const iconElement = tabElement.querySelector('.tab-icon');
                if (iconElement) {
                    iconElement.innerHTML = `<img src="${favicon}" alt="icon" style="width: 14px; height: 14px; border-radius: 2px; object-fit: cover;" 
                                            onerror="this.style.display='none'; this.parentElement.textContent='🌐';">`;
                }
            }
        }
    }
    private updateTabCount(): void {
        const countElement = document.getElementById('api-active-tabs');
        if (countElement) {
            countElement.textContent = this.tabs.size.toString();
        }
    }

    private updateCurrentTabInfo(tabId: string): void {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        const nameElement = document.getElementById('current-tab-name');
        const platformElement = document.getElementById('current-tab-platform');
        const statusElement = document.getElementById('current-tab-status');
        const urlElement = document.getElementById('current-tab-url');

        if (nameElement) nameElement.textContent = tab.accountName;
        if (platformElement) platformElement.textContent = tab.platform;
        if (statusElement) {
            statusElement.textContent = this.getStatusText(tab.loginStatus);
            statusElement.className = `value status-${tab.loginStatus}`;
        }
        if (urlElement) urlElement.textContent = tab.url || '-';
    }

    private showNotification(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info'): void {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">${type === 'success' ? '成功' : type === 'error' ? '错误' : '提示'}</span>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-body">${message}</div>
        `;

        // 添加到通知容器
        const container = document.getElementById('notification-container');
        if (container) {
            container.appendChild(notification);

            // 关闭按钮事件
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.removeNotification(notification);
                });
            }

            // 自动关闭
            setTimeout(() => {
                this.removeNotification(notification);
            }, 5000);
        }
    }

    private removeNotification(notification: HTMLElement): void {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    /**
     * 设置事件回调
     */
    onTabSwitchCallback(callback: (tabId: string) => void): void {
        this.onTabSwitch = callback;
    }

    onTabCloseCallback(callback: (tabId: string) => void): void {
        this.onTabClose = callback;
    }

    onTabCreateCallback(callback: () => void): void {
        this.onTabCreate = callback;
    }

    /**
     * 销毁组件
     */
    destroy(): void {
        this.tabs.clear();
        this.activeTabId = null;
        this.tabBarContent.innerHTML = '';
    }
}

// 导出供其他模块使用
if (typeof window !== 'undefined') {
    (window as any).TabBar = TabBar;
}

// CSS动画补充
const additionalStyles = `
@keyframes slideOutRight {
    from {
        opacity: 1;
        transform: translateX(0);
    }
    to {
        opacity: 0;
        transform: translateX(100%);
    }
}

.tab-bar-empty {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    color: var(--text-muted);
    font-style: italic;
}

.tab-icon {
    font-size: 14px;
    flex-shrink: 0;
}

.tab:hover .tab-close {
    opacity: 1;
}

.tab-close {
    opacity: 0.7;
    transition: opacity 0.2s ease;
}
`;

// 添加额外样式
if (typeof document !== 'undefined') {
    const existingStyle = document.getElementById('tabbar-styles');
    if (!existingStyle) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'tabbar-styles';
        styleSheet.textContent = additionalStyles;
        document.head.appendChild(styleSheet);
    }
}