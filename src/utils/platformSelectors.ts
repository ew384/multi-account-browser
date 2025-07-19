// src/utils/platformSelectors.ts

// 平台选择器配置接口
export interface PlatformSelectors {
    avatar: string;
    accountName: string;
    accountId: string;
    bio: string | null;
    stats: string;
}

// 账号信息提取配置
export interface AccountInfoSelectors {
    [platform: string]: PlatformSelectors;
}

// 平台选择器配置
export const PLATFORM_SELECTORS: AccountInfoSelectors = {
    douyin: {
        avatar: '.avatar-XoPjK6 .img-PeynF_',
        accountName: '.name-_lSSDc',
        accountId: '.unique_id-EuH8eA',
        bio: '.signature-HLGxt7',
        stats: '.number-No6ev9'  // 返回NodeList: [关注数, 粉丝数, 获赞数]
    },
    xiaohongshu: {
        avatar: '.base .avatar img',
        accountName: '.account-name',
        accountId: '.others div',  // 需要特殊处理查找包含"小红书账号:"的元素
        bio: '.others .description-text div:last-child',
        stats: '.numerical'  // 返回NodeList: [关注数, 粉丝数, 获赞与收藏]
    },
    wechat_finder: {
        avatar: '.finder-info-container .avatar',
        accountName: '.finder-nickname',
        accountId: '.finder-uniq-id',
        bio: null,  // 当前页面没有个人简介信息
        stats: '.finder-info-num'  // 返回NodeList: [视频数, 关注者数]
    }
};

// 获取指定平台的选择器配置
export function getPlatformSelectors(platform: string): Record<string, string> {
    const selectors = PLATFORM_SELECTORS[platform];
    if (!selectors) {
        throw new Error(`Unsupported platform: ${platform}. Available platforms: ${Object.keys(PLATFORM_SELECTORS).join(', ')}`);
    }

    // 转换为原有的 Record<string, string> 格式以保持兼容性
    return {
        avatar: selectors.avatar,
        accountName: selectors.accountName,
        accountId: selectors.accountId,
        bio: selectors.bio || '',
        stats: selectors.stats
    };
}

// 获取账号信息选择器（用于新的统一提取逻辑）
export function getAccountInfoSelectors(platform: string): PlatformSelectors {
    const selectors = PLATFORM_SELECTORS[platform];
    if (!selectors) {
        throw new Error(`Unsupported platform: ${platform}. Available platforms: ${Object.keys(PLATFORM_SELECTORS).join(', ')}`);
    }
    return selectors;
}

// 获取所有支持的平台列表
export function getSupportedPlatforms(): string[] {
    return Object.keys(PLATFORM_SELECTORS);
}

// 检查平台是否支持
export function isPlatformSupported(platform: string): boolean {
    return platform in PLATFORM_SELECTORS;
}