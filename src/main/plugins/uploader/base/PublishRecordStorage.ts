// src/main/plugins/uploader/base/PublishRecordStorage.ts

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../../../config/Config';
import { globalDB } from '../../../config/DatabaseManager';

// 🔥 发布记录相关类型定义
export interface PublishRecordData {
    title: string;
    video_files: string[];           // 视频文件列表
    account_list: Array<{            // 发布账号列表
        accountName: string;
        platform: string;
        filePath: string;
        accountId?: string;
    }>;
    platform_type: number;          // 主要平台类型
    status: 'pending' | 'success' | 'partial' | 'failed';
    total_accounts: number;
    success_accounts: number;
    failed_accounts: number;
    duration?: number;               // 耗时(秒)
    created_by?: string;             // 发布人
    cover_screenshots?: string[];    // 封面截图
    publish_config?: {               // 发布配置
        title: string;
        description: string;
        tags: string[];
        thumbnail: string;
        location: string;
        enableTimer: boolean;
        videosPerDay: number;
        dailyTimes: string[];
        startDays: number;
        category: number;
        mode: string;
        original: boolean;
        platformSpecific: {
            douyin: {
                statement: string;
                location: string;
            };
            wechat: {
                original: boolean;
                location: string;
            };
        };
    };
    original_request_data?: any;     // 原始请求数据
    scheduled_time?: string;         // 🔥 新增：定时发布时间
}
export interface PublishConfig {
    title: string;
    description: string;
    tags: string[];
    thumbnail: string;
    location: string;
    enableTimer: boolean;
    videosPerDay: number;
    dailyTimes: string[];
    startDays: number;
    category: number;
    mode: string;
    original: boolean;
    platformSpecific: {
        douyin: {
            statement: string;
            location: string;
        };
        wechat: {
            original: boolean;
            location: string;
        };
    };
}
export interface RepublishConfigResponse {
    recordId: number;
    title: string;
    videoFiles: string[];
    coverScreenshots: string[];
    accounts: Array<{
        accountName: string;
        platform: string;
        filePath: string;
        accountId?: string;
    }>;
    publishConfig: PublishConfig | null;
    originalRequest: any;
    platformType: number;
    mode: string;
    accountCount: number;
}
export interface PublishRecordFilters {
    publisher?: string;              // 发布人筛选
    content_type?: string;           // 内容类型筛选 
    status?: string;                 // 状态筛选
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
}

export interface PublishAccountStatus {
    record_id: number;
    account_name: string;
    platform: string;
    status: 'pending' | 'uploading' | 'success' | 'failed';
    upload_status?: string;          // 上传状态：上传成功
    push_status?: string;            // 推送状态：推送成功
    transcode_status?: string;       // 转码状态：转码成功
    review_status?: string;          // 审核状态：审核成功
    error_message?: string;
    start_time?: string;
    end_time?: string;
}

// 🔥 数据库初始化状态
let dbInitialized = false;
let dbInitializing = false;

// 🔥 数据库单例（复用 AccountStorage 的连接）
let dbInstance: Database.Database | null = null;

export class PublishRecordStorage {

    /**
     * 🔥 获取数据库实例（复用现有连接）
     */
    private static getDatabase(): Database.Database {
        return globalDB.getConnection();
    }

    /**
     * 🔥 数据库初始化 - 创建发布记录相关表
     */
    static initializeDatabase(): void {
        // 防止重复初始化
        if (dbInitialized) {
            console.log('✅ 发布记录数据库已初始化，跳过');
            return;
        }

        if (dbInitializing) {
            console.log('⏳ 发布记录数据库正在初始化中，等待完成...');
            while (dbInitializing) {
                require('child_process').spawnSync('sleep', ['0.1']);
            }
            return;
        }

        dbInitializing = true;

        try {
            console.log('🚀 开始初始化发布记录数据库...');

            const db = this.getDatabase();
            this.createPublishRecordTables(db);
            this.showDatabaseInfo(db);

            dbInitialized = true;
            console.log('🎉 发布记录数据库初始化完成！');

        } catch (error) {
            console.error('❌ 发布记录数据库初始化失败:', error);
            throw error;
        } finally {
            dbInitializing = false;
        }
    }

