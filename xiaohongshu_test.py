#!/usr/bin/env python3
"""
小红书多账号隔离测试脚本
测试创建多个小红书账号标签页，验证Cookie隔离和持久化功能
"""

import requests
import json
import time
import os
from typing import List, Dict, Any

class XiaohongshuTester:
    def __init__(self, api_base_url: str = "http://localhost:3000/api"):
        self.api_base_url = api_base_url
        self.xiaohongshu_login_url = "https://creator.xiaohongshu.com/login"
        self.cookies_dir = "./cookies/xiaohongshu"
        self.test_accounts = [
            {"name": "小红书账号A", "id": "xiaohongshu_account_a"},
            {"name": "小红书账号B", "id": "xiaohongshu_account_b"}, 
        ]
        self.created_tabs: List[str] = []
        
        # 确保cookies目录存在
        os.makedirs(self.cookies_dir, exist_ok=True)
    
    def log(self, message: str, level: str = "INFO"):
        """打印带时间戳的日志"""
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
    def check_api_status(self) -> bool:
        """检查API服务状态"""
        try:
            response = requests.get(f"{self.api_base_url}/health", timeout=5)
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    self.log("✅ API服务连接正常")
                    return True
            self.log("❌ API服务响应异常", "ERROR")
            return False
        except Exception as e:
            self.log(f"❌ 无法连接到API服务: {e}", "ERROR")
            return False
    
    def create_xiaohongshu_tab(self, account_name: str) -> str:
        """创建小红书标签页"""
        try:
            payload = {
                "accountName": account_name,
                "platform": "xiaohongshu",
                "initialUrl": self.xiaohongshu_login_url
            }
            
            response = requests.post(
                f"{self.api_base_url}/account/create",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    tab_id = result["data"]["tabId"]
                    self.log(f"✅ 成功创建标签页: {account_name} (ID: {tab_id})")
                    return tab_id
                else:
                    self.log(f"❌ 创建标签页失败: {result.get('error')}", "ERROR")
            else:
                self.log(f"❌ API请求失败: HTTP {response.status_code}", "ERROR")
                
        except Exception as e:
            self.log(f"❌ 创建标签页异常: {e}", "ERROR")
        
        return ""
    
    def switch_to_tab(self, tab_id: str) -> bool:
        """切换到指定标签页"""
        try:
            response = requests.post(
                f"{self.api_base_url}/account/switch",
                json={"tabId": tab_id},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("success", False)
                
        except Exception as e:
            self.log(f"❌ 切换标签页异常: {e}", "ERROR")
        
        return False
    
    def get_all_accounts(self) -> List[Dict[str, Any]]:
        """获取所有账号状态"""
        try:
            response = requests.get(f"{self.api_base_url}/accounts", timeout=5)
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    return result.get("data", [])
        except Exception as e:
            self.log(f"❌ 获取账号列表异常: {e}", "ERROR")
        
        return []
    
    def save_cookies(self, tab_id: str, account_id: str) -> bool:
        """保存指定标签页的Cookies"""
        try:
            cookie_file = os.path.join(self.cookies_dir, f"{account_id}.json")
            
            response = requests.post(
                f"{self.api_base_url}/account/save-cookies",
                json={
                    "tabId": tab_id,
                    "cookieFile": cookie_file
                },
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    self.log(f"✅ 成功保存Cookies: {cookie_file}")
                    return True
                else:
                    self.log(f"❌ 保存Cookies失败: {result.get('error')}", "ERROR")
            
        except Exception as e:
            self.log(f"❌ 保存Cookies异常: {e}", "ERROR")
        
        return False
    
    def load_cookies(self, tab_id: str, account_id: str) -> bool:
        """加载指定标签页的Cookies"""
        try:
            cookie_file = os.path.join(self.cookies_dir, f"{account_id}.json")
            
            if not os.path.exists(cookie_file):
                self.log(f"⚠️ Cookie文件不存在: {cookie_file}", "WARN")
                return False
            
            response = requests.post(
                f"{self.api_base_url}/account/load-cookies",
                json={
                    "tabId": tab_id,
                    "cookieFile": cookie_file
                },
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    self.log(f"✅ 成功加载Cookies: {cookie_file}")
                    return True
                else:
                    self.log(f"❌ 加载Cookies失败: {result.get('error')}", "ERROR")
            
        except Exception as e:
            self.log(f"❌ 加载Cookies异常: {e}", "ERROR")
        
        return False
    
    def close_tab(self, tab_id: str) -> bool:
        """关闭标签页"""
        try:
            response = requests.post(
                f"{self.api_base_url}/account/close",
                json={"tabId": tab_id},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("success", False)
                
        except Exception as e:
            self.log(f"❌ 关闭标签页异常: {e}", "ERROR")
        
        return False
    
    def wait_for_login(self, tab_id: str, account_name: str, timeout: int = 300) -> bool:
        """等待用户登录完成"""
        self.log(f"⏳ 等待用户登录 {account_name}...")
        self.log(f"请在浏览器中完成登录，最多等待 {timeout} 秒")
        
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                # 检查登录状态
                response = requests.post(
                    f"{self.api_base_url}/account/execute",
                    json={
                        "tabId": tab_id,
                        "script": """
                        (function() {
                            // 检查小红书登录状态的多个指标
                            const indicators = {
                                hasUserAvatar: !!document.querySelector('.avatar, .user-avatar, [class*="avatar"]'),
                                hasUserName: !!document.querySelector('.username, .user-name, [class*="username"]'),
                                hasCreatorPanel: !!document.querySelector('[class*="creator"], [class*="dashboard"]'),
                                isLoginPage: window.location.href.includes('/login'),
                                currentUrl: window.location.href,
                                title: document.title,
                                hasAuthToken: document.cookie.includes('web_session') || document.cookie.includes('access_token'),
                                bodyText: document.body ? document.body.innerText.substring(0, 200) : ''
                            };
                            return indicators;
                        })()
                        """
                    },
                    timeout=5
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        indicators = result.get("data", {})
                        
                        # 判断是否已登录
                        is_logged_in = (
                            indicators.get("hasUserAvatar") or 
                            indicators.get("hasCreatorPanel") or
                            indicators.get("hasAuthToken") or
                            not indicators.get("isLoginPage")
                        )
                        
                        if is_logged_in:
                            self.log(f"✅ 检测到 {account_name} 已登录!")
                            self.log(f"   当前URL: {indicators.get('currentUrl', 'Unknown')}")
                            return True
                
                # 每5秒检查一次
                time.sleep(5)
                elapsed = int(time.time() - start_time)
                if elapsed % 30 == 0:  # 每30秒提示一次
                    self.log(f"⏳ 仍在等待 {account_name} 登录... ({elapsed}/{timeout}秒)")
                
            except Exception as e:
                self.log(f"⚠️ 检查登录状态时出错: {e}", "WARN")
                time.sleep(5)
        
        self.log(f"⏱️ 等待 {account_name} 登录超时", "WARN")
        return False
    
    def test_cookie_isolation(self) -> bool:
        """测试Cookie隔离"""
        self.log("🧪 开始测试Cookie隔离...")
        
        try:
            accounts = self.get_all_accounts()
            xiaohongshu_accounts = [acc for acc in accounts if acc.get("platform") == "xiaohongshu"]
            
            if len(xiaohongshu_accounts) < 2:
                self.log("⚠️ 需要至少2个小红书账号来测试隔离", "WARN")
                return False
            
            # 为每个账号设置测试Cookie
            for i, account in enumerate(xiaohongshu_accounts):
                tab_id = account["id"]
                account_name = account["accountName"]
                
                # 切换到标签页
                if self.switch_to_tab(tab_id):
                    # 设置测试Cookie
                    test_script = f"""
                    (function() {{
                        // 设置测试Cookie
                        document.cookie = 'test_isolation_{i}=account_{i}_value_' + Date.now() + '; path=/; domain=.xiaohongshu.com';
                        document.cookie = 'common_test=account_{i}_common; path=/; domain=.xiaohongshu.com';
                        
                        return {{
                            success: true,
                            cookies: document.cookie,
                            timestamp: new Date().toISOString()
                        }};
                    }})()
                    """
                    
                    response = requests.post(
                        f"{self.api_base_url}/account/execute",
                        json={"tabId": tab_id, "script": test_script},
                        timeout=5
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        if result.get("success"):
                            self.log(f"✅ 为 {account_name} 设置测试Cookie成功")
                        else:
                            self.log(f"❌ 为 {account_name} 设置测试Cookie失败", "ERROR")
                
                time.sleep(1)
            
            # 验证Cookie隔离
            isolation_passed = True
            for i, account in enumerate(xiaohongshu_accounts):
                tab_id = account["id"]
                account_name = account["accountName"]
                
                if self.switch_to_tab(tab_id):
                    verify_script = f"""
                    (function() {{
                        const cookies = document.cookie;
                        const hasOwnCookie = cookies.includes('test_isolation_{i}=');
                        
                        // 检查是否包含其他账号的Cookie
                        let hasOtherCookies = false;
                        {" ".join([f"if (cookies.includes('test_isolation_{j}=')) hasOtherCookies = true;" 
                                  for j in range(len(xiaohongshu_accounts)) if j != i])}
                        
                        return {{
                            cookies: cookies,
                            hasOwnCookie: hasOwnCookie,
                            hasOtherCookies: hasOtherCookies,
                            isolated: hasOwnCookie && !hasOtherCookies
                        }};
                    }})()
                    """
                    
                    response = requests.post(
                        f"{self.api_base_url}/account/execute",
                        json={"tabId": tab_id, "script": verify_script},
                        timeout=5
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        if result.get("success"):
                            data = result.get("data", {})
                            if data.get("isolated"):
                                self.log(f"✅ {account_name} Cookie隔离正常")
                            else:
                                self.log(f"❌ {account_name} Cookie隔离失败", "ERROR")
                                isolation_passed = False
                        else:
                            self.log(f"❌ 验证 {account_name} Cookie隔离失败", "ERROR")
                            isolation_passed = False
            
            return isolation_passed
            
        except Exception as e:
            self.log(f"❌ Cookie隔离测试异常: {e}", "ERROR")
            return False
    
    def run_complete_test(self):
        """运行完整的多账号测试流程"""
        self.log("🚀 开始小红书多账号隔离测试")
        
        # 1. 检查API状态
        if not self.check_api_status():
            self.log("❌ API服务不可用，测试终止", "ERROR")
            return False
        
        # 2. 创建3个小红书账号标签页
        self.log("📱 创建小红书账号标签页...")
        for account in self.test_accounts:
            tab_id = self.create_xiaohongshu_tab(account["name"])
            if tab_id:
                self.created_tabs.append({
                    "tab_id": tab_id,
                    "account_id": account["id"],
                    "account_name": account["name"]
                })
                time.sleep(2)  # 等待标签页创建完成
        
        if len(self.created_tabs) == 0:
            self.log("❌ 没有成功创建任何标签页，测试终止", "ERROR")
            return False
        
        self.log(f"✅ 成功创建 {len(self.created_tabs)} 个标签页")
        
        # 3. 等待用户在每个标签页中登录
        self.log("👤 等待用户登录阶段...")
        logged_in_tabs = []
        
        for tab_info in self.created_tabs:
            tab_id = tab_info["tab_id"]
            account_name = tab_info["account_name"]
            
            # 切换到当前标签页
            if self.switch_to_tab(tab_id):
                self.log(f"🔄 已切换到 {account_name}，请在浏览器中登录")
                
                # 等待用户登录
                if self.wait_for_login(tab_id, account_name):
                    logged_in_tabs.append(tab_info)
                    
                    # 登录成功后保存Cookies
                    self.log(f"💾 保存 {account_name} 的Cookies...")
                    self.save_cookies(tab_id, tab_info["account_id"])
                else:
                    self.log(f"⚠️ {account_name} 登录超时，跳过", "WARN")
        
        if len(logged_in_tabs) < 2:
            self.log("⚠️ 需要至少2个账号登录才能进行隔离测试", "WARN")
        else:
            # 4. 测试Cookie隔离
            self.test_cookie_isolation()
        
        # 5. 关闭所有标签页
        self.log("🔄 关闭所有标签页...")
        for tab_info in self.created_tabs:
            if self.close_tab(tab_info["tab_id"]):
                self.log(f"✅ 已关闭 {tab_info['account_name']}")
        
        time.sleep(3)
        
        # 6. 重新创建标签页并加载Cookies测试持久化
        self.log("🔄 测试Cookie持久化...")
        restored_tabs = []
        
        for tab_info in logged_in_tabs:
            account_name = tab_info["account_name"]
            account_id = tab_info["account_id"]
            
            # 重新创建标签页
            new_tab_id = self.create_xiaohongshu_tab(f"{account_name}-恢复")
            if new_tab_id:
                time.sleep(2)
                
                # 加载之前保存的Cookies
                if self.load_cookies(new_tab_id, account_id):
                    restored_tabs.append({
                        "tab_id": new_tab_id,
                        "account_name": f"{account_name}-恢复"
                    })
                    
                    # 切换到标签页并验证登录状态
                    if self.switch_to_tab(new_tab_id):
                        time.sleep(3)  # 等待页面加载
                        
                        # 检查是否仍然登录
                        response = requests.post(
                            f"{self.api_base_url}/account/execute",
                            json={
                                "tabId": new_tab_id,
                                "script": """
                                (function() {
                                    // 刷新页面以验证Cookie有效性
                                    window.location.reload();
                                    return { refreshed: true };
                                })()
                                """
                            },
                            timeout=5
                        )
                        
                        self.log(f"🔄 已刷新 {account_name} 页面以验证登录状态")
        
        # 7. 最终状态检查
        self.log("📊 最终状态检查...")
        final_accounts = self.get_all_accounts()
        xiaohongshu_final = [acc for acc in final_accounts if acc.get("platform") == "xiaohongshu"]
        
        self.log(f"📈 测试总结:")
        self.log(f"   - 创建标签页: {len(self.created_tabs)} 个")
        self.log(f"   - 成功登录: {len(logged_in_tabs)} 个")
        self.log(f"   - 恢复标签页: {len(restored_tabs)} 个")
        self.log(f"   - 当前活跃: {len(xiaohongshu_final)} 个")
        
        # 8. Cookie文件列表
        cookie_files = [f for f in os.listdir(self.cookies_dir) if f.endswith('.json')]
        self.log(f"💾 保存的Cookie文件: {len(cookie_files)} 个")
        for cookie_file in cookie_files:
            file_path = os.path.join(self.cookies_dir, cookie_file)
            file_size = os.path.getsize(file_path)
            self.log(f"   - {cookie_file} ({file_size} bytes)")
        
        self.log("🎉 小红书多账号测试完成!")
        return True

def main():
    """主函数"""
    print("=" * 60)
    print("🔍 小红书多账号隔离测试工具")
    print("=" * 60)
    
    tester = XiaohongshuTester()
    
    # 运行完整测试
    success = tester.run_complete_test()
    
    if success:
        print("\n✅ 测试执行完成!")
        print("\n📋 后续验证步骤:")
        print("1. 检查各个标签页是否显示不同的登录状态")
        print("2. 验证Cookie隔离是否正常工作")
        print("3. 确认重新加载后账号状态是否保持")
    else:
        print("\n❌ 测试执行失败!")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
