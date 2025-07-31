// src/main/automation/message/MessageTabManager.ts
import { TabManager } from '../../TabManager';
import { AccountStorage } from '../../plugins/login/base/AccountStorage';

export interface MessageTabMetadata {
    platform: string;
    accountId: string;
    cookieFile: string;
    createdAt: string;
    lastHealthCheck: string;
    retryCount: number;
}

/**
 * 🔧 专门管理消息Tab的生命周期
 * 职责：创建、监控、维护、清理消息专用Tab
 */
export class MessageTabManager {
    private tabManager: TabManager;
    
    // Tab映射和状态
    private messageTabMapping: Map<string, string> = new Map(); // accountKey -> tabId
    private tabHealthMonitors: Map<string, NodeJS.Timeout> = new Map(); // tabId -> timer
    private tabMetadata: Map<string, MessageTabMetadata> = new Map(); // tabId -> metadata
    
    // 配置
    private readonly HEALTH_CHECK_INTERVAL = 60 * 1000; // 1分钟
    private readonly MAX_RETRY_COUNT = 3;
    
    constructor(tabManager: TabManager) {
        this.tabManager = tabManager;
        console.log('🔧 MessageTabManager 已初始化');
    }

    /**
     * 🔥 确保消息Tab存在并健康
     */
    async ensureMessageTab(platform: string, accountId: string, cookieFile: string): Promise<string> {
        const accountKey = `${platform}_${accountId}`;
        
        try {
            // 1. 检查现有Tab
            let tabId = this.messageTabMapping.get(accountKey);
            
            if (tabId && await this.isTabHealthy(tabId)) {
                console.log(`♻️ 复用健康的消息Tab: ${accountKey} -> ${tabId}`);
                return tabId;
            }
            
            // 2. 清理不健康的Tab
            if (tabId) {
                console.warn(`⚠️ 清理不健康的消息Tab: ${accountKey}`);
                await this.cleanupMessageTab(accountKey);
            }
            
            // 3. 创建新Tab
            tabId = await this.createMessageTab(platform, accountId, cookieFile);
            
            // 4. 记录映射和启动监控
            this.messageTabMapping.set(accountKey, tabId);
            this.startTabMonitoring(tabId, platform, accountId);
            
            console.log(`✅ 消息Tab就绪: ${accountKey} -> ${tabId}`);
            return tabId;
            
        } catch (error) {
            console.error(`❌ 确保消息Tab失败: ${accountKey}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 创建消息专用Tab
     */
    private async createMessageTab(platform: string, accountId: string, cookieFile: string): Promise<string> {
        try {
            // 使用TabManager创建并锁定Tab
            const tabId = await this.tabManager.createMessageTab(platform, accountId, cookieFile);
            
            // 记录Tab元数据
            this.tabMetadata.set(tabId, {
                platform,
                accountId,
                cookieFile,
                createdAt: new Date().toISOString(),
                lastHealthCheck: new Date().toISOString(),
                retryCount: 0
            });
            
            // 等待Tab就绪
            await this.waitForTabReady(tabId, platform);
            
            return tabId;
            
        } catch (error) {
            console.error(`❌ 创建消息专用Tab失败: ${platform}_${accountId}:`, error);
            throw error;
        }
    }

    /**
     * 🔥 等待Tab准备就绪
     */
    private async waitForTabReady(tabId: string, platform: string, timeout: number = 30000): Promise<boolean> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                const isReady = await this.checkPlatformTabReady(tabId, platform);
                if (isReady) {
                    console.log(`✅ 消息Tab已就绪: ${tabId}`);
                    return true;
                }
                
                // 等待1秒后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.warn(`⚠️ 检查Tab就绪状态失败: ${error}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.warn(`⏰ 等待Tab就绪超时: ${tabId}`);
        return false;
    }

    /**
     * 🔥 检查平台特定的Tab就绪状态
     */
    private async checkPlatformTabReady(tabId: string, platform: string): Promise<boolean> {
        try {
            // 平台特定的就绪检查逻辑
            const readyCheckers: Record<string, string> = {
                'wechat': `
                    (function() {
                        // 检查微信视频号消息页面是否加载完成
                        const messageList = document.querySelector('.message-list, .msg-list, [class*="message"]');
                        const loginCheck = !document.querySelector('.login-form, [class*="login"]');
                        return !!(messageList && loginCheck);
                    })()
                `,
                'xiaohongshu': `
                    (function() {
                        // 检查小红书消息页面
                        const messageContainer = document.querySelector('.message-container, [class*="message"]');
                        return !!messageContainer;
                    })()
                `,
                // 其他平台...
            };
            
            const checker = readyCheckers[platform] || 'true'; // 默认认为就绪
            const isReady = await this.tabManager.executeScript(tabId, checker);
            
            return Boolean(isReady);
            
        } catch (error) {
            console.warn(`⚠️ 平台Tab就绪检查失败: ${platform}:`, error);
            return false;
        }
    }

    /**
     * 🔥 检查Tab健康状态
     */
    async isTabHealthy(tabId: string): Promise<boolean> {
        try {
            // 1. 检查Tab是否存在
            const tabs = this.tabManager.getAllTabs();
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) {
                console.warn(`⚠️ Tab不存在: ${tabId}`);
                return false;
            }
            
            // 2. 检查Tab是否被正确锁定
            const lockStatus = this.tabManager.getTabLockStatus(tabId);
            if (!lockStatus.isLocked || lockStatus.lockInfo?.owner !== 'message') {
                console.warn(`⚠️ Tab锁定状态异常: ${tabId}`);
                return false;
            }
            
            // 3. 检查页面是否响应
            const isResponsive = await this.testTabResponsive(tabId);
            if (!isResponsive) {
                console.warn(`⚠️ Tab页面无响应: ${tabId}`);
                return false;
            }
            
            // 4. 检查是否在正确的页面
            const currentUrl = await this.tabManager.executeScript(tabId, 'window.location.href');
            if (typeof currentUrl === 'string' && currentUrl.includes('login')) {
                console.warn(`⚠️ Tab跳转到登录页面: ${tabId}`);
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.warn(`⚠️ Tab健康检查异常: ${tabId}:`, error);
            return false;
        }
    }

    /**
     * 🔥 测试Tab响应性
     */
    private async testTabResponsive(tabId: string, timeout: number = 3000): Promise<boolean> {
        try {
            const result = await Promise.race([
                this.tabManager.executeScript(tabId, 'Date.now()'),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('超时')), timeout)
                )
            ]);
            return typeof result === 'number';
        } catch {
            return false;
        }
    }

    /**
     * 🔥 启动Tab监控
     */
    private startTabMonitoring(tabId: string, platform: string, accountId: string): void {
        // 清理现有监控
        this.stopTabMonitoring(tabId);
        
        const monitor = setInterval(async () => {
            try {
                const isHealthy = await this.isTabHealthy(tabId);
                
                if (!isHealthy) {
                    console.warn(`⚠️ 检测到不健康的Tab: ${platform}_${accountId}`);
                    await this.handleUnhealthyTab(tabId, platform, accountId);
                } else {
                    // 更新健康检查时间
                    const metadata = this.tabMetadata.get(tabId);
                    if (metadata) {
                        metadata.lastHealthCheck = new Date().toISOString();
                    }
                }
            } catch (error) {
                console.error(`❌ Tab监控失败: ${tabId}:`, error);
            }
        }, this.HEALTH_CHECK_INTERVAL);
        
        this.tabHealthMonitors.set(tabId, monitor);
        console.log(`🔍 启动Tab监控: ${platform}_${accountId}`);
    }

    /**
     * 🔥 停止Tab监控
     */
    private stopTabMonitoring(tabId: string): void {
        const monitor = this.tabHealthMonitors.get(tabId);
        if (monitor) {
            clearInterval(monitor);
            this.tabHealthMonitors.delete(tabId);
        }
    }

    /**
     * 🔥 处理不健康的Tab
     */
    private async handleUnhealthyTab(tabId: string, platform: string, accountId: string): Promise<void> {
        const accountKey = `${platform}_${accountId}`;
        const metadata = this.tabMetadata.get(tabId);
        
        if (!metadata) return;
        
        try {
            // 增加重试计数
            metadata.retryCount++;
            
            if (metadata.retryCount > this.MAX_RETRY_COUNT) {
                console.error(`❌ Tab重试次数超限，停止监控: ${accountKey}`);
                await this.cleanupMessageTab(accountKey);
                return;
            }
            
            console.log(`🔧 重建不健康的Tab: ${accountKey} (重试: ${metadata.retryCount})`);
            
            // 清理当前Tab
            await this.cleanupMessageTab(accountKey);
            
            // 等待后重建
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 重新创建Tab
            await this.ensureMessageTab(platform, accountId, metadata.cookieFile);
            
        } catch (error) {
            console.error(`❌ 处理不健康Tab失败: ${accountKey}:`, error);
        }
    }

    /**
     * 🔥 清理消息Tab
     */
    async cleanupMessageTab(accountKey: string): Promise<void> {
        const tabId = this.messageTabMapping.get(accountKey);
        
        if (tabId) {
            try {
                console.log(`🧹 清理消息Tab: ${accountKey} -> ${tabId}`);
                
                // 停止监控
                this.stopTabMonitoring(tabId);
                
                // 清理Tab
                await this.tabManager.cleanupMessageTab(tabId);
                
                // 清理映射和元数据
                this.messageTabMapping.delete(accountKey);
                this.tabMetadata.delete(tabId);
                
                console.log(`✅ 消息Tab清理完成: ${accountKey}`);
            } catch (error) {
                console.error(`❌ 清理消息Tab失败: ${accountKey}:`, error);
            }
        }
    }

    /**
     * 🔥 获取Tab信息
     */
    getTabInfo(accountKey: string): { tabId?: string; metadata?: MessageTabMetadata } {
        const tabId = this.messageTabMapping.get(accountKey);
        const metadata = tabId ? this.tabMetadata.get(tabId) : undefined;
        return { tabId, metadata };
    }

    /**
     * 🔥 获取所有消息Tab状态
     */
    async getAllTabsStatus(): Promise<Array<{
        accountKey: string;
        tabId: string;
        platform: string;
        accountId: string;
        isHealthy: boolean;
        metadata: MessageTabMetadata;
    }>> {
        const results = [];
        
        for (const [accountKey, tabId] of this.messageTabMapping) {
            const metadata = this.tabMetadata.get(tabId);
            if (metadata) {
                const isHealthy = await this.isTabHealthy(tabId);
                results.push({
                    accountKey,
                    tabId,
                    platform: metadata.platform,
                    accountId: metadata.accountId,
                    isHealthy,
                    metadata
                });
            }
        }
        
        return results;
    }

    /**
     * 🔥 获取平台消息页面URL
     */
    private getMessageUrl(platform: string): string {
        const messageUrls: Record<string, string> = {
            'wechat': 'https://channels.weixin.qq.com/platform/private_msg',
            'xiaohongshu': 'https://creator.xiaohongshu.com/creator/post',
            'douyin': 'https://creator.douyin.com/creator-micro/home',
            'kuaishou': 'https://cp.kuaishou.com/profile',
            // 其他平台...
        };
        
        return messageUrls[platform] || 'about:blank';
    }

    /**
     * 🔥 销毁Tab管理器
     */
    async destroy(): Promise<void> {
        console.log('🧹 销毁MessageTabManager...');
        
        // 停止所有监控
        for (const tabId of this.tabHealthMonitors.keys()) {
            this.stopTabMonitoring(tabId);
        }
        
        // 清理所有Tab
        for (const accountKey of this.messageTabMapping.keys()) {
            await this.cleanupMessageTab(accountKey);
        }
        
        // 清理所有资源
        this.messageTabMapping.clear();
        this.tabHealthMonitors.clear();
        this.tabMetadata.clear();
        
        console.log('✅ MessageTabManager已销毁');
    }
}