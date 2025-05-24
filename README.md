# Cookie Reporter 浏览器插件

一个简单而强大的 Chrome 浏览器插件，用于自动刷新页面和上报 Cookie 数据。

## 功能特点

- 支持按页面独立配置自动刷新间隔
- 支持预览当前页面的 Cookie 数据
- 支持将 Cookie 数据上报到指定的服务器
- 现代化的用户界面
- 安全的数据处理

## 安装说明

1. 克隆或下载此仓库到本地
2. 打开 Chrome 浏览器，进入扩展程序页面（chrome://extensions/）
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本仓库的根目录

## 使用方法

1. 点击浏览器工具栏中的 Cookie Reporter 图标
2. 在弹出的界面中：
   - 使用开关按钮启用/禁用自动刷新和上报功能
   - 设置页面刷新间隔（秒）
   - 输入 Cookie 数据上报的服务器地址
   - 点击"预览 Cookie"按钮查看当前页面的 Cookie 数据
   - 点击"保存配置"按钮保存设置

## 注意事项

- 每个页面的配置都是独立的，需要单独设置
- 刷新间隔最小为 1 秒
- 启用功能时必须填写有效的上报地址
- 上报的数据格式为 JSON，包含 URL、Cookie 数据和时间戳

## 上报数据格式

```json
{
  "url": "当前页面的URL",
  "cookies": [
    {
      "name": "cookie名称",
      "value": "cookie值",
      "domain": "cookie域",
      "path": "cookie路径"
    }
  ],
  "timestamp": "ISO格式的时间戳"
}
```

## 开发说明

- 使用 Chrome Extension Manifest V3
- 使用 TailwindCSS 构建用户界面
- 后台服务使用 Service Worker
- 所有配置数据存储在 Chrome Storage 中

## 许可证

MIT License 