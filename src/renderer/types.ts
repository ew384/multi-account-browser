/**
 * 渲染进程专用类型定义
 */

// 从主进程类型中重新导出需要的共享类型
import { APIResponse } from '../types/index.js';

/**
 * 前端UI专用的标签页数据接口
 */
export interface TabData {
    id: string;
    accountName: string;        // 内部标识符
    displayTitle?: string;      // 页面标题（Chrome风格）
    displayFavicon?: string;    // 页面图标
    platform: string;
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    url?: string;
    cookieFile?: string;
    isHeadless?: boolean;       // 是否为headless标签页
}

// 重新导出共享类型
export { APIResponse };