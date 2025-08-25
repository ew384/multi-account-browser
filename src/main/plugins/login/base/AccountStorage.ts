// src/main/plugins/login/base/AccountStorage.ts - Better-SQLite3 版本

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { AccountInfo } from '../../../../types/pluginInterface';
import { Config } from '../../../config/Config';
import { globalDB } from '../../../config/DatabaseManager';
// 数据库初始化状态
let dbInitialized = false;
let dbInitializing = false;

// 🔥 平台类型映射 - 对应 Python 的 platform_map
const PLATFORM_TYPE_MAP: Record<number, string> = {
    1: '小红书',
    2: '视频号',
    3: '抖音',
    4: '快手',
    5: 'TikTok'
};

const PLATFORM_NAME_MAP: Record<string, number> = {
    'xiaohongshu': 1,
    'wechat': 2,
    'douyin': 3,
    'kuaishou': 4,
    'tiktok': 5
};

// 🔥 数据库单例 - 与 MessageStorage 共享
let dbInstance: Database.Database | null = null;

export class AccountStorage {

    /**
     * 🔥 获取数据库实例（与 MessageStorage 共享）
     */
    private static getDatabase(): Database.Database {
        return globalDB.getConnection();
    }

    /**
     * 🔥 数据库初始化 - 对应 Python 的 createTable.py
     */
    static initializeDatabase(): void {
        // 防止重复初始化
        if (dbInitialized) {
            console.log('✅ 账号数据库已初始化，跳过');
            return;
        }

        if (dbInitializing) {
            console.log('⏳ 账号数据库正在初始化中，等待完成...');
            while (dbInitializing) {
                // 同步等待
                require('child_process').spawnSync('sleep', ['0.1']);
            }
            return;
        }

        dbInitializing = true;

        try {
            console.log('🚀 开始初始化账号数据库...');

            const db = this.getDatabase();

            // 🔥 创建分组表
            db.exec(`
                CREATE TABLE IF NOT EXISTS account_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT DEFAULT '',
                    color VARCHAR(20) DEFAULT '#5B73DE',
                    icon VARCHAR(50) DEFAULT 'Users',
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ account_groups 表创建成功');

            // 🔥 创建账号记录表（包含所有新字段）
            db.exec(`
                CREATE TABLE IF NOT EXISTS user_info (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type INTEGER NOT NULL,
                    filePath TEXT NOT NULL,
                    userName TEXT NOT NULL,
                    status INTEGER DEFAULT 0,
                    group_id INTEGER DEFAULT NULL,
                    last_check_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    check_interval INTEGER DEFAULT 3600,
                    account_id TEXT,
                    real_name TEXT, 
                    followers_count INTEGER,
                    videos_count INTEGER,
                    bio TEXT,
                    avatar_url TEXT,
                    local_avatar TEXT,
                    updated_at TEXT,
                    FOREIGN KEY (group_id) REFERENCES account_groups(id) ON DELETE SET NULL
                )
            `);
            console.log('✅ user_info 表创建成功（包含账号信息字段）');

            // 🔥 创建文件记录表
            db.exec(`
                CREATE TABLE IF NOT EXISTS file_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    filesize REAL,
                    upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    file_path TEXT
                )
            `);
            console.log('✅ file_records 表创建成功');

            // 🔥 创建索引以提高查询性能
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_user_info_type ON user_info(type);
                CREATE INDEX IF NOT EXISTS idx_user_info_filepath ON user_info(filePath);
                CREATE INDEX IF NOT EXISTS idx_user_info_group ON user_info(group_id);
                CREATE INDEX IF NOT EXISTS idx_file_records_filename ON file_records(filename);
            `);
            
            console.log('✅ 数据库索引创建成功');

            // 🔥 插入默认分组数据
            this.insertDefaultGroups(db);

            // 🔥 显示数据库信息
            this.showDatabaseInfo(db);

            dbInitialized = true;
            console.log('🎉 账号数据库初始化完成！');

        } catch (error) {
            console.error('❌ 账号数据库初始化失败:', error);
            throw error;
        } finally {
            dbInitializing = false;
        }
    }

    /**
     * 🔥 插入默认分组数据
     */
    private static insertDefaultGroups(db: Database.Database): void {
        const defaultGroups = [
            { name: '微信视频号', description: '微信视频号账号分组', color: '#10B981', icon: 'Video', sortOrder: 1 },
            { name: '抖音', description: '抖音账号分组', color: '#EF4444', icon: 'Music', sortOrder: 2 },
            { name: '快手', description: '快手账号分组', color: '#F59E0B', icon: 'Zap', sortOrder: 3 },
            { name: '小红书', description: '小红书账号分组', color: '#EC4899', icon: 'Heart', sortOrder: 4 }
        ];

        let insertedCount = 0;

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO account_groups (name, description, color, icon, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const group of defaultGroups) {
            try {
                const result = insertStmt.run(group.name, group.description, group.color, group.icon, group.sortOrder);
                if (result.changes > 0) {
                    insertedCount++;
                }
            } catch (error) {
                console.warn(`⚠️ 插入分组 ${group.name} 失败:`, error);
            }
        }

        console.log(`✅ 默认分组数据处理完成，新插入 ${insertedCount} 个分组`);
    }

    /**
     * 🔥 显示数据库信息
     */
    private static showDatabaseInfo(db: Database.Database): void {
        try {
            console.log('\n📋 账号数据库表结构信息:');

            const tables = ['account_groups', 'user_info', 'file_records'];

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
            const groupsCount = db.prepare("SELECT COUNT(*) as count FROM account_groups").get() as { count: number };
            const usersCount = db.prepare("SELECT COUNT(*) as count FROM user_info").get() as { count: number };
            const filesCount = db.prepare("SELECT COUNT(*) as count FROM file_records").get() as { count: number };

            console.log(`\n📈 账号数据库统计:`);
            console.log(`   分组数量: ${groupsCount.count}`);
            console.log(`   账号数量: ${usersCount.count}`);
            console.log(`   文件数量: ${filesCount.count}`);
            console.log(`   数据库文件: ${Config.DB_PATH}`);

        } catch (error) {
            console.warn('⚠️ 显示账号数据库信息失败:', error);
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
            const requiredTables = ['account_groups', 'user_info', 'file_records'];

            for (const table of requiredTables) {
                const result = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
                ).get(table);

                if (!result) {
                    console.log(`❌ 账号表 ${table} 不存在`);
                    return false;
                }
            }

            console.log('✅ 账号数据库已正确初始化');
            dbInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ 检查账号数据库状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 确保数据库已初始化（应用启动时调用）
     */
    static ensureDatabaseInitialized(): void {
        console.log('🔍 检查账号数据库初始化状态...');

        const isInitialized = this.isDatabaseInitialized();

        if (!isInitialized) {
            console.log('🔧 账号数据库未初始化，开始初始化...');
            this.initializeDatabase();
        } else {
            console.log('✅ 账号数据库已初始化');
            dbInitialized = true;
        }
    }

    // ==================== 账号管理相关方法 ====================

    /**
     * 🔥 获取有效账号列表 - 对应 Python 的 getValidAccounts
     * 注意：不包含验证逻辑，纯数据库查询，返回前端格式
     */
    static getValidAccountsForFrontend(): any[] {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT id, type, filePath, userName, status, last_check_time, check_interval,
                       account_id, real_name, followers_count, videos_count, bio, avatar_url, local_avatar
                FROM user_info
            `);
            
            const accounts = stmt.all();

            const results = [];

            for (const row of accounts as any[]) {
                const {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    userName: user_name,
                    status,
                    account_id,
                    real_name,
                    followers_count,
                    videos_count,
                    bio,
                    avatar_url,
                    local_avatar
                } = row;

                // 构建前端期望的账号格式（不进行验证，只返回数据库状态）
                const account = {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    userName: user_name,
                    platform: PLATFORM_TYPE_MAP[type_val] || '未知',
                    status: status === 1 ? '正常' : '异常',
                    avatar: local_avatar || avatar_url || '/default-avatar.png',  // 使用真实头像路径
                    // 账号详细信息
                    accountId: account_id,
                    realName: real_name,
                    followersCount: followers_count,
                    videosCount: videos_count,
                    bio: bio
                };

                results.push(account);
            }

            return results;

        } catch (error) {
            console.error('❌ 获取有效账号失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取带分组信息的账号列表 - 对应 Python 的 getAccountsWithGroups
     */
    static getAccountsWithGroupsForFrontend(forceCheck: boolean = false): any[] {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT u.id, u.type, u.filePath, u.userName, u.status, u.group_id, 
                       u.last_check_time, u.check_interval,
                       u.account_id, u.real_name, u.followers_count, u.videos_count, 
                       u.bio, u.avatar_url, u.local_avatar,
                       g.name as group_name, g.color as group_color, g.icon as group_icon
                FROM user_info u
                LEFT JOIN account_groups g ON u.group_id = g.id
            `);
            
            const accounts = stmt.all();

            const results = [];

            for (const row of accounts as any[]) {
                const {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    userName: user_name,
                    status,
                    group_id,
                    last_check_time,
                    check_interval,
                    account_id,
                    real_name,
                    followers_count,
                    videos_count,
                    bio,
                    avatar_url,
                    local_avatar,
                    group_name,
                    group_color,
                    group_icon
                } = row;

                // 构建前端期望的账号格式（含分组信息）
                const account = {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    userName: user_name,
                    platform: PLATFORM_TYPE_MAP[type_val] || '未知',
                    status: status === 1 ? '正常' : '异常',
                    avatar: local_avatar || avatar_url || '/default-avatar.png',  // 使用真实头像路径
                    // 分组相关字段
                    group_id: group_id,
                    group_name: group_name,
                    group_color: group_color,
                    group_icon: group_icon,
                    // 账号详细信息字段
                    accountId: account_id,
                    realName: real_name,
                    followersCount: followers_count,
                    videosCount: videos_count,
                    bio: bio
                };

                results.push(account);
            }

            return results;

        } catch (error) {
            console.error('❌ 获取分组账号信息失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 删除账号 - 对应 Python 的 delete_account
     */
    static deleteAccount(accountId: number): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            // 查询要删除的记录
            const selectStmt = db.prepare("SELECT * FROM user_info WHERE id = ?");
            const record = selectStmt.get(accountId) as any;

            if (!record) {
                return {
                    success: false,
                    message: "account not found"
                };
            }

            // 删除数据库记录
            const deleteStmt = db.prepare("DELETE FROM user_info WHERE id = ?");
            deleteStmt.run(accountId);

            return {
                success: true,
                message: "account deleted successfully",
                data: null
            };

        } catch (error) {
            console.error('❌ 删除账号失败:', error);
            return {
                success: false,
                message: `delete failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 更新账号信息 - 对应 Python 的 updateUserinfo
     */
    static updateUserinfo(updateData: {
        id: number,
        type?: number,
        userName?: string,
        filePath?: string,  // 🔥 新增 filePath 参数
        status?: number
    }): { success: boolean, message: string, data?: any } {
        try {
            const { id: user_id, type, userName, filePath, status } = updateData;

            if (!user_id) {
                return {
                    success: false,
                    message: "账号ID不能为空"
                };
            }

            const db = this.getDatabase();

            // 动态构建更新SQL
            const updateFields = [];
            const updateValues = [];

            if (type !== undefined) {
                updateFields.push('type = ?');
                updateValues.push(type);
            }

            if (userName !== undefined) {
                updateFields.push('userName = ?');
                updateValues.push(userName);
            }

            // 🔥 新增 filePath 更新
            if (filePath !== undefined) {
                updateFields.push('filePath = ?');
                updateValues.push(filePath);
            }
            
            if (status !== undefined) {  // 🔥 添加这个条件
                updateFields.push('status = ?');
                updateValues.push(status);
            }
            
            if (updateFields.length === 0) {
                return {
                    success: false,
                    message: "没有提供要更新的字段"
                };
            }

            updateValues.push(user_id);

            const sql = `UPDATE user_info SET ${updateFields.join(', ')} WHERE id = ?`;
            const stmt = db.prepare(sql);
            stmt.run(...updateValues);

            return {
                success: true,
                message: "account update successfully",
                data: null
            };

        } catch (error) {
            console.error('❌ 更新账号信息失败:', error);
            return {
                success: false,
                message: `update failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }
    // 🔥 新增：更新账号Cookie和信息的方法
    static updateAccountCookie(
        accountId: number,
        newCookieFile: string,
        accountInfo?: AccountInfo
    ): boolean {
        try {
            const db = this.getDatabase();
            
            // 获取旧记录
            const oldRecord = db.prepare('SELECT filePath FROM user_info WHERE id = ?').get(accountId) as any;
            
            const updateData: any = {
                filePath: path.basename(newCookieFile),
                status: 1, // 恢复为正常状态
                last_check_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // 如果有新的账号信息，一并更新
            if (accountInfo) {
                Object.assign(updateData, {
                    account_id: accountInfo.accountId,
                    real_name: accountInfo.accountName,
                    followers_count: accountInfo.followersCount,
                    videos_count: accountInfo.videosCount,
                    bio: accountInfo.bio,
                    avatar_url: accountInfo.avatar,
                    local_avatar: accountInfo.localAvatar
                });
            }
            
            // 构建SQL
            const fields = Object.keys(updateData);
            const placeholders = fields.map(field => `${field} = ?`).join(', ');
            const values = Object.values(updateData);
            values.push(accountId);
            
            const stmt = db.prepare(`UPDATE user_info SET ${placeholders} WHERE id = ?`);
            const result = stmt.run(...values);
            
            // 删除旧Cookie文件
            if (oldRecord?.filePath && oldRecord.filePath !== path.basename(newCookieFile)) {
                const oldCookiePath = path.join(Config.COOKIE_DIR, oldRecord.filePath);
                try {
                    if (fs.existsSync(oldCookiePath)) {
                        fs.unlinkSync(oldCookiePath);
                        console.log(`🗑️ 已删除旧cookie文件: ${oldRecord.filePath}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ 删除旧cookie文件失败:`, error);
                }
            }
            
            console.log(`✅ 账号Cookie已更新: ID ${accountId}`);
            return result.changes > 0;
            
        } catch (error) {
            console.error('❌ 更新账号Cookie失败:', error);
            return false;
        }
    }
    /**
     * 🔥 添加账号 - 基础添加功能
     */
    static addAccount(accountData: {
        type: number,
        filePath: string,
        userName: string,
        status?: number,
        group_id?: number
    }): { success: boolean, message: string, data?: any } {
        try {
            const { type, filePath, userName, status = 0, group_id } = accountData;

            if (!type || !filePath || !userName) {
                return {
                    success: false,
                    message: "type, filePath, userName 是必需字段"
                };
            }

            const db = this.getDatabase();

            const stmt = db.prepare(`
                INSERT INTO user_info (type, filePath, userName, status, group_id, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `);
            
            const result = stmt.run(type, filePath, userName, status, group_id);

            return {
                success: true,
                message: "账号添加成功",
                data: { id: result.lastInsertRowid }
            };

        } catch (error) {
            console.error('❌ 添加账号失败:', error);
            return {
                success: false,
                message: `add account failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    // ==================== 分组管理相关方法 ====================

    /**
     * 🔥 获取所有分组 - 对应 Python 的 get_groups
     */
    static getAllGroups(): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT 
                    g.id, 
                    g.name, 
                    g.description, 
                    g.color,
                    g.icon,
                    g.sort_order,
                    g.created_at,
                    g.updated_at,
                    COUNT(u.id) as account_count
                FROM account_groups g
                LEFT JOIN user_info u ON g.id = u.group_id
                GROUP BY g.id, g.name, g.description, g.color, g.icon, g.sort_order, g.created_at, g.updated_at
                ORDER BY g.sort_order ASC, g.id ASC
            `);
            
            const groups = stmt.all();

            return {
                success: true,
                message: "success",
                data: groups
            };

        } catch (error) {
            console.error('❌ 获取分组失败:', error);
            return {
                success: false,
                message: `get groups failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 创建分组 - 对应 Python 的 create_group
     */
    static createGroup(groupData: {
        name: string,
        description?: string,
        color?: string,
        icon?: string,
        sort_order?: number
    }): { success: boolean, message: string, data?: any } {
        try {
            const {
                name,
                description = '',
                color = '#5B73DE',
                icon = 'Users',
                sort_order = 0
            } = groupData;

            if (!name) {
                return {
                    success: false,
                    message: "分组名称不能为空"
                };
            }

            const db = this.getDatabase();

            try {
                const stmt = db.prepare(`
                    INSERT INTO account_groups (name, description, color, icon, sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `);
                
                const result = stmt.run(name, description, color, icon, sort_order);

                return {
                    success: true,
                    message: "分组创建成功",
                    data: { id: result.lastInsertRowid }
                };

            } catch (sqlError: any) {
                if (sqlError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return {
                        success: false,
                        message: "分组名称已存在"
                    };
                }
                throw sqlError;
            }

        } catch (error) {
            console.error('❌ 创建分组失败:', error);
            return {
                success: false,
                message: `create group failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 更新分组 - 对应 Python 的 update_group
     */
    static updateGroup(updateData: {
        id: number,
        name?: string,
        description?: string,
        color?: string,
        icon?: string,
        sort_order?: number
    }): { success: boolean, message: string, data?: any } {
        try {
            const { id: group_id, name, description, color, icon, sort_order } = updateData;

            if (!group_id) {
                return {
                    success: false,
                    message: "分组ID不能为空"
                };
            }

            const db = this.getDatabase();

            // 动态构建更新SQL
            const updateFields = [];
            const updateValues = [];

            if (name !== undefined) {
                updateFields.push('name = ?');
                updateValues.push(name);
            }

            if (description !== undefined) {
                updateFields.push('description = ?');
                updateValues.push(description);
            }

            if (color !== undefined) {
                updateFields.push('color = ?');
                updateValues.push(color);
            }

            if (icon !== undefined) {
                updateFields.push('icon = ?');
                updateValues.push(icon);
            }

            if (sort_order !== undefined) {
                updateFields.push('sort_order = ?');
                updateValues.push(sort_order);
            }

            if (updateFields.length === 0) {
                return {
                    success: false,
                    message: "没有提供要更新的字段"
                };
            }

            updateFields.push('updated_at = datetime(\'now\')');
            updateValues.push(group_id);

            try {
                const sql = `UPDATE account_groups SET ${updateFields.join(', ')} WHERE id = ?`;
                const stmt = db.prepare(sql);
                stmt.run(...updateValues);

                return {
                    success: true,
                    message: "分组更新成功",
                    data: null
                };

            } catch (sqlError: any) {
                if (sqlError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return {
                        success: false,
                        message: "分组名称已存在"
                    };
                }
                throw sqlError;
            }

        } catch (error) {
            console.error('❌ 更新分组失败:', error);
            return {
                success: false,
                message: `update group failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 删除分组 - 对应 Python 的 delete_group
     */
    static deleteGroup(groupId: number): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            const transaction = db.transaction(() => {
                // 先将该分组的账号设为未分组
                const updateStmt = db.prepare('UPDATE user_info SET group_id = NULL WHERE group_id = ?');
                updateStmt.run(groupId);

                // 删除分组
                const deleteStmt = db.prepare('DELETE FROM account_groups WHERE id = ?');
                deleteStmt.run(groupId);
            });

            transaction();

            return {
                success: true,
                message: "分组删除成功",
                data: null
            };

        } catch (error) {
            console.error('❌ 删除分组失败:', error);
            return {
                success: false,
                message: `delete group failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 更新账号分组 - 对应 Python 的 update_account_group
     */
    static updateAccountGroup(updateData: {
        account_id: number,
        group_id?: number | null
    }): { success: boolean, message: string, data?: any } {
        try {
            const { account_id, group_id } = updateData;

            if (!account_id) {
                return {
                    success: false,
                    message: "账号ID不能为空"
                };
            }

            const db = this.getDatabase();

            const stmt = db.prepare(`
                UPDATE user_info
                SET group_id = ?
                WHERE id = ?
            `);
            
            stmt.run(group_id, account_id);

            return {
                success: true,
                message: "账号分组更新成功",
                data: null
            };

        } catch (error) {
            console.error('❌ 更新账号分组失败:', error);
            return {
                success: false,
                message: `update account group failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    // ==================== 素材管理相关方法 ====================

    /**
     * 🔥 获取所有素材文件 - 对应 Python 的 get_all_files
     */
    static getAllMaterials(): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare("SELECT * FROM file_records");
            const files = stmt.all();

            return {
                success: true,
                message: "success",
                data: files
            };

        } catch (error) {
            console.error('❌ 获取素材文件失败:', error);
            return {
                success: false,
                message: `get files failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 保存上传的素材文件 - 对应 Python 的 upload_save
     */
    static saveMaterial(materialData: {
        filename: string,
        final_filename: string,
        filesize: number,
        file_path: string
    }): { success: boolean, message: string, data?: any } {
        try {
            const { filename, final_filename, filesize, file_path } = materialData;

            const db = this.getDatabase();

            const stmt = db.prepare(`
                INSERT INTO file_records (filename, filesize, file_path)
                VALUES (?, ?, ?)
            `);
            
            stmt.run(filename, Math.round(filesize * 100) / 100, final_filename);

            console.log("✅ 上传文件已记录");

            return {
                success: true,
                message: "File uploaded and saved successfully",
                data: {
                    filename: filename,
                    filepath: final_filename
                }
            };

        } catch (error) {
            console.error('❌ 保存素材文件失败:', error);
            return {
                success: false,
                message: `save material failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 删除素材文件 - 对应 Python 的 delete_file
     */
    static deleteMaterial(fileId: number): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            // 查询要删除的记录
            const selectStmt = db.prepare("SELECT * FROM file_records WHERE id = ?");
            const record = selectStmt.get(fileId) as any;

            if (!record) {
                return {
                    success: false,
                    message: "File not found"
                };
            }

            // 删除数据库记录
            const deleteStmt = db.prepare("DELETE FROM file_records WHERE id = ?");
            deleteStmt.run(fileId);

            return {
                success: true,
                message: "File deleted successfully",
                data: {
                    id: record.id,
                    filename: record.filename
                }
            };

        } catch (error) {
            console.error('❌ 删除素材文件失败:', error);
            return {
                success: false,
                message: `delete file failed: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 检查文件是否为视频格式 - 对应 Python 的 is_video_file
     */
    static isVideoFile(filename: string): boolean {
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v'];
        const ext = path.extname(filename).toLowerCase();
        return videoExtensions.includes(ext);
    }

    /**
     * 🔥 生成唯一文件名 - 对应 Python 的 UUID 生成逻辑
     */
    static generateUniqueFilename(originalFilename: string): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const ext = path.extname(originalFilename);
        const nameWithoutExt = path.basename(originalFilename, ext);

        return `${timestamp}_${random}_${nameWithoutExt}${ext}`;
    }

    /**
     * 🔥 获取文件预览路径 - 对应 Python 的 get_file 路径构建
     */
    static getMaterialPreviewPath(filename: string): string {
        // 防止路径穿越攻击
        if (filename.includes('..') || filename.startsWith('/')) {
            throw new Error('Invalid filename');
        }

        return path.join(Config.VIDEO_DIR || path.join(Config.BASE_DIR, 'videoFile'), filename);
    }

    // ==================== 文件操作相关方法 ====================

    /**
     * 🔥 确保视频目录存在
     */
    static async ensureVideoDirectoryExists(): Promise<void> {
        try {
            await fs.promises.mkdir(Config.VIDEO_DIR, { recursive: true });
        } catch (error) {
            console.error('❌ 创建视频目录失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取文件大小（MB）
     */
    static async getFileSizeInMB(filePath: string): Promise<number> {
        try {
            const stats = await fs.promises.stat(filePath);
            return Math.round((stats.size / (1024 * 1024)) * 100) / 100;
        } catch (error) {
            console.error('❌ 获取文件大小失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 检查文件是否存在
     */
    static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 🔥 获取最近上传的视频文件 - 对应 Python 的 get_recent_uploads
     */
    static async getRecentUploads(): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const recentVideos: any[] = [];

            // 检查目录是否存在
            if (!(await this.fileExists(Config.VIDEO_DIR))) {
                return {
                    success: true,
                    message: "success",
                    data: []
                };
            }

            // 扫描 videoFile 目录
            const files = await fs.promises.readdir(Config.VIDEO_DIR);

            for (const filename of files) {
                const filePath = path.join(Config.VIDEO_DIR, filename);

                try {
                    const stat = await fs.promises.stat(filePath);

                    // 检查是否为文件且为视频格式
                    if (stat.isFile() && this.isVideoFile(filename)) {
                        // 生成唯一ID (使用文件名和修改时间的hash)
                        const hashInput = filename + stat.mtime.getTime().toString();
                        const id = this.generateSimpleHash(hashInput);

                        recentVideos.push({
                            id: id,
                            filename: filename,
                            filesize: Math.round((stat.size / (1024 * 1024)) * 100) / 100, // MB
                            upload_time: stat.mtime.toISOString(),
                            file_path: filename // 只存文件名，因为都在videoFile目录
                        });
                    }
                } catch (statError) {
                    console.warn(`⚠️ 获取文件状态失败: ${filename}:`, statError);
                    continue;
                }
            }

            // 按修改时间倒序排列（最新的在前面）
            recentVideos.sort((a, b) => new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime());

            return {
                success: true,
                message: "success",
                data: recentVideos
            };

        } catch (error) {
            console.error('❌ 获取最近上传文件失败:', error);
            return {
                success: false,
                message: `获取最近上传文件失败: ${error instanceof Error ? error.message : 'unknown error'}`,
                data: null
            };
        }
    }

    /**
     * 🔥 生成简单hash - 用于生成文件ID
     */
    private static generateSimpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString();
    }

    /**
     * 🔥 删除物理文件
     */
    static async deletePhysicalFile(filePath: string): Promise<boolean> {
        try {
            if (await this.fileExists(filePath)) {
                await fs.promises.unlink(filePath);
                console.log(`✅ 物理文件已删除: ${filePath}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`❌ 删除物理文件失败: ${filePath}:`, error);
            return false;
        }
    }

    // ==================== 数据格式转换方法 ====================

    /**
     * 🔥 转换平台类型为前端格式
     */
    static convertPlatformType(platformType: number): string {
        return PLATFORM_TYPE_MAP[platformType] || '未知';
    }

    /**
     * 🔥 转换平台名称为类型ID
     */
    static convertPlatformName(platformName: string): number {
        return PLATFORM_NAME_MAP[platformName.toLowerCase()] || 0;
    }

    /**
     * 🔥 转换账号状态为前端格式
     */
    static convertAccountStatus(status: number): string {
        return status === 1 ? '正常' : '异常';
    }

    /**
     * 🔥 格式化时间为 ISO 字符串
     */
    static formatDateTime(date?: Date): string {
        return (date || new Date()).toISOString();
    }

    // ==================== 验证相关方法 ====================

    /**
     * 🔥 更新账号验证状态
     */
    static updateValidationStatus(cookieFile: string, isValid: boolean, validationTime: string): boolean {
        try {
            const db = this.getDatabase();

            // 使用 path.basename 提取文件名
            const fileName = path.basename(cookieFile);

            const stmt = db.prepare(`
                UPDATE user_info 
                SET status = ?, last_check_time = ?
                WHERE filePath = ?
            `);
            
            const result = stmt.run(isValid ? 1 : 0, validationTime, fileName);

            if (result.changes > 0) {
                console.log(`✅ 验证状态已更新: ${fileName} -> ${isValid ? '有效' : '无效'}`);
                return true;
            } else {
                console.warn(`⚠️ 未找到要更新的账号: ${fileName}`);
                return false;
            }

        } catch (error) {
            console.error('❌ 更新验证状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 获取需要重新验证的有效账号（修复时间格式版本）
     */
    static getValidAccountsNeedingRevalidation(): Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        lastCheckTime: string;
    }> {
        try {
            const db = this.getDatabase();

            //const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            const tenHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
            // 🔥 添加调试日志
            console.log('🕐 当前时间:', new Date().toISOString());
            //console.log('🕐 30分钟前:', thirtyMinutesAgo);
            console.log('🕐6小时前:', tenHoursAgo);
            const stmt = db.prepare(`
                SELECT 
                    id, type, filePath, userName,
                    last_check_time as lastCheckTime
                FROM user_info 
                WHERE status = 1  -- 当前有效的账号
                AND (
                    last_check_time IS NULL 
                    OR datetime(last_check_time) < datetime(?)
                )
                ORDER BY last_check_time ASC
            `);
            
            //const accounts = stmt.all(thirtyMinutesAgo) as any[];
            const accounts = stmt.all(tenHoursAgo) as any[];
            // 🔥 添加详细调试日志
            console.log('📊 需要验证的账号数量:', accounts.length);
            accounts.forEach(acc => {
                console.log(`🔍 原始数据库时间: "${acc.lastCheckTime}"`);
                console.log(`🔍 类型: ${typeof acc.lastCheckTime}`);
                
                const lastCheck = acc.lastCheckTime ? new Date(acc.lastCheckTime) : null;
                const now = new Date();
                
                console.log(`🔍 解析后时间: ${lastCheck?.toISOString()}`);
                console.log(`🔍 当前时间: ${now.toISOString()}`);
                
                if (lastCheck) {
                    const diffMs = now.getTime() - lastCheck.getTime();
                    const diffMin = Math.round(diffMs / (1000 * 60));
                    console.log(`🔍 实际时间差: ${diffMs}ms = ${diffMin}分钟`);
                }
                
                console.log(`   账号: ${acc.userName}, 上次检查: ${acc.lastCheckTime}`);
            });

            return accounts.map(account => ({
                ...account,
                platform: this.getPlatformName(account.type)
            }));

        } catch (error) {
            console.error('❌ 获取需要重新验证的有效账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取所有有效账号
     */
    static getValidAccounts(): Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        status: number;
        lastCheckTime: string;
    }> {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT 
                    id, type, filePath, userName, status,
                    last_check_time as lastCheckTime
                FROM user_info 
                WHERE status = 1
                ORDER BY last_check_time DESC
            `);
            
            const accounts = stmt.all() as any[];

            return accounts.map(account => ({
                ...account,
                platform: this.getPlatformName(account.type)
            }));

        } catch (error) {
            console.error('❌ 获取有效账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取分组账号信息
     */
    static getAccountsWithGroups(): Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        status: number;
        lastCheckTime: string;
        groupId: number | null;
        groupName: string | null;
        groupColor: string | null;
    }> {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT 
                    u.id, u.type, u.filePath, u.userName, u.status,
                    u.last_check_time as lastCheckTime,
                    u.group_id as groupId,
                    g.name as groupName,
                    g.color as groupColor
                FROM user_info u
                LEFT JOIN account_groups g ON u.group_id = g.id
                ORDER BY g.sort_order, u.updated_at DESC
            `);
            
            const accounts = stmt.all() as any[];

            return accounts.map(account => ({
                ...account,
                platform: this.getPlatformName(account.type)
            }));

        } catch (error) {
            console.error('❌ 获取分组账号信息失败:', error);
            return [];
        }
    }

    // ==================== 原有方法保持不变 ====================

    /**
     * 生成Cookie文件名
     */
    static generateCookieFileName(): string {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}_${random}.json`;
    }

    /**
     * 🔥 从数据库获取账号信息
     */
    static getAccountInfoFromDb(cookieFile: string): { 
        username: string; 
        platform: string; 
        platformType: number;
        status: number;  // 🔥 新增状态字段
    } | null {
        try {
            const cookieFilename = path.basename(cookieFile);
            const db = this.getDatabase();

            // 🔥 查询时增加 status 字段
            const stmt = db.prepare('SELECT userName, type, status FROM user_info WHERE filePath = ?');
            const result = stmt.get(cookieFilename) as any;

            if (result) {
                const { userName, type: platformType, status } = result;
                const platformMap: Record<number, string> = {
                    1: 'xiaohongshu',
                    2: 'wechat',
                    3: 'douyin',
                    4: 'kuaishou'
                };

                return {
                    username: userName,
                    platform: platformMap[platformType] || 'unknown',
                    platformType: platformType,
                    status: status  // 🔥 直接返回数据库中的状态
                };
            }

            return null;
        } catch (e) {
            console.error(`⚠️ 获取账号信息失败:`, e);
            return null;
        }
    }

    /**
     * 🔥 保存完整账号信息到数据库（改进版）
     */
    static saveAccountToDatabase(
        accountName: string,  // 🔥 改为使用真实账号名
        platformType: number,
        cookieFile: string,
        accountInfo?: AccountInfo
    ): boolean {
        try {
            const db = this.getDatabase();

            // 🔥 插入完整账号信息
            if (accountInfo) {
                const stmt = db.prepare(`
                    INSERT INTO user_info (
                        type, filePath, userName, status, 
                        account_id, real_name, followers_count, videos_count, 
                        bio, avatar_url, local_avatar, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `);
                
                stmt.run(
                    platformType,
                    path.basename(cookieFile),
                    accountName,  // 🔥 使用真实账号名
                    1,
                    accountInfo.accountId || null,
                    accountInfo.accountName || accountName,
                    accountInfo.followersCount || null,
                    accountInfo.videosCount || null,
                    accountInfo.bio || null,
                    accountInfo.avatar || null,
                    accountInfo.localAvatar || null
                );

                console.log(`✅ 完整账号信息已保存: ${accountInfo.accountName} (粉丝: ${accountInfo.followersCount})`);
            } else {
                const stmt = db.prepare(`
                    INSERT INTO user_info (
                        type, filePath, userName, status, updated_at
                    ) VALUES (?, ?, ?, ?, datetime('now'))
                `);
                
                stmt.run(
                    platformType,
                    path.basename(cookieFile),
                    accountName,  // 🔥 使用真实账号名
                    1
                );

                console.log(`⚠️ 仅保存基础登录信息: ${accountName}`);
            }

            return true;

        } catch (error) {
            console.error(`❌ 保存账号信息失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 获取指定分组的账号列表
     */
    static getAccountsByGroup(groupId?: number): Array<any> {
        try {
            const db = this.getDatabase();

            let sql = `
                SELECT u.*, g.name as group_name, g.color as group_color
                FROM user_info u
                LEFT JOIN account_groups g ON u.group_id = g.id
            `;
            const params: any[] = [];

            if (groupId !== undefined) {
                if (groupId === 0) {
                    // 未分组账号
                    sql += ' WHERE u.group_id IS NULL';
                } else {
                    sql += ' WHERE u.group_id = ?';
                    params.push(groupId);
                }
            }

            sql += ' ORDER BY u.updated_at DESC';

            const stmt = db.prepare(sql);
            const accounts = stmt.all(...params);

            return accounts as any[];

        } catch (error) {
            console.error('❌ 获取账号列表失败:', error);
            return [];
        }
    }

    /**
     * 获取平台类型映射
     */
    static getPlatformType(platform: string): number {
        const typeMap: Record<string, number> = {
            'xiaohongshu': 1,
            'wechat': 2,
            'douyin': 3,
            'kuaishou': 4
        };
        return typeMap[platform] || 0;
    }

    /**
     * 获取平台名称
     */
    static getPlatformName(platformType: number): string {
        const nameMap: Record<number, string> = {
            1: 'xiaohongshu',
            2: 'wechat',
            3: 'douyin',
            4: 'kuaishou'
        };
        return nameMap[platformType] || 'unknown';
    }

    /**
     * 🔥 根据ID获取单个账号信息 - 返回标准格式
     */
    static getAccountById(accountId: number): { success: boolean, message: string, data?: any } {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT id, type, filePath, userName, status, last_check_time
                FROM user_info 
                WHERE id = ?
            `);
            
            const account = stmt.get(accountId);
            
            if (!account) {
                return {
                    success: false,
                    message: `账号不存在: ID ${accountId}`
                };
            }

            return {
                success: true,
                message: '账号找到',
                data: account
            };

        } catch (error) {
            console.error('❌ 获取账号信息失败:', error);
            return {
                success: false,
                message: `查找失败: ${error instanceof Error ? error.message : 'unknown error'}`
            };
        }
    }

    /**
     * 🔥 批量获取账号信息
     */
    static getAccountsByIds(accountIds: number[]): any[] {
        try {
            if (accountIds.length === 0) return [];

            const db = this.getDatabase();
            const placeholders = accountIds.map(() => '?').join(',');

            const stmt = db.prepare(`
                SELECT id, type, filePath, userName, status, last_check_time
                FROM user_info 
                WHERE id IN (${placeholders})
            `);
            
            const accounts = stmt.all(...accountIds);
            return accounts as any[];

        } catch (error) {
            console.error('❌ 批量获取账号信息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 根据账号ID更新验证状态
     */
    static updateValidationStatusById(
        accountId: number,
        isValid: boolean,
        validationTime?: string
    ): boolean {
        try {
            const db = this.getDatabase();
            const currentTime = validationTime || new Date().toISOString();

            const stmt = db.prepare(`
                UPDATE user_info 
                SET status = ?, last_check_time = ?
                WHERE id = ?
            `);
            
            const result = stmt.run(isValid ? 1 : 0, currentTime, accountId);

            if (result.changes > 0) {
                console.log(`✅ 验证状态已更新: 账号ID ${accountId} -> ${isValid ? '有效' : '无效'}`);
                return true;
            } else {
                console.warn(`⚠️ 未找到要更新的账号: ID ${accountId}`);
                return false;
            }

        } catch (error) {
            console.error('❌ 更新验证状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 批量更新验证状态（事务处理）
     */
    static batchUpdateValidationStatus(updates: Array<{
        accountId: number,
        isValid: boolean,
        validationTime?: string
    }>): number {
        try {
            if (updates.length === 0) return 0;

            const db = this.getDatabase();
            const currentTime = new Date().toISOString();
            let updatedCount = 0;

            // 使用事务确保数据一致性
            const transaction = db.transaction(() => {
                const stmt = db.prepare(`
                    UPDATE user_info 
                    SET status = ?, last_check_time = ?
                    WHERE id = ?
                `);

                for (const update of updates) {
                    const time = update.validationTime || currentTime;
                    const result = stmt.run(update.isValid ? 1 : 0, time, update.accountId);

                    if (result.changes > 0) {
                        updatedCount++;
                    }
                }
            });

            transaction();
            console.log(`✅ 批量验证状态更新完成: ${updatedCount}/${updates.length} 个账号`);

            return updatedCount;

        } catch (error) {
            console.error('❌ 批量更新验证状态失败:', error);
            return 0;
        }
    }

    // ==================== 批量操作相关方法 ====================

    /**
     * 🔥 批量更新账号状态
     */
    static batchUpdateAccountStatus(updates: Array<{
        filePath: string,
        status: number,
        lastCheckTime: string
    }>): number {
        try {
            const db = this.getDatabase();
            let updatedCount = 0;

            const stmt = db.prepare(`
                UPDATE user_info 
                SET status = ?, last_check_time = ?
                WHERE filePath = ?
            `);

            for (const update of updates) {
                const result = stmt.run(update.status, update.lastCheckTime, update.filePath);
                if (result.changes > 0) {
                    updatedCount++;
                }
            }

            console.log(`✅ 批量更新完成: ${updatedCount}/${updates.length} 个账号状态已更新`);
            return updatedCount;

        } catch (error) {
            console.error('❌ 批量更新账号状态失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 清理过期数据
     */
    static async cleanupExpiredData(maxAgeHours: number = 720): Promise<void> {
        try {
            const db = this.getDatabase();
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

            // 清理过期的文件记录（可选）
            const stmt = db.prepare(`
                DELETE FROM file_records 
                WHERE upload_time < ? AND id NOT IN (
                    SELECT DISTINCT file_id FROM some_usage_table WHERE file_id IS NOT NULL
                )
            `);
            
            const result = stmt.run(cutoffTime);

            if (result.changes > 0) {
                console.log(`🧹 清理完成: 删除了 ${result.changes} 条过期记录`);
            }

        } catch (error) {
            console.error('❌ 清理过期数据失败:', error);
        }
    }

    // ==================== 统计相关方法 ====================

    /**
     * 🔥 获取数据统计信息
     */
    static getStatistics(): {
        totalAccounts: number,
        validAccounts: number,
        totalGroups: number,
        totalFiles: number,
        platformStats: Record<string, number>
    } {
        try {
            const db = this.getDatabase();

            // 基本统计
            const totalAccounts = db.prepare("SELECT COUNT(*) as count FROM user_info").get() as { count: number };
            const validAccounts = db.prepare("SELECT COUNT(*) as count FROM user_info WHERE status = 1").get() as { count: number };
            const totalGroups = db.prepare("SELECT COUNT(*) as count FROM account_groups").get() as { count: number };
            const totalFiles = db.prepare("SELECT COUNT(*) as count FROM file_records").get() as { count: number };

            // 平台统计
            const platformStatsRaw = db.prepare(`
                SELECT type, COUNT(*) as count 
                FROM user_info 
                GROUP BY type
            `).all() as Array<{ type: number; count: number }>;

            const platformStats: Record<string, number> = {};
            for (const row of platformStatsRaw) {
                const platformName = this.getPlatformName(row.type);
                platformStats[platformName] = row.count;
            }

            return {
                totalAccounts: totalAccounts.count,
                validAccounts: validAccounts.count,
                totalGroups: totalGroups.count,
                totalFiles: totalFiles.count,
                platformStats
            };

        } catch (error) {
            console.error('❌ 获取统计信息失败:', error);
            return {
                totalAccounts: 0,
                validAccounts: 0,
                totalGroups: 0,
                totalFiles: 0,
                platformStats: {}
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
                console.log('✅ 数据库连接已关闭 (AccountStorage)');
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