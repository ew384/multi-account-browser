# test_python_integration.py
import requests
import json

def test_multi_account_api():
    base_url = "http://localhost:3000/api"
    
    # 创建账号
    accounts = [
        {"accountName": "Python测试账号A", "platform": "weixin"},
        {"accountName": "Python测试账号B", "platform": "weixin"},
        {"accountName": "Python测试账号C", "platform": "weixin"}
    ]
    
    tab_ids = []
    
    # 创建多个账号标签页
    for account in accounts:
        response = requests.post(f"{base_url}/account/create", json=account)
        result = response.json()
        
        if result["success"]:
            tab_ids.append(result["data"]["tabId"])
            print(f"✅ 创建账号成功: {account['accountName']}")
        else:
            print(f"❌ 创建账号失败: {result['error']}")
    
    # 切换标签页并执行操作
    for i, tab_id in enumerate(tab_ids):
        # 切换标签页
        requests.post(f"{base_url}/account/switch", json={"tabId": tab_id})
        
        # 执行JavaScript脚本
        script = f"""
        // 设置账号特定的数据
        localStorage.setItem('account_id', 'python_account_{i}');
        document.title = 'Python控制的标签页{i + 1}';
        
        // 返回状态信息
        ({{
            accountId: localStorage.getItem('account_id'),
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString()
        }});
        """
        
        response = requests.post(f"{base_url}/account/execute", json={
            "tabId": tab_id,
            "script": script
        })
        
        result = response.json()
        if result["success"]:
            print(f"✅ 标签页{i + 1}脚本执行成功: {result['data']}")
        else:
            print(f"❌ 标签页{i + 1}脚本执行失败: {result['error']}")
    
    # 获取所有账号状态
    response = requests.get(f"{base_url}/accounts")
    result = response.json()
    
    if result["success"]:
        print(f"\n📊 当前活跃账号数量: {len(result['data'])}")
        for account in result["data"]:
            print(f"   - {account['accountName']} ({account['loginStatus']})")
    
    print("\n🎉 Python集成测试完成！")

if __name__ == "__main__":
    test_multi_account_api()