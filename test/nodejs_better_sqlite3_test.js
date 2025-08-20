#!/usr/bin/env node

// Node.js Better-SQLite3 事务冲突测试脚本
// 用于验证嵌套事务导致数据插入失败的问题

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 测试数据库路径
const testDbPath = './test_transaction_conflict.db';

// 清理之前的测试数据库
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

console.log('🚀 开始 Better-SQLite3 事务冲突测试...');

// 创建数据库连接，模拟你的配置
const db = new Database(testDbPath);

// 设置与你系统相同的pragma
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');

console.log('✅ 数据库创建完成，WAL模式已启用');

// 创建测试表
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
        content_hash TEXT,
        timestamp TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
    )
`);

console.log('✅ 测试表创建完成');

// 生成内容hash的函数（模拟你的逻辑）
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

// 模拟你的 saveOrUpdateThread 方法
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
        threadData.platform, threadData.account_id, threadData.user_id,  // SELECT id
        threadData.platform, threadData.account_id, threadData.user_id, 
        threadData.user_name, threadData.unread_count, threadData.last_message_time,
        threadData.platform, threadData.account_id, threadData.user_id   // SELECT created_at
    );

    return result.lastInsertRowid;
}

// 模拟你的 updateThreadStatus 方法
function updateThreadStatus(threadId, lastMessageTime, incrementUnread = false) {
    try {
        let stmt;
        if (incrementUnread) {
            stmt = db.prepare(`
                UPDATE message_threads 
                SET last_message_time = ?, 
                    unread_count = unread_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
        } else {
            stmt = db.prepare(`
                UPDATE message_threads 
                SET last_message_time = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
        }
        
        stmt.run(lastMessageTime, threadId);
        console.log(`  ✅ 线程状态更新成功: ID=${threadId}`);
    } catch (error) {
        console.error(`  ❌ 线程状态更新失败:`, error);
        throw error; // 这里抛出异常可能导致问题
    }
}

// 模拟你的 addMessagesSync 方法（有内部事务的版本）
function addMessagesSyncWithTransaction(threadId, allMessages, sessionTime) {
    console.log(`  📝 addMessagesSyncWithTransaction: 线程${threadId}, ${allMessages.length}条消息`);
    
    if (allMessages.length === 0) return 0;
    
    const timestamp = sessionTime || new Date().toISOString();
    
    // 🔥 这里模拟内部事务（可能导致问题）
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
            const contentHash = generateContentHash(allMessages, i, threadId);
            
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
                console.log(`    ✅ 第${i+1}条: ID=${result.lastInsertRowid}, "${message.text.substring(0, 20)}..."`);
                
            } catch (error) {
                console.error(`    ❌ 插入第${i+1}条消息失败:`, error);
                throw error;
            }
        }

        // 🔥 在内部事务中调用 updateThreadStatus
        if (actualInsertCount > 0) {
            const lastMessage = allMessages[allMessages.length - 1];
            const isFromUser = lastMessage.sender === 'user';
            updateThreadStatus(threadId, timestamp, isFromUser);
        }

        return actualInsertCount;
    });

    return messageTransaction();
}

// 模拟你的 addMessagesSync 方法（无事务版本）
function addMessagesSyncNoTransaction(threadId, allMessages, sessionTime) {
    console.log(`  📝 addMessagesSyncNoTransaction: 线程${threadId}, ${allMessages.length}条消息`);
    
    if (allMessages.length === 0) return 0;
    
    const timestamp = sessionTime || new Date().toISOString();
    
    // 🔥 直接执行，不包装在事务中
    const insertStmt = db.prepare(`
        INSERT INTO messages (
            thread_id, sender, content_type, 
            text_content, content_hash, timestamp, is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let actualInsertCount = 0;
    
    for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];
        const contentHash = generateContentHash(allMessages, i, threadId);
        
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
            console.log(`    ✅ 第${i+1}条: ID=${result.lastInsertRowid}, "${message.text.substring(0, 20)}..."`);
            
        } catch (error) {
            console.error(`    ❌ 插入第${i+1}条消息失败:`, error);
            return actualInsertCount;
        }
    }

    // 🔥 在事务外调用 updateThreadStatus
    if (actualInsertCount > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const isFromUser = lastMessage.sender === 'user';
        try {
            updateThreadStatus(threadId, timestamp, isFromUser);
        } catch (error) {
            console.warn(`    ⚠️ 线程状态更新失败，但消息插入成功:`, error);
        }
    }

    return actualInsertCount;
}

// 测试数据
const testThreadData = {
    platform: 'wechat',
    account_id: 'test_account',
    user_id: 'test_user_123',
    user_name: 'Node.js测试用户',
    unread_count: 0,
    last_message_time: '2025-08-20T07:03:00.000Z'
};

