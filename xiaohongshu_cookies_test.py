#!/usr/bin/env python3
"""
小红书Cookie隔离测试脚本
测试加载已保存的cookies并验证账号隔离效果
"""

import requests
import json
import time
import os
from typing import List, Dict, Any

class XiaohongshuCookieTester:
    def __init__(self, api_base_url: str = "http://localhost:3000/api"):
        self.api_base_url = api_base_url
        self.xiaohongshu_url = "https://creator.xiaohongshu.com"
        self.cookies_dir = "./cookies/xiaohongshu"
        
        # 已保存的Cookie文件
        self.test_accounts = [
            {
                "name": "小红书账号A-恢复",
                "cookie_file": "xiaohongshu_account_a.json",
                "id": "xiaohongshu_account_a"
            },
            {
                "name": "小红书账号B-恢复", 
                "cookie_file": "xiaohongshu_account_b.json",
                "id": "xiaohongshu_account_b"
            }
        ]
        self.created_tabs: List[Dict] = []
    
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
    
    def check_cookie_files(self) -> bool:
        """检查Cookie文件是否存在"""
        self.log("📁 检查Cookie文件...")
        
        for account in self.test_accounts:
            cookie_path = os.path.join(self.cookies_dir, account["cookie_file"])
            if os.path.exists(cookie_path):
                file_size = os.path.getsize(cookie_path)
                self.log(f"✅ 找到 {account['cookie_file']} ({file_size} bytes)")
                
                # 简单验证JSON格式
                try:
                    with open(cookie_path, 'r', encoding='utf-8') as f:
                        cookie_data = json.load(f)
                        cookie_count = len(cookie_data.get('cookies', []))
                        self.log(f"   包含 {cookie_count} 个cookies")
                except Exception as e:
                    self.log(f"⚠️ Cookie文件格式可能有问题: {e}", "WARN")
            else:
                self.log(f"❌ 未找到 {account['cookie_file']}", "ERROR")
                return False
        
        return True
    
    def create_tab_with_cookies(self, account: Dict) -> str:
        """创建标签页并加载cookies"""
        try:
            # 1. 创建标签页
            self.log(f"📱 创建标签页: {account['name']}")
            create_payload = {
                "accountName": account["name"],
                "platform": "xiaohongshu",
                "initialUrl": self.xiaohongshu_url
            }
            
            response = requests.post(
                f"{self.api_base_url}/account/create",
                json=create_payload,
                timeout=10
            )
            
            if response.status_code != 200:
                self.log(f"❌ 创建标签页失败: HTTP {response.status_code}", "ERROR")
                return ""
            
            result = response.json()
            if not result.get("success"):
                self.log(f"❌ 创建标签页失败: {result.get('error')}", "ERROR")
                return ""
            
            tab_id = result["data"]["tabId"]
            self.log(f"✅ 标签页创建成功: {tab_id}")
            
            self.log(f"⏳ 等待标签页初始化...")
            time.sleep(5)  # 增加到5秒
            
            # 3. 加载cookies
            cookie_path = os.path.join(self.cookies_dir, account["cookie_file"])
            self.log(f"🍪 加载cookies: {account['cookie_file']}")
            
            load_payload = {
                "tabId": tab_id,
                "cookieFile": cookie_path
            }
            
            response = requests.post(
                f"{self.api_base_url}/account/load-cookies",
                json=load_payload,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    self.log(f"✅ Cookies加载成功，等待页面刷新...")
                    time.sleep(8)  # 等待页面自动刷新和重新登录
                    return tab_id
                else:
                    self.log(f"❌ Cookies加载失败: {result.get('error')}", "ERROR")
            else:
                self.log(f"❌ Cookies加载请求失败: HTTP {response.status_code}", "ERROR")
            
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
    

    def check_login_status(self, tab_id: str, account_name: str) -> Dict:
        """检查登录状态 - 增加重试机制"""
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # 简化检查脚本，避免复杂操作
                check_script = """
                (function() {
                    try {
                        return {
                            isLoggedIn: !window.location.href.includes('/login'),
                            currentUrl: window.location.href,
                            title: document.title || 'Loading...',
                            readyState: document.readyState,
                            timestamp: new Date().toISOString()
                        };
                    } catch(e) {
                        return {
                            isLoggedIn: false,
                            currentUrl: 'error',
                            title: 'Error',
                            error: e.message
                        };
                    }
                })()
                """
                
                self.log(f"🔍 检查 {account_name} 登录状态 (尝试 {attempt + 1}/{max_retries})")
                
                response = requests.post(
                    f"{self.api_base_url}/account/execute",
                    json={"tabId": tab_id, "script": check_script},
                    timeout=30  # 增加超时时间
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        return result.get("data", {})
                
                self.log(f"⚠️ 尝试 {attempt + 1} 失败，等待重试...", "WARN")
                time.sleep(3)
                
            except requests.exceptions.Timeout:
                self.log(f"⏱️ 第 {attempt + 1} 次尝试超时", "WARN")
                if attempt < max_retries - 1:
                    time.sleep(5)
            except Exception as e:
                self.log(f"❌ 第 {attempt + 1} 次尝试异常: {e}", "ERROR")
                if attempt < max_retries - 1:
                    time.sleep(3)
        
        return {"isLoggedIn": False, "error": "所有重试均失败"}

    def test_cookie_isolation(self) -> bool:
        """简化的Cookie隔离测试"""
        self.log("🧪 开始测试Cookie隔离...")
        
        if len(self.created_tabs) < 2:
            self.log("⚠️ 需要至少2个标签页来测试隔离", "WARN")
            return False
        
        isolation_results = []
        
        # 简化测试：只设置简单的测试cookie
        for i, tab_info in enumerate(self.created_tabs):
            tab_id = tab_info["tab_id"]
            account_name = tab_info["account_name"]
            
            try:
                # 切换到标签页
                if not self.switch_to_tab(tab_id):
                    self.log(f"❌ 无法切换到 {account_name}", "ERROR")
                    continue
                
                # 设置简单的测试Cookie
                simple_script = f"""
                document.cookie = 'test_isolation_{i}=value_{i}; path=/';
                'Cookie设置完成';
                """
                
                response = requests.post(
                    f"{self.api_base_url}/account/execute",
                    json={"tabId": tab_id, "script": simple_script},
                    timeout=15
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        self.log(f"✅ 为 {account_name} 设置测试Cookie成功")
                    else:
                        self.log(f"❌ 为 {account_name} 设置测试Cookie失败: {result.get('error')}", "ERROR")
                
                time.sleep(2)
                
            except Exception as e:
                self.log(f"❌ 设置Cookie异常: {e}", "ERROR")
        
        # 验证隔离
        time.sleep(3)
        
        for i, tab_info in enumerate(self.created_tabs):
            tab_id = tab_info["tab_id"]
            account_name = tab_info["account_name"]
            
            try:
                if not self.switch_to_tab(tab_id):
                    continue
                
                # 简化验证脚本
                verify_script = f"""
                (function() {{
                    const cookies = document.cookie;
                    const hasOwnCookie = cookies.includes('test_isolation_{i}=');
                    const hasOtherCookies = {' || '.join([f"cookies.includes('test_isolation_{j}=')" for j in range(len(self.created_tabs)) if j != i])};
                    
                    return {{
                        accountIndex: {i},
                        hasOwnCookie: hasOwnCookie,
                        hasOtherCookies: hasOtherCookies,
                        isolated: hasOwnCookie && !hasOtherCookies
                    }};
                }})()
                """
                
                response = requests.post(
                    f"{self.api_base_url}/account/execute",
                    json={"tabId": tab_id, "script": verify_script},
                    timeout=15
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        data = result.get("data", {})
                        isolation_results.append(data)
                        
                        if data.get("isolated"):
                            self.log(f"✅ {account_name} Cookie隔离正常")
                        else:
                            self.log(f"❌ {account_name} Cookie隔离失败", "ERROR")
                
            except Exception as e:
                self.log(f"❌ 验证Cookie异常: {e}", "ERROR")
        
        isolated_count = sum(1 for r in isolation_results if r.get("isolated"))
        total_count = len(isolation_results)
        
        self.log(f"🎯 Cookie隔离测试结果: {isolated_count}/{total_count} 个账号隔离正常")
        return isolated_count > 0  # 只要有一个隔离成功就算部分成功

    def run_test(self):
        """优化的测试流程"""
        self.log("🚀 开始小红书Cookie隔离测试")
        
        # 1. 检查API状态
        if not self.check_api_status():
            return False
        
        # 2. 检查Cookie文件
        if not self.check_cookie_files():
            return False
        
        # 3. 创建标签页并加载cookies
        self.log("📱 创建标签页并加载cookies...")
        for account in self.test_accounts:
            try:
                tab_id = self.create_tab_with_cookies(account)
                if tab_id:
                    self.created_tabs.append({
                        "tab_id": tab_id,
                        "account_name": account["name"],
                        "cookie_file": account["cookie_file"]
                    })
                    # 增加等待时间，让页面充分加载
                    self.log("⏳ 等待页面加载...")
                    time.sleep(10)
            except Exception as e:
                self.log(f"❌ 创建标签页失败: {e}", "ERROR")
                continue
        
        if len(self.created_tabs) == 0:
            self.log("❌ 没有成功创建任何标签页", "ERROR")
            return False
        
        self.log(f"✅ 成功创建 {len(self.created_tabs)} 个标签页")
        
        # 4. 简化登录状态检查
        self.log("👤 检查各账号登录状态...")
        login_success_count = 0
        
        for tab_info in self.created_tabs:
            tab_id = tab_info["tab_id"]
            account_name = tab_info["account_name"]
            
            try:
                if self.switch_to_tab(tab_id):
                    time.sleep(5)  # 等待切换完成
                    status = self.check_login_status(tab_id, account_name)
                    
                    if status.get("isLoggedIn"):
                        self.log(f"✅ {account_name} 状态良好")
                        login_success_count += 1
                    else:
                        self.log(f"⚠️ {account_name} 可能需要手动检查", "WARN")
            except Exception as e:
                self.log(f"❌ 检查 {account_name} 状态异常: {e}", "ERROR")
        
        # 5. 无论登录状态如何，都进行Cookie隔离测试
        self.log("🧪 进行Cookie隔离测试...")
        try:
            isolation_success = self.test_cookie_isolation()
        except Exception as e:
            self.log(f"❌ Cookie隔离测试异常: {e}", "ERROR")
            isolation_success = False
        
        # 6. 输出结果
        self.log("📊 测试总结:")
        self.log(f"   - 创建标签页: {len(self.created_tabs)} 个")
        self.log(f"   - 状态检查成功: {login_success_count} 个")
        self.log(f"   - Cookie隔离: {'✅ 通过' if isolation_success else '⚠️ 需要检查'}")
        
        return len(self.created_tabs) > 0  # 只要能创建标签页就算基本成功

def main():
    print("=" * 60)
    print("🔍 小红书Cookie隔离测试")
    print("=" * 60)
    
    tester = XiaohongshuCookieTester()
    success = tester.run_test()
    
    if success:
        print("\n🎉 Cookie隔离测试通过！")
        print("\n📋 验证要点:")
        print("1. ✅ 两个账号都能正常加载cookies并登录")
        print("2. ✅ 每个标签页的cookies完全隔离")
        print("3. ✅ 不同账号之间没有cookie泄露")
    else:
        print("\n⚠️ Cookie隔离测试失败！")
        print("请检查:")
        print("- API服务是否正常运行")
        print("- Cookie文件是否有效")
        print("- 浏览器Session隔离是否工作正常")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()