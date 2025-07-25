// src/main/plugins/login/base/AccountStorage.ts 扩展版 - 第一阶段实现

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

import * as fs from 'fs';
import * as path from 'path';
import { AccountInfo } from '../../../../types/pluginInterface';
import { Config } from '../../../config/Config';

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

export class AccountStorage {

    /**
     * 🔥 数据库初始化 - 对应 Python 的 createTable.py
     */
    static async initializeDatabase(): Promise<void> {
        // 防止重复初始化
        if (dbInitialized) {
            console.log('✅ 数据库已初始化，跳过');
            return;
        }

        if (dbInitializing) {
            console.log('⏳ 数据库正在初始化中，等待完成...');
            // 等待初始化完成
            while (dbInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        dbInitializing = true;

        try {
            console.log('🚀 开始初始化数据库...');

            // 确保数据库目录存在
            await fs.promises.mkdir(Config.DB_DIR, { recursive: true });

            // 确保视频文件目录存在
            await fs.promises.mkdir(Config.VIDEO_DIR, { recursive: true });

            const db = await open({
                filename: Config.DB_PATH,
                driver: sqlite3.Database
            });

            // 🔥 创建分组表
            await db.exec(`
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
            await db.exec(`
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
            await db.exec(`
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
            await db.exec(`
                CREATE INDEX IF NOT EXISTS idx_user_info_type ON user_info(type);
                CREATE INDEX IF NOT EXISTS idx_user_info_filepath ON user_info(filePath);
                CREATE INDEX IF NOT EXISTS idx_user_info_group ON user_info(group_id);
                CREATE INDEX IF NOT EXISTS idx_file_records_filename ON file_records(filename);
            `);
            console.log('✅ 数据库索引创建成功');

            // 🔥 插入默认分组数据
            await this.insertDefaultGroups(db);

            // 🔥 显示数据库信息
            await this.showDatabaseInfo(db);

            await db.close();

            dbInitialized = true;
            console.log('🎉 数据库初始化完成！');

        } catch (error) {
            console.error('❌ 数据库初始化失败:', error);
            throw error;
        } finally {
            dbInitializing = false;
        }
    }

    /**
     * 🔥 插入默认分组数据
     */
    private static async insertDefaultGroups(db: Database): Promise<void> {
        const defaultGroups = [
            { name: '微信视频号', description: '微信视频号账号分组', color: '#10B981', icon: 'Video', sortOrder: 1 },
            { name: '抖音', description: '抖音账号分组', color: '#EF4444', icon: 'Music', sortOrder: 2 },
            { name: '快手', description: '快手账号分组', color: '#F59E0B', icon: 'Zap', sortOrder: 3 },
            { name: '小红书', description: '小红书账号分组', color: '#EC4899', icon: 'Heart', sortOrder: 4 }
        ];

        let insertedCount = 0;

        for (const group of defaultGroups) {
            try {
                await db.run(`
                    INSERT OR IGNORE INTO account_groups (name, description, color, icon, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                `, [group.name, group.description, group.color, group.icon, group.sortOrder]);

                // 检查是否插入成功
                const result = await db.get('SELECT changes() as changes');
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
    private static async showDatabaseInfo(db: Database): Promise<void> {
        try {
            console.log('\n📋 数据库表结构信息:');

            const tables = ['account_groups', 'user_info', 'file_records'];

            for (const table of tables) {
                console.log(`\n📊 ${table} 表结构:`);
                const columns = await db.all(`PRAGMA table_info(${table})`);
                for (const col of columns) {
                    console.log(`   ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'}`);
                }
            }

            // 显示统计信息
            const groupsCount = await db.get("SELECT COUNT(*) as count FROM account_groups");
            const usersCount = await db.get("SELECT COUNT(*) as count FROM user_info");
            const filesCount = await db.get("SELECT COUNT(*) as count FROM file_records");

            console.log(`\n📈 数据库统计:`);
            console.log(`   分组数量: ${groupsCount.count}`);
            console.log(`   账号数量: ${usersCount.count}`);
            console.log(`   文件数量: ${filesCount.count}`);
            console.log(`   数据库文件: ${Config.DB_PATH}`);

        } catch (error) {
            console.warn('⚠️ 显示数据库信息失败:', error);
        }
    }

    /**
     * 🔥 检查数据库是否已初始化
     */
    static async isDatabaseInitialized(): Promise<boolean> {
        try {
            // 检查数据库文件是否存在
            if (!fs.existsSync(Config.DB_PATH)) {
                return false;
            }

            // 检查必要的表是否存在
            const db = await open({
                filename: Config.DB_PATH,
                driver: sqlite3.Database
            });

            const requiredTables = ['account_groups', 'user_info', 'file_records'];

            for (const table of requiredTables) {
                const result = await db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [table]
                );

                if (!result) {
                    console.log(`❌ 表 ${table} 不存在`);
                    await db.close();
                    return false;
                }
            }

            await db.close();
            console.log('✅ 数据库已正确初始化');
            dbInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ 检查数据库状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 确保数据库已初始化（应用启动时调用）
     */
    static async ensureDatabaseInitialized(): Promise<void> {
        console.log('🔍 检查数据库初始化状态...');

        const isInitialized = await this.isDatabaseInitialized();

        if (!isInitialized) {
            console.log('🔧 数据库未初始化，开始初始化...');
            await this.initializeDatabase();
        } else {
            console.log('✅ 数据库已初始化');
            dbInitialized = true;
        }
    }

    /**
     * 🔥 获取数据库连接（内部使用）
     */
    static async getDatabase(): Promise<Database> {
        // 确保数据库已初始化
        if (!dbInitialized) {
            await this.ensureDatabaseInitialized();
        }

        return await open({
            filename: Config.DB_PATH,
            driver: sqlite3.Database
        });
    }

    // ==================== 账号管理相关方法 ====================

    /**
     * 🔥 获取有效账号列表 - 对应 Python 的 getValidAccounts
     * 注意：不包含验证逻辑，纯数据库查询，返回前端格式
     */
    static async getValidAccountsForFrontend(): Promise<any[]> {
        try {
            const db = await this.getDatabase();

            const accounts = await db.all(`
            SELECT id, type, filePath, userName, status, last_check_time, check_interval 
            FROM user_info
        `);

            await db.close();

            const results = [];

            for (const row of accounts) {
                const { id: user_id, type: type_val, filePath: file_path, userName: user_name, status } = row;

                // 构建前端期望的账号格式（不进行验证，只返回数据库状态）
                const account = {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    name: user_name,
                    userName: user_name,
                    platform: PLATFORM_TYPE_MAP[type_val] || '未知',
                    status: status === 1 ? '正常' : '异常',
                    avatar: '/default-avatar.png'
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
    static async getAccountsWithGroupsForFrontend(forceCheck: boolean = false): Promise<any[]> {
        try {
            const db = await this.getDatabase();

            const accounts = await db.all(`
                SELECT u.id, u.type, u.filePath, u.userName, u.status, u.group_id, 
                       u.last_check_time, u.check_interval, 
                       g.name as group_name, g.color as group_color, g.icon as group_icon
                FROM user_info u
                LEFT JOIN account_groups g ON u.group_id = g.id
            `);

            await db.close();

            const currentTime = new Date();
            const results = [];

            for (const row of accounts) {
                const {
                    id: user_id, type: type_val, filePath: file_path, userName: user_name,
                    status, group_id, last_check_time, check_interval,
                    group_name, group_color, group_icon
                } = row;

                // 构建前端期望的账号格式（含分组信息）
                const account = {
                    id: user_id,
                    type: type_val,
                    filePath: file_path,
                    name: user_name,
                    userName: user_name,
                    platform: PLATFORM_TYPE_MAP[type_val] || '未知',
                    status: status === 1 ? '正常' : '异常',
                    avatar: '/default-avatar.png',
                    // 分组相关字段
                    group_id: group_id,
                    group_name: group_name,
                    group_color: group_color,
                    group_icon: group_icon
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
    static async deleteAccount(accountId: number): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const db = await this.getDatabase();

            // 查询要删除的记录
            const record = await db.get("SELECT * FROM user_info WHERE id = ?", [accountId]);

            if (!record) {
                await db.close();
                return {
                    success: false,
                    message: "account not found"
                };
            }

            // 删除数据库记录
            await db.run("DELETE FROM user_info WHERE id = ?", [accountId]);
            await db.close();

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
    static async updateUserinfo(updateData: { id: number, type?: number, userName?: string }): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const { id: user_id, type, userName } = updateData;

            if (!user_id) {
                return {
                    success: false,
                    message: "账号ID不能为空"
                };
            }

            const db = await this.getDatabase();

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

            if (updateFields.length === 0) {
                await db.close();
                return {
                    success: false,
                    message: "没有提供要更新的字段"
                };
            }

            updateValues.push(user_id);

            const sql = `UPDATE user_info SET ${updateFields.join(', ')} WHERE id = ?`;
            await db.run(sql, updateValues);
            await db.close();

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

    /**
     * 🔥 添加账号 - 基础添加功能
     */
    static async addAccount(accountData: {
        type: number,
        filePath: string,
        userName: string,
        status?: number,
        group_id?: number
    }): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const { type, filePath, userName, status = 0, group_id } = accountData;

            if (!type || !filePath || !userName) {
                return {
                    success: false,
                    message: "type, filePath, userName 是必需字段"
                };
            }

            const db = await this.getDatabase();

            const result = await db.run(`
                INSERT INTO user_info (type, filePath, userName, status, group_id, updated_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `, [type, filePath, userName, status, group_id]);

            await db.close();

            return {
                success: true,
                message: "账号添加成功",
                data: { id: result.lastID }
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
    static async getAllGroups(): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const db = await this.getDatabase();

            const groups = await db.all(`
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

            await db.close();

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
    static async createGroup(groupData: {
        name: string,
        description?: string,
        color?: string,
        icon?: string,
        sort_order?: number
    }): Promise<{ success: boolean, message: string, data?: any }> {
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

            const db = await this.getDatabase();

            try {
                const result = await db.run(`
                    INSERT INTO account_groups (name, description, color, icon, sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [name, description, color, icon, sort_order]);

                await db.close();

                return {
                    success: true,
                    message: "分组创建成功",
                    data: { id: result.lastID }
                };

            } catch (sqlError: any) {
                await db.close();

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
    static async updateGroup(updateData: {
        id: number,
        name?: string,
        description?: string,
        color?: string,
        icon?: string,
        sort_order?: number
    }): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const { id: group_id, name, description, color, icon, sort_order } = updateData;

            if (!group_id) {
                return {
                    success: false,
                    message: "分组ID不能为空"
                };
            }

            const db = await this.getDatabase();

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
                await db.close();
                return {
                    success: false,
                    message: "没有提供要更新的字段"
                };
            }

            updateFields.push('updated_at = datetime(\'now\')');
            updateValues.push(group_id);

            try {
                const sql = `UPDATE account_groups SET ${updateFields.join(', ')} WHERE id = ?`;
                await db.run(sql, updateValues);
                await db.close();

                return {
                    success: true,
                    message: "分组更新成功",
                    data: null
                };

            } catch (sqlError: any) {
                await db.close();

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
    static async deleteGroup(groupId: number): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const db = await this.getDatabase();

            // 先将该分组的账号设为未分组
            await db.run('UPDATE user_info SET group_id = NULL WHERE group_id = ?', [groupId]);

            // 删除分组
            await db.run('DELETE FROM account_groups WHERE id = ?', [groupId]);
            await db.close();

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
    static async updateAccountGroup(updateData: {
        account_id: number,
        group_id?: number | null
    }): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const { account_id, group_id } = updateData;

            if (!account_id) {
                return {
                    success: false,
                    message: "账号ID不能为空"
                };
            }

            const db = await this.getDatabase();

            await db.run(`
                UPDATE user_info
                SET group_id = ?
                WHERE id = ?
            `, [group_id, account_id]);

            await db.close();

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
    static async getAllMaterials(): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const db = await this.getDatabase();

            const files = await db.all("SELECT * FROM file_records");
            await db.close();

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
    static async saveMaterial(materialData: {
        filename: string,
        final_filename: string,
        filesize: number,
        file_path: string
    }): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const { filename, final_filename, filesize, file_path } = materialData;

            const db = await this.getDatabase();

            await db.run(`
                INSERT INTO file_records (filename, filesize, file_path)
                VALUES (?, ?, ?)
            `, [filename, Math.round(filesize * 100) / 100, final_filename]);

            await db.close();

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
    static async deleteMaterial(fileId: number): Promise<{ success: boolean, message: string, data?: any }> {
        try {
            const db = await this.getDatabase();

            // 查询要删除的记录
            const record = await db.get("SELECT * FROM file_records WHERE id = ?", [fileId]);

            if (!record) {
                await db.close();
                return {
                    success: false,
                    message: "File not found"
                };
            }

            // 删除数据库记录
            await db.run("DELETE FROM file_records WHERE id = ?", [fileId]);
            await db.close();

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
    static async updateValidationStatus(cookieFile: string, isValid: boolean, validationTime: string): Promise<boolean> {
        try {
            const db = await this.getDatabase();

            // 使用 path.basename 提取文件名
            const fileName = path.basename(cookieFile);

            const result = await db.run(`
                UPDATE user_info 
                SET status = ?, last_check_time = ?
                WHERE filePath = ?
            `, [isValid ? 1 : 0, validationTime, fileName]);

            await db.close();

            if (result.changes && result.changes > 0) {
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
     * 🔥 获取需要重新验证的有效账号（优化版）
     */
    static async getValidAccountsNeedingRevalidation(): Promise<Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        lastCheckTime: string;
    }>> {
        try {
            const db = await this.getDatabase();

            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

            const accounts = await db.all(`
            SELECT 
                id, type, filePath, userName,
                last_check_time as lastCheckTime
            FROM user_info 
            WHERE status = 1  -- 当前有效的账号
              AND (
                  last_check_time IS NULL 
                  OR last_check_time < ?
              )
            ORDER BY last_check_time ASC
        `, [oneHourAgo]);

            await db.close();

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
    static async getValidAccounts(): Promise<Array<{
        id: number;
        type: number;
        filePath: string;
        userName: string;
        platform: string;
        status: number;
        lastCheckTime: string;
    }>> {
        try {
            const db = await this.getDatabase();

            const accounts = await db.all(`
                SELECT 
                    id, type, filePath, userName, status,
                    last_check_time as lastCheckTime
                FROM user_info 
                WHERE status = 1
                ORDER BY last_check_time DESC
            `);

            await db.close();

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
    static async getAccountsWithGroups(): Promise<Array<{
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
    }>> {
        try {
            const db = await this.getDatabase();

            const accounts = await db.all(`
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

            await db.close();

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
     * 🔥 从数据库获取账号信息（改进版）
     */
    static async getAccountInfoFromDb(cookieFile: string): Promise<{ username: string; platform: string; platformType: number } | null> {
        try {
            const cookieFilename = path.basename(cookieFile);
            const db = await this.getDatabase();

            const result = await db.get(
                'SELECT userName, type FROM user_info WHERE filePath = ?',
                [cookieFilename]
            );

            await db.close();

            if (result) {
                const { userName, type: platformType } = result;
                const platformMap: Record<number, string> = {
                    1: 'xiaohongshu',
                    2: 'wechat',
                    3: 'douyin',
                    4: 'kuaishou'
                };

                return {
                    username: userName,
                    platform: platformMap[platformType] || 'unknown',
                    platformType: platformType
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
    static async saveAccountToDatabase(
        userId: string,
        platformType: number,
        cookieFile: string,
        accountInfo?: AccountInfo
    ): Promise<boolean> {
        try {
            const db = await this.getDatabase();

            // 🔥 插入完整账号信息
            if (accountInfo) {
                await db.run(`
                    INSERT INTO user_info (
                        type, filePath, userName, status, 
                        account_id, real_name, followers_count, videos_count, 
                        bio, avatar_url, local_avatar, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `, [
                    platformType,
                    path.basename(cookieFile),
                    userId,
                    1,
                    accountInfo.accountId || null,
                    accountInfo.accountName || userId,
                    accountInfo.followersCount || null,
                    accountInfo.videosCount || null,
                    accountInfo.bio || null,
                    accountInfo.avatar || null,
                    accountInfo.localAvatar || null
                ]);

                console.log(`✅ 完整账号信息已保存: ${accountInfo.accountName} (粉丝: ${accountInfo.followersCount})`);
            } else {
                await db.run(`
                    INSERT INTO user_info (
                        type, filePath, userName, status, updated_at
                    ) VALUES (?, ?, ?, ?, datetime('now'))
                `, [
                    platformType,
                    path.basename(cookieFile),
                    userId,
                    1
                ]);

                console.log(`⚠️ 仅保存基础登录信息: ${userId}`);
            }

            await db.close();
            return true;

        } catch (error) {
            console.error(`❌ 保存账号信息失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 获取指定分组的账号列表
     */
    static async getAccountsByGroup(groupId?: number): Promise<Array<any>> {
        try {
            const db = await this.getDatabase();

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

            const accounts = await db.all(sql, params);
            await db.close();

            return accounts;

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
     * 🔥 根据ID获取单个账号信息
     */
    static async getAccountById(accountId: number): Promise<any | null> {
        try {
            const db = await this.getDatabase();

            const account = await db.get(`
            SELECT id, type, filePath, userName, status, last_check_time
            FROM user_info 
            WHERE id = ?
        `, [accountId]);

            await db.close();

            return account || null;

        } catch (error) {
            console.error('❌ 获取账号信息失败:', error);
            return null;
        }
    }

    /**
     * 🔥 批量获取账号信息
     */
    static async getAccountsByIds(accountIds: number[]): Promise<any[]> {
        try {
            if (accountIds.length === 0) return [];

            const db = await this.getDatabase();
            const placeholders = accountIds.map(() => '?').join(',');

            const accounts = await db.all(`
            SELECT id, type, filePath, userName, status, last_check_time
            FROM user_info 
            WHERE id IN (${placeholders})
        `, accountIds);

            await db.close();

            return accounts;

        } catch (error) {
            console.error('❌ 批量获取账号信息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 根据账号ID更新验证状态
     */
    static async updateValidationStatusById(
        accountId: number,
        isValid: boolean,
        validationTime?: string
    ): Promise<boolean> {
        try {
            const db = await this.getDatabase();
            const currentTime = validationTime || new Date().toISOString();

            const result = await db.run(`
            UPDATE user_info 
            SET status = ?, last_check_time = ?
            WHERE id = ?
        `, [isValid ? 1 : 0, currentTime, accountId]);

            await db.close();

            if (result.changes && result.changes > 0) {
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
    static async batchUpdateValidationStatus(updates: Array<{
        accountId: number,
        isValid: boolean,
        validationTime?: string
    }>): Promise<number> {
        try {
            if (updates.length === 0) return 0;

            const db = await this.getDatabase();
            const currentTime = new Date().toISOString();
            let updatedCount = 0;

            // 使用事务确保数据一致性
            await db.run('BEGIN TRANSACTION');

            try {
                for (const update of updates) {
                    const time = update.validationTime || currentTime;
                    const result = await db.run(`
                    UPDATE user_info 
                    SET status = ?, last_check_time = ?
                    WHERE id = ?
                `, [update.isValid ? 1 : 0, time, update.accountId]);

                    if (result.changes && result.changes > 0) {
                        updatedCount++;
                    }
                }

                await db.run('COMMIT');
                console.log(`✅ 批量验证状态更新完成: ${updatedCount}/${updates.length} 个账号`);

            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            } finally {
                await db.close();
            }

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
    static async batchUpdateAccountStatus(updates: Array<{
        filePath: string,
        status: number,
        lastCheckTime: string
    }>): Promise<number> {
        try {
            const db = await this.getDatabase();
            let updatedCount = 0;

            for (const update of updates) {
                const result = await db.run(`
                    UPDATE user_info 
                    SET status = ?, last_check_time = ?
                    WHERE filePath = ?
                `, [update.status, update.lastCheckTime, update.filePath]);

                if (result.changes && result.changes > 0) {
                    updatedCount++;
                }
            }

            await db.close();
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
            const db = await this.getDatabase();
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

            // 清理过期的文件记录（可选）
            const result = await db.run(`
                DELETE FROM file_records 
                WHERE upload_time < ? AND id NOT IN (
                    SELECT DISTINCT file_id FROM some_usage_table WHERE file_id IS NOT NULL
                )
            `, [cutoffTime]);

            await db.close();

            if (result.changes && result.changes > 0) {
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
    static async getStatistics(): Promise<{
        totalAccounts: number,
        validAccounts: number,
        totalGroups: number,
        totalFiles: number,
        platformStats: Record<string, number>
    }> {
        try {
            const db = await this.getDatabase();

            // 基本统计
            const totalAccounts = await db.get("SELECT COUNT(*) as count FROM user_info");
            const validAccounts = await db.get("SELECT COUNT(*) as count FROM user_info WHERE status = 1");
            const totalGroups = await db.get("SELECT COUNT(*) as count FROM account_groups");
            const totalFiles = await db.get("SELECT COUNT(*) as count FROM file_records");

            // 平台统计
            const platformStatsRaw = await db.all(`
                SELECT type, COUNT(*) as count 
                FROM user_info 
                GROUP BY type
            `);

            const platformStats: Record<string, number> = {};
            for (const row of platformStatsRaw) {
                const platformName = this.getPlatformName(row.type);
                platformStats[platformName] = row.count;
            }

            await db.close();

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
}