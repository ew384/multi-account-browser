// src/main/plugins/message/base/MessageStorage.ts
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../../../config/Config';
import { 
    Message, 
    UserMessageThread, 
    MessageStatistics 
} from '../../../../types/pluginInterface';

// 🔥 内部数据库记录类型定义
interface MessageRecord {
    id?: number;
    thread_id: number;
    message_id?: string;
    sender: 'me' | 'user';
    content_type: 'text' | 'image' | 'mixed';
    text_content?: string;
    image_data?: string;  // JSON格式的图片数组
    timestamp: string;
    is_read: number;      // SQLite 使用数字表示布尔值
    created_at?: string;
}

interface ThreadRecord {
    id?: number;
    platform: string;
    account_id: string;
    user_id: string;
    user_name: string;
    user_avatar?: string;
    unread_count: number;
    last_message_time?: string;
    last_sync_time?: string;
    created_at?: string;
    updated_at?: string;
}

interface SyncStatusRecord {
    id?: number;
    platform: string;
    account_id: string;
    last_sync_time?: string;
    sync_count: number;
    last_error?: string;
    updated_at?: string;
}

// 消息数据库初始化状态
let messageDbInitialized = false;
let messageDbInitializing = false;

export class MessageStorage {

    /**
     * 🔥 消息数据库初始化 - 创建消息相关表
     */
    static async initializeDatabase(): Promise<void> {
        // 防止重复初始化
        if (messageDbInitialized) {
            console.log('✅ 消息数据库已初始化，跳过');
            return;
        }

        if (messageDbInitializing) {
            console.log('⏳ 消息数据库正在初始化中，等待完成...');
            while (messageDbInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        messageDbInitializing = true;

        try {
            console.log('🚀 开始初始化消息数据库...');

            // 确保数据库目录存在
            await fs.promises.mkdir(Config.DB_DIR, { recursive: true });

            const db = await open({
                filename: Config.DB_PATH,
                driver: sqlite3.Database
            });

            // 🔥 创建消息线程表
            await db.exec(`
                CREATE TABLE IF NOT EXISTS message_threads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    user_avatar TEXT,
                    unread_count INTEGER DEFAULT 0,
                    last_message_time TEXT,
                    last_sync_time TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(platform, account_id, user_id)
                )
            `);
            console.log('✅ message_threads 表创建成功');

            // 🔥 创建具体消息表
            await db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id INTEGER NOT NULL,
                    message_id TEXT,
                    sender TEXT NOT NULL CHECK(sender IN ('me', 'user')),
                    content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'mixed')),
                    text_content TEXT,
                    image_data TEXT,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
                )
            `);
            console.log('✅ messages 表创建成功');

            // 🔥 创建平台同步状态表
            await db.exec(`
                CREATE TABLE IF NOT EXISTS platform_sync_status (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    last_sync_time TEXT,
                    sync_count INTEGER DEFAULT 0,
                    last_error TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(platform, account_id)
                )
            `);
            console.log('✅ platform_sync_status 表创建成功');

            // 🔥 创建索引以提高查询性能
            await db.exec(`
                CREATE INDEX IF NOT EXISTS idx_message_threads_platform_account ON message_threads(platform, account_id);
                CREATE INDEX IF NOT EXISTS idx_message_threads_user ON message_threads(user_id);
                CREATE INDEX IF NOT EXISTS idx_message_threads_last_message_time ON message_threads(last_message_time);
                CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
                CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
                CREATE INDEX IF NOT EXISTS idx_sync_status_platform_account ON platform_sync_status(platform, account_id);
            `);
            console.log('✅ 消息数据库索引创建成功');

            // 🔥 显示数据库信息
            await MessageStorage.showMessageDatabaseInfo(db);

            await db.close();

            messageDbInitialized = true;
            console.log('🎉 消息数据库初始化完成！');

        } catch (error) {
            console.error('❌ 消息数据库初始化失败:', error);
            throw error;
        } finally {
            messageDbInitializing = false;
        }
    }

    /**
     * 🔥 显示消息数据库信息
     */
    private static async showMessageDatabaseInfo(db: Database): Promise<void> {
        try {
            console.log('\n📋 消息数据库表结构信息:');

            const tables = ['message_threads', 'messages', 'platform_sync_status'];

            for (const table of tables) {
                console.log(`\n📊 ${table} 表结构:`);
                const columns = await db.all(`PRAGMA table_info(${table})`);
                for (const col of columns) {
                    console.log(`   ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'}`);
                }
            }

            // 显示统计信息
            const threadsCount = await db.get("SELECT COUNT(*) as count FROM message_threads");
            const messagesCount = await db.get("SELECT COUNT(*) as count FROM messages");
            const syncStatusCount = await db.get("SELECT COUNT(*) as count FROM platform_sync_status");

            console.log(`\n📈 消息数据库统计:`);
            console.log(`   对话线程数量: ${threadsCount.count}`);
            console.log(`   消息总数: ${messagesCount.count}`);
            console.log(`   同步状态记录: ${syncStatusCount.count}`);

        } catch (error) {
            console.warn('⚠️ 显示消息数据库信息失败:', error);
        }
    }

    /**
     * 🔥 检查消息数据库是否已初始化
     */
    static async isMessageDatabaseInitialized(): Promise<boolean> {
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

            const requiredTables = ['message_threads', 'messages', 'platform_sync_status'];

            for (const table of requiredTables) {
                const result = await db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [table]
                );

                if (!result) {
                    console.log(`❌ 消息表 ${table} 不存在`);
                    await db.close();
                    return false;
                }
            }

            await db.close();
            console.log('✅ 消息数据库已正确初始化');
            messageDbInitialized = true;
            return true;

        } catch (error) {
            console.error('❌ 检查消息数据库状态失败:', error);
            return false;
        }
    }

    /**
     * 🔥 确保消息数据库已初始化
     */
    static async ensureMessageDatabaseInitialized(): Promise<void> {
        console.log('🔍 检查消息数据库初始化状态...');

        const isInitialized = await this.isMessageDatabaseInitialized();

        if (!isInitialized) {
            console.log('🔧 消息数据库未初始化，开始初始化...');
            await this.initializeDatabase();
        } else {
            console.log('✅ 消息数据库已初始化');
            messageDbInitialized = true;
        }
    }

    /**
     * 🔥 获取数据库连接（内部使用）
     */
    static async getDatabase(): Promise<Database> {
        // 确保数据库已初始化
        if (!messageDbInitialized) {
            await this.ensureMessageDatabaseInitialized();
        }

        return await open({
            filename: Config.DB_PATH,
            driver: sqlite3.Database
        });
    }

    // ==================== 对话线程管理方法 ====================

    /**
     * 🔥 保存或更新对话线程
     */
    static async saveOrUpdateThread(threadData: UserMessageThread): Promise<number> {
        try {
            const db = await this.getDatabase();

            const {
                platform,
                account_id,
                user_id,
                user_name,
                avatar,
                unread_count = 0,
                last_message_time,
                last_sync_time
            } = threadData;

            // 使用 INSERT OR REPLACE 来处理新增或更新
            const result = await db.run(`
                INSERT OR REPLACE INTO message_threads (
                    id, platform, account_id, user_id, user_name, user_avatar, 
                    unread_count, last_message_time, last_sync_time, 
                    created_at, updated_at
                ) VALUES (
                    (SELECT id FROM message_threads WHERE platform = ? AND account_id = ? AND user_id = ?),
                    ?, ?, ?, ?, ?, ?, ?, ?, 
                    COALESCE((SELECT created_at FROM message_threads WHERE platform = ? AND account_id = ? AND user_id = ?), CURRENT_TIMESTAMP),
                    CURRENT_TIMESTAMP
                )
            `, [
                platform, account_id, user_id,  // SELECT id
                platform, account_id, user_id, user_name, avatar, 
                unread_count, last_message_time, last_sync_time,
                platform, account_id, user_id   // SELECT created_at
            ]);

            await db.close();

            const threadId = result.lastID!;
            console.log(`✅ 对话线程已保存: ${user_name} (ID: ${threadId})`);
            return threadId;

        } catch (error) {
            console.error('❌ 保存对话线程失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 根据用户获取对话线程
     */
    static async getThreadByUser(platform: string, accountId: string, userId: string): Promise<UserMessageThread | null> {
        try {
            const db = await this.getDatabase();

            const thread = await db.get(`
                SELECT * FROM message_threads 
                WHERE platform = ? AND account_id = ? AND user_id = ?
            `, [platform, accountId, userId]);

            await db.close();

            if (!thread) {
                return null;
            }

            return {
                id: thread.id,
                platform: thread.platform,
                account_id: thread.account_id,
                user_id: thread.user_id,
                user_name: thread.user_name,
                avatar: thread.user_avatar,
                unread_count: thread.unread_count,
                last_message_time: thread.last_message_time,
                last_sync_time: thread.last_sync_time
            };

        } catch (error) {
            console.error('❌ 获取对话线程失败:', error);
            return null;
        }
    }

    /**
     * 🔥 获取指定账号的所有对话线程
     */
    static async getAllThreads(platform: string, accountId: string): Promise<UserMessageThread[]> {
        try {
            const db = await this.getDatabase();

            const threads = await db.all(`
                SELECT t.*, 
                       m.text_content as last_message_text,
                       m.content_type as last_message_type
                FROM message_threads t
                LEFT JOIN messages m ON t.id = m.thread_id AND m.timestamp = t.last_message_time
                WHERE t.platform = ? AND t.account_id = ?
                ORDER BY t.last_message_time DESC NULLS LAST
            `, [platform, accountId]);

            await db.close();

            return threads.map(thread => ({
                id: thread.id,
                platform: thread.platform,
                account_id: thread.account_id,
                user_id: thread.user_id,
                user_name: thread.user_name,
                avatar: thread.user_avatar,
                unread_count: thread.unread_count,
                last_message_time: thread.last_message_time,
                last_sync_time: thread.last_sync_time,
                // 附加最后一条消息信息用于显示
                last_message_text: thread.last_message_text,
                last_message_type: thread.last_message_type
            }));

        } catch (error) {
            console.error('❌ 获取对话线程列表失败:', error);
            return [];
        }
    }

    /**
     * 🔥 更新线程的最后消息时间和未读数
     */
    static async updateThreadStatus(threadId: number, lastMessageTime: string, incrementUnread: boolean = false): Promise<void> {
        try {
            const db = await this.getDatabase();

            if (incrementUnread) {
                await db.run(`
                    UPDATE message_threads 
                    SET last_message_time = ?, 
                        unread_count = unread_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [lastMessageTime, threadId]);
            } else {
                await db.run(`
                    UPDATE message_threads 
                    SET last_message_time = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [lastMessageTime, threadId]);
            }

            await db.close();

        } catch (error) {
            console.error('❌ 更新线程状态失败:', error);
            throw error;
        }
    }

    // ==================== 消息管理方法 ====================

    /**
     * 🔥 批量添加消息
     */
    static async addMessages(threadId: number, messages: Message[]): Promise<void> {
        if (messages.length === 0) return;

        try {
            const db = await this.getDatabase();

            // 使用事务确保数据一致性
            await db.run('BEGIN TRANSACTION');

            try {
                for (const message of messages) {
                    // 检查消息是否已存在（基于时间戳和发送者去重）
                    const existing = await db.get(`
                        SELECT id FROM messages 
                        WHERE thread_id = ? AND timestamp = ? AND sender = ?
                    `, [threadId, message.timestamp, message.sender]);

                    if (existing) {
                        console.log(`⚠️ 消息已存在，跳过: ${message.timestamp}`);
                        continue;
                    }

                    // 处理图片数据
                    let imageData = null;
                    if (message.images && message.images.length > 0) {
                        imageData = JSON.stringify(message.images);
                    }

                    // 确定内容类型
                    let contentType: 'text' | 'image' | 'mixed' = 'text';
                    if (message.images && message.images.length > 0) {
                        contentType = message.text ? 'mixed' : 'image';
                    }

                    await db.run(`
                        INSERT INTO messages (
                            thread_id, message_id, sender, content_type, 
                            text_content, image_data, timestamp, is_read
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        threadId,
                        message.message_id || null,
                        message.sender,
                        contentType,
                        message.text || null,
                        imageData,
                        message.timestamp,
                        message.is_read ? 1 : 0
                    ]);
                }

                // 更新线程的最后消息时间
                const lastMessage = messages[messages.length - 1];
                const isFromUser = lastMessage.sender === 'user';
                await this.updateThreadStatus(threadId, lastMessage.timestamp, isFromUser);

                await db.run('COMMIT');
                console.log(`✅ 成功添加 ${messages.length} 条消息到线程 ${threadId}`);

            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            } finally {
                await db.close();
            }

        } catch (error) {
            console.error('❌ 添加消息失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取对话线程的消息
     */
    static async getThreadMessages(threadId: number, limit: number = 50, offset: number = 0): Promise<Message[]> {
        try {
            const db = await this.getDatabase();

            const messages = await db.all(`
                SELECT * FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            `, [threadId, limit, offset]);

            await db.close();

            return messages.map(msg => ({
                id: msg.id,
                message_id: msg.message_id,
                sender: msg.sender,
                text: msg.text_content,
                images: msg.image_data ? JSON.parse(msg.image_data) : undefined,
                timestamp: msg.timestamp,
                is_read: msg.is_read === 1,
                type: msg.content_type
            }));

        } catch (error) {
            console.error('❌ 获取消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取指定时间之后的消息（增量同步用）
     */
    static async getMessagesAfter(threadId: number, timestamp: string): Promise<Message[]> {
        try {
            const db = await this.getDatabase();

            const messages = await db.all(`
                SELECT * FROM messages 
                WHERE thread_id = ? AND timestamp > ?
                ORDER BY timestamp ASC
            `, [threadId, timestamp]);

            await db.close();

            return messages.map(msg => ({
                id: msg.id,
                message_id: msg.message_id,
                sender: msg.sender,
                text: msg.text_content,
                images: msg.image_data ? JSON.parse(msg.image_data) : undefined,
                timestamp: msg.timestamp,
                is_read: msg.is_read === 1,
                type: msg.content_type
            }));

        } catch (error) {
            console.error('❌ 获取增量消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 标记消息为已读
     */
    static async markMessagesAsRead(threadId: number, messageIds?: number[]): Promise<void> {
        try {
            const db = await this.getDatabase();

            if (messageIds && messageIds.length > 0) {
                // 标记指定消息为已读
                const placeholders = messageIds.map(() => '?').join(',');
                await db.run(`
                    UPDATE messages 
                    SET is_read = 1 
                    WHERE thread_id = ? AND id IN (${placeholders})
                `, [threadId, ...messageIds]);
            } else {
                // 标记该线程所有消息为已读
                await db.run(`
                    UPDATE messages 
                    SET is_read = 1 
                    WHERE thread_id = ?
                `, [threadId]);
            }

            // 重置线程的未读数
            await db.run(`
                UPDATE message_threads 
                SET unread_count = 0 
                WHERE id = ?
            `, [threadId]);

            await db.close();
            console.log(`✅ 消息已标记为已读: 线程 ${threadId}`);

        } catch (error) {
            console.error('❌ 标记消息已读失败:', error);
            throw error;
        }
    }

    // ==================== 同步状态管理方法 ====================

    /**
     * 🔥 更新平台同步时间
     */
    static async updateLastSyncTime(platform: string, accountId: string, syncTime: string): Promise<void> {
        try {
            const db = await this.getDatabase();

            await db.run(`
                INSERT OR REPLACE INTO platform_sync_status (
                    platform, account_id, last_sync_time, sync_count, updated_at
                ) VALUES (
                    ?, ?, ?, 
                    COALESCE((SELECT sync_count + 1 FROM platform_sync_status WHERE platform = ? AND account_id = ?), 1),
                    CURRENT_TIMESTAMP
                )
            `, [platform, accountId, syncTime, platform, accountId]);

            await db.close();
            console.log(`✅ 同步时间已更新: ${platform} - ${accountId}`);

        } catch (error) {
            console.error('❌ 更新同步时间失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取平台最后同步时间
     */
    static async getLastSyncTime(platform: string, accountId: string): Promise<string | null> {
        try {
            const db = await this.getDatabase();

            const result = await db.get(`
                SELECT last_sync_time FROM platform_sync_status 
                WHERE platform = ? AND account_id = ?
            `, [platform, accountId]);

            await db.close();

            return result ? result.last_sync_time : null;

        } catch (error) {
            console.error('❌ 获取同步时间失败:', error);
            return null;
        }
    }

    /**
     * 🔥 记录同步错误
     */
    static async recordSyncError(platform: string, accountId: string, error: string): Promise<void> {
        try {
            const db = await this.getDatabase();

            await db.run(`
                UPDATE platform_sync_status 
                SET last_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE platform = ? AND account_id = ?
            `, [error, platform, accountId]);

            await db.close();
            console.log(`⚠️ 同步错误已记录: ${platform} - ${accountId}`);

        } catch (error) {
            console.error('❌ 记录同步错误失败:', error);
        }
    }

    // ==================== 统计和查询方法 ====================

    /**
     * 🔥 获取未读消息统计
     */
    static async getUnreadCount(platform?: string, accountId?: string): Promise<number> {
        try {
            const db = await this.getDatabase();

            let sql = 'SELECT SUM(unread_count) as total FROM message_threads';
            const params: string[] = [];

            if (platform && accountId) {
                sql += ' WHERE platform = ? AND account_id = ?';
                params.push(platform, accountId);
            } else if (platform) {
                sql += ' WHERE platform = ?';
                params.push(platform);
            }

            const result = await db.get(sql, params);
            await db.close();

            return result.total || 0;

        } catch (error) {
            console.error('❌ 获取未读消息统计失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 获取消息统计信息
     */
    static async getMessageStatistics(): Promise<MessageStatistics> {
        try {
            const db = await this.getDatabase();

            // 基本统计
            const totalThreads = await db.get("SELECT COUNT(*) as count FROM message_threads");
            const totalMessages = await db.get("SELECT COUNT(*) as count FROM messages");
            const unreadMessages = await db.get("SELECT SUM(unread_count) as count FROM message_threads");

            // 按平台统计
            const platformStatsRaw = await db.all(`
                SELECT 
                    t.platform,
                    COUNT(t.id) as threads,
                    COUNT(m.id) as messages,
                    SUM(t.unread_count) as unread
                FROM message_threads t
                LEFT JOIN messages m ON t.id = m.thread_id
                GROUP BY t.platform
            `);

            const platformStats: Record<string, { threads: number; messages: number; unread: number }> = {};
            for (const row of platformStatsRaw) {
                platformStats[row.platform] = {
                    threads: row.threads,
                    messages: row.messages,
                    unread: row.unread || 0
                };
            }

            await db.close();

            return {
                totalThreads: totalThreads.count,
                totalMessages: totalMessages.count,
                unreadMessages: unreadMessages.count || 0,
                platformStats
            };

        } catch (error) {
            console.error('❌ 获取消息统计失败:', error);
            return {
                totalThreads: 0,
                totalMessages: 0,
                unreadMessages: 0,
                platformStats: {}
            };
        }
    }

    // ==================== 数据清理方法 ====================

    /**
     * 🔥 清理旧消息（保留最近30天）
     */
    static async cleanupOldMessages(daysToKeep: number = 30): Promise<number> {
        try {
            const db = await this.getDatabase();

            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

            // 删除旧消息
            const result = await db.run(`
                DELETE FROM messages 
                WHERE timestamp < ?
            `, [cutoffDate]);

            // 清理没有消息的线程
            await db.run(`
                DELETE FROM message_threads 
                WHERE id NOT IN (SELECT DISTINCT thread_id FROM messages)
            `);

            await db.close();

            const deletedCount = result.changes || 0;
            console.log(`🧹 清理完成: 删除了 ${deletedCount} 条 ${daysToKeep} 天前的消息`);

            return deletedCount;

        } catch (error) {
            console.error('❌ 清理旧消息失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 增量同步逻辑 - 处理新获取的消息数据
     */
    static async incrementalSync(
        platform: string, 
        accountId: string, 
        syncData: UserMessageThread[]
    ): Promise<{
        newMessages: number;
        updatedThreads: number;
        errors: string[];
    }> {
        try {
            console.log(`🔄 开始增量同步: ${platform} - ${accountId}`);

            let newMessages = 0;
            let updatedThreads = 0;
            const errors: string[] = [];

            for (const threadData of syncData) {
                try {
                    // 保存或更新线程
                    const threadId = await this.saveOrUpdateThread({
                        platform,
                        account_id: accountId,
                        user_id: threadData.user_id,
                        user_name: threadData.user_name,
                        avatar: threadData.avatar,
                        unread_count: threadData.unread_count || 0
                    });

                    // 获取该线程的最后消息时间
                    const lastMessageTime = await this.getLastMessageTime(threadId);

                    // 过滤出新消息
                    const newMessagesForThread = threadData.messages?.filter(msg => 
                        !lastMessageTime || msg.timestamp > lastMessageTime
                    ) || [];

                    if (newMessagesForThread.length > 0) {
                        await this.addMessages(threadId, newMessagesForThread);
                        newMessages += newMessagesForThread.length;
                    }

                    updatedThreads++;

                } catch (error) {
                    const errorMsg = `线程 ${threadData.user_name} 同步失败: ${error instanceof Error ? error.message : 'unknown error'}`;
                    errors.push(errorMsg);
                    console.error('❌', errorMsg);
                }
            }

            // 更新同步时间
            await this.updateLastSyncTime(platform, accountId, new Date().toISOString());

            console.log(`✅ 增量同步完成: 新消息 ${newMessages} 条，更新线程 ${updatedThreads} 个`);

            return { newMessages, updatedThreads, errors };

        } catch (error) {
            console.error('❌ 增量同步失败:', error);
            await this.recordSyncError(platform, accountId, error instanceof Error ? error.message : 'unknown error');
            
            return { 
                newMessages: 0, 
                updatedThreads: 0, 
                errors: [error instanceof Error ? error.message : 'unknown error']
            };
        }
    }

    /**
     * 🔥 获取线程最后一条消息的时间
     */
    private static async getLastMessageTime(threadId: number): Promise<string | null> {
        try {
            const db = await this.getDatabase();

            const result = await db.get(`
                SELECT timestamp FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            `, [threadId]);

            await db.close();

            return result ? result.timestamp : null;

        } catch (error) {
            console.error('❌ 获取最后消息时间失败:', error);
            return null;
        }
    }

    // ==================== 实用工具方法 ====================

    /**
     * 🔥 检查线程是否存在
     */
    static async threadExists(platform: string, accountId: string, userId: string): Promise<boolean> {
        try {
            const thread = await this.getThreadByUser(platform, accountId, userId);
            return thread !== null;
        } catch {
            return false;
        }
    }

    /**
     * 🔥 获取活跃的同步账号列表
     */
    static async getActiveSyncAccounts(): Promise<Array<{
        platform: string;
        account_id: string;
        last_sync_time: string | null;
        thread_count: number;
    }>> {
        try {
            const db = await this.getDatabase();

            const accounts = await db.all(`
                SELECT 
                    t.platform,
                    t.account_id,
                    s.last_sync_time,
                    COUNT(t.id) as thread_count
                FROM message_threads t
                LEFT JOIN platform_sync_status s ON t.platform = s.platform AND t.account_id = s.account_id
                GROUP BY t.platform, t.account_id
                ORDER BY s.last_sync_time ASC NULLS FIRST
            `);

            await db.close();

            return accounts;

        } catch (error) {
            console.error('❌ 获取活跃同步账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 搜索消息内容
     */
    static async searchMessages(
        platform: string, 
        accountId: string, 
        keyword: string, 
        limit: number = 20
    ): Promise<Array<{
        thread_id: number;
        user_name: string;
        message: Message;
    }>> {
        try {
            const db = await this.getDatabase();

            const results = await db.all(`
                SELECT 
                    m.*,
                    t.user_name,
                    t.user_avatar
                FROM messages m
                JOIN message_threads t ON m.thread_id = t.id
                WHERE t.platform = ? AND t.account_id = ?
                AND (m.text_content LIKE ? OR t.user_name LIKE ?)
                ORDER BY m.timestamp DESC
                LIMIT ?
            `, [platform, accountId, `%${keyword}%`, `%${keyword}%`, limit]);

            await db.close();

            return results.map(row => ({
                thread_id: row.thread_id,
                user_name: row.user_name,
                message: {
                    id: row.id,
                    message_id: row.message_id,
                    sender: row.sender,
                    text: row.text_content,
                    images: row.image_data ? JSON.parse(row.image_data) : undefined,
                    timestamp: row.timestamp,
                    is_read: row.is_read === 1,
                    type: row.content_type
                }
            }));

        } catch (error) {
            console.error('❌ 搜索消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取指定时间范围内的消息统计
     */
    static async getMessageStatsInRange(
        platform: string,
        accountId: string,
        startTime: string,
        endTime: string
    ): Promise<{
        totalMessages: number;
        sentByMe: number;
        receivedFromUsers: number;
        activeUsers: number;
    }> {
        try {
            const db = await this.getDatabase();

            const stats = await db.get(`
                SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN m.sender = 'me' THEN 1 ELSE 0 END) as sent_by_me,
                    SUM(CASE WHEN m.sender = 'user' THEN 1 ELSE 0 END) as received_from_users,
                    COUNT(DISTINCT t.user_id) as active_users
                FROM messages m
                JOIN message_threads t ON m.thread_id = t.id
                WHERE t.platform = ? AND t.account_id = ?
                AND m.timestamp BETWEEN ? AND ?
            `, [platform, accountId, startTime, endTime]);

            await db.close();

            return {
                totalMessages: stats.total_messages || 0,
                sentByMe: stats.sent_by_me || 0,
                receivedFromUsers: stats.received_from_users || 0,
                activeUsers: stats.active_users || 0
            };

        } catch (error) {
            console.error('❌ 获取时间范围统计失败:', error);
            return {
                totalMessages: 0,
                sentByMe: 0,
                receivedFromUsers: 0,
                activeUsers: 0
            };
        }
    }

    /**
     * 🔥 导出指定线程的完整对话数据
     */
    static async exportThreadData(threadId: number): Promise<{
        thread: UserMessageThread;
        messages: Message[];
    } | null> {
        try {
            const db = await this.getDatabase();

            // 获取线程信息
            const thread = await db.get(`
                SELECT * FROM message_threads WHERE id = ?
            `, [threadId]);

            if (!thread) {
                await db.close();
                return null;
            }

            // 获取所有消息
            const messages = await db.all(`
                SELECT * FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp ASC
            `, [threadId]);

            await db.close();

            return {
                thread: {
                    id: thread.id,
                    platform: thread.platform,
                    account_id: thread.account_id,
                    user_id: thread.user_id,
                    user_name: thread.user_name,
                    avatar: thread.user_avatar,
                    unread_count: thread.unread_count,
                    last_message_time: thread.last_message_time,
                    last_sync_time: thread.last_sync_time
                },
                messages: messages.map(msg => ({
                    id: msg.id,
                    message_id: msg.message_id,
                    sender: msg.sender,
                    text: msg.text_content,
                    images: msg.image_data ? JSON.parse(msg.image_data) : undefined,
                    timestamp: msg.timestamp,
                    is_read: msg.is_read === 1,
                    type: msg.content_type
                }))
            };

        } catch (error) {
            console.error('❌ 导出线程数据失败:', error);
            return null;
        }
    }

    /**
     * 🔥 删除指定线程及其所有消息
     */
    static async deleteThread(threadId: number): Promise<boolean> {
        try {
            const db = await this.getDatabase();

            // 由于设置了外键约束 ON DELETE CASCADE，删除线程会自动删除相关消息
            const result = await db.run(`
                DELETE FROM message_threads WHERE id = ?
            `, [threadId]);

            await db.close();

            if (result.changes && result.changes > 0) {
                console.log(`✅ 线程已删除: ID ${threadId}`);
                return true;
            } else {
                console.log(`⚠️ 线程不存在: ID ${threadId}`);
                return false;
            }

        } catch (error) {
            console.error('❌ 删除线程失败:', error);
            return false;
        }
    }

    /**
     * 🔥 批量删除旧线程
     */
    static async batchDeleteOldThreads(daysToKeep: number = 30): Promise<number> {
        try {
            const db = await this.getDatabase();

            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

            const result = await db.run(`
                DELETE FROM message_threads 
                WHERE last_message_time < ? OR last_message_time IS NULL
            `, [cutoffDate]);

            await db.close();

            const deletedCount = result.changes || 0;
            console.log(`🧹 批量删除完成: 删除了 ${deletedCount} 个超过 ${daysToKeep} 天的对话线程`);

            return deletedCount;

        } catch (error) {
            console.error('❌ 批量删除线程失败:', error);
            return 0;
        }
    }

    // ==================== 调试和维护方法 ====================

    /**
     * 🔥 修复数据一致性
     */
    static async repairDataConsistency(): Promise<{
        repairedThreads: number;
        orphanedMessages: number;
    }> {
        try {
            const db = await this.getDatabase();

            // 修复线程的最后消息时间
            await db.run(`
                UPDATE message_threads 
                SET last_message_time = (
                    SELECT MAX(timestamp) 
                    FROM messages 
                    WHERE thread_id = message_threads.id
                )
                WHERE id IN (
                    SELECT DISTINCT thread_id FROM messages
                )
            `);

            // 修复线程的未读消息数（假设所有 sender='user' 且 is_read=0 的消息为未读）
            await db.run(`
                UPDATE message_threads 
                SET unread_count = (
                    SELECT COUNT(*) 
                    FROM messages 
                    WHERE thread_id = message_threads.id 
                    AND sender = 'user' 
                    AND is_read = 0
                )
            `);

            // 删除孤儿消息（没有对应线程的消息）
            const orphanedResult = await db.run(`
                DELETE FROM messages 
                WHERE thread_id NOT IN (SELECT id FROM message_threads)
            `);

            // 获取修复的线程数
            const repairedThreads = await db.get(`
                SELECT COUNT(*) as count FROM message_threads
            `);

            await db.close();

            const result = {
                repairedThreads: repairedThreads.count,
                orphanedMessages: orphanedResult.changes || 0
            };

            console.log(`🔧 数据一致性修复完成: 修复线程 ${result.repairedThreads} 个，删除孤儿消息 ${result.orphanedMessages} 条`);

            return result;

        } catch (error) {
            console.error('❌ 修复数据一致性失败:', error);
            return { repairedThreads: 0, orphanedMessages: 0 };
        }
    }

    /**
     * 🔥 获取数据库健康状态
     */
    static async getDatabaseHealth(): Promise<{
        isHealthy: boolean;
        issues: string[];
        suggestions: string[];
        stats: MessageStatistics;
    }> {
        try {
            const issues: string[] = [];
            const suggestions: string[] = [];

            const db = await this.getDatabase();

            // 检查孤儿消息
            const orphanedMessages = await db.get(`
                SELECT COUNT(*) as count 
                FROM messages 
                WHERE thread_id NOT IN (SELECT id FROM message_threads)
            `);

            if (orphanedMessages.count > 0) {
                issues.push(`发现 ${orphanedMessages.count} 条孤儿消息`);
                suggestions.push('运行数据一致性修复');
            }

            // 检查空线程
            const emptyThreads = await db.get(`
                SELECT COUNT(*) as count 
                FROM message_threads 
                WHERE id NOT IN (SELECT DISTINCT thread_id FROM messages)
            `);

            if (emptyThreads.count > 0) {
                issues.push(`发现 ${emptyThreads.count} 个空线程`);
                suggestions.push('清理空线程');
            }

            // 检查时间戳不一致
            const inconsistentTime = await db.get(`
                SELECT COUNT(*) as count 
                FROM message_threads t
                WHERE t.last_message_time != (
                    SELECT MAX(timestamp) 
                    FROM messages m 
                    WHERE m.thread_id = t.id
                )
            `);

            if (inconsistentTime.count > 0) {
                issues.push(`发现 ${inconsistentTime.count} 个线程的最后消息时间不一致`);
                suggestions.push('修复时间戳一致性');
            }

            await db.close();

            // 获取基本统计
            const stats = await this.getMessageStatistics();

            const isHealthy = issues.length === 0;

            return {
                isHealthy,
                issues,
                suggestions,
                stats
            };

        } catch (error) {
            console.error('❌ 检查数据库健康状态失败:', error);
            return {
                isHealthy: false,
                issues: ['数据库健康检查失败'],
                suggestions: ['检查数据库连接和权限'],
                stats: {
                    totalThreads: 0,
                    totalMessages: 0,
                    unreadMessages: 0,
                    platformStats: {}
                }
            };
        }
    }

    // ==================== 批量操作方法 ====================

    /**
     * 🔥 批量更新账号状态
     */
    static async batchUpdateAccountStatus(updates: Array<{
        platform: string;
        accountId: string;
        status: number;
        lastSyncTime: string;
    }>): Promise<number> {
        try {
            const db = await this.getDatabase();
            let updatedCount = 0;

            for (const update of updates) {
                const result = await db.run(`
                    UPDATE platform_sync_status 
                    SET last_sync_time = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE platform = ? AND account_id = ?
                `, [update.lastSyncTime, update.platform, update.accountId]);

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
     * 🔥 获取需要同步的账号列表
     */
    static async getAccountsNeedingSync(intervalMinutes: number = 5): Promise<Array<{
        platform: string;
        account_id: string;
        last_sync_time: string | null;
        thread_count: number;
    }>> {
        try {
            const db = await this.getDatabase();

            const cutoffTime = new Date(Date.now() - intervalMinutes * 60 * 1000).toISOString();

            const accounts = await db.all(`
                SELECT 
                    t.platform,
                    t.account_id,
                    s.last_sync_time,
                    COUNT(t.id) as thread_count
                FROM message_threads t
                LEFT JOIN platform_sync_status s ON t.platform = s.platform AND t.account_id = s.account_id
                WHERE s.last_sync_time IS NULL OR s.last_sync_time < ?
                GROUP BY t.platform, t.account_id
                ORDER BY s.last_sync_time ASC NULLS FIRST
            `, [cutoffTime]);

            await db.close();

            return accounts;

        } catch (error) {
            console.error('❌ 获取需要同步的账号失败:', error);
            return [];
        }
    }
}