import { Session, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private dataPath: string;

    constructor(dataPath: string) {
        this.dataPath = dataPath;
        this.ensureDataDirectory();
    }

    private ensureDataDirectory(): void {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
    }

    createIsolatedSession(accountId: string): Session {
        if (this.sessions.has(accountId)) {
            return this.sessions.get(accountId)!;
        }

        const partition = `persist:account-${accountId}`;
        const isolatedSession = session.fromPartition(partition, {
            cache: true
        });

        // 配置Session安全选项
        isolatedSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = ['notifications', 'media'];
            callback(allowedPermissions.includes(permission));
        });

        // 设置用户代理
        isolatedSession.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // 移除不必要的预加载脚本
        isolatedSession.setPreloads([]);

        // 网络优化 - 这个是有效的
        isolatedSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
            // 移除可能导致慢速的头部
            delete details.requestHeaders['X-Requested-With'];
            callback({ requestHeaders: details.requestHeaders });
        });

        this.sessions.set(accountId, isolatedSession);
        console.log(`✅ Created isolated session for account: ${accountId}`);

        return isolatedSession;
    }

    async validateIsolation(): Promise<boolean> {
        try {
            console.log('🔍 Starting session isolation validation...');

            const session1 = this.createIsolatedSession('test-isolation-1');
            const session2 = this.createIsolatedSession('test-isolation-2');

            const testDomain = 'https://channels.weixin.qq.com';
            const cookieName = 'test_isolation_cookie';

            // 定义期望的值
            const expectedValue1 = 'session_1_value';
            const expectedValue2 = 'session_2_value';

            // 清除测试Cookie
            await session1.cookies.remove(testDomain, cookieName);
            await session2.cookies.remove(testDomain, cookieName);

            // 在session1中设置Cookie
            await session1.cookies.set({
                url: testDomain,
                name: cookieName,
                value: expectedValue1
            });

            // 在session2中设置不同的Cookie
            await session2.cookies.set({
                url: testDomain,
                name: cookieName,
                value: expectedValue2
            });

            // 验证Cookie隔离
            const cookies1 = await session1.cookies.get({
                url: testDomain,
                name: cookieName
            });
            const cookies2 = await session2.cookies.get({
                url: testDomain,
                name: cookieName
            });

            // 获取实际的Cookie值
            const session1Value = cookies1[0]?.value || '';
            const session2Value = cookies2[0]?.value || '';

            console.log('Session1 Cookie:', session1Value);
            console.log('Session2 Cookie:', session2Value);

            // 修复：使用类型安全的比较方式
            const hasCorrectValues = session1Value === expectedValue1 &&
                session2Value === expectedValue2;

            // 验证值确实不同（通过字符串比较而不是类型比较）
            const valuesAreDifferent = String(session1Value) !== String(session2Value);

            const isIsolated = hasCorrectValues && valuesAreDifferent;

            // 清理测试数据
            await session1.cookies.remove(testDomain, cookieName);
            await session2.cookies.remove(testDomain, cookieName);
            this.sessions.delete('test-isolation-1');
            this.sessions.delete('test-isolation-2');

            console.log(`🔍 Session isolation test: ${isIsolated ? '✅ PASSED' : '❌ FAILED'}`);
            if (!isIsolated) {
                console.log(`Expected: ${expectedValue1} and ${expectedValue2}`);
                console.log(`Got: ${session1Value} and ${session2Value}`);
                console.log(`Values different: ${valuesAreDifferent}`);
            }

            return isIsolated;
        } catch (error) {
            console.error('❌ Session isolation validation failed:', error);
            return false;
        }
    }

    getSession(accountId: string): Session | undefined {
        return this.sessions.get(accountId);
    }

    deleteSession(accountId: string): void {
        const session = this.sessions.get(accountId);
        if (session) {
            // 清理Session数据
            session.clearStorageData().catch(console.error);
            this.sessions.delete(accountId);
            console.log(`🗑️ Deleted session for account: ${accountId}`);
        }
    }

    getAllSessionIds(): string[] {
        return Array.from(this.sessions.keys());
    }
}