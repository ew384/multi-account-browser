import { SessionManager } from '../src/main/SessionManager';
import * as path from 'path';

async function runIsolationTest(): Promise<void> {
    console.log('🔍 开始Session隔离测试...');

    const sessionManager = new SessionManager(path.join(__dirname, 'test-sessions'));

    try {
        // 基础隔离测试
        const basicTest = await sessionManager.validateIsolation();
        console.log(`基础隔离测试: ${basicTest ? '✅ 通过' : '❌ 失败'}`);

        // 创建多个Session测试
        console.log('🔍 创建多个Session进行测试...');

        const sessions = [
            sessionManager.createIsolatedSession('weixin-account-a'),
            sessionManager.createIsolatedSession('weixin-account-b'),
            sessionManager.createIsolatedSession('weixin-account-c')
        ];

        const testDomain = 'https://channels.weixin.qq.com';

        // 为每个Session设置不同的Cookie
        for (let i = 0; i < sessions.length; i++) {
            await sessions[i].cookies.set({
                url: testDomain,
                name: 'account_id',
                value: `account_${i + 1}`
            });

            await sessions[i].cookies.set({
                url: testDomain,
                name: 'login_token',
                value: `token_${Date.now()}_${i}`
            });
        }

        // 验证每个Session的Cookie是否独立
        let allIsolated = true;

        for (let i = 0; i < sessions.length; i++) {
            const cookies = await sessions[i].cookies.get({ url: testDomain });
            const accountCookie = cookies.find(c => c.name === 'account_id');

            if (accountCookie?.value !== `account_${i + 1}`) {
                console.log(`❌ Session ${i + 1} Cookie隔离失败`);
                allIsolated = false;
            } else {
                console.log(`✅ Session ${i + 1} Cookie隔离正常`);
            }
        }

        // 交叉验证 - 确保Session之间没有Cookie泄露
        for (let i = 0; i < sessions.length; i++) {
            const cookies = await sessions[i].cookies.get({ url: testDomain });

            for (let j = 0; j < sessions.length; j++) {
                if (i !== j) {
                    const hasOtherSessionCookie = cookies.some(c =>
                        c.value.includes(`account_${j + 1}`) ||
                        c.value.includes(`token_${Date.now()}_${j}`)
                    );

                    if (hasOtherSessionCookie) {
                        console.log(`❌ Session ${i + 1} 包含Session ${j + 1}的Cookie`);
                        allIsolated = false;
                    }
                }
            }
        }

        console.log(`\n🎯 最终结果: ${allIsolated ? '✅ 所有Session完全隔离' : '❌ Session隔离存在问题'}`);

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runIsolationTest().catch(console.error);
}

export { runIsolationTest };