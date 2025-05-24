# Cookie Reporter 服务器

这是 Cookie Reporter 浏览器插件的后端服务器，用于接收和管理 Cookie 数据。

## 功能特点

- RESTful API 接口
- SQLite 数据库存储
- Web 界面查看数据
- 支持按 URL 和时间范围过滤
- 异步处理请求

## 安装说明

1. 创建虚拟环境（推荐）：
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

## 运行服务器

```bash
python run.py
```

服务器将在 http://localhost:8000 启动

## API 接口

### 1. 提交 Cookie 报告

```
POST /api/cookies

请求体：
{
    "url": "页面URL",
    "cookies": [
        {
            "name": "cookie名称",
            "value": "cookie值",
            "domain": "cookie域",
            "path": "cookie路径"
        }
    ],
    "timestamp": "时间戳"
}
```

### 2. 获取 Cookie 报告列表

```
GET /api/cookies?url=过滤URL&days=天数

参数：
- url: 可选，按URL过滤
- days: 可选，最近几天的数据
```

## Web 界面

访问 http://localhost:8000 可以通过 Web 界面查看和管理 Cookie 数据：

- 支持按 URL 搜索
- 支持按时间范围过滤
- 查看详细的 Cookie 数据
- 响应式设计，支持移动设备

## 注意事项

- 默认使用 SQLite 数据库，数据文件保存在 `cookie_reports.db`
- 服务器默认监听所有网络接口（0.0.0.0）
- 开发模式下启用了自动重载功能 