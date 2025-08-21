def diagnose_wal_issue():
    """诊断WAL模式可能导致的数据丢失"""
    print("🔍 诊断WAL模式数据丢失问题")
    print("=" * 60)
    
    try:
        # 1. 检查数据库文件状态
        print("📊 1. 数据库文件状态:")
        if os.path.exists(DB_PATH):
            db_size = os.path.getsize(DB_PATH)
            print(f"   主数据库文件: {db_size} bytes")
        else:
            print("   ❌ 主数据库文件不存在")
            return
        
        # 检查WAL和SHM文件
        wal_path = DB_PATH + "-wal"
        shm_path = DB_PATH + "-shm"
        
        if os.path.exists(wal_path):
            wal_size = os.path.getsize(wal_path)
            print(f"   WAL文件: {wal_size} bytes")
        else:
            print("   WAL文件: 不存在")
            
        if os.path.exists(shm_path):
            shm_size = os.path.getsize(shm_path)
            print(f"   SHM文件: {shm_size} bytes")
        else:
            print("   SHM文件: 不存在")
        
        # 2. 连接数据库并检查模式
        print("\n📊 2. 数据库模式检查:")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查journal模式
        cursor.execute("PRAGMA journal_mode")
        journal_mode = cursor.fetchone()[0]
        print(f"   Journal模式: {journal_mode}")
        
        # 检查同步模式
        cursor.execute("PRAGMA synchronous")
        sync_mode = cursor.fetchone()[0]
        print(f"   同步模式: {sync_mode}")
        
        # 检查WAL自动检查点
        cursor.execute("PRAGMA wal_autocheckpoint")
        wal_autocheckpoint = cursor.fetchone()[0]
        print(f"   WAL自动检查点: {wal_autocheckpoint}")
        
        # 3. 检查数据完整性
        print("\n📊 3. 数据完整性检查:")
        try:
            cursor.execute("PRAGMA integrity_check")
            integrity = cursor.fetchone()[0]
            print(f"   完整性检查: {integrity}")
        except Exception as e:
            print(f"   完整性检查失败: {e}")
        
        # 4. 强制WAL检查点
        print("\n📊 4. 强制WAL检查点:")
        try:
            cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            checkpoint_result = cursor.fetchone()
            print(f"   检查点结果: {checkpoint_result}")
            
            # 重新检查messages表
            cursor.execute("SELECT COUNT(*) FROM messages")
            message_count = cursor.fetchone()[0]
            print(f"   检查点后messages数量: {message_count}")
            
        except Exception as e:
            print(f"   WAL检查点失败: {e}")
        
        # 5. 检查表是否存在但为空
        print("\n📊 5. 表存在性检查:")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        for table in tables:
            table_name = table[0]
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cursor.fetchone()[0]
                print(f"   {table_name}: {count} 条记录")
            except Exception as e:
                print(f"   {table_name}: 查询失败 - {e}")
        
        # 6. 测试插入和立即查询
        print("\n📊 6. 数据持久性测试:")
        try:
            # 插入测试数据
            cursor.execute("""
                INSERT INTO messages (thread_id, sender, content_type, text_content, timestamp, is_read)
                VALUES (1, 'test', 'text', 'persistence test', datetime('now'), 0)
            """)
            
            insert_id = cursor.lastrowid
            print(f"   插入测试记录ID: {insert_id}")
            
            # 立即查询
            cursor.execute("SELECT * FROM messages WHERE id = ?", (insert_id,))
            result = cursor.fetchone()
            if result:
                print("   ✅ 立即查询成功")
            else:
                print("   ❌ 立即查询失败")
            
            # 提交事务
            conn.commit()
            print("   事务已提交")
            
            # 再次查询
            cursor.execute("SELECT * FROM messages WHERE id = ?", (insert_id,))
            result = cursor.fetchone()
            if result:
                print("   ✅ 提交后查询成功")
            else:
                print("   ❌ 提交后查询失败")
            
            # 清理测试数据
            cursor.execute("DELETE FROM messages WHERE id = ?", (insert_id,))
            conn.commit()
            print("   测试数据已清理")
            
        except Exception as e:
            print(f"   数据持久性测试失败: {e}")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ 诊断失败: {e}")

def suggest_wal_fixes():
    """建议WAL相关修复方案"""
    print("\n🔧 WAL相关修复建议:")
    print("1. 在应用启动时强制WAL检查点")
    print("2. 使用DELETE模式而不是WAL模式")
    print("3. 确保所有连接都正确关闭")
    print("4. 添加数据库连接池管理")
    print("5. 在关键操作后强制同步")

if __name__ == "__main__":
    diagnose_wal_issue()
    suggest_wal_fixes()