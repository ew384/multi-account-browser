export interface AccountTab {
    id: string;
    accountName: string;
    platform: string;
    session: Electron.Session;
    webContentsView: Electron.WebContentsView; // 替换 browserView 为 webContentsView
    cookieFile?: string;
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    url?: string;
    isHeadless?: boolean;  // 标识是否为后台模式的 tab
    isVisible?: boolean;   // 标识当前是否可见
}

export interface CookieData {
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        expires?: number;
        sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
    }>;
}

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface CreateAccountRequest {
    accountName: string;
    platform: string;
    cookieFile?: string;
    initialUrl?: string;
}

export interface ExecuteScriptRequest {
    tabId: string;
    script: string;
}

export interface NavigateRequest {
    tabId: string;
    url: string;
}