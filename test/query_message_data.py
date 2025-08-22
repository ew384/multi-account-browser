#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime
import os

# 数据库路径 - 请根据实际路径修改
# 数据库路径配置
from config import Config, BASE_DIR, DB_PATH, PLATFORM_TYPE_MAP, get_platform_name

print(f"🔍 基础目录: {BASE_DIR}")
print(f"🔍 数据库路径: {DB_PATH}")

def debug_message_count_issue():
    """调试消息数量查询问题"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("🔍 调试消息数量查询问题")
        print("=" * 60)
        
        # 1. 直接查询messages表
        print("📊 1. 直接查询messages表:")
        cursor.execute("SELECT COUNT(*) as total FROM messages")
        total_messages = cursor.fetchone()['total']
        print(f"   messages表总记录数: {total_messages}")
        
        # 2. 直接查询message_threads表
        print("\n📊 2. 直接查询message_threads表:")
        cursor.execute("SELECT COUNT(*) as total FROM message_threads")
        total_threads = cursor.fetchone()['total']
        print(f"   message_threads表总记录数: {total_threads}")
        
        # 3. 检查thread_id关联
        print("\n📊 3. 检查thread_id关联:")
        cursor.execute("""
            SELECT DISTINCT thread_id 
            FROM messages 
            ORDER BY thread_id
        """)
        message_thread_ids = [row['thread_id'] for row in cursor.fetchall()]
        print(f"   messages表中的thread_id: {message_thread_ids}")
        
        cursor.execute("""
            SELECT DISTINCT id 
            FROM message_threads 
            ORDER BY id
        """)
        thread_ids = [row['id'] for row in cursor.fetchall()]
        print(f"   message_threads表中的id: {thread_ids}")
        
        # 检查关联
        orphaned = set(message_thread_ids) - set(thread_ids)
        if orphaned:
            print(f"   ❌ 发现孤儿消息的thread_id: {orphaned}")
        else:
            print(f"   ✅ 所有消息都有对应的线程")
        
        # 4. 测试正确的关联查询
        print("\n📊 4. 测试正确的关联查询:")
        cursor.execute("""
            SELECT 
                t.user_name, 
                t.id as thread_id,
                COUNT(m.id) as message_count
            FROM message_threads t
            LEFT JOIN messages m ON t.id = m.thread_id
            GROUP BY t.id, t.user_name
            ORDER BY message_count DESC
        """)
        
        results = cursor.fetchall()
        print("   正确的消息统计:")
        for result in results:
            print(f"     {result['user_name']}: {result['message_count']} 条消息 (线程ID: {result['thread_id']})")
        
        # 5. 检查具体某个线程的消息
        if results:
            first_thread = results[0]
            thread_id = first_thread['thread_id']
            print(f"\n📊 5. 检查线程ID {thread_id} 的具体消息:")
            
            cursor.execute("""
                SELECT id, sender, text_content, timestamp 
                FROM messages 
                WHERE thread_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 5
            """, (thread_id,))
            
            messages = cursor.fetchall()
            if messages:
                print(f"   线程 {thread_id} 的最新5条消息:")
                for msg in messages:
                    content = msg['text_content'][:30] if msg['text_content'] else '[无文本]'
                    print(f"     {msg['sender']}: {content}... ({msg['timestamp']})")
            else:
                print(f"   ❌ 线程 {thread_id} 没有找到消息记录")
        
        print("\n✅ 调试完成!")
        
    except sqlite3.Error as e:
        print(f"❌ 数据库查询失败: {e}")
    except Exception as e:
        print(f"❌ 脚本执行失败: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    debug_message_count_issue()