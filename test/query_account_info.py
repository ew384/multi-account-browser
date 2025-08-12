#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime
import os
import sys

# 🔥 导入配置
from config import Config, BASE_DIR, DB_PATH, PLATFORM_TYPE_MAP, get_platform_name

print(f"🔍 基础目录: {BASE_DIR}")
print(f"🔍 数据库路径: {DB_PATH}")

def query_account_info():
    try:
        # 连接数据库
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # 让结果可以通过列名访问
        cursor = conn.cursor()
        
        # 查询所有账号信息
        cursor.execute("""
            SELECT u.*, g.name as group_name, g.color as group_color
            FROM user_info u
            LEFT JOIN account_groups g ON u.group_id = g.id
            ORDER BY u.updated_at DESC
        """)
        accounts = cursor.fetchall()
        
        if not accounts:
            print("❌ 没有找到账号信息")
            return
            
        print(f"📊 找到 {len(accounts)} 个账号\n")
        
        # 统计信息
        total_accounts = len(accounts)
        valid_accounts = sum(1 for acc in accounts if acc['status'] == 1)
        invalid_accounts = total_accounts - valid_accounts
        
        print(f"📈 账号统计:")
        print(f"   总账号数: {total_accounts}")
        print(f"   正常账号: {valid_accounts}")
        print(f"   异常账号: {invalid_accounts}")
        print("=" * 60)
        
        # 显示每个账号的详细信息
        for i, account in enumerate(accounts, 1):
            platform_name = get_platform_name(account['type'])
            status_text = '正常' if account['status'] == 1 else '异常'
            
            print(f"🔥 账号 {i}")
            print(f"   ID: {account['id']}")
            print(f"   用户名: {account['userName']}")
            print(f"   真实姓名: {account['real_name'] or 'N/A'}")
            print(f"   平台: {platform_name} (类型: {account['type']})")
            print(f"   状态: {status_text}")
            print(f"   Cookie文件: {account['filePath']}")
            print(f"   分组: {account['group_name'] or '未分组'}")
            
            # 🔥 重点显示头像相关信息
            print(f"   --- 头像信息 ---")
            print(f"   远程头像URL: {account['avatar_url'] or 'NULL'}")
            print(f"   本地头像路径: {account['local_avatar'] or 'NULL'}")
            
            # 🔥 检查本地头像文件是否存在（使用 Config 路径逻辑）
            if account['local_avatar']:
                # 本地头像路径格式：assets/avatar/{platform}/{username}/avatar.jpg
                local_avatar_full_path = os.path.join(BASE_DIR, account['local_avatar'])
                file_exists = os.path.exists(local_avatar_full_path)
                print(f"   本地文件存在: {'✅' if file_exists else '❌'}")
                print(f"   完整路径: {local_avatar_full_path}")
                
                if file_exists:
                    file_size = os.path.getsize(local_avatar_full_path)
                    print(f"   文件大小: {file_size} bytes")
                    
                    # 🔥 验证路径格式是否正确
                    if account['local_avatar'].startswith('assets/avatar/'):
                        print(f"   路径格式: ✅ 标准格式")
                    else:
                        print(f"   路径格式: ⚠️ 非标准格式")
                else:
                    # 🔥 如果文件不存在，检查可能的路径问题
                    print(f"   🔍 诊断信息:")
                    avatar_dir = os.path.dirname(local_avatar_full_path)
                    print(f"     目录存在: {'✅' if os.path.exists(avatar_dir) else '❌'}")
                    if os.path.exists(avatar_dir):
                        files_in_dir = os.listdir(avatar_dir)
                        print(f"     目录文件: {files_in_dir}")
            else:
                print(f"   本地头像: 无")
            
            # 🔥 分析头像状态
            avatar_status = "无头像"
            if account['local_avatar'] and account['avatar_url']:
                avatar_status = "双重头像"
            elif account['local_avatar']:
                avatar_status = "仅本地头像"
            elif account['avatar_url']:
                avatar_status = "仅远程头像"
            print(f"   头像状态: {avatar_status}")
            
            # 账号详细信息
            print(f"   --- 账号详情 ---")
            print(f"   账号ID: {account['account_id'] or 'N/A'}")
            print(f"   粉丝数: {account['followers_count'] or 'N/A'}")
            print(f"   视频数: {account['videos_count'] or 'N/A'}")
            print(f"   个人简介: {account['bio'] or 'N/A'}")
            
            # 时间信息
            print(f"   --- 时间信息 ---")
            print(f"   最后检查: {account['last_check_time'] or 'N/A'}")
            print(f"   更新时间: {account['updated_at'] or 'N/A'}")
            
            print("-" * 60)
        
        # 🔥 头像统计分析
        print(f"\n📊 头像统计分析:")
        has_remote_avatar = sum(1 for acc in accounts if acc['avatar_url'])
        has_local_avatar = sum(1 for acc in accounts if acc['local_avatar'])
        no_avatar = sum(1 for acc in accounts if not acc['avatar_url'] and not acc['local_avatar'])
        
        print(f"   有远程头像: {has_remote_avatar} 个")
        print(f"   有本地头像: {has_local_avatar} 个")
        print(f"   无头像信息: {no_avatar} 个")
        
        # 🔥 按平台分组显示头像情况
        print(f"\n📱 按平台分析:")
        platform_stats = {}
        for account in accounts:
            platform_name = get_platform_name(account['type'])
            if platform_name not in platform_stats:
                platform_stats[platform_name] = {
                    'total': 0,
                    'with_remote_avatar': 0,
                    'with_local_avatar': 0,
                    'valid': 0
                }
            
            platform_stats[platform_name]['total'] += 1
            if account['avatar_url']:
                platform_stats[platform_name]['with_remote_avatar'] += 1
            if account['local_avatar']:
                platform_stats[platform_name]['with_local_avatar'] += 1
            if account['status'] == 1:
                platform_stats[platform_name]['valid'] += 1
        
        for platform, stats in platform_stats.items():
            print(f"   {platform}:")
            print(f"     总数: {stats['total']} | 正常: {stats['valid']}")
            print(f"     远程头像: {stats['with_remote_avatar']} | 本地头像: {stats['with_local_avatar']}")
        
    except sqlite3.Error as e:
        print(f"❌ 数据库错误: {e}")
    except Exception as e:
        print(f"❌ 脚本错误: {e}")
    finally:
        if conn:
            conn.close()

