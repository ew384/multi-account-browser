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

        // 注释掉整个 webRequest 拦截
        isolatedSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
            delete details.requestHeaders['X-Requested-With'];
            callback({ requestHeaders: details.requestHeaders });
        });

        this.sessions.set(accountId, isolatedSession);
        console.log(`✅ Created isolated session for account: ${accountId}`);

        return isolatedSession;
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