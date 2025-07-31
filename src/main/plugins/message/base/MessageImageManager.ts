// src/main/plugins/message/base/MessageImageManager.ts
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../../../config/Config';

export interface MessageImageInfo {
    type: 'file';
    path: string;        // 相对路径，如: wechat/张三/thread_123/20240731_001.jpg
    fileName: string;    // 文件名，如: 20240731_001.jpg
    fullPath: string;    // 完整本地路径
    size: number;        // 文件大小
}

/**
 * 🔥 消息图片管理器
 * 处理消息中的图片存储、读取、清理等功能
 */
export class MessageImageManager {
    
    /**
     * 🔥 消息图片根目录
     */
    static get MESSAGE_IMAGES_DIR(): string {
        return path.join(Config.BASE_DIR, 'messageImages');
    }

    /**
     * 🔥 初始化消息图片目录
     */
    static async ensureMessageImagesDirectory(): Promise<void> {
        try {
            await fs.promises.mkdir(this.MESSAGE_IMAGES_DIR, { recursive: true });
            console.log(`📁 消息图片目录已确保存在: ${this.MESSAGE_IMAGES_DIR}`);
        } catch (error) {
            console.error(`❌ 创建消息图片目录失败:`, error);
            throw error;
        }
    }

    /**
     * 🔥 保存消息图片（从base64数据）
     * 目录结构: messageImages/platform/accountName/threadId/timestamp_index.jpg
     */
    static async saveMessageImage(
        base64Data: string,
        platform: string,
        accountName: string,
        threadId: number,
        messageTimestamp: string,
        imageIndex: number = 0
    ): Promise<MessageImageInfo | null> {
        try {
            // 清理账号名（移除特殊字符）
            const sanitizedAccountName = accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            
            // 构建目录结构: platform/accountName/thread_threadId/
            const platformDir = path.join(this.MESSAGE_IMAGES_DIR, platform);
            const accountDir = path.join(platformDir, sanitizedAccountName);
            const threadDir = path.join(accountDir, `thread_${threadId}`);

            // 确保目录存在
            await fs.promises.mkdir(threadDir, { recursive: true });

            // 生成文件名: timestamp_index.jpg
            const timestamp = new Date(messageTimestamp).getTime();
            const extension = this.getImageExtensionFromBase64(base64Data);
            const fileName = `${timestamp}_${imageIndex.toString().padStart(3, '0')}.${extension}`;
            const fullPath = path.join(threadDir, fileName);

            // 保存图片
            const imageBuffer = this.base64ToBuffer(base64Data);
            await fs.promises.writeFile(fullPath, imageBuffer);

            // 构建相对路径（用于数据库存储）
            const relativePath = `${platform}/${sanitizedAccountName}/thread_${threadId}/${fileName}`;

            const imageInfo: MessageImageInfo = {
                type: 'file',
                path: relativePath,
                fileName: fileName,
                fullPath: fullPath,
                size: imageBuffer.length
            };

            console.log(`✅ 消息图片保存成功: ${relativePath} (${Config.formatFileSize(imageBuffer.length)})`);
            
            return imageInfo;

        } catch (error) {
            console.error(`❌ 保存消息图片失败:`, error);
            return null;
        }
    }

    /**
     * 🔥 批量保存消息图片
     */
    static async saveMessageImages(
        base64Images: string[],
        platform: string,
        accountName: string,
        threadId: number,
        messageTimestamp: string
    ): Promise<MessageImageInfo[]> {
        const savedImages: MessageImageInfo[] = [];

        for (let i = 0; i < base64Images.length; i++) {
            const imageInfo = await this.saveMessageImage(
                base64Images[i],
                platform,
                accountName,
                threadId,
                messageTimestamp,
                i
            );

            if (imageInfo) {
                savedImages.push(imageInfo);
            }
        }

        console.log(`✅ 批量保存消息图片完成: ${savedImages.length}/${base64Images.length} 成功`);
        return savedImages;
    }

    /**
     * 🔥 获取消息图片的完整路径
     */
    static getImageFullPath(relativePath: string): string {
        return path.join(this.MESSAGE_IMAGES_DIR, relativePath);
    }

