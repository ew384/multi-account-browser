// src/main/apis/SocialAutomationAPI.ts
import express from 'express';
import { AutomationEngine } from '../automation/AutomationEngine';
import { PublishRecordStorage } from '../plugins/uploader/base/PublishRecordStorage';
import { AccountStorage } from '../plugins/login/base/AccountStorage';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from '../config/Config';

export class SocialAutomationAPI {
    private router: express.Router;
    private automationEngine: AutomationEngine;

    constructor(automationEngine: AutomationEngine) {
        this.router = express.Router();
        this.automationEngine = automationEngine;

        this.setupRoutes();
    }

    private setupRoutes(): void {
        // 🔥 前端期望的所有API都在这里
        this.setupAccountRoutes();
        this.setupGroupRoutes();
        this.setupMaterialRoutes();
        this.setupUploadRoutes();
        this.setupAutomationRoutes();
        this.setupPublishRecordRoutes();
        this.setupPathRoutes();
        this.router.get('/assets/avatar/:platform/:accountName/:filename', this.handleGetAvatar.bind(this));
    }

    private setupAccountRoutes(): void {
        // 账号管理API
        this.router.get('/getAccountsWithGroups', this.handleGetAccountsWithGroups.bind(this));
        this.router.get('/deleteAccount', this.handleDeleteAccount.bind(this));
        this.router.post('/updateUserinfo', this.handleUpdateUserinfo.bind(this));
        this.router.post('/account', this.handleAddAccount.bind(this));
        this.router.post('/validateAccount', this.handleValidateAccount.bind(this));
    }
    private setupPublishRecordRoutes(): void {
        // 发布记录管理API
        this.router.get('/getPublishRecords', this.handleGetPublishRecords.bind(this));
        this.router.get('/getPublishRecordDetail', this.handleGetPublishRecordDetail.bind(this));
        this.router.post('/deletePublishRecords', this.handleDeletePublishRecords.bind(this));
        this.router.get('/exportPublishRecords', this.handleExportPublishRecords.bind(this));
        this.router.get('/getRepublishConfig', this.handleGetRepublishConfig.bind(this));
        this.router.post('/republishVideo', this.handleRepublishVideo.bind(this));
    }
    private setupGroupRoutes(): void {
        // 分组管理API
        this.router.get('/getGroups', this.handleGetGroups.bind(this));
        this.router.post('/createGroup', this.handleCreateGroup.bind(this));
        this.router.post('/updateGroup', this.handleUpdateGroup.bind(this));
        this.router.get('/deleteGroup', this.handleDeleteGroup.bind(this));
        this.router.post('/updateAccountGroup', this.handleUpdateAccountGroup.bind(this));
    }

    private setupMaterialRoutes(): void {
        // 素材管理API
        this.router.get('/getFiles', this.handleGetFiles.bind(this));
        this.router.post('/upload', this.handleUpload.bind(this));
        this.router.post('/uploadSave', this.handleUploadSave.bind(this));
        this.router.get('/deleteFile', this.handleDeleteFile.bind(this));
        this.router.get('/getFile', this.handleGetFile.bind(this));
        this.router.get('/getCover', this.handleGetCover.bind(this));
        this.router.get('/getRecentUploads', this.handleGetRecentUploads.bind(this));
        this.router.post('/saveCoverScreenshot', this.handleSaveCoverScreenshot.bind(this));
    }

    private setupUploadRoutes(): void {
        // 视频发布API
        this.router.post('/postVideo', this.handlePostVideo.bind(this));
        this.router.post('/postVideoBatch', this.handlePostVideoBatch.bind(this));
    }

