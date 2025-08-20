#!/usr/bin/env node

// 高级Better-SQLite3事务异常测试
// 模拟可能导致你系统问题的各种异常情况

const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');

const testDbPath = './test_advanced_transaction.db';

if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

console.log('🚀 开始高级事务异常测试...');

const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');

// 创建表
db.exec(`
    CREATE TABLE IF NOT EXISTS message_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        unread_count INTEGER DEFAULT 0,
        last_message_time TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, account_id, user_id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        sender TEXT NOT NULL CHECK(sender IN ('me', 'user')),
        content_type TEXT NOT NULL CHECK(content_type IN ('text', 'image', 'mixed')),
        text_content TEXT,
        content_hash TEXT UNIQUE,  -- 🔥 添加UNIQUE约束，可能导致冲突
        timestamp TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
    )
`);

console.log('✅ 测试表创建完成（含UNIQUE约束）');

function generateContentHash(messages, currentIndex, threadId) {
    const current = messages[currentIndex];
    const contextParts = [];
    
    contextParts.push(`thread:${threadId}`);
    
    const currentText = (current.text || '').trim().replace(/\s+/g, ' ');
    contextParts.push(`current:${current.sender}:${currentText}`);
    
    const lookBackCount = Math.min(5, currentIndex);
    for (let i = 0; i < lookBackCount; i++) {
        const historyIndex = currentIndex - 1 - i;
        const historyMsg = messages[historyIndex];
        const historyText = (historyMsg.text || '').trim().replace(/\s+/g, ' ').substring(0, 50);
        contextParts.push(`h${i}:${historyMsg.sender}:${historyText}`);
    }
    
    contextParts.push(`pos:${currentIndex}`);
    
    const content = contextParts.join('::');
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

function saveOrUpdateThread(threadData) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO message_threads (
            id, platform, account_id, user_id, user_name, 
            unread_count, last_message_time, 
            created_at, updated_at
        ) VALUES (
            (SELECT id FROM message_threads WHERE platform = ? AND account_id = ? AND user_id = ?),
            ?, ?, ?, ?, ?, ?, 
            COALESCE((SELECT created_at FROM message_threads WHERE platform = ? AND account_id = ? AND user_id = ?), CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        )
    `);

    const result = stmt.run(
        threadData.platform, threadData.account_id, threadData.user_id,
        threadData.platform, threadData.account_id, threadData.user_id, 
        threadData.user_name, threadData.unread_count, threadData.last_message_time,
        threadData.platform, threadData.account_id, threadData.user_id
    );

    return result.lastInsertRowid;
}

// 🔥 模拟可能失败的updateThreadStatus
function updateThreadStatusMayFail(threadId, lastMessageTime, shouldFail = false) {
    try {
        if (shouldFail) {
            // 🔥 故意制造失败
            throw new Error('模拟线程状态更新失败');
        }
        
        const stmt = db.prepare(`
            UPDATE message_threads 
            SET last_message_time = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        
        stmt.run(lastMessageTime, threadId);
        console.log(`  ✅ 线程状态更新成功: ID=${threadId}`);
    } catch (error) {
        console.error(`  ❌ 线程状态更新失败:`, error.message);
        throw error; // 🔥 抛出异常，可能导致事务回滚
    }
}

