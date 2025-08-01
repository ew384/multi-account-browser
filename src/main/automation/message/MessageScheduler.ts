// src/main/automation/message/MessageScheduler.ts
import { MessageTabManager } from './MessageTabManager';

export interface MessageScheduleTask {
    id: string;                    // 任务ID
    platform: string;             // 平台名称
    accountId: string;             // 账号ID
    accountKey: string;            // 组合键 platform_accountId
    currentCookieFile: string;     // 🔥 改名：cookieFile -> currentCookieFile
    
    // 🔥 简化的Cookie管理信息
    lastCookieUpdate: string;      // 🔥 新增：最后更新Cookie的时间
    cookieUpdateCount: number;     // 🔥 新增：Cookie更新次数
    
    // 调度配置
    syncInterval: number;          // 同步间隔(分钟)
    enabled: boolean;              // 是否启用
    priority: number;              // 优先级 (1-10)
    
    // 状态信息
    status: 'pending' | 'running' | 'paused' | 'error' | 'stopped';
    lastSyncTime?: string;         // 上次同步时间
    nextSyncTime?: string;         // 下次同步时间
    syncCount: number;             // 同步次数
    errorCount: number;            // 错误次数
    consecutiveErrors: number;     // 连续错误次数
    lastError?: string;            // 最近错误
    
    // 统计信息
    totalMessages: number;         // 同步的总消息数
    newMessagesLastSync: number;   // 上次同步的新消息数
    avgSyncDuration: number;       // 平均同步耗时(ms)
}

export interface MessageSchedulerConfig {
    maxConcurrentTasks: number;    // 最大并发任务数
    maxConsecutiveErrors: number;  // 最大连续错误数
    errorBackoffMultiplier: number; // 错误退避倍数
}

/**
 * 📅 专门管理消息同步调度逻辑
 * 职责：任务调度、并发控制、错误重试
 */
export class MessageScheduler {
    private messageTabManager: MessageTabManager;
    
    // 任务管理
    private tasks: Map<string, MessageScheduleTask> = new Map();
    private runningTasks: Set<string> = new Set();
    private taskTimers: Map<string, NodeJS.Timeout> = new Map();
    
    // 全局调度
    private masterScheduler?: NodeJS.Timeout;
    
    // 配置
    private config: MessageSchedulerConfig = {
        maxConcurrentTasks: 5,
        maxConsecutiveErrors: 3,
        errorBackoffMultiplier: 2
    };
    
    // 状态
    private isRunning: boolean = false;
    private startTime?: Date;
    private totalSyncOperations: number = 0;
    
    // 🔥 接受同步执行函数作为依赖注入
    private syncFunction?: (platform: string, accountId: string, tabId: string, options?: any) => Promise<any>;
    
    constructor(messageTabManager: MessageTabManager) {
        this.messageTabManager = messageTabManager;
        console.log('📅 MessageScheduler 已初始化');
    }

    /**
     * 🔥 设置同步执行函数（依赖注入）
     */
    setSyncFunction(syncFn: (platform: string, accountId: string, tabId: string, options?: any) => Promise<any>): void {
        this.syncFunction = syncFn;
    }

    // ==================== 任务管理 ====================

    /**
     * 🔥 添加消息同步任务
     */
    addTask(params: {
        platform: string;
        accountId: string;
        cookieFile: string;
        syncInterval?: number;
        priority?: number;
        enabled?: boolean;
    }): string {
        const accountKey = `${params.platform}_${params.accountId}`;
        const taskId = `msg_${accountKey}_${Date.now()}`;
        
        const task: MessageScheduleTask = {
            id: taskId,
            platform: params.platform,
            accountId: params.accountId,
            accountKey: accountKey,
            currentCookieFile: params.cookieFile,
            lastCookieUpdate: new Date().toISOString(),
            cookieUpdateCount: 1,            
            // 调度配置
            syncInterval: params.syncInterval || 5,
            enabled: params.enabled !== false,
            priority: params.priority || 5,
            
            // 初始状态
            status: 'pending',
            syncCount: 0,
            errorCount: 0,
            consecutiveErrors: 0,
            totalMessages: 0,
            newMessagesLastSync: 0,
            avgSyncDuration: 0
        };
        
        this.tasks.set(taskId, task);
        console.log(`➕ 添加消息同步任务: ${accountKey} (ID: ${taskId})`);
        
        // 如果调度器正在运行，立即调度这个任务
        if (this.isRunning) {
            this.scheduleTask(taskId);
        }
        
        return taskId;
    }

