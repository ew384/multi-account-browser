// 🔥 新增：Tab锁定信息接口
export interface TabLockInfo {
    owner: string;              // 锁定者标识 ('message', 'upload', 'monitor', etc.)
    reason: string;             // 锁定原因描述
    lockTime: string;           // 锁定时间戳
    priority: number;           // 锁定优先级
}

// 🔥 修改：AccountTab 接口，添加锁定相关字段
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
    // 🔥 新增锁定相关字段
    lockInfo?: TabLockInfo;     // 锁定信息
    isLocked?: boolean;         // 是否被锁定
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
    headless?: boolean;
}

export interface ExecuteScriptRequest {
    tabId: string;
    script: string;
}

export interface NavigateRequest {
    tabId: string;
    url: string;
}