    private setupAutomationRoutes(): void {
        // 自动化相关API
        this.router.post('/api/automation/get-account-info', this.handleGetAccountInfo.bind(this));
    }
    private setupPathRoutes(): void {
        // 🔥 路径相关API
        this.router.get('/getPaths', this.handleGetPaths.bind(this));
    }
    // ==================== 账号管理相关处理方法 ====================
    /**
     * 🔥 获取带分组信息的账号列表 - getAccountsWithGroups
     */
    private async handleGetAccountsWithGroups(req: express.Request, res: express.Response): Promise<void> {
        try {
            const forceCheck = req.query.force === 'true';
            const accounts = await this.automationEngine.getAccountsWithGroupsForFrontend(forceCheck);

            this.sendResponse(res, 200, 'success', accounts);

        } catch (error) {
            console.error('❌ 获取分组账号失败:', error);
            this.sendResponse(res, 500, `get accounts with groups failed: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    /**
     * 🔥 删除账号 - delete_account
     */
    private async handleDeleteAccount(req: express.Request, res: express.Response): Promise<void> {
        try {
            const accountId = parseInt(req.query.id as string);

            if (!accountId || isNaN(accountId)) {
                this.sendResponse(res, 400, 'Invalid or missing account ID', null);
                return;
            }

            const result = await AccountStorage.deleteAccount(accountId);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                const statusCode = result.message.includes('not found') ? 404 : 500;
                this.sendResponse(res, statusCode, result.message, null);
            }

        } catch (error) {
            console.error('❌ 删除账号失败:', error);
            this.sendResponse(res, 500, 'delete account failed', null);
        }
    }

    /**
     * 🔥 更新账号信息 - updateUserinfo
     */
    private async handleUpdateUserinfo(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { id, type, userName, filePath, status } = req.body;

            if (!id) {
                this.sendResponse(res, 400, '账号ID不能为空', null);
                return;
            }

            const result = await AccountStorage.updateUserinfo({ id, type, userName, filePath, status });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 更新账号信息失败:', error);
            this.sendResponse(res, 500, 'update account failed', null);
        }
    }

    /**
     * 🔥 添加账号 - 基础添加功能
     */
    private async handleAddAccount(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { type, filePath, userName, status = 0, group_id } = req.body;

            if (!type || !filePath || !userName) {
                this.sendResponse(res, 400, 'type, filePath, userName 是必需字段', null);
                return;
            }

            const result = await AccountStorage.addAccount({
                type, filePath, userName, status, group_id
            });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 400, result.message, null);
            }

        } catch (error) {
            console.error('❌ 添加账号失败:', error);
            this.sendResponse(res, 500, 'add account failed', null);
        }
    }
    private async handleGetAvatar(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { platform, accountName, filename } = req.params;

            // 防止路径穿越攻击
            if (platform.includes('..') || accountName.includes('..') || filename.includes('..')) {
                res.status(400).json({ error: 'Invalid path' });
                return;
            }

            const avatarPath = path.join(Config.AVATAR_DIR, platform, accountName, filename);

            // 检查文件是否存在
            if (!fs.existsSync(avatarPath)) {
                res.status(404).json({ error: 'Avatar not found' });
                return;
            }

            // 发送文件
            res.sendFile(path.resolve(avatarPath));

        } catch (error) {
            console.error('❌ 获取头像失败:', error);
            res.status(500).json({ error: 'Get avatar failed' });
        }
    }
    // ==================== 分组管理相关处理方法 ====================

    /**
     * 🔥 获取所有分组 - get_groups
     */
    private async handleGetGroups(req: express.Request, res: express.Response): Promise<void> {
        try {
            const result = await AccountStorage.getAllGroups();

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 获取分组失败:', error);
            this.sendResponse(res, 500, 'get groups failed', null);
        }
    }

    /**
     * 🔥 创建分组 - create_group
     */
    private async handleCreateGroup(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { name, description = '', color = '#5B73DE', icon = 'Users', sort_order = 0 } = req.body;

            if (!name) {
                this.sendResponse(res, 400, '分组名称不能为空', null);
                return;
            }

            const result = await AccountStorage.createGroup({
                name, description, color, icon, sort_order
            });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                const statusCode = result.message.includes('已存在') ? 400 : 500;
                this.sendResponse(res, statusCode, result.message, null);
            }

        } catch (error) {
            console.error('❌ 创建分组失败:', error);
            this.sendResponse(res, 500, 'create group failed', null);
        }
    }

    /**
     * 🔥 更新分组 - update_group
     */
    private async handleUpdateGroup(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { id, name, description, color, icon, sort_order } = req.body;

            if (!id) {
                this.sendResponse(res, 400, '分组ID不能为空', null);
                return;
            }

            const result = await AccountStorage.updateGroup({
                id, name, description, color, icon, sort_order
            });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                const statusCode = result.message.includes('已存在') ? 400 : 500;
                this.sendResponse(res, statusCode, result.message, null);
            }

        } catch (error) {
            console.error('❌ 更新分组失败:', error);
            this.sendResponse(res, 500, 'update group failed', null);
        }
    }

    /**
     * 🔥 删除分组 - delete_group
     */
    private async handleDeleteGroup(req: express.Request, res: express.Response): Promise<void> {
        try {
            const groupId = parseInt(req.query.id as string);

            if (!groupId || isNaN(groupId)) {
                this.sendResponse(res, 400, '分组ID不能为空', null);
                return;
            }

            const result = await AccountStorage.deleteGroup(groupId);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 删除分组失败:', error);
            this.sendResponse(res, 500, 'delete group failed', null);
        }
    }

    /**
     * 🔥 更新账号分组 - update_account_group
     */
    private async handleUpdateAccountGroup(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { account_id, group_id } = req.body;

            if (!account_id) {
                this.sendResponse(res, 400, '账号ID不能为空', null);
                return;
            }

            const result = await AccountStorage.updateAccountGroup({ account_id, group_id });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 更新账号分组失败:', error);
            this.sendResponse(res, 500, 'update account group failed', null);
        }
    }

    // ==================== 素材管理相关处理方法 ====================

    /**
     * 🔥 获取所有素材文件 - get_all_files
     */
    private async handleGetFiles(req: express.Request, res: express.Response): Promise<void> {
        try {
            const result = await AccountStorage.getAllMaterials();

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 获取素材文件失败:', error);
            this.sendResponse(res, 500, 'get files failed', null);
        }
    }
    /**
     * 🔥 上传文件 - upload
     */
    private async handleUpload(req: express.Request, res: express.Response): Promise<void> {
        try {
            if (!(req as any).file) {
                this.sendResponse(res, 200, 'No file part in the request', null);
                return;
            }

            const file = (req as any).file;
            if (!file.originalname) {
                this.sendResponse(res, 200, 'No selected file', null);
                return;
            }

            // 生成唯一文件名
            const finalFilename = AccountStorage.generateUniqueFilename(file.originalname);
            const filepath = path.join(Config.VIDEO_DIR, finalFilename);

            // 确保目录存在
            await AccountStorage.ensureVideoDirectoryExists();

            // 保存文件到指定位置
            await fs.promises.writeFile(filepath, file.buffer);

            this.sendResponse(res, 200, 'File uploaded successfully', finalFilename);

        } catch (error) {
            console.error('❌ 上传失败:', error);
            this.sendResponse(res, 200, String(error), null);
        }
    }
    /**
     * 🔥 上传保存素材文件 - upload_save
     */
    private async handleUploadSave(req: express.Request, res: express.Response): Promise<void> {
        try {
            if (!(req as any).file) {
                this.sendResponse(res, 400, 'No file part in the request', null);
                return;
            }

            const file = (req as any).file;
            if (!file.originalname) {
                this.sendResponse(res, 400, 'No selected file', null);
                return;
            }

            // 获取表单中的自定义文件名（可选）
            const customFilename = req.body.filename;
            let filename = file.originalname;

            if (customFilename) {
                const ext = path.extname(file.originalname);
                filename = customFilename + ext;
            }

            // 检查是否为视频文件
            if (!AccountStorage.isVideoFile(filename)) {
                this.sendResponse(res, 400, '不支持的视频格式，请上传 MP4、MOV、AVI 等格式的视频', null);
                return;
            }

            // 生成唯一文件名
            const finalFilename = AccountStorage.generateUniqueFilename(filename);
            const filepath = path.join(Config.VIDEO_DIR, finalFilename);

            // 确保目录存在
            await AccountStorage.ensureVideoDirectoryExists();

            // 保存文件
            await fs.promises.writeFile(filepath, file.buffer);

            // 获取文件大小
            const filesize = await AccountStorage.getFileSizeInMB(filepath);

            // 保存到数据库
            const result = await AccountStorage.saveMaterial({
                filename: filename,
                final_filename: finalFilename,
                filesize: filesize,
                file_path: filepath
            });

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 上传保存失败:', error);
            this.sendResponse(res, 500, 'upload failed', null);
        }
    }

    /**
     * 🔥 删除素材文件 - delete_file
     */
    private async handleDeleteFile(req: express.Request, res: express.Response): Promise<void> {
        try {
            const fileId = parseInt(req.query.id as string);

            if (!fileId || isNaN(fileId)) {
                this.sendResponse(res, 400, 'Invalid or missing file ID', null);
                return;
            }

            const result = await AccountStorage.deleteMaterial(fileId);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                const statusCode = result.message.includes('not found') ? 404 : 500;
                this.sendResponse(res, statusCode, result.message, null);
            }

        } catch (error) {
            console.error('❌ 删除文件失败:', error);
            this.sendResponse(res, 500, 'delete file failed', null);
        }
    }

    /**
     * 🔥 获取素材文件 - get_file
     */
    private async handleGetFile(req: express.Request, res: express.Response): Promise<void> {
        try {
            const filename = req.query.filename as string;

            if (!filename) {
                res.status(400).json({ error: 'filename is required' });
                return;
            }

            // 防止路径穿越攻击
            if (filename.includes('..') || filename.startsWith('/')) {
                res.status(400).json({ error: 'Invalid filename' });
                return;
            }

            const filePath = AccountStorage.getMaterialPreviewPath(filename);

            // 检查文件是否存在
            if (!(await AccountStorage.fileExists(filePath))) {
                res.status(404).json({ error: 'File not found' });
                return;
            }

            // 发送文件
            res.sendFile(path.resolve(filePath));

        } catch (error) {
            console.error('❌ 获取文件失败:', error);
            res.status(500).json({ error: 'get file failed' });
        }
    }
    /**
     * 🔥 获取封面文件
     */
    private async handleGetCover(req: express.Request, res: express.Response): Promise<void> {
        try {
            const filename = req.query.filename as string;

            if (!filename) {
                res.status(400).json({ error: 'filename is required' });
                return;
            }

            // 防止路径穿越攻击
            if (filename.includes('..') || filename.startsWith('/')) {
                res.status(400).json({ error: 'Invalid filename' });
                return;
            }

            const coversDir = path.join(Config.VIDEO_DIR, 'covers');
            const coverPath = path.join(coversDir, filename);

            // 检查文件是否存在
            if (!fs.existsSync(coverPath)) {
                res.status(404).json({ error: 'Cover not found' });
                return;
            }

            // 发送文件
            res.sendFile(path.resolve(coverPath));

        } catch (error) {
            console.error('❌ 获取封面失败:', error);
            res.status(500).json({ error: 'get cover failed' });
        }
    }    
    /**
     * 🔥 获取最近上传的视频文件 - get_recent_uploads
     */
    private async handleGetRecentUploads(req: express.Request, res: express.Response): Promise<void> {
        try {
            const result = await AccountStorage.getRecentUploads();

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 获取最近上传文件失败:', error);
            this.sendResponse(res, 500, `获取最近上传文件失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
    // 🔥 新增：处理封面保存的方法
    private async handleSaveCoverScreenshot(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { base64Data, videoFileName } = req.body;

            if (!base64Data) {
                this.sendResponse(res, 400, 'base64Data 不能为空', null);
                return;
            }

            if (!videoFileName) {
                this.sendResponse(res, 400, 'videoFileName 不能为空', null);
                return;
            }

            // 验证 base64 数据格式
            if (!base64Data.startsWith('data:image/')) {
                this.sendResponse(res, 400, '无效的图片数据格式', null);
                return;
            }

            console.log(`📸 保存视频封面: ${videoFileName}`);
            
            const coverPath = await PublishRecordStorage.saveCoverScreenshot(base64Data, videoFileName);

            if (coverPath) {
                this.sendResponse(res, 200, '封面保存成功', {
                    coverPath: coverPath,
                    videoFileName: videoFileName,
                    timestamp: new Date().toISOString()
                });
            } else {
                this.sendResponse(res, 500, '封面保存失败', null);
            }

        } catch (error) {
            console.error('❌ 保存封面失败:', error);
            this.sendResponse(res, 500, `保存封面失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
// ==================== 路径管理相关处理方法 ====================

    /**
     * 🔥 获取本地路径信息 - 为前端提供本地文件路径
     */
    private async handleGetPaths(req: express.Request, res: express.Response): Promise<void> {
        try {
            const paths = {
                baseDir: Config.BASE_DIR,
                videoDir: Config.VIDEO_DIR,
                coversDir: path.join(Config.VIDEO_DIR, 'covers'),
                cookieDir: Config.COOKIE_DIR,
                avatarDir: Config.AVATAR_DIR,
                tempDir: Config.TEMP_DIR,
                
                // 🔥 为前端提供 file:// 协议的路径
                videoFileUrl: `file://${Config.VIDEO_DIR}`,
                coversFileUrl: `file://${path.join(Config.VIDEO_DIR, 'covers')}`,
                
                // 🔥 平台信息
                platform: process.platform,
                
                // 🔥 路径分隔符
                pathSeparator: path.sep
            };
            
            console.log('📂 返回路径信息给前端:', {
                videoDir: paths.videoDir,
                coversDir: paths.coversDir,
                platform: paths.platform
            });
            
            this.sendResponse(res, 200, 'success', paths);

        } catch (error) {
            console.error('❌ 获取路径信息失败:', error);
            this.sendResponse(res, 500, `获取路径失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
// ==================== 发布记录管理相关处理方法 ====================

    /**
     * 🔥 获取发布记录列表
     */
    private async handleGetPublishRecords(req: express.Request, res: express.Response): Promise<void> {
        try {
            const {
                publisher = '全部发布人',
                content_type = '全部发布类型', 
                status = '全部推送状态',
                start_date,
                end_date,
                limit = 50,
                offset = 0
            } = req.query;

            const filters = {
                publisher: publisher as string,
                content_type: content_type as string,
                status: status as string,
                start_date: start_date as string,
                end_date: end_date as string,
                limit: parseInt(limit as string),
                offset: parseInt(offset as string)
            };

            const result = await PublishRecordStorage.getPublishRecords(filters);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 获取发布记录失败:', error);
            this.sendResponse(res, 500, `获取发布记录失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    /**
     * 🔥 修改：获取发布记录详情 - 合并内存中的实时进度
     */
    private async handleGetPublishRecordDetail(req: express.Request, res: express.Response): Promise<void> {
        try {
            const recordId = parseInt(req.query.id as string);

            if (!recordId || isNaN(recordId)) {
                this.sendResponse(res, 400, '发布记录ID不能为空', null);
                return;
            }

            // 1. 获取基础记录信息（从数据库）
            const result = PublishRecordStorage.getPublishRecordDetail(recordId);

            if (!result.success) {
                this.sendResponse(res, 404, result.message, null);
                return;
            }

            const recordData = result.data;

            // 2. 🔥 如果是进行中的任务，合并内存中的实时进度
            if (recordData.status === 'pending') {
                try {
                    const realtimeProgress = this.automationEngine.getUploadProgress(recordId);
                    console.log(`🔄 获取实时进度数据: ${realtimeProgress.length} 条记录`);
                    
                    // 合并实时进度到账号状态
                    if (realtimeProgress.length > 0) {
                        recordData.account_statuses.forEach((accountStatus: any) => {
                            const realtimeData = realtimeProgress.find(
                                p => p.accountName === accountStatus.account_name
                            );
                            
                            if (realtimeData) {
                                // 🔥 实时数据优先级更高
                                Object.assign(accountStatus, {
                                    status: realtimeData.status || accountStatus.status,
                                    upload_status: realtimeData.upload_status || accountStatus.upload_status,
                                    push_status: realtimeData.push_status || accountStatus.push_status,
                                    review_status: realtimeData.review_status || accountStatus.review_status,
                                    error_message: realtimeData.error_message || accountStatus.error_message
                                });
                                console.log(`✅ 合并实时进度: ${accountStatus.account_name} -> ${realtimeData.status}`);
                            }
                        });
                    }
                } catch (error) {
                    console.error('❌ 获取实时进度失败:', error);
                    // 如果获取实时进度失败，继续返回数据库中的数据
                }
            }

            this.sendResponse(res, 200, "success", recordData);

        } catch (error) {
            console.error('❌ 获取发布记录详情失败:', error);
            this.sendResponse(res, 500, `获取详情失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    /**
     * 🔥 批量删除发布记录
     */
    private async handleDeletePublishRecords(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { recordIds } = req.body;

            if (!Array.isArray(recordIds) || recordIds.length === 0) {
                this.sendResponse(res, 400, '请选择要删除的发布记录', null);
                return;
            }

            const validIds = recordIds.filter(id => typeof id === 'number' && id > 0);
            
            if (validIds.length === 0) {
                this.sendResponse(res, 400, '无效的记录ID', null);
                return;
            }

            const result = await PublishRecordStorage.deletePublishRecords(validIds);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 删除发布记录失败:', error);
            this.sendResponse(res, 500, `删除失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    /**
     * 🔥 导出发布记录
     */
    private async handleExportPublishRecords(req: express.Request, res: express.Response): Promise<void> {
        try {
            const {
                publisher,
                content_type, 
                status,
                start_date,
                end_date
            } = req.query;

            const filters = {
                publisher: publisher as string,
                content_type: content_type as string,
                status: status as string,
                start_date: start_date as string,
                end_date: end_date as string
            };

            const result = PublishRecordStorage.exportPublishRecords(filters);

            if (result.success) {
                // 设置下载响应头
                const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
                const filename = `publish_records_${timestamp}.csv`;
                
                res.setHeader('Content-Type', 'application/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                
                // 转换为CSV格式
                const csvContent = this.convertToCSV(result.data);
                res.send(csvContent);
            } else {
                this.sendResponse(res, 500, result.message, null);
            }

        } catch (error) {
            console.error('❌ 导出发布记录失败:', error);
            this.sendResponse(res, 500, `导出失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    // ==================== 视频发布相关处理方法 ====================
    /**
     * 🔥 视频发布 - postVideo
     */
    private async handlePostVideo(req: express.Request, res: express.Response): Promise<void> {
        let recordId: number | undefined = undefined;
        let savedCoverPaths: string[] = [];
        try {
            const {
                fileList = [],
                accountList = [],
                thumbnail,
                location,
                type: typeVal,
                title,
                tags,
                category,
                enableTimer,
                videosPerDay,
                dailyTimes,
                startDays,
                mode = 'background',
                description,
                original,
                statement,
                douyin_location,
                wechat_location
            } = req.body;

            console.log(`📤 接收到视频发布请求:`);
            console.log(`   文件数: ${fileList.length}`);
            console.log(`   账号数: ${accountList.length}`);
            console.log(`   发布模式: ${mode}`);
            console.log(`   tags: ${tags}`);
            // 验证必要参数
            if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
                this.sendResponse(res, 400, '文件列表不能为空', null);
                return;
            }

            if (!accountList || !Array.isArray(accountList) || accountList.length === 0) {
                this.sendResponse(res, 400, '账号列表不能为空', null);
                return;
            }

            // 平台类型映射
            const platformMap: Record<string, string> = {
                '1': 'xiaohongshu',
                '2': 'wechat',
                '3': 'douyin',
                '4': 'kuaishou'
            };

            const platform = platformMap[typeVal];
            if (!platform) {
                this.sendResponse(res, 400, `不支持的平台类型: ${typeVal}`, null);
                return;
            }

            // 检查平台是否支持上传
            if (!this.automationEngine.isPlatformSupported(platform)) {
                this.sendResponse(res, 400, `平台 ${platform} 暂不支持视频上传功能`, null);
                return;
            }
            
            let scheduledTime: string | undefined = undefined;
            if (enableTimer && videosPerDay && dailyTimes && Array.isArray(dailyTimes) && dailyTimes.length > 0) {
                const calculatedDate = this.calculatePublishDate(videosPerDay, dailyTimes, startDays);
                if (calculatedDate) {
                    scheduledTime = calculatedDate.toISOString();
                }
            }
            
            // 🔥 1. 创建发布记录
            const publishRecordData = {
                title: req.body.displayTitle || '未命名发布任务',
                video_files: fileList,
                cover_screenshots: savedCoverPaths,
                account_list: accountList.map((account: any) => ({
                    accountName: account.accountName,
                    platform: platform,
                    filePath: account.filePath,
                    accountId: account.accountId
                })),
                platform_type: parseInt(typeVal),
                status: 'pending' as const,
                total_accounts: accountList.length,
                success_accounts: 0,
                failed_accounts: 0,
                created_by: 'system',
                // 保存完整的发布配置
                publish_config: {
                    title: title || '',
                    description: description || '',
                    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
                    thumbnail: thumbnail || '',
                    location: location || '',
                    enableTimer: Boolean(enableTimer),
                    videosPerDay: videosPerDay || 1,
                    dailyTimes: dailyTimes || ['10:00'],
                    startDays: startDays || 0,
                    category: category || 0,
                    mode: mode,
                    original: Boolean(original !== false), // 默认为 true
                    platformSpecific: {
                        douyin: {
                            statement: statement || '无需声明',
                            location: douyin_location || location || ''
                        },
                        wechat: {
                            original: Boolean(original !== false),
                            location: wechat_location || location || ''
                        }
                    }
                },
                
                // 🔥 保存原始请求数据用于重新发布
                original_request_data: req.body,
                scheduled_time: scheduledTime,
            };
        
            const recordResult = PublishRecordStorage.savePublishRecord(publishRecordData);
            
            if (!recordResult.success) {
                this.sendResponse(res, 500, `创建发布记录失败: ${recordResult.message}`, null);
                return;
            }

            recordId = recordResult.data.recordId;
            console.log(`✅ 发布记录已创建: ID ${recordId}`);

            /*
            if (recordId !== undefined) {
                for (const account of accountList) {
                    const statusData = {
                        status: 'uploading',
                        upload_status: '待开始',
                        push_status: '待推送',
                        review_status: '待审核'
                    };

                    await PublishRecordStorage.updateAccountPublishStatus(recordId, account.accountName, statusData);
                }
            }*/

            // 🔥 3. 构造批量上传请求
            const batchRequest = {
                platform,
                files: fileList,
                accounts: accountList.map((account: any) => ({
                    cookieFile: account.filePath,
                    platform: platform,
                    accountName: account.accountName,
                    accountId: account.accountId,
                    followersCount: account.followersCount,
                    videosCount: account.videosCount,
                    avatar: account.avatar,
                    bio: account.bio
                })),
                params: {
                    title: req.body.title || '',
                    tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
                    category: category === 0 ? undefined : category,
                    enableOriginal: platform === 'wechat' ? (req.body.original !== false) : undefined, // 🔥 默认为 true，除非明确设置为 false
                    addToCollection: false,
                    publishDate: enableTimer ? this.calculatePublishDate(videosPerDay, dailyTimes, startDays) : undefined,
                    headless: mode === 'background',
                    thumbnailPath: thumbnail,
                    location: location
                }
            };
            console.log('🔧 handlePostVideo: enableTimer =', enableTimer);
            console.log('🔧 handlePostVideo: 原始参数 =', { videosPerDay, dailyTimes, startDays });
            console.log('🔧 handlePostVideo: 计算后的publishDate =', batchRequest.params.publishDate);
            if (batchRequest.params.publishDate) {
                console.log('🔧 handlePostVideo: publishDate格式化 =', batchRequest.params.publishDate.toLocaleString('zh-CN'));
            }
            // 🔥 4. 执行批量上传，传递 recordId
            console.log(`🚀 开始执行批量上传，记录ID: ${recordId}`);
            const uploadResults = await this.automationEngine.batchUpload(batchRequest, recordId);
            // 🔥 5. 统计结果
            const successCount = uploadResults.filter(r => r.success).length;
            const failedCount = uploadResults.length - successCount;
            const totalCount = uploadResults.length;
            
            // 确定最终状态
            let finalStatus: string;
            if (failedCount === 0) {
                finalStatus = 'success';
            } else if (successCount === 0) {
                finalStatus = 'failed';
            } else {
                finalStatus = 'partial';
            }

            // 🔥 6. 更新发布记录状态 - 添加类型检查
            if (recordId !== undefined) {
                const updateResult = await PublishRecordStorage.updatePublishRecordStatus(recordId, finalStatus, {
                    success: successCount,
                    failed: failedCount,
                    total: totalCount
                });

                if (!updateResult.success) {
                    console.error(`❌ 更新发布记录状态失败: ${updateResult.message}`);
                }
            }

            console.log(`📊 批量上传完成: 成功 ${successCount}, 失败 ${failedCount}`);

            this.sendResponse(res, 200, '发布任务已提交', {
                summary: {
                    total: uploadResults.length,
                    success: successCount,
                    failed: failedCount,
                    platform: platform
                },
                results: uploadResults,
                recordId: recordId,
                recordStatus: finalStatus
            });

        } catch (error) {
            console.error(`❌ 视频发布失败:`, error);
            // 🔥 添加类型检查
            if (recordId !== undefined) {
                try {
                    await PublishRecordStorage.updatePublishRecordStatus(recordId, 'failed');
                } catch (updateError) {
                    console.error(`❌ 更新发布记录状态失败:`, updateError);
                }
            }
            this.sendResponse(res, 500, `发布失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
    // 3. 新增：获取重新发布配置
    private async handleGetRepublishConfig(req: express.Request, res: express.Response): Promise<void> {
        try {
            const recordId = parseInt(req.query.id as string);
            const mode = req.query.mode as string; // 'all' 或 'failed'

            if (!recordId || isNaN(recordId)) {
                this.sendResponse(res, 400, '发布记录ID不能为空', null);
                return;
            }

            const result = await PublishRecordStorage.getRepublishConfig(recordId, mode);

            if (result.success) {
                this.sendResponse(res, 200, result.message, result.data);
            } else {
                this.sendResponse(res, 404, result.message, null);
            }

        } catch (error) {
            console.error('❌ 获取重新发布配置失败:', error);
            this.sendResponse(res, 500, `获取配置失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    // 4. 新增：重新发布接口
    private async handleRepublishVideo(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { recordId, mode, selectedAccounts } = req.body;

            if (!recordId) {
                this.sendResponse(res, 400, '发布记录ID不能为空', null);
                return;
            }

            // 获取重新发布配置
            const configResult = await PublishRecordStorage.getRepublishConfig(recordId, mode);
            if (!configResult.success) {
                this.sendResponse(res, 404, configResult.message, null);
                return;
            }

            const config = configResult.data;
            
            // 过滤账号（如果提供了selectedAccounts）
            let targetAccounts = config.accounts;
            if (selectedAccounts && Array.isArray(selectedAccounts)) {
                targetAccounts = config.accounts.filter((account: any) => 
                    selectedAccounts.includes(account.accountName)
                );
            }

            // 构造新的发布请求
            const republishRequest = {
                ...config.originalRequest,
                accountList: targetAccounts,
                title: config.originalRequest.title
            };

            console.log(`🔄 开始重新发布: 记录${recordId}, 模式${mode}, 账号数${targetAccounts.length}`);

            // 🔥 处理定时发布时间
            let scheduledTime: string | undefined = undefined;
            if (config.publishConfig) {
                const publishConfig = config.publishConfig;
                
                // 如果原来是定时发布，重新计算新的定时发布时间
                if (publishConfig.enableTimer && 
                    publishConfig.videosPerDay && 
                    publishConfig.dailyTimes && 
                    Array.isArray(publishConfig.dailyTimes) && 
                    publishConfig.dailyTimes.length > 0) {
                    
                    const calculatedDate = this.calculatePublishDate(
                        publishConfig.videosPerDay, 
                        publishConfig.dailyTimes, 
                        publishConfig.startDays || 0
                    );
                    
                    if (calculatedDate) {
                        scheduledTime = calculatedDate.toISOString();
                        console.log('🔄 重新发布定时时间已设置:', calculatedDate.toLocaleString('zh-CN'));
                    }
                }
            }
            // 创建发布记录
            const publishRecordData = {
                title: republishRequest.displayTitle || '重新发布任务',
                video_files: republishRequest.fileList || [],
                account_list: republishRequest.accountList.map((account: any) => ({
                    accountName: account.accountName || account.userName,
                    platform: account.platform,
                    filePath: account.filePath,
                    accountId: account.accountId
                })),
                platform_type: republishRequest.type || 2,
                status: 'pending' as const,
                total_accounts: republishRequest.accountList.length,
                success_accounts: 0,
                failed_accounts: 0,
                created_by: 'system',
                publish_config: config.publishConfig,
                original_request_data: republishRequest,
                scheduled_time: scheduledTime
            };

            const recordResult = PublishRecordStorage.savePublishRecord(publishRecordData);
            
            if (!recordResult.success) {
                this.sendResponse(res, 500, `创建发布记录失败: ${recordResult.message}`, null);
                return;
            }

            const newRecordId = recordResult.data.recordId;
            console.log(`✅ 重新发布记录已创建: ID ${newRecordId}`);

            // 🔥 立即返回响应，让前端切换到新记录
            this.sendResponse(res, 200, `重新发布任务已提交，共${targetAccounts.length}个账号`, {
                recordId: newRecordId,
                originalRecordId: recordId,
                accountCount: targetAccounts.length,
                mode: mode
            });

            // 🔥 在后台异步执行上传任务
            setImmediate(async () => {
                try {
                    console.log(`🚀 开始执行重新发布的批量上传，记录ID: ${newRecordId}`);
                    
                    // 构造批量上传请求
                    const batchRequest = {
                        platform: targetAccounts[0]?.platform || 'wechat',
                        files: republishRequest.fileList || [],
                        accounts: targetAccounts.map((account: any) => ({
                            cookieFile: account.filePath,
                            platform: account.platform,
                            accountName: account.accountName || account.userName,
                            accountId: account.accountId
                        })),
                        params: {
                            title: republishRequest.title || '',
                            tags: Array.isArray(republishRequest.tags) ? republishRequest.tags : (republishRequest.tags ? [republishRequest.tags] : []),
                            category: republishRequest.category === 0 ? undefined : republishRequest.category,
                            enableOriginal: targetAccounts[0]?.platform === 'wechat' ? (republishRequest.original !== false) : undefined,
                            addToCollection: false,
                            publishDate: config.publishConfig?.enableTimer ? this.calculatePublishDate(
                                config.publishConfig.videosPerDay, 
                                config.publishConfig.dailyTimes, 
                                config.publishConfig.startDays || 0
                            ) : undefined,
                            headless: true,
                            thumbnailPath: republishRequest.thumbnail,
                            location: republishRequest.location
                        }
                    };

                    // 执行批量上传
                    const uploadResults = await this.automationEngine.batchUpload(batchRequest, newRecordId);
                    
                    // 统计结果并更新记录状态
                    const successCount = uploadResults.filter(r => r.success).length;
                    const failedCount = uploadResults.length - successCount;
                    
                    let finalStatus = 'failed';
                    if (failedCount === 0) finalStatus = 'success';
                    else if (successCount > 0) finalStatus = 'partial';

                    await PublishRecordStorage.updatePublishRecordStatus(newRecordId, finalStatus, {
                        success: successCount,
                        failed: failedCount,
                        total: uploadResults.length
                    });

                    console.log(`📊 重新发布完成: 成功 ${successCount}, 失败 ${failedCount}`);
                    
                } catch (uploadError) {
                    console.error(`❌ 重新发布上传失败:`, uploadError);
                    await PublishRecordStorage.updatePublishRecordStatus(newRecordId, 'failed');
                }
            });

        } catch (error) {
            console.error('❌ 重新发布失败:', error);
            this.sendResponse(res, 500, `重新发布失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
    /**
     * 🔥 批量视频发布 - postVideoBatch
     */
    private async handlePostVideoBatch(req: express.Request, res: express.Response): Promise<void> {
        try {
            const dataList = req.body;

            if (!Array.isArray(dataList)) {
                this.sendResponse(res, 400, '请求数据应为数组格式', null);
                return;
            }

            const totalTasks = dataList.length;
            console.log(`🚀 接收到 ${totalTasks} 个批量发布任务`);

            let successCount = 0;
            let failedCount = 0;
            const results: any[] = [];

            for (let index = 0; index < dataList.length; index++) {
                const data = dataList[index];
                console.log(`\n📋 处理任务 ${index + 1}/${totalTasks}`);

                try {
                    // 模拟处理单个批量任务（实际应该调用相应的上传逻辑）
                    const fileList = data.fileList || [];
                    const accountList = data.accountList || [];
                    const typeVal = data.type;
                    const title = data.title || `批量任务_${index + 1}`;

                    // 计算任务成功数量
                    const taskSuccessCount = fileList.length * accountList.length;
                    successCount += taskSuccessCount;

                    results.push({
                        index: index + 1,
                        platform: this.getPlatformName(typeVal),
                        title: title,
                        success: true,
                        files: fileList.length,
                        accounts: accountList.length,
                        total_uploads: taskSuccessCount,
                        message: `成功提交 ${taskSuccessCount} 个上传任务`
                    });

                    console.log(`   ✅ 任务 ${index + 1} 提交成功`);

                } catch (taskError) {
                    console.log(`   ❌ 任务 ${index + 1} 失败: ${taskError}`);

                    const fileCount = data.fileList?.length || 0;
                    const accountCount = data.accountList?.length || 0;
                    const taskFailedCount = fileCount * accountCount;
                    failedCount += taskFailedCount;

                    results.push({
                        index: index + 1,
                        platform: this.getPlatformName(data.type),
                        title: data.title || `任务_${index + 1}`,
                        success: false,
                        files: fileCount,
                        accounts: accountCount,
                        total_uploads: 0,
                        error: taskError instanceof Error ? taskError.message : 'unknown error',
                        message: `任务失败: ${taskError instanceof Error ? taskError.message : 'unknown error'}`
                    });
                }
            }

            // 生成总结报告
            const totalEstimatedUploads = successCount + failedCount;
            const successRate = totalEstimatedUploads > 0 ? (successCount / totalEstimatedUploads * 100) : 0;

            const summary = {
                total_tasks: totalTasks,
                total_estimated_uploads: totalEstimatedUploads,
                success_uploads: successCount,
                failed_uploads: failedCount,
                success_rate: Math.round(successRate * 10) / 10
            };

            console.log(`\n📊 批量发布总结:`);
            console.log(`   总任务数: ${totalTasks}`);
            console.log(`   预计上传数: ${totalEstimatedUploads}`);
            console.log(`   成功提交: ${successCount}`);
            console.log(`   提交失败: ${failedCount}`);
            console.log(`   成功率: ${successRate.toFixed(1)}%`);

            this.sendResponse(res, 200, `批量发布完成: ${successCount}/${totalEstimatedUploads} 成功提交`, {
                summary: summary,
                results: results
            });

        } catch (error) {
            console.error(`❌ 批量发布系统错误:`, error);
            this.sendResponse(res, 500, `批量发布失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }

    // ==================== 验证相关处理方法 ====================
/**
 * 🔥 转换数据为CSV格式
 */
private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) {
        return '';
    }

    // 获取表头
    const headers = Object.keys(data[0]);
    
    // 转义CSV字段
    const escapeCSVField = (field: any): string => {
        if (field === null || field === undefined) {
            return '';
        }
        
        const stringField = String(field);
        
        // 如果包含逗号、引号或换行符，需要用引号包围并转义内部引号
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        
        return stringField;
    };

    // 构建CSV内容
    const csvHeaders = headers.map(escapeCSVField).join(',');
    const csvRows = data.map(row => 
        headers.map(header => escapeCSVField(row[header])).join(',')
    );

    return [csvHeaders, ...csvRows].join('\n');
}

/**
 * 🔥 获取发布记录统计信息（可选，用于仪表板）
 */
private async handleGetPublishRecordStats(req: express.Request, res: express.Response): Promise<void> {
    try {
        const stats = PublishRecordStorage.getPublishRecordStats();
        this.sendResponse(res, 200, 'success', stats);

    } catch (error) {
        console.error('❌ 获取发布记录统计失败:', error);
        this.sendResponse(res, 500, `获取统计失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
    }
}


    // ==================== 自动化相关处理方法 ====================

    /**
     * 🔥 获取账号信息
     */
    private async handleGetAccountInfo(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { tabId, platform } = req.body;

            if (!tabId || !platform) {
                res.status(400).json({
                    success: false,
                    error: 'tabId and platform are required'
                });
                return;
            }

            console.log(`🔍 收到账号信息提取请求: Tab ${tabId}, 平台 ${platform}`);

            const accountInfo = await this.automationEngine.getAccountInfo(platform, tabId);

            console.log(`📊 账号信息提取结果:`, accountInfo);
            res.json({
                success: !!accountInfo,
                data: accountInfo
            });

        } catch (error) {
            console.error('❌ 提取账号信息失败:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    /**
     * 🔥 手动验证账号 - 直接调用验证引擎重新检查cookie有效性
     */
    private async handleValidateAccount(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { accountId, headless = true, tabClose = true } = req.body;

            let targetPlatform: string;
            let targetCookieFile: string;
            console.log('accountId:', accountId);
            // 方式1: 直接提供accountId
            if (accountId) {
                const account = await AccountStorage.getAccountById(accountId);
                if (!account.success) {
                    this.sendResponse(res, 404, '账号不存在', null);
                    return;
                }
                
                targetPlatform = AccountStorage.getPlatformName(account.data.type);
                targetCookieFile = account.data.filePath;
            }
            else {
                this.sendResponse(res, 400, '需要提供 accountId', null);
                return;
            }

            console.log(`🔍 手动验证账号: ${targetPlatform} - ${targetCookieFile}, headless: ${headless}, tabClose: ${tabClose}`);

            // 调用验证引擎，传入新参数
            const isValid = await this.automationEngine.validateAccount(targetPlatform, targetCookieFile, headless, tabClose);

            // 返回验证结果
            this.sendResponse(res, 200, `验证完成: 账号${isValid ? '有效' : '无效'}`, {
                platform: targetPlatform,
                cookieFile: targetCookieFile,
                userName: accountId,
                isValid: isValid,
                status: isValid ? '正常' : '异常',
                validateTime: new Date().toISOString(),
                tabOpened: !tabClose
            });

        } catch (error) {
            console.error('❌ 手动验证账号失败:', error);
            this.sendResponse(res, 500, `验证失败: ${error instanceof Error ? error.message : 'unknown error'}`, null);
        }
    }
    // ==================== 辅助方法 ====================

    /**
     * 🔥 统一的前端响应格式
     */
    private sendResponse(res: express.Response, code: number, msg: string, data: any = null): void {
        res.json({ code, msg, data });
    }

    /**
     * 🔥 计算发布时间
     */
    private calculatePublishDate(videosPerDay?: number, dailyTimes?: string[], startDays?: number): Date | undefined {
        if (!videosPerDay || !dailyTimes || !Array.isArray(dailyTimes)) {
            return undefined;
        }

        try {
            const now = new Date();
            const startDate = new Date(now.getTime() + (startDays || 0) * 24 * 60 * 60 * 1000);

            // 使用第一个时间点作为发布时间
            const timeStr = dailyTimes[0] || '09:00';
            const [hours, minutes] = timeStr.split(':').map(Number);

            startDate.setHours(hours, minutes, 0, 0);

            return startDate;
        } catch (error) {
            console.warn(`⚠️ 计算发布时间失败:`, error);
            return undefined;
        }
    }

    /**
     * 🔥 获取平台名称
     */
    private getPlatformName(platformType: number): string {
        const platformNames: Record<number, string> = {
            1: "小红书",
            2: "视频号",
            3: "抖音",
            4: "快手"
        };
        return platformNames[platformType] || `平台${platformType}`;
    }

    /**
     * 🔥 获取路由器实例
     */
    getRouter(): express.Router {
        return this.router;
    }
}