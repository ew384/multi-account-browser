#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime

# 数据库路径
from config import Config, BASE_DIR, DB_PATH, PLATFORM_TYPE_MAP, get_platform_name

print(f"🔍 基础目录: {BASE_DIR}")
print(f"🔍 数据库路径: {DB_PATH}")


def query_publish_records():
    try:
        # 连接数据库
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # 让结果可以通过列名访问
        cursor = conn.cursor()
        
        # 查询所有发布记录
        cursor.execute("SELECT * FROM publish_records ORDER BY created_at DESC")
        records = cursor.fetchall()
        
        if not records:
            print("❌ 没有找到发布记录")
            return
            
        print(f"📊 找到 {len(records)} 条发布记录\n")
        
        # 显示每条记录
        for i, record in enumerate(records, 1):
            print(f"🔥 记录 {i}")
            print(f"   ID: {record['id']}")
            print(f"   标题: {record['title']}")
            print(f"   平台类型: {record['platform_type']}")
            print(f"   状态: {record['status']}")
            print(f"   总账号数: {record['total_accounts']}")
            print(f"   成功账号数: {record['success_accounts']}")
            print(f"   失败账号数: {record['failed_accounts']}")
            print(f"   开始时间: {record['start_time']}")
            print(f"   结束时间: {record['end_time']}")
            print(f"   耗时(秒): {record['duration']}")
            print(f"   创建者: {record['created_by']}")
            print(f"   创建时间: {record['created_at']}")
            print(f"   更新时间: {record['updated_at']}")
            
            # 解析 JSON 字段
            try:
                video_files = json.loads(record['video_files']) if record['video_files'] else []
                print(f"   视频文件: {video_files}")
            except:
                print(f"   视频文件: {record['video_files']}")
            
            try:
                account_list = json.loads(record['account_list']) if record['account_list'] else []
                print(f"   账号列表: {len(account_list)} 个账号")
            except:
                print(f"   账号列表: {record['account_list']}")
            
            try:
                cover_screenshots = json.loads(record['cover_screenshots']) if record['cover_screenshots'] else []
                print(f"   封面截图: {cover_screenshots}")
            except:
                print(f"   封面截图: {record['cover_screenshots']}")
                
            print("-" * 50)
        
    except sqlite3.Error as e:
        print(f"❌ 数据库错误: {e}")
    except Exception as e:
        print(f"❌ 脚本错误: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    query_publish_records()
