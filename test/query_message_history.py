#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime
import os

# 数据库路径配置
from config import Config, BASE_DIR, DB_PATH, PLATFORM_TYPE_MAP, get_platform_name

print(f"🔍 基础目录: {BASE_DIR}")
print(f"🔍 数据库路径: {DB_PATH}")

def query_message_threads():
    """查询消息线程表"""
    try:
        conn = sqlite3.connect(DB_PATH, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM message_threads 
            ORDER BY last_message_time DESC NULLS LAST, created_at DESC
        """)
        threads = cursor.fetchall()
        
        if not threads:
            print("❌ 没有找到消息线程")
            return []
            
        print(f"📊 找到 {len(threads)} 个消息线程\n")
        
        for i, thread in enumerate(threads, 1):
            print(f"🧵 线程 {i}")
            print(f"   ID: {thread['id']}")
            print(f"   平台: {thread['platform']}")
            print(f"   账号ID: {thread['account_id']}")
            print(f"   用户ID: {thread['user_id']}")
            print(f"   用户名: {thread['user_name']}")
            print(f"   用户头像: {thread['user_avatar']}")
            print(f"   未读数: {thread['unread_count']}")
            print(f"   最后消息时间: {thread['last_message_time']}")
            print(f"   最后同步时间: {thread['last_sync_time']}")
            print(f"   创建时间: {thread['created_at']}")
            print(f"   更新时间: {thread['updated_at']}")
            print("-" * 50)
        
        return threads
        
    except sqlite3.Error as e:
        print(f"❌ 查询消息线程失败: {e}")
        return []
    finally:
        if conn:
            conn.close()

def query_messages(thread_id=None, limit=50):
    """查询消息表"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if thread_id:
            cursor.execute("""
                SELECT m.*, t.user_name, t.platform, t.account_id
                FROM (
                    SELECT * FROM messages 
                    WHERE thread_id = ? 
                    ORDER BY id DESC 
                    LIMIT ?
                ) m
                JOIN message_threads t ON m.thread_id = t.id
                ORDER BY m.id ASC
            """, (thread_id, limit))
        else:
            cursor.execute("""
                SELECT m.*, t.user_name, t.platform, t.account_id
                FROM (
                    SELECT * FROM messages 
                    ORDER BY id DESC 
                    LIMIT ?
                ) m
                JOIN message_threads t ON m.thread_id = t.id
                ORDER BY m.id ASC
            """, (limit,))
        
        messages = cursor.fetchall()
        
        if not messages:
            print("❌ 没有找到消息记录")
            return []
            
        print(f"📨 找到 {len(messages)} 条消息记录\n")
        
        for i, msg in enumerate(messages, 1):
            print(f"💬 消息 {i}")
            print(f"   ID: {msg['id']}")
            print(f"   线程ID: {msg['thread_id']}")
            print(f"   用户名: {msg['user_name']}")
            print(f"   平台: {msg['platform']}")
            print(f"   账号: {msg['account_id']}")
            print(f"   消息ID: {msg['message_id']}")
            print(f"   发送者: {msg['sender']}")
            print(f"   内容类型: {msg['content_type']}")
            print(f"   文本内容: {msg['text_content']}")
            
            # 解析图片路径
            if msg['image_paths']:
                try:
                    image_paths = json.loads(msg['image_paths'])
                    print(f"   图片路径: {image_paths}")
                except:
                    print(f"   图片路径: {msg['image_paths']}")
            else:
                print(f"   图片路径: 无")
            
            print(f"   内容指纹: {msg['content_hash']}")
            print(f"   时间戳: {msg['timestamp']}")
            print(f"   是否已读: {'是' if msg['is_read'] else '否'}")
            print(f"   创建时间: {msg['created_at']}")
            print("-" * 50)
        
        return messages
        
    except sqlite3.Error as e:
        print(f"❌ 查询消息失败: {e}")
        return []
    finally:
        if conn:
            conn.close()

def query_sync_status():
    """查询同步状态表"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM platform_sync_status 
            ORDER BY updated_at DESC
        """)
        statuses = cursor.fetchall()
        
        if not statuses:
            print("❌ 没有找到同步状态记录")
            return []
            
        print(f"🔄 找到 {len(statuses)} 个同步状态记录\n")
        
        for i, status in enumerate(statuses, 1):
            print(f"⚡ 同步状态 {i}")
            print(f"   ID: {status['id']}")
            print(f"   平台: {status['platform']}")
            print(f"   账号ID: {status['account_id']}")
            print(f"   最后同步时间: {status['last_sync_time']}")
            print(f"   同步次数: {status['sync_count']}")
            print(f"   最后错误: {status['last_error']}")
            print(f"   更新时间: {status['updated_at']}")
            print("-" * 50)
        
        return statuses
        
    except sqlite3.Error as e:
        print(f"❌ 查询同步状态失败: {e}")
        return []
    finally:
        if conn:
            conn.close()