// 🔥 模拟会产生约束冲突的消息插入
function addMessagesWithConflicts(threadId, allMessages, sessionTime, createConflict = false) {
    console.log(`  📝 addMessagesWithConflicts: 线程${threadId}, ${allMessages.length}条消息, 冲突=${createConflict}`);
    
    const timestamp = sessionTime || new Date().toISOString();
    
    const messageTransaction = db.transaction(() => {
        const insertStmt = db.prepare(`
            INSERT INTO messages (
                thread_id, sender, content_type, 
                text_content, content_hash, timestamp, is_read
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        let actualInsertCount = 0;
        
        for (let i = 0; i < allMessages.length; i++) {
            const message = allMessages[i];
            let contentHash = generateContentHash(allMessages, i, threadId);
            
            // 🔥 故意制造hash冲突
            if (createConflict && i === 3) {
                contentHash = generateContentHash(allMessages, 0, threadId); // 重复第一条的hash
                console.log(`    🔥 故意制造hash冲突: 第${i+1}条使用第1条的hash`);
            }
            
            try {
                const result = insertStmt.run(
                    threadId,
                    message.sender,
                    'text',
                    message.text,
                    contentHash,
                    timestamp,
                    0
                );
                
                actualInsertCount++;
                console.log(`    ✅ 第${i+1}条: ID=${result.lastInsertRowid}, hash=${contentHash.substring(0, 8)}...`);
                
            } catch (error) {
                console.error(`    ❌ 插入第${i+1}条消息失败:`, error.message);
                if (error.message.includes('UNIQUE constraint failed')) {
                    console.error(`    🔥 发现UNIQUE约束冲突！`);
                }
                throw error; // 🔥 抛出异常，导致事务回滚
            }
        }

        // 🔥 在事务末尾可能失败的操作
        if (actualInsertCount > 0) {
            const shouldUpdateFail = createConflict; // 如果有冲突，也让更新失败
            updateThreadStatusMayFail(threadId, timestamp, shouldUpdateFail);
        }

        return actualInsertCount;
    });

    return messageTransaction();
}

// 🔥 完全模拟你的incrementalSync结构
function simulateIncrementalSync(syncData, createProblems = false) {
    console.log(`🔄 模拟incrementalSync: ${syncData.length}个线程, 制造问题=${createProblems}`);
    
    let totalNewMessages = 0;
    let updatedThreads = 0;
    const errors = [];

    // 🔥 这里是你的大事务
    const syncTransaction = db.transaction(() => {
        for (let i = 0; i < syncData.length; i++) {
            const threadData = syncData[i];
            
            try {
                console.log(`  处理线程 ${i+1}/${syncData.length}: ${threadData.user_name}`);
                
                // 保存线程
                const threadId = saveOrUpdateThread(threadData);
                console.log(`    ✅ 线程已保存: ID=${threadId}`);
                
                // 🔥 插入消息（可能失败）
                const shouldFail = createProblems && i === 1; // 第2个线程制造问题
                const newCount = addMessagesWithConflicts(
                    threadId, 
                    threadData.messages, 
                    threadData.last_message_time,
                    shouldFail
                );
                
                totalNewMessages += newCount;
                updatedThreads++;
                
            } catch (error) {
                const errorMsg = `线程 ${threadData.user_name} 处理失败: ${error.message}`;
                errors.push(errorMsg);
                console.error(`    ❌ ${errorMsg}`);
                // 🔥 关键：这里抛出异常会导致整个大事务回滚
                throw error;
            }
        }
        
        return { totalNewMessages, updatedThreads, errors };
    });

    try {
        return syncTransaction();
    } catch (error) {
        console.error(`❌ 整个同步事务失败:`, error.message);
        return { totalNewMessages: 0, updatedThreads: 0, errors: [error.message] };
    }
}

// 测试数据
const testSyncData = [
    {
        platform: 'wechat',
        account_id: 'test_account',
        user_id: 'user_1',
        user_name: '用户1',
        unread_count: 0,
        last_message_time: '2025-08-20T07:03:00.000Z',
        messages: [
            { sender: 'user', text: '你好' },
            { sender: 'me', text: '你好' },
            { sender: 'user', text: '测试消息' }
        ]
    },
    {
        platform: 'wechat',
        account_id: 'test_account',
        user_id: 'user_2',
        user_name: '用户2',
        unread_count: 0,
        last_message_time: '2025-08-20T07:04:00.000Z',
        messages: [
            { sender: 'user', text: '第二个用户' },
            { sender: 'me', text: '回复' },
            { sender: 'user', text: '再次回复' },
            { sender: 'me', text: '最后回复' }
        ]
    },
    {
        platform: 'wechat',
        account_id: 'test_account',
        user_id: 'user_3',
        user_name: '用户3',
        unread_count: 0,
        last_message_time: '2025-08-20T07:05:00.000Z',
        messages: [
            { sender: 'user', text: '第三个用户的消息' },
            { sender: 'me', text: '好的' }
        ]
    }
];

// 🔥 测试4: 正常情况
console.log('\n🧪 测试4: 正常同步（无问题）');
const result4 = simulateIncrementalSync(testSyncData, false);
console.log(`📊 结果4:`, result4);

const check4 = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 测试4后消息数: ${check4.count}`);

// 清理
db.exec('DELETE FROM messages');
db.exec('DELETE FROM message_threads');

// 🔥 测试5: 异常情况（在事务中间发生错误）
console.log('\n🧪 测试5: 异常同步（第2个线程故意失败）');
const result5 = simulateIncrementalSync(testSyncData, true);
console.log(`📊 结果5:`, result5);

const check5 = db.prepare('SELECT COUNT(*) as count FROM messages').get();
const threadCheck5 = db.prepare('SELECT COUNT(*) as count FROM message_threads').get();
console.log(`📊 测试5后消息数: ${check5.count}`);
console.log(`📊 测试5后线程数: ${threadCheck5.count}`);

// 🔥 WAL检查点
console.log('\n🔄 执行WAL检查点...');
const checkpoint = db.pragma('wal_checkpoint(FULL)');
console.log(`✅ WAL检查点完成:`, checkpoint);

const finalCheck = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 WAL后最终消息数: ${finalCheck.count}`);

// 分析结果
console.log('\n📊 高级测试总结:');
console.log(`正常同步: ${check4.count} 条消息`);
console.log(`异常同步: ${check5.count} 条消息`);

if (check4.count > 0 && check5.count === 0) {
    console.log('✅ 确认：事务中的异常会导致整个事务回滚！');
    console.log('🔧 解决方案：避免在大事务中处理可能失败的操作');
} else if (check5.count > 0 && check5.count < check4.count) {
    console.log('⚠️ 部分回滚：某些操作成功了，某些失败了');
} else {
    console.log('❓ 异常测试未产生预期结果');
}

db.close();
console.log('\n🎉 高级测试完成！');