const testMessages = [
    { sender: 'user', text: '你的电话' },
    { sender: 'user', text: '[呲牙]' },
    { sender: 'me', text: '好' },
    { sender: 'user', text: '好' },
    { sender: 'me', text: '测试' },
    { sender: 'user', text: '我今天生病还要测试' }
];

// 🔥 测试1: 模拟你当前的代码（外层事务 + 内层事务）
console.log('\n🧪 测试1: 嵌套事务版本（模拟当前问题）');

const problematicSync = db.transaction(() => {
    console.log('  🔄 开始外层事务...');
    
    // 保存线程
    const threadId = saveOrUpdateThread(testThreadData);
    console.log(`  ✅ 线程已保存: ID=${threadId}`);
    
    // 🔥 这里调用带内部事务的消息插入
    const insertedCount = addMessagesSyncWithTransaction(threadId, testMessages, testThreadData.last_message_time);
    console.log(`  📊 插入消息数: ${insertedCount}`);
    
    return { threadId, insertedCount };
});

try {
    const result1 = problematicSync();
    console.log(`✅ 外层事务执行完成:`, result1);
} catch (error) {
    console.error(`❌ 外层事务执行失败:`, error);
}

// 检查结果
const checkMessages1 = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 测试1结果 - 数据库中消息数: ${checkMessages1.count}`);

// 清理数据准备测试2
db.exec('DELETE FROM messages');
db.exec('DELETE FROM message_threads');

// 🔥 测试2: 修复版本（移除外层事务）
console.log('\n🧪 测试2: 无外层事务版本（修复方案）');

try {
    console.log('  🔄 开始无事务同步...');
    
    // 保存线程（独立操作）
    const threadId = saveOrUpdateThread(testThreadData);
    console.log(`  ✅ 线程已保存: ID=${threadId}`);
    
    // 🔥 这里调用带内部事务的消息插入（但外层没有事务）
    const insertedCount = addMessagesSyncWithTransaction(threadId, testMessages, testThreadData.last_message_time);
    console.log(`  📊 插入消息数: ${insertedCount}`);
    
    console.log(`✅ 无外层事务执行完成: threadId=${threadId}, insertedCount=${insertedCount}`);
} catch (error) {
    console.error(`❌ 无外层事务执行失败:`, error);
}

// 检查结果
const checkMessages2 = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 测试2结果 - 数据库中消息数: ${checkMessages2.count}`);

// 清理数据准备测试3
db.exec('DELETE FROM messages');
db.exec('DELETE FROM message_threads');

// 🔥 测试3: 更好的修复版本（完全移除内层事务）
console.log('\n🧪 测试3: 完全无事务版本（最佳修复方案）');

try {
    console.log('  🔄 开始完全无事务同步...');
    
    // 保存线程（独立操作）
    const threadId = saveOrUpdateThread(testThreadData);
    console.log(`  ✅ 线程已保存: ID=${threadId}`);
    
    // 🔥 这里调用无事务的消息插入
    const insertedCount = addMessagesSyncNoTransaction(threadId, testMessages, testThreadData.last_message_time);
    console.log(`  📊 插入消息数: ${insertedCount}`);
    
    console.log(`✅ 完全无事务执行完成: threadId=${threadId}, insertedCount=${insertedCount}`);
} catch (error) {
    console.error(`❌ 完全无事务执行失败:`, error);
}

// 检查结果
const checkMessages3 = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 测试3结果 - 数据库中消息数: ${checkMessages3.count}`);

// 🔥 执行WAL检查点
console.log('\n🔄 执行WAL检查点...');
const checkpointResult = db.pragma('wal_checkpoint(FULL)');
console.log(`✅ WAL检查点完成:`, checkpointResult);

// 最终验证
const finalCheck = db.prepare('SELECT COUNT(*) as count FROM messages').get();
console.log(`📊 WAL检查点后最终消息数: ${finalCheck.count}`);

// 显示测试总结
console.log('\n📊 测试总结:');
console.log(`测试1 (嵌套事务): ${checkMessages1.count} 条消息`);
console.log(`测试2 (无外层事务): ${checkMessages2.count} 条消息`);
console.log(`测试3 (完全无事务): ${checkMessages3.count} 条消息`);

if (checkMessages1.count === 0 && checkMessages2.count > 0) {
    console.log('✅ 确认了嵌套事务问题！移除外层事务可以解决问题');
} else if (checkMessages1.count === checkMessages2.count && checkMessages2.count > 0) {
    console.log('❓ 未复现嵌套事务问题，可能是其他原因');
} else {
    console.log('❓ 测试结果异常，需要进一步分析');
}

// 关闭数据库
db.close();

console.log('\n🎉 测试完成！');