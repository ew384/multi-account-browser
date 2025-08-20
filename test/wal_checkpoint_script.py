#!/usr/bin/env python3
import sqlite3
import os
from config import DB_PATH

def deep_debug_data_loss():
    """深度调试数据丢失问题"""
    print("🕵️ 深度调试数据丢失问题")
    print("=" * 50)
    
    # 获取文件路径
    db_file = DB_PATH
    wal_file = DB_PATH + "-wal"
    shm_file = DB_PATH + "-shm"
    
    try:
        # 1. 检查文件状态
        print("1. 文件状态检查:")
        for file_path, name in [(db_file, "主数据库"), (wal_file, "WAL文件"), (shm_file, "SHM文件")]:
            if os.path.exists(file_path):
                size = os.path.getsize(file_path)
                print(f"   {name}: {size:,} 字节 ({size/1024:.1f} KB)")
            else:
                print(f"   {name}: 不存在")
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 2. 检查数据库完整性
        print("\n2. 数据库完整性检查:")
        cursor.execute("PRAGMA integrity_check")
        integrity = cursor.fetchone()[0]
        print(f"   完整性: {integrity}")
        
        # 3. 检查表结构
        print("\n3. 表结构检查:")
        cursor.execute("PRAGMA table_info(messages)")
        columns = cursor.fetchall()
        print(f"   messages表有 {len(columns)} 个字段")
        
        # 4. 检查外键约束
        print("\n4. 外键约束检查:")
        cursor.execute("PRAGMA foreign_key_check")
        fk_errors = cursor.fetchall()
        if fk_errors:
            print(f"   外键错误: {fk_errors}")
        else:
            print("   外键约束正常")
        
        # 5. 检查序列表详情
        print("\n5. 序列表详情:")
        cursor.execute("SELECT * FROM sqlite_sequence")
        sequences = cursor.fetchall()
        for seq in sequences:
            print(f"   表 {seq[0]}: 当前序列 = {seq[1]}")
        
        # 6. 尝试手动插入测试
        print("\n6. 手动插入测试:")
        try:
            # 获取第一个线程ID
            cursor.execute("SELECT id FROM message_threads LIMIT 1")
            thread_id = cursor.fetchone()[0]
            
            # 插入测试消息
            cursor.execute("""
                INSERT INTO messages (thread_id, sender, content_type, text_content, content_hash, timestamp, is_read)
                VALUES (?, 'user', 'text', '测试消息_debug', 'debug_hash_001', '2025-08-20T17:00:00Z', 0)
            """, (thread_id,))
            
            test_id = cursor.lastrowid
            print(f"   测试插入成功，ID: {test_id}")
            
            # 立即查询
            cursor.execute("SELECT COUNT(*) FROM messages")
            count_after_insert = cursor.fetchone()[0]
            print(f"   插入后消息总数: {count_after_insert}")
            
            # 提交事务
            conn.commit()
            print("   事务已提交")
            
            # 再次查询
            cursor.execute("SELECT COUNT(*) FROM messages")
            count_after_commit = cursor.fetchone()[0]
            print(f"   提交后消息总数: {count_after_commit}")
            
            # 执行检查点
            cursor.execute("PRAGMA wal_checkpoint(FULL)")
            checkpoint_result = cursor.fetchone()
            print(f"   检查点结果: {checkpoint_result}")
            
            # 最终查询
            cursor.execute("SELECT COUNT(*) FROM messages")
            count_after_checkpoint = cursor.fetchone()[0]
            print(f"   检查点后消息总数: {count_after_checkpoint}")
            
        except Exception as e:
            print(f"   手动插入失败: {e}")
        
        # 7. 检查是否有触发器或其他自动操作
        print("\n7. 检查触发器:")
        cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger'")
        triggers = cursor.fetchall()
        if triggers:
            for trigger in triggers:
                print(f"   触发器: {trigger[0]}")
                print(f"   SQL: {trigger[1]}")
        else:
            print("   没有触发器")
        
        # 8. 检查索引
        print("\n8. 检查索引:")
        cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
        indexes = cursor.fetchall()
        for index in indexes:
            print(f"   索引: {index[0]} - {index[1]}")
        
    except Exception as e:
        print(f"❌ 调试失败: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    deep_debug_data_loss()