#!/usr/bin/env python3
import sqlite3
from config import DB_PATH

def debug_autoincrement():
    """快速验证 SQLite 自增 ID 机制"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查当前消息数
        cursor.execute("SELECT COUNT(*) FROM messages")
        count = cursor.fetchone()[0]
        print(f"当前消息数: {count}")
        
        # 检查序列表 - 这是关键！
        cursor.execute("SELECT seq FROM sqlite_sequence WHERE name = 'messages'")
        result = cursor.fetchone()
        if result:
            print(f"🔑 关键发现: messages表的序列值是 {result[0]}")
            print(f"   这意味着下一个插入的ID将是: {result[0] + 1}")
            print(f"   即使表中没有数据，序列值也保持在 {result[0]}！")
        else:
            print("未找到序列记录")
            
    except Exception as e:
        print(f"错误: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    debug_autoincrement()