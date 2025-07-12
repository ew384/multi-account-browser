import { Session } from 'electron';
import * as fs from 'fs';
import { CookieData } from '../types';

export class CookieManager {
    /**
     * 从文件加载Cookie到Session
     */
    async loadCookiesToSession(session: Session, cookieFilePath: string): Promise<void> {
        if (!fs.existsSync(cookieFilePath)) {
            throw new Error(`Cookie file not found: ${cookieFilePath}`);
        }

        try {
            const cookieData: CookieData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));

            if (!cookieData.cookies || !Array.isArray(cookieData.cookies)) {
                throw new Error('Invalid cookie file format');
            }

            console.log(`📁 Loading ${cookieData.cookies.length} cookies from file...`);

            // 清除现有Cookie（可选）
            // await session.clearStorageData();

            let successCount = 0;
            let errorCount = 0;

            for (const cookie of cookieData.cookies) {
                try {
                    // 确保必需的字段不为undefined
                    if (!cookie.domain) {
                        console.warn(`⚠️ Skipping cookie ${cookie.name}: missing domain`);
                        errorCount++;
                        continue;
                    }

                    await session.cookies.set({
                        url: this.buildCookieUrl(cookie.domain),
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain,
                        path: cookie.path || '/',
                        secure: cookie.secure || false,
                        httpOnly: cookie.httpOnly || false,
                        expirationDate: cookie.expires,
                        sameSite: this.normalizeSameSite(cookie.sameSite)
                    });
                    successCount++;
                } catch (error) {
                    console.warn(`⚠️ Failed to set cookie ${cookie.name}:`, error);
                    errorCount++;
                }
            }

            console.log(`✅ Loaded ${successCount} cookies successfully, ${errorCount} failed`);
        } catch (error) {
            console.error('❌ Failed to load cookies:', error);
            throw error;
        }
    }

    /**
     * 从Session导出Cookie到文件
     */
    async saveCookiesFromSession(session: Session, cookieFilePath: string, domain?: string): Promise<void> {
        try {
            const filter = domain ? { domain } : {};
            const cookies = await session.cookies.get(filter);

            const cookieData: CookieData = {
                cookies: cookies.map(cookie => ({
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain || '',
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expires: cookie.expirationDate,
                    // 🔧 使用类型断言来兼容
                    sameSite: this.convertSameSiteForPlaywright(cookie.sameSite) as any
                })).filter(cookie => cookie.domain)
            };

            // 确保目录存在
            const dir = cookieFilePath.substring(0, cookieFilePath.lastIndexOf('/'));
            if (dir && !fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(cookieFilePath, JSON.stringify(cookieData, null, 2));
            console.log(`💾 Saved ${cookies.length} cookies to file: ${cookieFilePath}`);
        } catch (error) {
            console.error('❌ Failed to save cookies:', error);
            throw error;
        }
    }

    /**
     * 转换 sameSite 值为 Playwright 兼容格式
     */
    private convertSameSiteForPlaywright(sameSite?: string): 'Strict' | 'Lax' | 'None' {
        switch (sameSite) {
            case 'strict':
            case 'Strict':
                return 'Strict';
            case 'no_restriction':
            case 'None':
            case 'none':
                return 'None';
            case 'lax':
            case 'Lax':
            case 'unspecified':
            default:
                return 'Lax';  // 默认值
        }
    }
    /**
     * 清除Session中的所有Cookie
     */
    async clearSessionCookies(session: Session, domain?: string): Promise<void> {
        try {
            if (domain) {
                const cookies = await session.cookies.get({ domain });
                for (const cookie of cookies) {
                    await session.cookies.remove(`https://${cookie.domain}`, cookie.name);
                }
                console.log(`🧹 Cleared ${cookies.length} cookies for domain: ${domain}`);
            } else {
                await session.clearStorageData();
                console.log('🧹 Cleared all session cookies and data');
            }
        } catch (error) {
            console.error('❌ Failed to clear cookies:', error);
            throw error;
        }
    }

    /**
     * 构建Cookie URL
     */
    private buildCookieUrl(domain: string): string {
        // 确保域名格式正确
        const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
        return `https://${cleanDomain}`;
    }

    /**
     * 标准化SameSite值
     */
    private normalizeSameSite(sameSite?: string): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
        switch (sameSite) {
            case 'no_restriction':
            case 'None':
            case 'none':
                return 'no_restriction';
            case 'lax':
            case 'Lax':
                return 'lax';
            case 'strict':
            case 'Strict':
                return 'strict';
            default:
                return 'lax';  // 默认改为 lax 而不是 unspecified
        }
    }
}