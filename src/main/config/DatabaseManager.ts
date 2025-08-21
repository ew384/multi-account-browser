// src/main/config/DatabaseManager.ts - 全局数据库连接管理器

import Database from 'better-sqlite3';
import * as fs from 'fs';
import { Config } from './Config';

/**
 * 🔥 全局数据库连接管理器 - 解决多连接冲突问题
 * 
 * 所有存储类都必须通过这个管理器获取数据库连接
 * 确保整个应用程序只有一个SQLite连接实例
 */
export class DatabaseManager {
    private static instance: DatabaseManager | null = null;
    private db: Database.Database | null = null;
    private connectionCount: number = 0;
    private isInitialized: boolean = false;

    private constructor() {
        // 私有构造函数，确保单例
    }

    /**
     * 🔥 获取数据库管理器单例
     */
    static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    /**
     * 🔥 获取数据库连接（全局唯一）
     */
    getConnection(): Database.Database {
        if (!this.db) {
            this.initializeConnection();
        }
        
        this.connectionCount++;
        //console.log(`📊 数据库连接引用计数: ${this.connectionCount}`);
        
        return this.db!;
    }

    /**
     * 🔥 初始化数据库连接
     */
    private initializeConnection(): void {
        if (this.isInitialized) {
            return;
        }

        try {
            // 确保数据库目录存在
            if (!fs.existsSync(Config.DB_DIR)) {
                fs.mkdirSync(Config.DB_DIR, { recursive: true });
            }

            // 创建数据库连接
            this.db = new Database(Config.DB_PATH);
            
            // 🔥 关键配置：WAL模式 + 手动检查点
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 1000');
            this.db.pragma('temp_store = memory');
            // 🔥 禁用自动检查点，避免多连接冲突
            this.db.pragma('wal_autocheckpoint = 1000');
            
            // 🔥 设置忙等待超时，避免锁定冲突
            this.db.pragma('busy_timeout = 30000'); // 30秒超时
            
            this.isInitialized = true;
            console.log('✅ 全局数据库连接已初始化 (WAL模式，手动检查点)');
            // 🔥 启动时立即执行一次检查点，确保之前的WAL数据合并
            try {
                const checkpointResult = this.db.pragma('wal_checkpoint(RESTART)');
                console.log('✅ 启动检查点完成:', checkpointResult);
            } catch (checkpointError) {
                console.warn('⚠️ 启动检查点失败:', checkpointError);
            }
        } catch (error) {
            console.error('❌ 数据库连接初始化失败:', error);
            throw error;
        }
    }

    /**
     * 🔥 手动执行WAL检查点
     */
    executeCheckpoint(): void {
        if (!this.db) {
            console.warn('⚠️ 数据库连接未初始化，跳过检查点');
            return;
        }

        try {
            console.log('🔄 执行全局WAL检查点...');
            //const result = this.db.pragma('wal_checkpoint(FULL)');
            const result = this.db.pragma('wal_checkpoint(RESTART)');
            console.log('✅ WAL检查点完成:', result);
            
            // 验证数据持久化
            const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as {count: number};
            const threadCount = this.db.prepare('SELECT COUNT(*) as count FROM message_threads').get() as {count: number};
            console.log(`📊 检查点后数据状态: ${messageCount.count} 条消息, ${threadCount.count} 个线程`);
            
        } catch (error) {
            console.error('❌ WAL检查点执行失败:', error);
        }
    }

    /**
     * 🔥 减少连接引用计数
     */
    releaseConnection(): void {
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        //console.log(`📊 数据库连接引用计数: ${this.connectionCount}`);
    }

    /**
     * 🔥 获取连接状态信息
     */
    getConnectionInfo(): {
        isConnected: boolean;
        connectionCount: number;
        databasePath: string;
        walSize?: number;
    } {
        const walPath = Config.DB_PATH + '-wal';
        let walSize: number | undefined;
        
        try {
            if (fs.existsSync(walPath)) {
                walSize = fs.statSync(walPath).size;
            }
        } catch (error) {
            // 忽略WAL文件大小获取错误
        }

        return {
            isConnected: this.db !== null,
            connectionCount: this.connectionCount,
            databasePath: Config.DB_PATH,
            walSize
        };
    }

    /**
     * 🔥 安全关闭数据库连接
     */
    closeConnection(): void {
        if (this.db) {
            try {
                console.log('🔄 关闭前执行最终WAL检查点...');
                this.executeCheckpoint();
                
                console.log('🔌 关闭全局数据库连接...');
                this.db.close();
                this.db = null;
                this.connectionCount = 0;
                this.isInitialized = false;
                
                console.log('✅ 全局数据库连接已安全关闭');
                
            } catch (error) {
                console.error('❌ 关闭数据库连接失败:', error);
            }
        }
    }

    /**
     * 🔥 强制重新初始化连接（调试用）
     */
    forceReinitialize(): void {
        console.log('🔄 强制重新初始化数据库连接...');
        this.closeConnection();
        this.initializeConnection();
    }
}

// 🔥 导出全局实例
export const globalDB = DatabaseManager.getInstance();