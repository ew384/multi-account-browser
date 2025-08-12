#!/usr/bin/env python3
"""
Python Config 类 - 模拟 TypeScript Config.ts 的路径逻辑
用于在 Python 脚本中获取与 Node.js 应用一致的路径配置
"""

import os
import platform

class Config:
    """应用配置类 - 对应 TypeScript 的 Config 类"""
    
    @staticmethod
    def get_base_dir():
        """获取基础目录 - 模拟 electron app.getPath('userData')"""
        system = platform.system()
        
        if system == "Darwin":  # macOS
            return os.path.expanduser("~/Library/Application Support/multi-account-browser")
        elif system == "Linux":  # Linux
            return os.path.expanduser("~/.config/multi-account-browser")
        elif system == "Windows":  # Windows
            return os.path.expanduser("~/AppData/Roaming/multi-account-browser")
        else:
            # 默认使用 Linux 路径
            return os.path.expanduser("~/.config/multi-account-browser")
    
    @staticmethod
    def get_video_dir():
        """获取视频文件目录 - 对应 Config.VIDEO_DIR"""
        return os.path.join(Config.get_base_dir(), "videoFile")
    
    @staticmethod
    def get_cookie_dir():
        """获取 Cookie 文件目录 - 对应 Config.COOKIE_DIR"""
        return os.path.join(Config.get_base_dir(), "cookiesFile")
    
    @staticmethod
    def get_db_dir():
        """获取数据库目录 - 对应 Config.DB_DIR"""
        return os.path.join(Config.get_base_dir(), "db")
    
    @staticmethod
    def get_db_path():
        """获取数据库路径 - 对应 Config.DB_PATH"""
        return os.path.join(Config.get_db_dir(), "database.db")
    
    @staticmethod
    def get_avatar_base_path():
        """获取头像基础路径 - 对应 assets/avatar 的根目录"""
        return Config.get_base_dir()  # 头像存储在 BASE_DIR/assets/avatar/
    
    @staticmethod
    def get_message_images_dir():
        """获取消息图片目录 - 对应 Config.MESSAGE_IMAGES_DIR"""
        return os.path.join(Config.get_base_dir(), "messageImages")
    
    @staticmethod
    def get_log_dir():
        """获取日志目录 - 对应 Config.LOG_DIR"""
        return os.path.join(Config.get_base_dir(), "logs")
    
    @staticmethod
    def get_temp_dir():
        """获取临时文件目录 - 对应 Config.TEMP_DIR"""
        return os.path.join(Config.get_base_dir(), "temp")
    
    # 🔥 便捷属性访问
    @property
    def BASE_DIR(self):
        return Config.get_base_dir()
    
    @property
    def VIDEO_DIR(self):
        return Config.get_video_dir()
    
    @property
    def COOKIE_DIR(self):
        return Config.get_cookie_dir()
    
    @property
    def DB_DIR(self):
        return Config.get_db_dir()
    
    @property
    def DB_PATH(self):
        return Config.get_db_path()
    
    @property
    def AVATAR_BASE_PATH(self):
        return Config.get_avatar_base_path()
    
    @property
    def MESSAGE_IMAGES_DIR(self):
        return Config.get_message_images_dir()
    
    @property
    def LOG_DIR(self):
        return Config.get_log_dir()
    
    @property
    def TEMP_DIR(self):
        return Config.get_temp_dir()

# 🔥 创建全局配置实例
config = Config()

# 🔥 常用路径常量（兼容旧代码）
BASE_DIR = Config.get_base_dir()
VIDEO_DIR = Config.get_video_dir()
COOKIE_DIR = Config.get_cookie_dir()
DB_DIR = Config.get_db_dir()
DB_PATH = Config.get_db_path()
AVATAR_BASE_PATH = Config.get_avatar_base_path()

# 🔥 平台类型映射 - 对应 TypeScript 的映射
PLATFORM_TYPE_MAP = {
    1: '小红书',
    2: '视频号', 
    3: '抖音',
    4: '快手',
    5: 'TikTok'
}

PLATFORM_NAME_MAP = {
    'xiaohongshu': 1,
    'wechat': 2,
    'douyin': 3,
    'kuaishou': 4,
    'tiktok': 5
}

def get_platform_name(platform_type):
    """根据类型获取平台名称"""
    return PLATFORM_TYPE_MAP.get(platform_type, '未知')

def get_platform_type(platform_name):
    """根据名称获取平台类型"""
    return PLATFORM_NAME_MAP.get(platform_name.lower(), 0)

# 🔥 调试信息
def print_config_info():
    """打印配置信息"""
    print("🔧 Python Config 配置信息:")
    print(f"   系统类型: {platform.system()}")
    print(f"   基础目录: {BASE_DIR}")
    print(f"   数据库路径: {DB_PATH}")
    print(f"   视频目录: {VIDEO_DIR}")
    print(f"   Cookie目录: {COOKIE_DIR}")
    print(f"   头像基础路径: {AVATAR_BASE_PATH}")

if __name__ == "__main__":
    print_config_info()