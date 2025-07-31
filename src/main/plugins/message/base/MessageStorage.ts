// src/main/plugins/message/base/MessageStorage.ts - Better-SQLite3 版本
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../../../config/Config';
import { MessageImageManager, MessageImageInfo } from './MessageImageManager';
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
    image_paths?: string;  // 🔥 改为存储图片路径的JSON数组
    content?: string;
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

// 🔥 数据库单例
let dbInstance: Database.Database | null = null;

export class MessageStorage {

    /**
     * 🔥 获取数据库实例（单例模式）
     */
    private static getDatabase(): Database.Database {
        if (!dbInstance) {
            // 确保数据库目录存在
            if (!fs.existsSync(Config.DB_DIR)) {
                fs.mkdirSync(Config.DB_DIR, { recursive: true });
            }

            dbInstance = new Database(Config.DB_PATH);
            
            // 设置性能优化选项
            dbInstance.pragma('journal_mode = WAL');
            dbInstance.pragma('synchronous = NORMAL');
            dbInstance.pragma('cache_size = 1000');
            dbInstance.pragma('temp_store = memory');
            
            console.log('✅ Better-SQLite3 数据库连接已建立');
        }
        
        return dbInstance;
    }

    /**
     * 🔥 消息数据库初始化 - 创建消息相关表
     */
    static initializeDatabase(): void {
        // 防止重复初始化
        if (messageDbInitialized) {
            console.log('✅ 消息数据库已初始化，跳过');
            return;
        }

        if (messageDbInitializing) {
            console.log('⏳ 消息数据库正在初始化中，等待完成...');
            while (messageDbInitializing) {
                // 同步等待
                require('child_process').spawnSync('sleep', ['0.1']);
            }
            return;
        }

        messageDbInitializing = true;

        try {
            console.log('🚀 开始初始化消息数据库...');

            const db = this.getDatabase();

            // 🔥 创建消息线程表
            db.exec(`
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
            db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id INTEGER NOT NULL,
                    message_id TEXT,
                    sender TEXT NOT NULL CHECK(sender IN ('me', 'user')),
                    content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'mixed')),
                    text_content TEXT,
                    image_paths TEXT,
                    timestamp TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
                )
            `);
            console.log('✅ messages 表创建成功');

            // 🔥 创建平台同步状态表
            db.exec(`
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
            db.exec(`
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
            this.showMessageDatabaseInfo(db);

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
    private static showMessageDatabaseInfo(db: Database.Database): void {
        try {
            console.log('\n📋 消息数据库表结构信息:');

            const tables = ['message_threads', 'messages', 'platform_sync_status'];

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
            const threadsCount = db.prepare("SELECT COUNT(*) as count FROM message_threads").get() as { count: number };
            const messagesCount = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
            const syncStatusCount = db.prepare("SELECT COUNT(*) as count FROM platform_sync_status").get() as { count: number };

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
    static isMessageDatabaseInitialized(): boolean {
        try {
            // 检查数据库文件是否存在
            if (!fs.existsSync(Config.DB_PATH)) {
                return false;
            }

            // 检查必要的表是否存在
            const db = this.getDatabase();
            const requiredTables = ['message_threads', 'messages', 'platform_sync_status'];

            for (const table of requiredTables) {
                const result = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
                ).get(table);

                if (!result) {
                    console.log(`❌ 消息表 ${table} 不存在`);
                    return false;
                }
            }

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
    static ensureMessageDatabaseInitialized(): void {
        console.log('🔍 检查消息数据库初始化状态...');

        const isInitialized = this.isMessageDatabaseInitialized();

        if (!isInitialized) {
            console.log('🔧 消息数据库未初始化，开始初始化...');
            this.initializeDatabase();
        } else {
            console.log('✅ 消息数据库已初始化');
            messageDbInitialized = true;
        }
    }

    // ==================== 对话线程管理方法 ====================

    /**
     * 🔥 保存或更新对话线程
     */
    static saveOrUpdateThread(threadData: UserMessageThread): number {
        try {
            const db = this.getDatabase();

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
            const stmt = db.prepare(`
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
            `);

            const result = stmt.run(
                platform, account_id, user_id,  // SELECT id
                platform, account_id, user_id, user_name, avatar, 
                unread_count, last_message_time, last_sync_time,
                platform, account_id, user_id   // SELECT created_at
            );

            const threadId = result.lastInsertRowid as number;
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
    static getThreadByUser(platform: string, accountId: string, userId: string): UserMessageThread | null {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT * FROM message_threads 
                WHERE platform = ? AND account_id = ? AND user_id = ?
            `);
            
            const thread = stmt.get(platform, accountId, userId) as ThreadRecord;

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
    static getAllThreads(platform: string, accountId: string): UserMessageThread[] {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT t.*, 
                       m.text_content as last_message_text,
                       m.content_type as last_message_type
                FROM message_threads t
                LEFT JOIN messages m ON t.id = m.thread_id AND m.timestamp = t.last_message_time
                WHERE t.platform = ? AND t.account_id = ?
                ORDER BY t.last_message_time DESC NULLS LAST
            `);
            
            const threads = stmt.all(platform, accountId) as any[];

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
    static updateThreadStatus(threadId: number, lastMessageTime: string, incrementUnread: boolean = false): void {
        try {
            const db = this.getDatabase();

            let stmt;
            if (incrementUnread) {
                stmt = db.prepare(`
                    UPDATE message_threads 
                    SET last_message_time = ?, 
                        unread_count = unread_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                stmt.run(lastMessageTime, threadId);
            } else {
                stmt = db.prepare(`
                    UPDATE message_threads 
                    SET last_message_time = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                stmt.run(lastMessageTime, threadId);
            }

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
            const db = this.getDatabase();

            // 🔥 确保消息图片目录存在
            await MessageImageManager.ensureMessageImagesDirectory();

            // 获取线程信息（用于图片存储）
            const threadInfo = this.getThreadById(threadId);
            if (!threadInfo) {
                throw new Error(`线程不存在: ${threadId}`);
            }

            // 预处理所有消息的图片
            const processedMessages: Array<Message & { processedImagePaths: string | null }> = [];
            for (const message of messages) {
                let imagePaths: string | null = null;
                
                // 🔥 处理图片数据 - 保存到文件系统
                if (message.images && message.images.length > 0) {
                    try {
                        const savedImages = await MessageImageManager.saveMessageImages(
                            message.images,
                            threadInfo.platform,
                            threadInfo.user_name,
                            threadId,
                            message.timestamp
                        );

                        if (savedImages.length > 0) {
                            // 只存储相对路径
                            imagePaths = JSON.stringify(savedImages.map(img => img.path));
                        }
                    } catch (error) {
                        console.error(`❌ 保存消息图片失败:`, error);
                        // 继续处理消息，但不保存图片
                    }
                }

                processedMessages.push({
                    ...message,
                    processedImagePaths: imagePaths
                });
            }

            // 使用事务确保数据一致性
            const transaction = db.transaction(() => {
                const checkStmt = db.prepare(`
                    SELECT id FROM messages 
                    WHERE thread_id = ? AND timestamp = ? AND sender = ?
                `);

                const insertStmt = db.prepare(`
                    INSERT INTO messages (
                        thread_id, message_id, sender, content_type, 
                        text_content, image_paths, timestamp, is_read
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const message of processedMessages) {
                    // 检查消息是否已存在（基于时间戳和发送者去重）
                    const existing = checkStmt.get(threadId, message.timestamp, message.sender);

                    if (existing) {
                        console.log(`⚠️ 消息已存在，跳过: ${message.timestamp}`);
                        continue;
                    }

                    // 确定内容类型
                    let contentType: 'text' | 'image' | 'mixed' = 'text';
                    if (message.processedImagePaths) {
                        contentType = message.text ? 'mixed' : 'image';
                    }

                    insertStmt.run(
                        threadId,
                        message.message_id || null,
                        message.sender,
                        contentType,
                        message.text || null,
                        message.processedImagePaths,
                        message.timestamp,
                        message.is_read ? 1 : 0
                    );
                }

                // 更新线程的最后消息时间
                const lastMessage = messages[messages.length - 1];
                const isFromUser = lastMessage.sender === 'user';
                this.updateThreadStatus(threadId, lastMessage.timestamp, isFromUser);
            });

            transaction();
            console.log(`✅ 成功添加 ${messages.length} 条消息到线程 ${threadId}`);

        } catch (error) {
            console.error('❌ 添加消息失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取对话线程的消息
     */
    static getThreadMessages(threadId: number, limit: number = 50, offset: number = 0): Message[] {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT * FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            `);
            
            const messages = stmt.all(threadId, limit, offset) as MessageRecord[];

            return messages.map(msg => {
                // 🔥 处理图片路径 - 按需加载
                let images: string[] | undefined = undefined;
                if (msg.image_paths) {
                    try {
                        const imagePaths = JSON.parse(msg.image_paths) as string[];
                        // 这里只返回相对路径，实际加载由前端或其他服务处理
                        images = imagePaths;
                    } catch (error) {
                        console.warn(`⚠️ 解析图片路径失败: ${msg.id}:`, error);
                    }
                }

                return {
                    id: msg.id,
                    message_id: msg.message_id,
                    sender: msg.sender,
                    text: msg.text_content,
                    images: images,
                    timestamp: msg.timestamp,
                    is_read: msg.is_read === 1,
                    type: msg.content_type
                };
            });

        } catch (error) {
            console.error('❌ 获取消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 获取指定时间之后的消息（增量同步用）
     */
    static getMessagesAfter(threadId: number, timestamp: string): Message[] {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT * FROM messages 
                WHERE thread_id = ? AND timestamp > ?
                ORDER BY timestamp ASC
            `);
            
            const messages = stmt.all(threadId, timestamp) as MessageRecord[];

            return messages.map(msg => {
                // 🔥 处理图片路径
                let images: string[] | undefined = undefined;
                if (msg.image_paths) {
                    try {
                        const imagePaths = JSON.parse(msg.image_paths) as string[];
                        images = imagePaths;
                    } catch (error) {
                        console.warn(`⚠️ 解析图片路径失败: ${msg.id}:`, error);
                    }
                }

                return {
                    id: msg.id,
                    message_id: msg.message_id,
                    sender: msg.sender,
                    text: msg.text_content,
                    images: images,
                    timestamp: msg.timestamp,
                    is_read: msg.is_read === 1,
                    type: msg.content_type
                };
            });

        } catch (error) {
            console.error('❌ 获取增量消息失败:', error);
            return [];
        }
    }

    /**
     * 🔥 标记消息为已读
     */
    static markMessagesAsRead(threadId: number, messageIds?: number[]): void {
        try {
            const db = this.getDatabase();

            const transaction = db.transaction(() => {
                if (messageIds && messageIds.length > 0) {
                    // 标记指定消息为已读
                    const placeholders = messageIds.map(() => '?').join(',');
                    const stmt = db.prepare(`
                        UPDATE messages 
                        SET is_read = 1 
                        WHERE thread_id = ? AND id IN (${placeholders})
                    `);
                    stmt.run(threadId, ...messageIds);
                } else {
                    // 标记该线程所有消息为已读
                    const stmt = db.prepare(`
                        UPDATE messages 
                        SET is_read = 1 
                        WHERE thread_id = ?
                    `);
                    stmt.run(threadId);
                }

                // 重置线程的未读数
                const resetUnreadStmt = db.prepare(`
                    UPDATE message_threads 
                    SET unread_count = 0 
                    WHERE id = ?
                `);
                resetUnreadStmt.run(threadId);
            });

            transaction();
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
    static updateLastSyncTime(platform: string, accountId: string, syncTime: string): void {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                INSERT OR REPLACE INTO platform_sync_status (
                    platform, account_id, last_sync_time, sync_count, updated_at
                ) VALUES (
                    ?, ?, ?, 
                    COALESCE((SELECT sync_count + 1 FROM platform_sync_status WHERE platform = ? AND account_id = ?), 1),
                    CURRENT_TIMESTAMP
                )
            `);
            
            stmt.run(platform, accountId, syncTime, platform, accountId);
            console.log(`✅ 同步时间已更新: ${platform} - ${accountId}`);

        } catch (error) {
            console.error('❌ 更新同步时间失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 获取平台最后同步时间
     */
    static getLastSyncTime(platform: string, accountId: string): string | null {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT last_sync_time FROM platform_sync_status 
                WHERE platform = ? AND account_id = ?
            `);
            
            const result = stmt.get(platform, accountId) as { last_sync_time: string } | undefined;
            return result ? result.last_sync_time : null;

        } catch (error) {
            console.error('❌ 获取同步时间失败:', error);
            return null;
        }
    }

    /**
     * 🔥 记录同步错误
     */
    static recordSyncError(platform: string, accountId: string, error: string): void {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                UPDATE platform_sync_status 
                SET last_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE platform = ? AND account_id = ?
            `);
            
            stmt.run(error, platform, accountId);
            console.log(`⚠️ 同步错误已记录: ${platform} - ${accountId}`);

        } catch (error) {
            console.error('❌ 记录同步错误失败:', error);
        }
    }

    // ==================== 统计和查询方法 ====================

    /**
     * 🔥 获取未读消息统计
     */
    static getUnreadCount(platform?: string, accountId?: string): number {
        try {
            const db = this.getDatabase();

            let sql = 'SELECT SUM(unread_count) as total FROM message_threads';
            const params: string[] = [];

            if (platform && accountId) {
                sql += ' WHERE platform = ? AND account_id = ?';
                params.push(platform, accountId);
            } else if (platform) {
                sql += ' WHERE platform = ?';
                params.push(platform);
            }

            const stmt = db.prepare(sql);
            const result = stmt.get(...params) as { total: number } | undefined;
            return result?.total || 0;

        } catch (error) {
            console.error('❌ 获取未读消息统计失败:', error);
            return 0;
        }
    }

    /**
     * 🔥 获取消息统计信息
     */
    static getMessageStatistics(): MessageStatistics {
        try {
            const db = this.getDatabase();

            // 基本统计
            const totalThreads = db.prepare("SELECT COUNT(*) as count FROM message_threads").get() as { count: number };
            const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
            const unreadMessages = db.prepare("SELECT SUM(unread_count) as count FROM message_threads").get() as { count: number };

            // 按平台统计
            const platformStatsRaw = db.prepare(`
                SELECT 
                    t.platform,
                    COUNT(t.id) as threads,
                    COUNT(m.id) as messages,
                    SUM(t.unread_count) as unread
                FROM message_threads t
                LEFT JOIN messages m ON t.id = m.thread_id
                GROUP BY t.platform
            `).all() as any[];

            const platformStats: Record<string, { threads: number; messages: number; unread: number }> = {};
            for (const row of platformStatsRaw) {
                platformStats[row.platform] = {
                    threads: row.threads,
                    messages: row.messages,
                    unread: row.unread || 0
                };
            }

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
    static cleanupOldMessages(daysToKeep: number = 30): number {
        try {
            const db = this.getDatabase();

            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

            const transaction = db.transaction(() => {
                // 删除旧消息
                const deleteMessagesStmt = db.prepare(`
                    DELETE FROM messages 
                    WHERE timestamp < ?
                `);
                const result = deleteMessagesStmt.run(cutoffDate);

                // 清理没有消息的线程
                const deleteThreadsStmt = db.prepare(`
                    DELETE FROM message_threads 
                    WHERE id NOT IN (SELECT DISTINCT thread_id FROM messages)
                `);
                deleteThreadsStmt.run();

                return result.changes;
            });

            const deletedCount = transaction();
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
    static incrementalSync(
        platform: string, 
        accountId: string, 
        syncData: UserMessageThread[]
    ): { newMessages: number; updatedThreads: number; errors: string[] } {
        try {
            console.log(`🔄 开始增量同步: ${platform} - ${accountId}`);

            let newMessages = 0;
            let updatedThreads = 0;
            const errors: string[] = [];

            const db = this.getDatabase();

            const transaction = db.transaction(() => {
                for (const threadData of syncData) {
                    try {
                        // 保存或更新线程
                        const threadId = this.saveOrUpdateThread({
                            platform,
                            account_id: accountId,
                            user_id: threadData.user_id,
                            user_name: threadData.user_name,
                            avatar: threadData.avatar,
                            unread_count: threadData.unread_count || 0
                        });

                        // 获取该线程的最后消息时间
                        const lastMessageTime = this.getLastMessageTime(threadId);

                        // 过滤出新消息
                        const newMessagesForThread = threadData.messages?.filter(msg => 
                            !lastMessageTime || msg.timestamp > lastMessageTime
                        ) || [];

                        if (newMessagesForThread.length > 0) {
                            this.addMessages(threadId, newMessagesForThread);
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
                this.updateLastSyncTime(platform, accountId, new Date().toISOString());
            });

            transaction();

            console.log(`✅ 增量同步完成: 新消息 ${newMessages} 条，更新线程 ${updatedThreads} 个`);

            return { newMessages, updatedThreads, errors };

        } catch (error) {
            console.error('❌ 增量同步失败:', error);
            this.recordSyncError(platform, accountId, error instanceof Error ? error.message : 'unknown error');
            
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
    private static getLastMessageTime(threadId: number): string | null {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT timestamp FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            `);
            
            const result = stmt.get(threadId) as { timestamp: string } | undefined;
            return result ? result.timestamp : null;

        } catch (error) {
            console.error('❌ 获取最后消息时间失败:', error);
            return null;
        }
    }

    /**
     * 🔥 根据ID获取线程信息（用于图片存储）
     */
    private static getThreadById(threadId: number): UserMessageThread | null {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT * FROM message_threads WHERE id = ?
            `);
            
            const thread = stmt.get(threadId) as ThreadRecord;

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
            console.error('❌ 获取线程信息失败:', error);
            return null;
        }
    }

    // ==================== 图片相关实用方法 ====================

    /**
     * 🔥 获取消息图片的完整路径
     */
    static getMessageImagePath(relativePath: string): string {
        return MessageImageManager.getImageFullPath(relativePath);
    }

    /**
     * 🔥 读取消息图片为base64（用于前端显示）
     */
    static async readMessageImageAsBase64(relativePath: string): Promise<string | null> {
        return await MessageImageManager.readImageAsBase64(relativePath);
    }

    /**
     * 🔥 检查消息图片是否存在
     */
    static async messageImageExists(relativePath: string): Promise<boolean> {
        return await MessageImageManager.imageExists(relativePath);
    }

    /**
     * 🔥 删除线程的所有图片文件
     */
    static async deleteThreadImages(threadId: number): Promise<number> {
        try {
            const threadInfo = this.getThreadById(threadId);
            if (!threadInfo) {
                console.warn(`⚠️ 线程不存在: ${threadId}`);
                return 0;
            }

            return await MessageImageManager.deleteThreadImages(
                threadInfo.platform,
                threadInfo.user_name,
                threadId
            );

        } catch (error) {
            console.error(`❌ 删除线程图片失败:`, error);
            return 0;
        }
    }

    // ==================== 实用工具方法 ====================

    /**
     * 🔥 检查线程是否存在
     */
    static threadExists(platform: string, accountId: string, userId: string): boolean {
        try {
            const thread = this.getThreadByUser(platform, accountId, userId);
            return thread !== null;
        } catch {
            return false;
        }
    }

    /**
     * 🔥 获取活跃的同步账号列表
     */
    static getActiveSyncAccounts(): Array<{
        platform: string;
        account_id: string;
        last_sync_time: string | null;
        thread_count: number;
    }> {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
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
            
            return stmt.all() as any[];

        } catch (error) {
            console.error('❌ 获取活跃同步账号失败:', error);
            return [];
        }
    }

    /**
     * 🔥 搜索消息内容
     */
    static searchMessages(
        platform: string, 
        accountId: string, 
        keyword: string, 
        limit: number = 20
    ): Array<{
        thread_id: number;
        user_name: string;
        message: Message;
    }> {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
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
            `);
            
            const results = stmt.all(platform, accountId, `%${keyword}%`, `%${keyword}%`, limit) as any[];

            return results.map(row => ({
                thread_id: row.thread_id,
                user_name: row.user_name,
                message: {
                    id: row.id,
                    message_id: row.message_id,
                    sender: row.sender,
                    text: row.text_content,
                    images: row.image_paths ? JSON.parse(row.image_paths) : undefined,
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
    static getMessageStatsInRange(
        platform: string,
        accountId: string,
        startTime: string,
        endTime: string
    ): {
        totalMessages: number;
        sentByMe: number;
        receivedFromUsers: number;
        activeUsers: number;
    } {
        try {
            const db = this.getDatabase();

            const stmt = db.prepare(`
                SELECT 
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN m.sender = 'me' THEN 1 ELSE 0 END) as sent_by_me,
                    SUM(CASE WHEN m.sender = 'user' THEN 1 ELSE 0 END) as received_from_users,
                    COUNT(DISTINCT t.user_id) as active_users
                FROM messages m
                JOIN message_threads t ON m.thread_id = t.id
                WHERE t.platform = ? AND t.account_id = ?
                AND m.timestamp BETWEEN ? AND ?
            `);
            
            const stats = stmt.get(platform, accountId, startTime, endTime) as any;

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
    static exportThreadData(threadId: number): {
        thread: UserMessageThread;
        messages: Message[];
    } | null {
        try {
            const db = this.getDatabase();

            // 获取线程信息
            const threadStmt = db.prepare(`
                SELECT * FROM message_threads WHERE id = ?
            `);
            const thread = threadStmt.get(threadId) as ThreadRecord;

            if (!thread) {
                return null;
            }

            // 获取所有消息
            const messagesStmt = db.prepare(`
                SELECT * FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp ASC
            `);
            const messages = messagesStmt.all(threadId) as MessageRecord[];

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
                    images: msg.image_paths ? JSON.parse(msg.image_paths) : undefined,
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
    static deleteThread(threadId: number): boolean {
        try {
            const db = this.getDatabase();

            // 由于设置了外键约束 ON DELETE CASCADE，删除线程会自动删除相关消息
            const stmt = db.prepare(`
                DELETE FROM message_threads WHERE id = ?
            `);
            
            const result = stmt.run(threadId);

            if (result.changes > 0) {
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
    static batchDeleteOldThreads(daysToKeep: number = 30): number {
        try {
            const db = this.getDatabase();

            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

            const stmt = db.prepare(`
                DELETE FROM message_threads 
                WHERE last_message_time < ? OR last_message_time IS NULL
            `);
            
            const result = stmt.run(cutoffDate);

            const deletedCount = result.changes;
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
    static repairDataConsistency(): {
        repairedThreads: number;
        orphanedMessages: number;
    } {
        try {
            const db = this.getDatabase();

            const transaction = db.transaction(() => {
                // 修复线程的最后消息时间
                const updateThreadsStmt = db.prepare(`
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
                updateThreadsStmt.run();

                // 修复线程的未读消息数（假设所有 sender='user' 且 is_read=0 的消息为未读）
                const updateUnreadStmt = db.prepare(`
                    UPDATE message_threads 
                    SET unread_count = (
                        SELECT COUNT(*) 
                        FROM messages 
                        WHERE thread_id = message_threads.id 
                        AND sender = 'user' 
                        AND is_read = 0
                    )
                `);
                updateUnreadStmt.run();

                // 删除孤儿消息（没有对应线程的消息）
                const deleteOrphanedStmt = db.prepare(`
                    DELETE FROM messages 
                    WHERE thread_id NOT IN (SELECT id FROM message_threads)
                `);
                const orphanedResult = deleteOrphanedStmt.run();

                // 获取修复的线程数
                const repairedThreadsStmt = db.prepare(`
                    SELECT COUNT(*) as count FROM message_threads
                `);
                const repairedThreads = repairedThreadsStmt.get() as { count: number };

                return {
                    repairedThreads: repairedThreads.count,
                    orphanedMessages: orphanedResult.changes
                };
            });

            const result = transaction();

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
    static getDatabaseHealth(): {
        isHealthy: boolean;
        issues: string[];
        suggestions: string[];
        stats: MessageStatistics;
    } {
        try {
            const issues: string[] = [];
            const suggestions: string[] = [];

            const db = this.getDatabase();

            // 检查孤儿消息
            const orphanedMessagesStmt = db.prepare(`
                SELECT COUNT(*) as count 
                FROM messages 
                WHERE thread_id NOT IN (SELECT id FROM message_threads)
            `);
            const orphanedMessages = orphanedMessagesStmt.get() as { count: number };

            if (orphanedMessages.count > 0) {
                issues.push(`发现 ${orphanedMessages.count} 条孤儿消息`);
                suggestions.push('运行数据一致性修复');
            }

            // 检查空线程
            const emptyThreadsStmt = db.prepare(`
                SELECT COUNT(*) as count 
                FROM message_threads 
                WHERE id NOT IN (SELECT DISTINCT thread_id FROM messages)
            `);
            const emptyThreads = emptyThreadsStmt.get() as { count: number };

            if (emptyThreads.count > 0) {
                issues.push(`发现 ${emptyThreads.count} 个空线程`);
                suggestions.push('清理空线程');
            }

            // 检查时间戳不一致
            const inconsistentTimeStmt = db.prepare(`
                SELECT COUNT(*) as count 
                FROM message_threads t
                WHERE t.last_message_time != (
                    SELECT MAX(timestamp) 
                    FROM messages m 
                    WHERE m.thread_id = t.id
                )
            `);
            const inconsistentTime = inconsistentTimeStmt.get() as { count: number };

            if (inconsistentTime.count > 0) {
                issues.push(`发现 ${inconsistentTime.count} 个线程的最后消息时间不一致`);
                suggestions.push('修复时间戳一致性');
            }

            // 获取基本统计
            const stats = this.getMessageStatistics();

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
    static batchUpdateAccountStatus(updates: Array<{
        platform: string;
        accountId: string;
        status: number;
        lastSyncTime: string;
    }>): number {
        try {
            const db = this.getDatabase();
            let updatedCount = 0;

            const transaction = db.transaction(() => {
                const stmt = db.prepare(`
                    UPDATE platform_sync_status 
                    SET last_sync_time = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE platform = ? AND account_id = ?
                `);

                for (const update of updates) {
                    const result = stmt.run(update.lastSyncTime, update.platform, update.accountId);
                    if (result.changes > 0) {
                        updatedCount++;
                    }
                }
            });

            transaction();
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
    static getAccountsNeedingSync(intervalMinutes: number = 5): Array<{
        platform: string;
        account_id: string;
        last_sync_time: string | null;
        thread_count: number;
    }> {
        try {
            const db = this.getDatabase();

            const cutoffTime = new Date(Date.now() - intervalMinutes * 60 * 1000).toISOString();

            const stmt = db.prepare(`
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
            `);
            
            return stmt.all(cutoffTime) as any[];

        } catch (error) {
            console.error('❌ 获取需要同步的账号失败:', error);
            return [];
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
                console.log('✅ 数据库连接已关闭');
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
        messageDbInitialized = false;
        messageDbInitializing = false;
    }
}