def query_database_info():
    """查询数据库基本信息"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("📋 数据库基本信息:")
        print(f"   数据库文件: {DB_PATH}")
        print(f"   文件大小: {os.path.getsize(DB_PATH) / 1024 / 1024:.2f} MB")
        
        # 查询表信息
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"   表数量: {len(tables)}")
        print(f"   表列表: {[table['name'] for table in tables]}")
        
        # 查询各表记录数
        for table in tables:
            table_name = table['name']
            cursor.execute(f"SELECT COUNT(*) as count FROM {table_name}")
            count = cursor.fetchone()['count']
            print(f"   {table_name}: {count} 条记录")
        
        print("-" * 50)
        
    except sqlite3.Error as e:
        print(f"❌ 查询数据库信息失败: {e}")
    finally:
        if conn:
            conn.close()

def query_content_hash_analysis():
    """分析内容指纹的分布情况"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("🔍 内容指纹分析:")
        
        # 查询重复指纹
        cursor.execute("""
            SELECT content_hash, COUNT(*) as count, 
                   GROUP_CONCAT(DISTINCT text_content) as texts,
                   GROUP_CONCAT(DISTINCT sender) as senders
            FROM messages 
            WHERE content_hash IS NOT NULL
            GROUP BY content_hash 
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 10
        """)
        
        duplicates = cursor.fetchall()
        
        if duplicates:
            print(f"   发现 {len(duplicates)} 个重复指纹:")
            for dup in duplicates:
                print(f"   指纹: {dup['content_hash']}")
                print(f"   重复次数: {dup['count']}")
                print(f"   文本内容: {dup['texts']}")
                print(f"   发送者: {dup['senders']}")
                print("   ---")
        else:
            print("   ✅ 没有发现重复指纹")
        
        # 查询指纹为空的记录
        cursor.execute("SELECT COUNT(*) as count FROM messages WHERE content_hash IS NULL")
        null_hash_count = cursor.fetchone()['count']
        print(f"   指纹为空的消息数: {null_hash_count}")
        
        # 查询总消息数
        cursor.execute("SELECT COUNT(*) as count FROM messages")
        total_count = cursor.fetchone()['count']
        print(f"   总消息数: {total_count}")
        
        if total_count > 0:
            print(f"   指纹覆盖率: {((total_count - null_hash_count) / total_count * 100):.2f}%")
        
        print("-" * 50)
        
    except sqlite3.Error as e:
        print(f"❌ 内容指纹分析失败: {e}")
    finally:
        if conn:
            conn.close()

def main():
    """主函数"""
    print("🚀 消息数据库查询工具")
    print("=" * 60)
    
    # 检查数据库文件是否存在
    if not os.path.exists(DB_PATH):
        print(f"❌ 数据库文件不存在: {DB_PATH}")
        return
    
    while True:
        print("\n📋 请选择查询选项:")
        print("1. 查询数据库基本信息")
        print("2. 查询消息线程")
        print("3. 查询所有消息 (最近50条)")
        print("4. 查询指定线程的消息")
        print("5. 查询同步状态")
        print("6. 内容指纹分析")
        print("7. 完整报告")
        print("0. 退出")
        
        choice = input("\n请输入选项 (0-7): ").strip()
        
        if choice == '0':
            print("👋 再见!")
            break
        elif choice == '1':
            query_database_info()
        elif choice == '2':
            query_message_threads()
        elif choice == '3':
            query_messages()
        elif choice == '4':
            thread_id = input("请输入线程ID: ").strip()
            try:
                thread_id = int(thread_id)
                query_messages(thread_id=thread_id)
            except ValueError:
                print("❌ 请输入有效的线程ID数字")
        elif choice == '5':
            query_sync_status()
        elif choice == '6':
            query_content_hash_analysis()
        elif choice == '7':
            print("📊 生成完整报告:")
            query_database_info()
            query_message_threads()
            query_messages(limit=20)
            query_sync_status()
            query_content_hash_analysis()
        else:
            print("❌ 无效选项，请重新选择")

if __name__ == "__main__":
    main()