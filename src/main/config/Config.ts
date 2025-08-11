// src/main/config/Config.ts - 添加消息图片目录配置

import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

/**
 * 应用配置类
 * 对应 Python 的 conf.py
 */
export class Config {
    // 🔥 基础路径配置 (替代 Python 的 BASE_DIR)
    static get BASE_DIR(): string {
        const userData = app.getPath('userData');
        //console.log(`🔍 BASE_DIR 路径: ${userData}`);
        //console.log(`🔍 COOKIE_DIR 路径: ${path.join(userData, 'cookiesFile')}`);
        return userData;
    }

    // 🔥 视频文件目录
    static get VIDEO_DIR(): string {
        return path.join(this.BASE_DIR, 'videoFile');
    }

    // 🔥 Cookie文件目录  
    static get COOKIE_DIR(): string {
        return path.join(this.BASE_DIR, 'cookiesFile');
    }

    // 🔥 数据库目录
    static get DB_DIR(): string {
        return path.join(this.BASE_DIR, 'db');
    }

    // 🔥 数据库文件路径
    static get DB_PATH(): string {
        return path.join(this.DB_DIR, 'database.db');
    }

    // 🔥 头像存储目录
    static get AVATAR_DIR(): string {
        return path.join(process.env.HOME || require('os').homedir(), '.config/multi-account-browser/assets/avatar');
    }

    // 🔥 消息图片存储目录
    static get MESSAGE_IMAGES_DIR(): string {
        return path.join(this.BASE_DIR, 'messageImages');
    }

    // 🔥 日志目录
    static get LOG_DIR(): string {
        return path.join(this.BASE_DIR, 'logs');
    }

    // 🔥 临时文件目录
    static get TEMP_DIR(): string {
        return path.join(this.BASE_DIR, 'temp');
    }

    // API配置
    static readonly API_PORT = 3000;
    static readonly API_BASE_URL = `http://localhost:${this.API_PORT}/api`;

    // 默认配置值
    static readonly DEFAULT_VIDEOS_PER_DAY = 1;
    static readonly DEFAULT_DAILY_TIMES = ['06:00', '11:00', '14:00', '16:00', '22:00'];
    static readonly MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

    // 支持的视频格式
    static readonly SUPPORTED_VIDEO_FORMATS = [
        '.mp4', '.avi', '.mov', '.wmv', '.flv',
        '.webm', '.mkv', '.m4v', '.3gp', '.f4v'
    ];

    // 支持的图片格式  
    static readonly SUPPORTED_IMAGE_FORMATS = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'
    ];

    // 平台配置
    static readonly PLATFORM_CONFIG = {
        wechat: {
            name: '微信视频号',
            loginUrl: 'https://channels.weixin.qq.com',
            uploadUrl: 'https://channels.weixin.qq.com/platform/post/create',
            maxVideoSize: 1024 * 1024 * 1024, // 1GB
            maxTitleLength: 100,
            maxTagCount: 10
        },
        douyin: {
            name: '抖音',
            loginUrl: 'https://creator.douyin.com',
            uploadUrl: 'https://creator.douyin.com/creator-micro/content/upload',
            maxVideoSize: 4 * 1024 * 1024 * 1024, // 4GB
            maxTitleLength: 55,
            maxTagCount: 5
        },
        xiaohongshu: {
            name: '小红书',
            loginUrl: 'https://creator.xiaohongshu.com/',
            uploadUrl: 'https://creator.xiaohongshu.com/publish/publish',
            maxVideoSize: 1024 * 1024 * 1024, // 1GB
            maxTitleLength: 50,
            maxTagCount: 10
        },
        kuaishou: {
            name: '快手',
            loginUrl: 'https://cp.kuaishou.com',
            uploadUrl: 'https://cp.kuaishou.com/article/publish/video',
            maxVideoSize: 2 * 1024 * 1024 * 1024, // 2GB
            maxTitleLength: 100,
            maxTagCount: 8
        }
    };

    /**
     * 🔥 确保所有必要目录存在
     */
    static async ensureDirectories(): Promise<void> {
        const dirs = [
            this.BASE_DIR,
            this.VIDEO_DIR,
            path.join(this.VIDEO_DIR, 'covers'), // 🔥 新增封面目录
            this.COOKIE_DIR,
            this.DB_DIR,
            this.AVATAR_DIR,
            this.MESSAGE_IMAGES_DIR,  // 🔥 新增消息图片目录
            this.LOG_DIR,
            this.TEMP_DIR
        ];

        for (const dir of dirs) {
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                console.log(`📁 目录已确保存在: ${dir}`);
            } catch (error) {
                console.error(`❌ 创建目录失败 ${dir}:`, error);
            }
        }
    }

    /**
     * 🔥 获取平台配置
     */
    static getPlatformConfig(platform: string) {
        return this.PLATFORM_CONFIG[platform as keyof typeof this.PLATFORM_CONFIG] || null;
    }

    /**
     * 🔥 验证文件是否为支持的视频格式
     */
    static isVideoFile(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return this.SUPPORTED_VIDEO_FORMATS.includes(ext);
    }

    /**
     * 🔥 验证文件是否为支持的图片格式
     */
    static isImageFile(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return this.SUPPORTED_IMAGE_FORMATS.includes(ext);
    }

    /**
     * 🔥 获取文件的MIME类型
     */
    static getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();

        const mimeTypes: Record<string, string> = {
            // 视频格式
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.m4v': 'video/x-m4v',
            '.3gp': 'video/3gpp',
            '.f4v': 'video/x-f4v',

            // 图片格式
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',

            // 其他
            '.json': 'application/json',
            '.txt': 'text/plain'
        };

        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * 🔥 格式化文件大小
     */
    static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 🔥 获取环境信息
     */
    static getEnvironmentInfo(): Record<string, any> {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            baseDir: this.BASE_DIR,
            isDevelopment: process.env.NODE_ENV === 'development',
            isProduction: process.env.NODE_ENV === 'production'
        };
    }

    /**
     * 🔥 清理临时文件
     */
    static async cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const tempDir = this.TEMP_DIR;
            const files = await fs.promises.readdir(tempDir);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.promises.stat(filePath);

                if (now - stats.mtimeMs > maxAge) {
                    await fs.promises.unlink(filePath);
                    console.log(`🧹 清理临时文件: ${file}`);
                }
            }
        } catch (error) {
            console.warn(`⚠️ 清理临时文件失败:`, error);
        }
    }

    /**
     * 🔥 获取应用版本信息
     */
    static getVersionInfo(): Record<string, string> {
        try {
            const packageJson = require('../../../package.json');
            return {
                version: packageJson.version || '1.0.0',
                name: packageJson.name || 'multi-account-browser',
                description: packageJson.description || 'Multi-Account Browser for Social Media Automation'
            };
        } catch {
            return {
                version: '1.0.0',
                name: 'multi-account-browser',
                description: 'Multi-Account Browser for Social Media Automation'
            };
        }
    }
}

// 🔥 应用启动时确保目录存在
Config.ensureDirectories().catch(console.error);