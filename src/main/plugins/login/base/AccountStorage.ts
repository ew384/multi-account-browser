// src/main/plugins/login/base/AccountStorage.ts 扩展版

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AccountInfo } from '../../../../types/pluginInterface';
import { Config } from '../../../config/Config';

// 数据库初始化状态
let dbInitialized = false;
let dbInitializing = false;

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
    private static async getDatabase(): Promise<Database> {
        // 确保数据库已初始化
        if (!dbInitialized) {
            await this.ensureDatabaseInitialized();
        }

        return await open({
            filename: Config.DB_PATH,
            driver: sqlite3.Database
        });
    }

    // 🔥 以下是原有的方法，现在使用新的数据库连接方式

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
     * 🔥 获取所有账号分组
     */
    static async getAllGroups(): Promise<Array<{ id: number, name: string, description: string, color: string, icon: string }>> {
        try {
            const db = await this.getDatabase();

            const groups = await db.all(`
                SELECT id, name, description, color, icon, sort_order 
                FROM account_groups 
                ORDER BY sort_order, name
            `);

            await db.close();
            return groups;

        } catch (error) {
            console.error('❌ 获取账号分组失败:', error);
            return [];
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

    // ... 其他现有方法保持不变 ...

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
}