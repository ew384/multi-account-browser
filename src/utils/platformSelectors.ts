// utils/platformSelectors.ts - 平台选择器配置文件

export interface PlatformSelectors {
    accountName: string;
    accountId: string;
    followersCount: string;
    videosCount: string;
    avatar: string;
    bio: string;
    [key: string]: string;  // 🔥 添加索引签名，允许任意字符串键
}

export const PLATFORM_SELECTORS: Record<string, PlatformSelectors> = {
    'wechat': {
        accountName: '.user-name, .nickname, .account-title, .name',
        accountId: '.account-id, .user-id, [data-account-id]',
        followersCount: '.follower-count, .fans-num, .followers, .粉丝数',
        videosCount: '.video-count, .works-num, .videos, .视频数',
        avatar: '.avatar img, .user-avatar img, .profile-img',
        bio: '.bio, .description, .user-desc, .简介'
    },
    'douyin': {
        accountName: '.username, .nickname, .user-name',
        accountId: '.user-id, .douyin-id, [data-user-id]', 
        followersCount: '.follower-count, .fans-count, .粉丝',
        videosCount: '.video-count, .作品, .works-count',
        avatar: '.avatar img, .user-avatar img',
        bio: '.bio, .user-desc, .signature'
    },
    'kuaishou': {
        accountName: '.user-name, .nickname, .name',
        accountId: '.user-id, .ks-id',
        followersCount: '.follower-count, .fans-count, .关注',
        videosCount: '.video-count, .work-count, .作品',
        avatar: '.avatar img, .user-img img',
        bio: '.bio, .description, .user-signature'
    },
    'xiaohongshu': {
        accountName: '.user-name, .nickname, .name, .username',
        accountId: '.user-id, .red-id, .xhs-id',
        followersCount: '.follower-count, .fans-count, .粉丝',
        videosCount: '.note-count, .works-count, .笔记',
        avatar: '.avatar img, .user-avatar img',
        bio: '.bio, .user-desc, .description'
    }
};

/**
 * 获取平台选择器配置
 */
export function getPlatformSelectors(platform: string): PlatformSelectors {
    return PLATFORM_SELECTORS[platform] || PLATFORM_SELECTORS['wechat'];
}

/**
 * 获取所有支持的平台
 */
export function getSupportedPlatforms(): string[] {
    return Object.keys(PLATFORM_SELECTORS);
}