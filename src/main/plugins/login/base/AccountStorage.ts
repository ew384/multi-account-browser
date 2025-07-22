// src/main/plugins/login/base/AccountStorage.ts
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AccountInfo } from '../../../../types/pluginInterface';
import { Config } from '../../../config/Config';

const dbPath = path.join(app.getPath('userData'), 'database.db');

interface DbAccountInfo {
    username: string;
    platform: string;
    platformType: number;
}

export class AccountStorage {

    /**
     * 生成Cookie文件名
     * 对应 Python 的 uuid.uuid1()
     */
    static generateCookieFileName(): string {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}_${random}.json`;
    }

    /**
     * 🔥 从数据库获取账号信息 (迁移自 TabManager)
     * 对应 Python 的 get_account_info_from_db
     */
    static async getAccountInfoFromDb(cookieFile: string): Promise<DbAccountInfo | null> {
        try {
            const cookieFilename = path.basename(cookieFile);

            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            const result = await db.get(
                'SELECT userName, type FROM user_info WHERE filePath = ?',
                [cookieFilename]
            );

            await db.close();

            if (result) {
                const { userName, type: platformType } = result;
                const platformMap: Record<number, string> = {
                    1: 'xiaohongshu',
                    2: 'wechat', // 注意：这里改为 wechat 而不是 weixin
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
     * 🔥 保存完整账号信息到数据库
     * 对应 Python 的 save_complete_account_info
     */
    static async saveAccountToDatabase(
        userId: string,
        platformType: number,
        cookieFile: string,
        accountInfo?: AccountInfo
    ): Promise<boolean> {
        try {
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            // 🔥 检查并添加新字段（如果不存在）
            const tableInfo = await db.all("PRAGMA table_info(user_info)");
            const existingColumns = tableInfo.map((col: any) => col.name);

            const newColumns = {
                'account_id': 'TEXT',
                'real_name': 'TEXT',
                'followers_count': 'INTEGER',
                'videos_count': 'INTEGER',
                'bio': 'TEXT',
                'avatar_url': 'TEXT',
                'local_avatar': 'TEXT',
                'updated_at': 'TEXT'
            };

            for (const [columnName, columnType] of Object.entries(newColumns)) {
                if (!existingColumns.includes(columnName)) {
                    try {
                        await db.exec(`ALTER TABLE user_info ADD COLUMN ${columnName} ${columnType}`);
                        console.log(`✅ 添加数据库字段: ${columnName}`);
                    } catch (error) {
                        // 字段可能已存在，忽略错误
                        console.warn(`⚠️ 添加字段失败 ${columnName}:`, error);
                    }
                }
            }

            // 🔥 插入完整账号信息
            if (accountInfo) {
                // 有账号信息：插入完整数据
                await db.run(`
                    INSERT INTO user_info (
                        type, filePath, userName, status, 
                        account_id, real_name, followers_count, videos_count, 
                        bio, avatar_url, local_avatar, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `, [
                    platformType,
                    path.basename(cookieFile), // 只存文件名
                    userId,
                    1, // 状态：有效
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
                // 无账号信息：只插入基础数据
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
     * 🔥 更新账号信息
     */
    static async updateAccountInfo(cookieFile: string, accountInfo: Partial<AccountInfo>): Promise<boolean> {
        try {
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            const cookieFilename = path.basename(cookieFile);

            // 构建更新字段
            const updateFields: string[] = [];
            const updateValues: any[] = [];

            if (accountInfo.accountName) {
                updateFields.push('real_name = ?');
                updateValues.push(accountInfo.accountName);
            }

            if (accountInfo.followersCount !== undefined) {
                updateFields.push('followers_count = ?');
                updateValues.push(accountInfo.followersCount);
            }

            if (accountInfo.videosCount !== undefined) {
                updateFields.push('videos_count = ?');
                updateValues.push(accountInfo.videosCount);
            }

            if (accountInfo.bio) {
                updateFields.push('bio = ?');
                updateValues.push(accountInfo.bio);
            }

            if (accountInfo.avatar) {
                updateFields.push('avatar_url = ?');
                updateValues.push(accountInfo.avatar);
            }

            if (accountInfo.localAvatar) {
                updateFields.push('local_avatar = ?');
                updateValues.push(accountInfo.localAvatar);
            }

            if (updateFields.length > 0) {
                updateFields.push('updated_at = datetime(\'now\')');
                updateValues.push(cookieFilename);

                const sql = `UPDATE user_info SET ${updateFields.join(', ')} WHERE filePath = ?`;
                await db.run(sql, updateValues);

                console.log(`✅ 账号信息已更新: ${cookieFilename}`);
            }

            await db.close();
            return true;

        } catch (error) {
            console.error(`❌ 更新账号信息失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 验证Cookie文件是否存在
     */
    static async verifyCookieFile(cookieFile: string): Promise<boolean> {
        try {
            const cookiePath = path.isAbsolute(cookieFile)
                ? cookieFile
                : path.join(Config.COOKIE_DIR, cookieFile);

            await fs.promises.access(cookiePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 🔥 删除账号信息（从数据库和文件系统）
     */
    static async deleteAccount(cookieFile: string): Promise<boolean> {
        try {
            const cookieFilename = path.basename(cookieFile);

            // 删除数据库记录
            const db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            await db.run('DELETE FROM user_info WHERE filePath = ?', [cookieFilename]);
            await db.close();

            // 删除Cookie文件
            const cookiePath = path.join(Config.COOKIE_DIR, cookieFilename);
            try {
                await fs.promises.unlink(cookiePath);
            } catch {
                // 文件可能不存在，忽略错误
            }

            console.log(`🗑️ 账号已删除: ${cookieFilename}`);
            return true;

        } catch (error) {
            console.error(`❌ 删除账号失败:`, error);
            return false;
        }
    }

    /**
     * 🔥 获取平台类型映射
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
     * 🔥 获取平台名称
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