#!/usr/bin/env python3
import sqlite3
import shutil
import os
from config import DB_PATH

def force_data_recovery():
    """强制数据恢复和保护"""
    print("🚨 强制数据恢复操作")
    print("=" * 50)
    
    # 1. 先备份当前数据库文件
    backup_dir = os.path.dirname(DB_PATH) + "/backup"
    os.makedirs(backup_dir, exist_ok=True)
    
    backup_db = os.path.join(backup_dir, "database_backup.db")
    backup_wal = os.path.join(backup_dir, "database_backup.db-wal")
    backup_shm = os.path.join(backup_dir, "database_backup.db-shm")
    
    try:
        shutil.copy2(DB_PATH, backup_db)
        if os.path.exists(DB_PATH + "-wal"):
            shutil.copy2(DB_PATH + "-wal", backup_wal)
        if os.path.exists(DB_PATH + "-shm"):
            shutil.copy2(DB_PATH + "-shm", backup_shm)
        print(f"✅ 数据库已备份到: {backup_dir}")
    except Exception as e:
        print(f"⚠️ 备份失败: {e}")
    
    try:
        # 2. 强制关闭所有可能的连接
        print("🔒 强制关闭所有数据库连接...")
        
        # 3. 打开新连接并强制检查点
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查当前状态
        cursor.execute("SELECT COUNT(*) FROM messages")
        before_count = cursor.fetchone()[0]
        print(f"检查点前消息数: {before_count}")
        
        # 强制WAL检查点 - 使用最激进的模式
        print("🔄 执行强制WAL检查点 (TRUNCATE模式)...")
        cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        result = cursor.fetchone()
        print(f"检查点结果: {result}")
        
        # 检查检查点后状态
        cursor.execute("SELECT COUNT(*) FROM messages")
        after_count = cursor.fetchone()[0]
        print(f"检查点后消息数: {after_count}")
        
        # 4. 如果数据仍然丢失，尝试从WAL文件恢复
        if after_count == 0 and os.path.exists(backup_wal):
            print("🔄 尝试从备份WAL文件恢复...")
            
            # 恢复WAL文件
            shutil.copy2(backup_wal, DB_PATH + "-wal")
            if os.path.exists(backup_shm):
                shutil.copy2(backup_shm, DB_PATH + "-shm")
            
            # 重新尝试检查点
            cursor.execute("PRAGMA wal_checkpoint(FULL)")
            result2 = cursor.fetchone()
            print(f"恢复后检查点结果: {result2}")
            
            cursor.execute("SELECT COUNT(*) FROM messages")
            final_count = cursor.fetchone()[0]
            print(f"最终消息数: {final_count}")
        
        # 5. 显示恢复的数据
        if after_count > 0:
            print(f"\n📊 恢复成功! 找到 {after_count} 条消息")
            
            # 显示最新的几条消息
            cursor.execute("""
                SELECT m.id, t.user_name, m.sender, m.text_content, m.timestamp
                FROM messages m
                JOIN message_threads t ON m.thread_id = t.id
                ORDER BY m.id DESC
                LIMIT 10
            """)
            messages = cursor.fetchall()
            
            print("\n最新10条消息:")
            for msg in messages:
                print(f"  ID{msg[0]}: {msg[1]} - {msg[2]} - {msg[3][:50]}... - {msg[4]}")
        
        # 6. 优化数据库
        print("\n🔧 优化数据库...")
        cursor.execute("PRAGMA optimize")
        cursor.execute("ANALYZE")
        
        conn.commit()
        conn.close()
        
        print("✅ 数据恢复操作完成!")
        
    except Exception as e:
        print(f"❌ 恢复失败: {e}")
    
    # 7. 显示最终文件状态
    print("\n📁 最终文件状态:")
    for suffix in ['', '-wal', '-shm']:
        file_path = DB_PATH + suffix
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            print(f"  {os.path.basename(file_path)}: {size:,} 字节")
        else:
            print(f"  {os.path.basename(file_path)}: 不存在")

if __name__ == "__main__":
    force_data_recovery()