    /**
     * 🔥 移除任务
     */
    removeTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        
        // 停止任务
        this.stopTask(taskId);
        
        // 清理资源
        this.tasks.delete(taskId);
        this.runningTasks.delete(taskId);
        
        console.log(`➖ 移除消息同步任务: ${task.accountKey}`);
        return true;
    }

    /**
     * 🔥 批量添加任务
     */
    addBatchTasks(taskParams: Array<{
        platform: string;
        accountId: string;
        cookieFile: string;
        syncInterval?: number;
        priority?: number;
        enabled?: boolean;
    }>): string[] {
        console.log(`📋 批量添加 ${taskParams.length} 个消息同步任务`);
        
        const taskIds = taskParams.map(params => this.addTask(params));
        
        console.log(`✅ 批量添加完成: ${taskIds.length} 个任务`);
        return taskIds;
    }

    // ==================== 调度控制 ====================

    /**
     * 🔥 启动消息调度器
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('⚠️ 消息调度器已在运行');
            return;
        }
        
        console.log('🚀 启动消息调度器...');
        
        this.isRunning = true;
        this.startTime = new Date();
        
        // 启动主调度器
        this.startMasterScheduler();
        
        // 调度所有启用的任务
        for (const [taskId, task] of this.tasks) {
            if (task.enabled) {
                this.scheduleTask(taskId);
            }
        }
        
        console.log(`✅ 消息调度器已启动 (任务数: ${this.tasks.size})`);
    }

    /**
     * 🔥 停止消息调度器
     */
    async stop(): Promise<void> {
        if (!this.isRunning) return;
        
        console.log('⏹️ 停止消息调度器...');
        
        this.isRunning = false;
        
        // 停止主调度器
        if (this.masterScheduler) {
            clearTimeout(this.masterScheduler);
            this.masterScheduler = undefined;
        }
        
        // 停止所有任务
        for (const taskId of this.taskTimers.keys()) {
            this.stopTask(taskId);
        }
        
        // 等待运行中的任务完成
        let waitCount = 0;
        while (this.runningTasks.size > 0 && waitCount < 30) {
            console.log(`⏳ 等待 ${this.runningTasks.size} 个任务完成...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCount++;
        }
        
        console.log('✅ 消息调度器已停止');
    }

    /**
     * 🔥 启动主调度器
     */
    private startMasterScheduler(): void {
        const scheduleNextCheck = () => {
            this.masterScheduler = setTimeout(async () => {
                if (!this.isRunning) return;
                
                try {
                    await this.checkAndExecuteTasks();
                } catch (error) {
                    console.error('❌ 主调度器执行失败:', error);
                }
                
                // 调度下次检查
                scheduleNextCheck();
            }, 30000); // 每30秒检查一次
        };
        
        scheduleNextCheck();
        console.log('⏰ 主调度器已启动');
    }

    /**
     * 🔥 检查并执行到期任务
     */
    private async checkAndExecuteTasks(): Promise<void> {
        const now = Date.now();
        
        for (const [taskId, task] of this.tasks) {
            if (!task.enabled || task.status !== 'pending') continue;
            
            // 检查是否到达执行时间
            if (task.nextSyncTime && new Date(task.nextSyncTime).getTime() <= now) {
                await this.executeTask(taskId);
            }
        }
    }

    // ==================== 任务执行 ====================

    /**
     * 🔥 调度单个任务
     */
    private scheduleTask(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task || !task.enabled) return;
        
        // 清理现有定时器
        const existingTimer = this.taskTimers.get(taskId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // 计算下次执行时间
        let delay = task.syncInterval * 60 * 1000; // 转换为毫秒
        
        // 错误退避策略
        if (task.consecutiveErrors > 0) {
            delay *= Math.pow(this.config.errorBackoffMultiplier, task.consecutiveErrors);
            delay = Math.min(delay, 30 * 60 * 1000); // 最大30分钟
        }
        
        const nextExecuteTime = new Date(Date.now() + delay);
        task.nextSyncTime = nextExecuteTime.toISOString();
        
        // 设置定时器
        const timer = setTimeout(async () => {
            await this.executeTask(taskId);
        }, delay);
        
        this.taskTimers.set(taskId, timer);
        
        console.log(`📅 任务已调度: ${task.accountKey} (下次执行: ${nextExecuteTime.toLocaleString()})`);
    }

    /**
     * 🔥 执行单个任务
     */
    private async executeTask(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task || !task.enabled || !this.isRunning) return;
        
        // 检查并发限制
        if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
            console.log(`⚠️ 达到并发限制，延迟执行: ${task.accountKey}`);
            setTimeout(() => this.executeTask(taskId), 30000); // 30秒后重试
            return;
        }
        
        // 检查同步函数是否已设置
        if (!this.syncFunction) {
            console.error(`❌ 同步函数未设置，跳过任务: ${task.accountKey}`);
            return;
        }
        
        this.runningTasks.add(taskId);
        task.status = 'running';
        
        const startTime = Date.now();
        
        try {
            console.log(`🔄 开始执行消息同步: ${task.accountKey}`);
            
            // 1. 确保Tab健康
            const tabId = await this.messageTabManager.ensureMessageTab(
                task.platform,
                task.accountId,
                task.currentCookieFile
            );
            
            // 2. 执行同步
            const syncResult = await this.syncFunction(
                task.platform,
                task.accountId,
                tabId,
                { fullSync: false }
            );
            
            // 3. 更新任务状态
            const duration = Date.now() - startTime;
            
            task.status = 'pending';
            task.lastSyncTime = new Date().toISOString();
            task.syncCount++;
            task.newMessagesLastSync = syncResult.newMessages || 0;
            task.totalMessages += syncResult.newMessages || 0;
            
            // 更新平均耗时
            task.avgSyncDuration = Math.round(
                (task.avgSyncDuration * (task.syncCount - 1) + duration) / task.syncCount
            );
            
            if (syncResult.success) {
                task.consecutiveErrors = 0;
                delete task.lastError;
                console.log(`✅ 同步完成: ${task.accountKey} (新消息: ${syncResult.newMessages || 0}, 耗时: ${duration}ms)`);
            } else {
                task.errorCount++;
                task.consecutiveErrors++;
                task.lastError = syncResult.errors?.[0] || 'Unknown error';
                console.error(`❌ 同步失败: ${task.accountKey} - ${task.lastError}`);
                
                // 连续错误过多时暂停任务
                if (task.consecutiveErrors >= this.config.maxConsecutiveErrors) {
                    task.status = 'error';
                    task.enabled = false;
                    console.error(`🚫 任务已暂停(连续错误): ${task.accountKey}`);
                }
            }
            
            this.totalSyncOperations++;
            
        } catch (error) {
            console.error(`❌ 执行任务异常: ${task.accountKey}:`, error);
            
            task.status = 'error';
            task.errorCount++;
            task.consecutiveErrors++;
            task.lastError = error instanceof Error ? error.message : 'Unknown error';
            
        } finally {
            this.runningTasks.delete(taskId);
            
            // 如果任务仍然启用，调度下次执行
            if (task.enabled && this.isRunning) {
                this.scheduleTask(taskId);
            }
        }
    }

    /**
     * 🔥 停止单个任务
     */
    private stopTask(taskId: string): void {
        const timer = this.taskTimers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.taskTimers.delete(taskId);
        }
        
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = 'stopped';
            delete task.nextSyncTime;
        }
        
        this.runningTasks.delete(taskId);
    }

    // ==================== 状态查询 ====================

    /**
     * 🔥 获取调度器状态
     */
    getSchedulerStatus(): {
        isRunning: boolean;
        startTime?: string;
        totalTasks: number;
        runningTasks: number;
        enabledTasks: number;
        totalSyncOperations: number;
        tasks: MessageScheduleTask[];
    } {
        return {
            isRunning: this.isRunning,
            startTime: this.startTime?.toISOString(),
            totalTasks: this.tasks.size,
            runningTasks: this.runningTasks.size,
            enabledTasks: Array.from(this.tasks.values()).filter(t => t.enabled).length,
            totalSyncOperations: this.totalSyncOperations,
            tasks: Array.from(this.tasks.values())
        };
    }

    /**
     * 🔥 获取任务详情
     */
    getTask(taskId: string): MessageScheduleTask | null {
        return this.tasks.get(taskId) || null;
    }

    /**
     * 🔥 获取账号的任务
     */
    getTaskByAccount(platform: string, accountId: string): MessageScheduleTask | null {
        const accountKey = `${platform}_${accountId}`;
        for (const task of this.tasks.values()) {
            if (task.accountKey === accountKey) {
                return task;
            }
        }
        return null;
    }
    /**
     * 🔥 更新任务的Cookie文件
     */
    updateTaskCookie(accountKey: string, newCookieFile: string, reason: string = 'manual_update'): boolean {
        const task = Array.from(this.tasks.values()).find(t => t.accountKey === accountKey);
        
        if (!task) {
            console.warn(`⚠️ 未找到任务: ${accountKey}`);
            return false;
        }
        
        console.log(`🔄 更新任务Cookie: ${accountKey}`);
        console.log(`   旧Cookie: ${task.currentCookieFile}`);
        console.log(`   新Cookie: ${newCookieFile}`);
        
        // 简单替换，不保留历史
        task.currentCookieFile = newCookieFile;
        task.lastCookieUpdate = new Date().toISOString();
        task.cookieUpdateCount++;
        
        // 重置错误状态
        task.consecutiveErrors = 0;
        delete task.lastError;
        
        // 如果任务被禁用，重新启用
        if (!task.enabled || task.status === 'error') {
            task.status = 'pending';
            task.enabled = true;
            console.log(`✅ 任务已重新启用: ${accountKey}`);
        }
        
        // 重新调度
        if (this.isRunning && task.enabled) {
            this.scheduleTask(task.id);
        }
        
        return true;
    }
    /**
     * 🔥 启用/禁用任务
     */
    setTaskEnabled(taskId: string, enabled: boolean): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        
        task.enabled = enabled;
        
        if (enabled && this.isRunning) {
            task.status = 'pending';
            task.consecutiveErrors = 0; // 重置错误计数
            this.scheduleTask(taskId);
            console.log(`✅ 任务已启用: ${task.accountKey}`);
        } else {
            this.stopTask(taskId);
            console.log(`⏸️ 任务已禁用: ${task.accountKey}`);
        }
        
        return true;
    }

    /**
     * 🔥 更新任务配置
     */
    updateTaskConfig(taskId: string, config: {
        syncInterval?: number;
        priority?: number;
    }): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        
        if (config.syncInterval !== undefined) {
            task.syncInterval = config.syncInterval;
        }
        
        if (config.priority !== undefined) {
            task.priority = config.priority;
        }
        
        // 如果任务正在运行，重新调度
        if (task.enabled && this.isRunning) {
            this.scheduleTask(taskId);
        }
        
        console.log(`🔧 任务配置已更新: ${task.accountKey}`);
        return true;
    }

    // ==================== 生命周期管理 ====================

    /**
     * 🔥 销毁调度器
     */
    async destroy(): Promise<void> {
        console.log('🧹 销毁消息调度器...');
        
        await this.stop();
        
        // 清理所有资源
        this.tasks.clear();
        this.runningTasks.clear();
        this.taskTimers.clear();
        
        console.log('✅ 消息调度器已销毁');
    }
}