    /**
     * 🔥 创建发布记录相关表
     */
    private static createPublishRecordTables(db: Database.Database): void {
        // 发布记录主表
        db.exec(`
            CREATE TABLE IF NOT EXISTS publish_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                video_files TEXT NOT NULL,        -- JSON数组：["video1.mp4", "video2.mp4"]
                account_list TEXT NOT NULL,       -- JSON数组：账号信息列表
                cover_screenshots TEXT,
                platform_type INTEGER,           -- 主要平台类型
                status TEXT DEFAULT 'pending',   -- pending/success/partial/failed
                total_accounts INTEGER DEFAULT 0,
                success_accounts INTEGER DEFAULT 0,
                failed_accounts INTEGER DEFAULT 0,
                start_time DATETIME,
                end_time DATETIME,
                duration INTEGER DEFAULT 0,      -- 耗时(秒)
                created_by TEXT DEFAULT 'system',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                publish_config TEXT,              -- JSON存储完整的发布配置
                original_request_data TEXT,        -- JSON存储原始请求数据，用于重新发布
                scheduled_time DATETIME
            )
        `);

        // 发布账号状态详情表
        db.exec(`
            CREATE TABLE IF NOT EXISTS publish_account_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id INTEGER NOT NULL,
                account_name TEXT NOT NULL,
                platform TEXT NOT NULL,
                status TEXT DEFAULT 'pending',    -- pending/uploading/success/failed
                upload_status TEXT,               -- 上传状态
                push_status TEXT,                 -- 推送状态  
                transcode_status TEXT,            -- 转码状态
                review_status TEXT,               -- 审核状态
                error_message TEXT,
                start_time DATETIME,
                end_time DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (record_id) REFERENCES publish_records(id) ON DELETE CASCADE
            )
        `);

        // 创建索引
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_publish_records_status ON publish_records(status);
            CREATE INDEX IF NOT EXISTS idx_publish_records_created_at ON publish_records(created_at);
            CREATE INDEX IF NOT EXISTS idx_publish_records_created_by ON publish_records(created_by);
            CREATE INDEX IF NOT EXISTS idx_publish_account_status_record_id ON publish_account_status(record_id);
        `);
        console.log('✅ 发布记录表创建成功');
    }

    /**
     * 🔥 显示数据库信息
     */
    private static showDatabaseInfo(db: Database.Database): void {
        try {
            console.log('\n📋 发布记录数据库表结构信息:');

            const tables = ['publish_records', 'publish_account_status'];

            for (const table of tables) {
                console.log(`\n📊 ${table} 表结构:`);
                const columns = db.pragma(`table_info(${table})`) as Array<{
                    cid: number;
                    name: string;
                    type: string;
                    notnull: number;
                    dflt_value: any;
                    pk: number;
                }>;
                for (const col of columns) {
                    console.log(`   ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'}`);
                }
            }

            // 显示统计信息
            const recordsCount = db.prepare("SELECT COUNT(*) as count FROM publish_records").get() as { count: number };
            const statusCount = db.prepare("SELECT COUNT(*) as count FROM publish_account_status").get() as { count: number };

            console.log(`\n📈 发布记录数据库统计:`);
            console.log(`   发布记录数量: ${recordsCount.count}`);
            console.log(`   账号状态记录数量: ${statusCount.count}`);

        } catch (error) {
            console.warn('⚠️ 显示发布记录数据库信息失败:', error);
        }
    }

    /**
     * 🔥 检查数据库是否已初始化
     */
    static isDatabaseInitialized(): boolean {
        try {
            // 检查数据库文件是否存在
            if (!fs.existsSync(Config.DB_PATH)) {
                return false;
            }

            // 检查必要的表是否存在
            const db = this.getDatabase();
            const requiredTables = ['publish_records', 'publish_account_status'];

            for (const table of requiredTables) {
                const result = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
                ).get(table);

                if (!result) {
                    console.log(`❌ 发布记录表 ${table} 不存在`);
                    return false;
                }
            }

            console.log('✅ 发布记录数据库已正确初始化');
            dbInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ 检查发布记录数据库状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 确保数据库已初始化（应用启动时调用）
     */
    static ensureDatabaseInitialized(): void {
        console.log('🔍 检查发布记录数据库初始化状态...');

        const isInitialized = this.isDatabaseInitialized();

        if (!isInitialized) {
            console.log('🔧 发布记录数据库未初始化，开始初始化...');
            this.initializeDatabase();
        } else {
            console.log('✅ 发布记录数据库已初始化');
            dbInitialized = true;
        }
    }

    // ==================== 发布记录管理方法 ====================

    /**
     * 🔥 保存发布记录
     */
    static savePublishRecord(recordData: PublishRecordData & { cover_screenshots?: string[] }): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();
            
            const {
                title,
                video_files,
                account_list,
                cover_screenshots = [], 
                platform_type,
                status,
                total_accounts,
                success_accounts,
                failed_accounts,
                duration = 0,
                created_by = 'system',
                publish_config,
                original_request_data,
                scheduled_time
            } = recordData;

            const currentTime = new Date().toISOString();

            // 开始事务
            const transaction = db.transaction(() => {
                // 1. 插入主记录
                const insertRecord = db.prepare(`
                    INSERT INTO publish_records (
                        title, video_files, account_list, cover_screenshots, platform_type, status,
                        total_accounts, success_accounts, failed_accounts,
                        start_time, end_time, duration, created_by, updated_at,
                        publish_config, original_request_data,scheduled_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const result = insertRecord.run(
                    title,
                    JSON.stringify(video_files),
                    JSON.stringify(account_list),
                    JSON.stringify(cover_screenshots),
                    platform_type,
                    status,
                    total_accounts,
                    success_accounts,
                    failed_accounts,
                    currentTime,
                    status !== 'pending' ? currentTime : null,
                    duration,
                    created_by,
                    currentTime,
                    publish_config ? JSON.stringify(publish_config) : null,  // 🔥 新增
                    original_request_data ? JSON.stringify(original_request_data) : null,
                    scheduled_time ? scheduled_time: null
                );

                const recordId = result.lastInsertRowid as number;

                // 2. 插入账号状态记录
                const insertAccountStatus = db.prepare(`
                    INSERT INTO publish_account_status (
                        record_id, account_name, platform, status, start_time
                    ) VALUES (?, ?, ?, ?, ?)
                `);

                for (const account of account_list) {
                    insertAccountStatus.run(
                        recordId,
                        account.accountName,
                        account.platform,
                        'pending',
                        currentTime
                    );
                }

                return recordId;
            });

            const recordId = transaction();

            return {
                success: true,
                message: "发布记录保存成功",
                data: { recordId }
            };

        } catch (error) {
            console.error('❌ 保存发布记录失败:', error);
            return {
                success: false,
                message: `保存失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 修改：获取重新发布配置 - 动态获取最新账号信息
     */
    static getRepublishConfig(recordId: number, mode: string = 'all'): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            // 获取发布记录
            const recordStmt = db.prepare(`
                SELECT id, title, video_files, account_list, cover_screenshots, 
                    publish_config, original_request_data, platform_type
                FROM publish_records 
                WHERE id = ?
            `);
            const record = recordStmt.get(recordId) as any;

            if (!record) {
                return { success: false, message: "发布记录不存在" };
            }

            // 获取账号状态
            const statusStmt = db.prepare(`
                SELECT account_name, platform, status, error_message
                FROM publish_account_status 
                WHERE record_id = ?
            `);
            const accountStatuses = statusStmt.all(recordId) as any[];

            // 根据模式过滤账号
            let targetAccountNames = JSON.parse(record.account_list).map((acc: any) => acc.accountName);
            
            if (mode === 'failed') {
                const failedAccountNames = accountStatuses
                    .filter(status => status.status === 'failed')
                    .map(status => status.account_name);
                
                targetAccountNames = targetAccountNames.filter((name: string) => 
                    failedAccountNames.includes(name)
                );
            }

            if (targetAccountNames.length === 0) {
                return { 
                    success: false, 
                    message: mode === 'failed' ? "没有发布失败的账号" : "没有可重新发布的账号" 
                };
            }

            // 🔥 关键修改：通过 accountName 查找最新账号信息
            const { AccountStorage } = require('../../login/base/AccountStorage');
            const originalAccountList = JSON.parse(record.account_list);
            const updatedAccounts = [];

            for (const accountName of targetAccountNames) {
                try {
                    const db = AccountStorage.getDatabase();
                    
                    // 🔥 直接通过 userName 查找数据库主键ID和最新信息
                    const stmt = db.prepare(`
                        SELECT id, type, filePath, userName, status
                        FROM user_info 
                        WHERE userName = ?
                        ORDER BY updated_at DESC
                        LIMIT 1
                    `);
                    
                    const currentAccount = stmt.get(accountName);
                    
                    if (currentAccount) {
                        updatedAccounts.push({
                            accountName: currentAccount.userName,
                            platform: AccountStorage.getPlatformName(currentAccount.type),
                            filePath: currentAccount.filePath, // 🔥 使用最新的cookie路径
                            accountId: currentAccount.id // 🔥 使用数据库主键ID
                        });
                        
                        console.log(`🔄 账号信息已更新: ${accountName} -> ${currentAccount.filePath}`);
                    } else {
                        console.warn(`⚠️ 账号 ${accountName} 在数据库中未找到，使用原始数据`);
                        const originalAccount = originalAccountList.find((acc: any) => acc.accountName === accountName);
                        if (originalAccount) {
                            updatedAccounts.push(originalAccount);
                        }
                    }
                } catch (error) {
                    console.error(`❌ 查找账号 ${accountName} 失败:`, error);
                    const originalAccount = originalAccountList.find((acc: any) => acc.accountName === accountName);
                    if (originalAccount) {
                        updatedAccounts.push(originalAccount);
                    }
                }
            }

            // 构造返回数据
            const configData = {
                recordId: record.id,
                title: record.title,
                videoFiles: JSON.parse(record.video_files),
                coverScreenshots: record.cover_screenshots ? JSON.parse(record.cover_screenshots) : [],
                accounts: updatedAccounts, // 🔥 使用更新后的账号信息
                publishConfig: record.publish_config ? JSON.parse(record.publish_config) : null,
                originalRequest: record.original_request_data ? JSON.parse(record.original_request_data) : null,
                platformType: record.platform_type,
                mode: mode,
                accountCount: updatedAccounts.length
            };

            console.log(`🔄 重新发布配置已更新: ${updatedAccounts.length} 个账号使用最新cookie路径`);
            
            return {
                success: true,
                message: `找到 ${updatedAccounts.length} 个${mode === 'failed' ? '失败' : ''}账号可重新发布`,
                data: configData
            };

        } catch (error) {
            console.error('❌ 获取重新发布配置失败:', error);
            return {
                success: false,
                message: `获取配置失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 新增：获取可重新发布的账号统计
     */
    static getRepublishStats(recordId: number): { 
        total: number, 
        failed: number, 
        success: number,
        canRepublishAll: boolean,
        canRepublishFailed: boolean 
    } {
        try {
            const db = this.getDatabase();
            
            const stmt = db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
                FROM publish_account_status 
                WHERE record_id = ?
            `);
            
            const stats = stmt.get(recordId) as any;
            
            return {
                total: stats.total || 0,
                failed: stats.failed || 0,
                success: stats.success || 0,
                canRepublishAll: stats.total > 0,
                canRepublishFailed: (stats.failed || 0) > 0
            };
            
        } catch (error) {
            console.error('❌ 获取重新发布统计失败:', error);
            return {
                total: 0, failed: 0, success: 0,
                canRepublishAll: false, canRepublishFailed: false
            };
        }
    }
    /**
     * 🔥 获取发布记录列表
     */
    static getPublishRecords(filters?: PublishRecordFilters): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();
            
            let sql = `
                SELECT 
                    pr.*,
                    COUNT(pas.id) as account_count,
                    SUM(CASE WHEN pas.status = 'success' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN pas.status = 'failed' THEN 1 ELSE 0 END) as failed_count
                FROM publish_records pr
                LEFT JOIN publish_account_status pas ON pr.id = pas.record_id
            `;

            const conditions = [];
            const params: any[] = [];

            // 应用筛选条件
            if (filters?.publisher && filters.publisher !== '全部发布人') {
                conditions.push('pr.created_by = ?');
                params.push(filters.publisher);
            }

            if (filters?.status && filters.status !== '全部推送状态') {
                const statusValue = filters.status
                    .replace('全部', '')
                    .replace('发布成功', 'success')
                    .replace('发布失败', 'failed')
                    .replace('发布中', 'pending')
                    .replace('部分发布成功', 'partial');
                conditions.push('pr.status = ?');
                params.push(statusValue);
            }

            if (filters?.start_date) {
                conditions.push('pr.created_at >= ?');
                params.push(filters.start_date);
            }

            if (filters?.end_date) {
                conditions.push('pr.created_at <= ?');
                params.push(filters.end_date);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' GROUP BY pr.id ORDER BY pr.created_at DESC';

            if (filters?.limit) {
                sql += ' LIMIT ?';
                params.push(filters.limit);
                
                if (filters?.offset) {
                    sql += ' OFFSET ?';
                    params.push(filters.offset);
                }
            }

            const stmt = db.prepare(sql);
            const records = stmt.all(...params) as any[];

            // 处理返回数据
            const processedRecords = records.map(record => ({
                ...record,
                video_files: JSON.parse(record.video_files),
                account_list: JSON.parse(record.account_list),
                cover_screenshots: record.cover_screenshots ? JSON.parse(record.cover_screenshots) : [],
                // 计算耗时显示
                duration_display: record.duration ? `${Math.floor(record.duration / 60)}分${record.duration % 60}秒` : '0秒',
                // 状态显示
                status_display: this.getStatusDisplay(record.status),
                // 平台显示
                platform_display: this.getPlatformDisplayName(record.platform_type)
            }));

            return {
                success: true,
                message: "success",
                data: processedRecords
            };

        } catch (error) {
            console.error('❌ 获取发布记录失败:', error);
            return {
                success: false,
                message: `获取失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 获取发布记录详情
     */
    static getPublishRecordDetail(recordId: number): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            // 获取主记录
            const recordStmt = db.prepare('SELECT * FROM publish_records WHERE id = ?');
            const record = recordStmt.get(recordId) as any;

            if (!record) {
                return {
                    success: false,
                    message: "发布记录不存在"
                };
            }

            // 获取账号状态详情
            const statusStmt = db.prepare(`
                SELECT * FROM publish_account_status 
                WHERE record_id = ? 
                ORDER BY created_at ASC
            `);
            const accountStatuses = statusStmt.all(recordId) as PublishAccountStatus[];

            // 处理数据
            const detailData = {
                ...record,
                video_files: JSON.parse(record.video_files),
                account_list: JSON.parse(record.account_list),
                cover_screenshots: record.cover_screenshots ? JSON.parse(record.cover_screenshots) : [],
                account_statuses: accountStatuses,
                // 统计数据
                stats: {
                    total: accountStatuses.length,
                    success: accountStatuses.filter(s => s.status === 'success').length,
                    failed: accountStatuses.filter(s => s.status === 'failed').length,
                    pending: accountStatuses.filter(s => s.status === 'pending').length,
                    duration: record.duration || 0,
                    duration_per_account: record.duration && accountStatuses.length > 0 
                        ? Math.round(record.duration / accountStatuses.length * 10) / 10 
                        : 0
                }
            };

            return {
                success: true,
                message: "success", 
                data: detailData
            };

        } catch (error) {
            console.error('❌ 获取发布记录详情失败:', error);
            return {
                success: false,
                message: `获取详情失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 更新发布记录状态
     */
    static updatePublishRecordStatus(
        recordId: number, 
        status: string, 
        summary?: { success: number, failed: number, total: number }
    ): { success: boolean, message: string } {
        try {
            const db = this.getDatabase();
            
            const updateFields: string[] = ['status = ?', 'updated_at = ?'];
            const updateValues: (string | number)[] = [status, new Date().toISOString()];

            if (summary) {
                updateFields.push('success_accounts = ?', 'failed_accounts = ?');
                updateValues.push(summary.success, summary.failed);
            }

            if (status !== 'pending') {
                updateFields.push('end_time = ?');
                updateValues.push(new Date().toISOString());
                
                // 计算耗时
                const recordStmt = db.prepare('SELECT start_time FROM publish_records WHERE id = ?');
                const record = recordStmt.get(recordId) as any;
                
                if (record?.start_time) {
                    const duration = Math.floor((Date.now() - new Date(record.start_time).getTime()) / 1000);
                    updateFields.push('duration = ?');
                    updateValues.push(duration);
                }
            }

            updateValues.push(recordId);

            const sql = `UPDATE publish_records SET ${updateFields.join(', ')} WHERE id = ?`;
            const stmt = db.prepare(sql);
            stmt.run(...updateValues);

            return {
                success: true,
                message: "状态更新成功"
            };

        } catch (error) {
            console.error('❌ 更新发布记录状态失败:', error);
            return {
                success: false,
                message: `更新失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 更新账号发布状态
     */
    static updateAccountPublishStatus(
        recordId: number,
        accountName: string,
        statusData: {
            status?: string;
            upload_status?: string;
            push_status?: string;
            transcode_status?: string;
            review_status?: string;
            error_message?: string;
        }
    ): { success: boolean, message: string } {
        try {
            const db = this.getDatabase();

            const updateFields: string[] = [];
            const updateValues: (string | number)[] = [];

            Object.entries(statusData).forEach(([key, value]) => {
                if (value !== undefined) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(value);
                }
            });

            if (statusData.status && statusData.status !== 'pending') {
                updateFields.push('end_time = ?');
                updateValues.push(new Date().toISOString());
            }

            updateValues.push(recordId, accountName);

            const sql = `
                UPDATE publish_account_status 
                SET ${updateFields.join(', ')} 
                WHERE record_id = ? AND account_name = ?
            `;
            
            const stmt = db.prepare(sql);
            stmt.run(...updateValues);

            return {
                success: true,
                message: "账号状态更新成功"
            };

        } catch (error) {
            console.error('❌ 更新账号发布状态失败:', error);
            return {
                success: false,
                message: `更新失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 批量删除发布记录
     */
    static deletePublishRecords(recordIds: number[]): { success: boolean, message: string, data?: any } {
        try {
            if (recordIds.length === 0) {
                return {
                    success: false,
                    message: "没有要删除的记录"
                };
            }

            const db = this.getDatabase();
            
            const transaction = db.transaction(() => {
                const placeholders = recordIds.map(() => '?').join(',');
                
                // 删除账号状态记录（外键约束会自动处理，但手动删除更安全）
                const deleteStatusStmt = db.prepare(`DELETE FROM publish_account_status WHERE record_id IN (${placeholders})`);
                deleteStatusStmt.run(...recordIds);
                
                // 删除主记录
                const deleteRecordStmt = db.prepare(`DELETE FROM publish_records WHERE id IN (${placeholders})`);
                const result = deleteRecordStmt.run(...recordIds);
                
                return result.changes;
            });

            const deletedCount = transaction();

            return {
                success: true,
                message: `成功删除 ${deletedCount} 条发布记录`,
                data: { deletedCount }
            };

        } catch (error) {
            console.error('❌ 删除发布记录失败:', error);
            return {
                success: false,
                message: `删除失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 导出发布记录
     */
    static exportPublishRecords(filters?: PublishRecordFilters): { success: boolean, message: string, data?: any } {
        try {
            const result = this.getPublishRecords(filters);
            
            if (!result.success) {
                return result;
            }

            const records = result.data;
            
            // 转换为CSV格式的数据
            const csvData = records.map((record: any) => ({
                'ID': record.id,
                '标题': record.title,
                '视频文件': record.video_files.join(', '),
                '平台': record.platform_display,
                '总账号数': record.total_accounts,
                '成功账号数': record.success_accounts,
                '失败账号数': record.failed_accounts,
                '状态': record.status_display,
                '耗时': record.duration_display,
                '发布时间': record.created_at,
                '发布人': record.created_by
            }));

            return {
                success: true,
                message: "导出数据准备完成",
                data: csvData
            };

        } catch (error) {
            console.error('❌ 导出发布记录失败:', error);
            return {
                success: false,
                message: `导出失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }
    /**
     * 🔥 保存封面截图到本地
     */
    static async saveCoverScreenshot(
        base64Data: string, 
        videoFileName: string
    ): Promise<string | null> {
        try {
            // 移除 base64 前缀
            const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Content, 'base64');

            // 生成封面文件名
            const nameWithoutExt = path.parse(videoFileName).name;
            const coverFileName = `${nameWithoutExt}_cover.jpg`;
            
            // 确保封面目录存在
            const coverDir = path.join(Config.VIDEO_DIR, 'covers');
            await fs.promises.mkdir(coverDir, { recursive: true });
            
            // 保存文件
            const coverPath = path.join(coverDir, coverFileName);
            await fs.promises.writeFile(coverPath, buffer);
            
            console.log(`✅ 封面截图保存成功: ${coverPath}`);
            return path.join('covers', coverFileName); // 返回相对路径
            
        } catch (error) {
            console.error('❌ 保存封面截图失败:', error);
            return null;
        }
    }
    // ==================== 辅助方法 ====================

    /**
     * 🔥 获取状态显示文本
     */
    private static getStatusDisplay(status: string): string {
        const statusMap: Record<string, string> = {
            'pending': '发布中',
            'success': '全部发布成功', 
            'partial': '部分发布成功',
            'failed': '全部发布失败'
        };
        return statusMap[status] || status;
    }

    /**
     * 🔥 获取平台显示名称
     */
    private static getPlatformDisplayName(platformType: number): string {
        const platformMap: Record<number, string> = {
            1: '小红书',
            2: '视频号', 
            3: '抖音',
            4: '快手'
        };
        return platformMap[platformType] || '未知平台';
    }

    /**
     * 🔥 获取发布记录统计信息
     */
    static getPublishRecordStats(): {
        total: number,
        today: number,
        statusBreakdown: Record<string, number>,
        platformBreakdown: Record<string, number>
    } {
        try {
            const db = this.getDatabase();
            
            // 获取基本统计
            const totalRecords = db.prepare("SELECT COUNT(*) as count FROM publish_records").get() as { count: number };
            const todayRecords = db.prepare(`
                SELECT COUNT(*) as count FROM publish_records 
                WHERE DATE(created_at) = DATE('now')
            `).get() as { count: number };
            
            // 状态统计
            const statusStats = db.prepare(`
                SELECT status, COUNT(*) as count 
                FROM publish_records 
                GROUP BY status
            `).all() as Array<{ status: string; count: number }>;

            // 平台统计
            const platformStats = db.prepare(`
                SELECT platform_type, COUNT(*) as count 
                FROM publish_records 
                GROUP BY platform_type
            `).all() as Array<{ platform_type: number; count: number }>;

            return {
                total: totalRecords.count,
                today: todayRecords.count,
                statusBreakdown: statusStats.reduce((acc, item) => {
                    acc[this.getStatusDisplay(item.status)] = item.count;
                    return acc;
                }, {} as Record<string, number>),
                platformBreakdown: platformStats.reduce((acc, item) => {
                    const platformName = this.getPlatformDisplayName(item.platform_type);
                    acc[platformName] = item.count;
                    return acc;
                }, {} as Record<string, number>)
            };

        } catch (error) {
            console.error('❌ 获取发布记录统计失败:', error);
            return {
                total: 0,
                today: 0,
                statusBreakdown: {},
                platformBreakdown: {}
            };
        }
    }

    // ==================== 生命周期管理 ====================

    /**
     * 🔥 关闭数据库连接
     */
    static closeDatabase(): void {
        if (dbInstance) {
            try {
                dbInstance.close();
                dbInstance = null;
                console.log('✅ 数据库连接已关闭 (PublishRecordStorage)');
            } catch (error) {
                console.error('❌ 关闭数据库连接失败:', error);
            }
        }
    }

    /**
     * 🔥 重置数据库状态（测试用）
     */
    static resetDatabase(): void {
        this.closeDatabase();
        dbInitialized = false;
        dbInitializing = false;
    }
}