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
            // 对小红书等认证网站采用宽松策略
            const url = webContents.getURL();
            if (url.includes('xiaohongshu.com') || url.includes('weixin.qq.com')) {
                callback(true);  // 允许通知等权限
            } else {
                const allowedPermissions = ['notifications', 'media'];
                callback(allowedPermissions.includes(permission));
            }
        });

        // 设置用户代理
        isolatedSession.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // 移除不必要的预加载脚本
        isolatedSession.setPreloads([]);

        // 🔥 关键修复：添加认证相关的请求处理
        isolatedSession.webRequest.onHeadersReceived({ urls: ['*://*.xiaohongshu.com/*'] }, (details, callback) => {
            if (details.statusCode === 401) {
                console.log(`🔐 处理小红书401响应: ${details.url}`);
                
                // 🔥 检查是否是非关键API的401响应
                const nonCriticalAPIs = [
                    '/api/sns/v5/creator/topic/template/list',
                    '/api/galaxy/v2/creator/activity_center/list',
                    '/web_api/sns/v5/creator/topic/template/list'
                ];
                
                const isNonCriticalAPI = nonCriticalAPIs.some(api => details.url.includes(api));
                
                if (isNonCriticalAPI) {
                    console.log(`🔇 转换非关键API的401为200: ${details.url}`);
                    callback({
                        statusLine: 'HTTP/1.1 200 OK',
                        responseHeaders: {
                            ...details.responseHeaders,
                            'content-type': ['application/json'],
                            'content-length': ['2']
                        }
                    });
                    return;
                }
            }
            
            callback({ responseHeaders: details.responseHeaders });
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