def query_specific_account(username=None, platform_type=None):
    """查询特定账号"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        sql = """
            SELECT u.*, g.name as group_name, g.color as group_color
            FROM user_info u
            LEFT JOIN account_groups g ON u.group_id = g.id
            WHERE 1=1
        """
        params = []
        
        if username:
            sql += " AND u.userName LIKE ?"
            params.append(f"%{username}%")
            
        if platform_type:
            sql += " AND u.type = ?"
            params.append(platform_type)
            
        sql += " ORDER BY u.updated_at DESC"
        
        cursor.execute(sql, params)
        accounts = cursor.fetchall()
        
        if not accounts:
            print("❌ 没有找到匹配的账号")
            return
            
        print(f"🔍 找到 {len(accounts)} 个匹配账号:")
        for account in accounts:
            platform_name = get_platform_name(account['type'])
            status_text = '正常' if account['status'] == 1 else '异常'
            print(f"   {account['userName']} ({platform_name}) - {status_text}")
            print(f"   远程头像: {account['avatar_url'] or 'NULL'}")
            print(f"   本地头像: {account['local_avatar'] or 'NULL'}")
            print()
            
    except sqlite3.Error as e:
        print(f"❌ 数据库错误: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "search":
            username = sys.argv[2] if len(sys.argv) > 2 else None
            platform = int(sys.argv[3]) if len(sys.argv) > 3 else None
            query_specific_account(username, platform)
        else:
            print("用法: python script.py [search] [用户名] [平台类型]")
            print("平台类型: 1=小红书, 2=视频号, 3=抖音, 4=快手")
    else:
        query_account_info()