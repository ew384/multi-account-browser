#!/usr/bin/env python3
import sqlite3
import json
import hashlib
from datetime import datetime
import os

# 数据库路径 - 修改为你的实际路径
DB_PATH = "/home/endian/.config/multi-account-browser/db/database.db"

def get_db_connection():
    """获取数据库连接，模拟Better-SQLite3的设置"""
    conn = sqlite3.connect(DB_PATH)
    
    # 模拟Better-SQLite3的pragma设置
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL") 
    conn.execute("PRAGMA cache_size = 1000")
    conn.execute("PRAGMA temp_store = memory")
    conn.execute("PRAGMA wal_autocheckpoint = 1000")
    
    return conn

def generate_content_hash(messages, current_index, thread_id):
    """模拟TypeScript中的generateStableHistoryFingerprint方法"""
    current = messages[current_index]
    context_parts = []
    
    # 1. 线程ID
    context_parts.append(f"thread:{thread_id}")
    
    # 2. 当前消息内容
    current_text = (current.get('text') or '').strip()
    current_text = ' '.join(current_text.split())  # 替换多个空格为单个
    context_parts.append(f"current:{current['sender']}:{current_text}")
    
    # 3. 向前查找最多5条消息作为上下文
    look_back_count = min(5, current_index)
    for i in range(look_back_count):
        history_index = current_index - 1 - i
        history_msg = messages[history_index]
        history_text = (history_msg.get('text') or '').strip()
        history_text = ' '.join(history_text.split())[:50]  # 限制长度
        context_parts.append(f"h{i}:{history_msg['sender']}:{history_text}")
    
    # 4. 图片指纹（如果有）
    if current.get('images'):
        context_parts.append(f"img:{'|'.join(current['images'])}")
    
    # 5. 位置信息
    context_parts.append(f"pos:{current_index}")
    
    content = "::".join(context_parts)
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def test_message_insert():
    """模拟消息插入过程"""
    print("🚀 开始模拟消息插入测试...")
    
    # 检查数据库文件
    if not os.path.exists(DB_PATH):
        print(f"❌ 数据库文件不存在: {DB_PATH}")
        return
    
    print(f"📂 数据库文件: {DB_PATH}")
    print(f"📊 文件大小: {os.path.getsize(DB_PATH) / 1024:.2f} KB")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 1. 检查当前数据状态
        print("\n📋 检查当前数据状态...")
        cursor.execute("SELECT COUNT(*) FROM message_threads")
        thread_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM messages")
        message_count = cursor.fetchone()[0]
        
        print(f"  线程数: {thread_count}")
        print(f"  消息数: {message_count}")
        
        # 2. 获取一个现有线程ID（如果存在）
        cursor.execute("SELECT id, user_name FROM message_threads LIMIT 1")
        thread_result = cursor.fetchone()
        
        if not thread_result:
            print("❌ 没有找到现有线程，创建测试线程...")
            cursor.execute("""
                INSERT INTO message_threads (
                    platform, account_id, user_id, user_name, 
                    unread_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                'wechat', 'test_account', 'test_user_123', 'Python测试用户',
                0, datetime.now().isoformat(), datetime.now().isoformat()
            ))
            thread_id = cursor.lastrowid
            thread_name = 'Python测试用户'
            print(f"✅ 创建测试线程: ID={thread_id}, name={thread_name}")
        else:
            thread_id, thread_name = thread_result
            print(f"✅ 使用现有线程: ID={thread_id}, name={thread_name}")
        
        # 3. 模拟消息数据（类似于你的实际数据）
        test_messages = [
            {"sender": "user", "text": "你的电话"},
            {"sender": "user", "text": "[呲牙]"},
            {"sender": "me", "text": "好"},
            {"sender": "user", "text": "好"},
            {"sender": "me", "text": "测试"},
            {"sender": "user", "text": "我今天生病还要测试"}
        ]
        
        print(f"\n📝 准备插入 {len(test_messages)} 条测试消息...")
        
        # 4. 模拟addMessagesSync的逻辑
        timestamp = "2025-08-20T07:03:00.000Z"
        
        # 准备插入语句
        insert_sql = """
            INSERT INTO messages (
                thread_id, message_id, sender, content_type, 
                text_content, content_hash, timestamp, is_read
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        inserted_ids = []
        
        for i, message in enumerate(test_messages):
            # 生成内容哈希
            content_hash = generate_content_hash(test_messages, i, thread_id)
            content_type = 'text'
            
            print(f"  📤 插入第{i+1}条: sender={message['sender']}, text=\"{message['text'][:20]}...\", hash={content_hash[:8]}...")
            
            try:
                cursor.execute(insert_sql, (
                    thread_id,
                    None,  # message_id
                    message['sender'],
                    content_type,
                    message['text'],
                    content_hash,
                    timestamp,
                    0  # is_read
                ))
                
                inserted_id = cursor.lastrowid
                inserted_ids.append(inserted_id)
                
                print(f"    ✅ SQL执行成功: ID={inserted_id}, rowid={cursor.lastrowid}")
                
                # 立即验证这条记录
                cursor.execute("SELECT id, text_content, content_hash FROM messages WHERE id = ?", (inserted_id,))
                verify_result = cursor.fetchone()
                
                if verify_result:
                    verify_id, verify_text, verify_hash = verify_result
                    print(f"    ✅ 立即验证成功: ID={verify_id}, text=\"{verify_text[:20]}...\", hash={verify_hash[:8]}...")
                else:
                    print(f"    ❌ 立即验证失败: 插入的记录ID={inserted_id} 查询不到!")
                    
            except Exception as e:
                print(f"    ❌ 插入失败: {e}")
                break
        
        print(f"\n📊 插入完成: {len(inserted_ids)} 条消息")
        
        # 5. 检查插入后的总数
        print("\n🔍 检查插入后的数据状态...")
        cursor.execute("SELECT COUNT(*) FROM messages")
        new_message_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM messages WHERE thread_id = ?", (thread_id,))
        thread_message_count = cursor.fetchone()[0]
        
        print(f"  总消息数: {new_message_count} (之前: {message_count})")
        print(f"  线程{thread_id}消息数: {thread_message_count}")
        
        # 6. 模拟事务提交
        print("\n💾 提交事务...")
        conn.commit()
        
        # 7. 事务提交后再次检查
        print("\n🔍 事务提交后检查...")
        cursor.execute("SELECT COUNT(*) FROM messages")
        final_message_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM messages WHERE thread_id = ?", (thread_id,))
        final_thread_message_count = cursor.fetchone()[0]
        
        print(f"  最终总消息数: {final_message_count}")
        print(f"  最终线程{thread_id}消息数: {final_thread_message_count}")
        
        # 8. 模拟WAL检查点
        print("\n🔄 执行WAL检查点...")
        cursor.execute("PRAGMA wal_checkpoint(FULL)")
        checkpoint_result = cursor.fetchone()
        print(f"✅ WAL检查点完成: {checkpoint_result}")
        
        # 9. WAL检查点后最终检查
        print("\n🔍 WAL检查点后最终检查...")
        cursor.execute("SELECT COUNT(*) FROM messages")
        post_wal_message_count = cursor.fetchone()[0]
        
        print(f"  WAL后总消息数: {post_wal_message_count}")
        
        # 10. 分析结果
        print("\n📊 结果分析:")
        if len(inserted_ids) > 0 and final_message_count == message_count:
            print("❌ 复现问题: 插入操作执行成功但数据没有持久化!")
            print("❌ 这确认了你遇到的问题")
        elif final_message_count > message_count:
            print("✅ 插入成功: 数据正确持久化")
        else:
            print("❓ 未知状态")
            
        # 11. 显示最近插入的消息
        print("\n📋 最近插入的消息:")
        cursor.execute("""
            SELECT id, thread_id, sender, text_content, content_hash, timestamp
            FROM messages 
            WHERE thread_id = ?
            ORDER BY id DESC 
            LIMIT 10
        """, (thread_id,))
        
        recent_messages = cursor.fetchall()
        for msg in recent_messages:
            msg_id, t_id, sender, text, hash_val, ts = msg
            print(f"  ID={msg_id}: {sender} - \"{text[:30]}...\" hash={hash_val[:8]}... time={ts}")
            
    except Exception as e:
        print(f"❌ 测试过程出错: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    test_message_insert()