    /**
     * 🔥 检查图片文件是否存在
     */
    static async imageExists(relativePath: string): Promise<boolean> {
        try {
            const fullPath = this.getImageFullPath(relativePath);
            await fs.promises.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 🔥 获取图片文件信息
     */
    static async getImageStats(relativePath: string): Promise<{
        size: number;
        mtime: Date;
        exists: boolean;
    }> {
        try {
            const fullPath = this.getImageFullPath(relativePath);
            const stats = await fs.promises.stat(fullPath);
            
            return {
                size: stats.size,
                mtime: stats.mtime,
                exists: true
            };
        } catch {
            return {
                size: 0,
                mtime: new Date(0),
                exists: false
            };
        }
    }

    /**
     * 🔥 读取图片为base64（用于前端显示）
     */
    static async readImageAsBase64(relativePath: string): Promise<string | null> {
        try {
            const fullPath = this.getImageFullPath(relativePath);
            const buffer = await fs.promises.readFile(fullPath);
            const extension = path.extname(relativePath).toLowerCase().substring(1);
            const mimeType = this.getMimeTypeFromExtension(extension);
            
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (error) {
            console.error(`❌ 读取图片失败: ${relativePath}:`, error);
            return null;
        }
    }

    /**
     * 🔥 删除单个消息图片
     */
    static async deleteMessageImage(relativePath: string): Promise<boolean> {
        try {
            const fullPath = this.getImageFullPath(relativePath);
            await fs.promises.unlink(fullPath);
            console.log(`✅ 消息图片已删除: ${relativePath}`);
            return true;
        } catch (error) {
            console.error(`❌ 删除消息图片失败: ${relativePath}:`, error);
            return false;
        }
    }

    /**
     * 🔥 删除线程的所有图片
     */
    static async deleteThreadImages(
        platform: string,
        accountName: string,
        threadId: number
    ): Promise<number> {
        try {
            const sanitizedAccountName = accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            const threadDir = path.join(
                this.MESSAGE_IMAGES_DIR,
                platform,
                sanitizedAccountName,
                `thread_${threadId}`
            );

            if (!await this.directoryExists(threadDir)) {
                return 0;
            }

            const files = await fs.promises.readdir(threadDir);
            let deletedCount = 0;

            for (const file of files) {
                try {
                    await fs.promises.unlink(path.join(threadDir, file));
                    deletedCount++;
                } catch (error) {
                    console.warn(`⚠️ 删除图片文件失败: ${file}:`, error);
                }
            }

            // 尝试删除空目录
            try {
                await fs.promises.rmdir(threadDir);
            } catch {
                // 目录可能不为空，忽略错误
            }

            console.log(`✅ 线程图片清理完成: ${deletedCount} 个文件已删除`);
            return deletedCount;

        } catch (error) {
            console.error(`❌ 删除线程图片失败:`, error);
            return 0;
        }
    }

    /**
     * 🔥 清理过期的消息图片
     */
    static async cleanupExpiredImages(daysToKeep: number = 30): Promise<{
        deletedFiles: number;
        deletedDirs: number;
        freedSpace: number;
    }> {
        try {
            const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
            let deletedFiles = 0;
            let deletedDirs = 0;
            let freedSpace = 0;

            // 遍历所有平台目录
            if (!await this.directoryExists(this.MESSAGE_IMAGES_DIR)) {
                return { deletedFiles: 0, deletedDirs: 0, freedSpace: 0 };
            }

            const platforms = await fs.promises.readdir(this.MESSAGE_IMAGES_DIR);

            for (const platform of platforms) {
                const platformDir = path.join(this.MESSAGE_IMAGES_DIR, platform);
                const platformStat = await fs.promises.stat(platformDir);

                if (!platformStat.isDirectory()) continue;

                const accounts = await fs.promises.readdir(platformDir);

                for (const account of accounts) {
                    const accountDir = path.join(platformDir, account);
                    const accountStat = await fs.promises.stat(accountDir);

                    if (!accountStat.isDirectory()) continue;

                    const threads = await fs.promises.readdir(accountDir);

                    for (const thread of threads) {
                        const threadDir = path.join(accountDir, thread);
                        const threadStat = await fs.promises.stat(threadDir);

                        if (!threadStat.isDirectory()) continue;

                        // 检查线程目录的修改时间
                        if (threadStat.mtime.getTime() < cutoffTime) {
                            const files = await fs.promises.readdir(threadDir);

                            // 删除所有文件
                            for (const file of files) {
                                const filePath = path.join(threadDir, file);
                                const fileStat = await fs.promises.stat(filePath);
                                freedSpace += fileStat.size;
                                await fs.promises.unlink(filePath);
                                deletedFiles++;
                            }

                            // 删除目录
                            await fs.promises.rmdir(threadDir);
                            deletedDirs++;
                        }
                    }

                    // 尝试删除空的账号目录
                    try {
                        const remaining = await fs.promises.readdir(accountDir);
                        if (remaining.length === 0) {
                            await fs.promises.rmdir(accountDir);
                            deletedDirs++;
                        }
                    } catch {
                        // 目录不为空，忽略
                    }
                }

                // 尝试删除空的平台目录
                try {
                    const remaining = await fs.promises.readdir(platformDir);
                    if (remaining.length === 0) {
                        await fs.promises.rmdir(platformDir);
                        deletedDirs++;
                    }
                } catch {
                    // 目录不为空，忽略
                }
            }

            console.log(`🧹 消息图片清理完成: 删除 ${deletedFiles} 个文件, ${deletedDirs} 个目录, 释放 ${Config.formatFileSize(freedSpace)}`);

            return { deletedFiles, deletedDirs, freedSpace };

        } catch (error) {
            console.error(`❌ 清理过期图片失败:`, error);
            return { deletedFiles: 0, deletedDirs: 0, freedSpace: 0 };
        }
    }

    /**
     * 🔥 获取消息图片存储统计
     */
    static async getStorageStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        platformStats: Record<string, { files: number; size: number }>;
    }> {
        try {
            let totalFiles = 0;
            let totalSize = 0;
            const platformStats: Record<string, { files: number; size: number }> = {};

            if (!await this.directoryExists(this.MESSAGE_IMAGES_DIR)) {
                return { totalFiles: 0, totalSize: 0, platformStats: {} };
            }

            const platforms = await fs.promises.readdir(this.MESSAGE_IMAGES_DIR);

            for (const platform of platforms) {
                const platformDir = path.join(this.MESSAGE_IMAGES_DIR, platform);
                const platformStat = await fs.promises.stat(platformDir);

                if (!platformStat.isDirectory()) continue;

                const stats = await this.calculateDirectoryStats(platformDir);
                platformStats[platform] = stats;
                totalFiles += stats.files;
                totalSize += stats.size;
            }

            return { totalFiles, totalSize, platformStats };

        } catch (error) {
            console.error(`❌ 获取存储统计失败:`, error);
            return { totalFiles: 0, totalSize: 0, platformStats: {} };
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 🔥 从base64数据提取图片扩展名
     */
    private static getImageExtensionFromBase64(base64Data: string): string {
        const mimeType = base64Data.substring(5, base64Data.indexOf(';'));
        
        switch (mimeType) {
            case 'image/jpeg': return 'jpg';
            case 'image/png': return 'png';
            case 'image/gif': return 'gif';
            case 'image/webp': return 'webp';
            case 'image/bmp': return 'bmp';
            default: return 'jpg';
        }
    }

    /**
     * 🔥 从扩展名获取MIME类型
     */
    private static getMimeTypeFromExtension(extension: string): string {
        switch (extension.toLowerCase()) {
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'png': return 'image/png';
            case 'gif': return 'image/gif';
            case 'webp': return 'image/webp';
            case 'bmp': return 'image/bmp';
            default: return 'image/jpeg';
        }
    }

    /**
     * 🔥 将base64转换为Buffer
     */
    private static base64ToBuffer(base64Data: string): Buffer {
        // 移除data:image/...;base64,前缀
        const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
        return Buffer.from(base64Content, 'base64');
    }

    /**
     * 🔥 检查目录是否存在
     */
    private static async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const stats = await fs.promises.stat(dirPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * 🔥 计算目录统计信息
     */
    private static async calculateDirectoryStats(dirPath: string): Promise<{ files: number; size: number }> {
        let files = 0;
        let size = 0;

        try {
            const items = await fs.promises.readdir(dirPath);

            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const itemStat = await fs.promises.stat(itemPath);

                if (itemStat.isDirectory()) {
                    const subStats = await this.calculateDirectoryStats(itemPath);
                    files += subStats.files;
                    size += subStats.size;
                } else {
                    files++;
                    size += itemStat.size;
                }
            }
        } catch (error) {
            console.warn(`⚠️ 计算目录统计失败: ${dirPath}:`, error);
        }

        return { files, size };
    }
}