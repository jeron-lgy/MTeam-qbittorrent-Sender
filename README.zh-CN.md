# MTeam qB Sender

一个用于 M-Team 的 Chrome MV3 扩展，可以把当前种子详情页，或已经打开的多个 M-Team 种子详情标签页，一键发送到 qBittorrent Web UI。

## 功能

- 在 M-Team 页面右下角显示轻量悬浮面板。
- 支持发送当前种子详情页到 qBittorrent。
- 支持批量发送当前 Chrome 中已经打开的 M-Team 种子详情页。
- 支持 `upload` 模式：扩展先下载 `.torrent` 文件，再上传到 qBittorrent。
- 支持 `url` 模式：直接把 M-Team 下载链接交给 qBittorrent。
- 兼容 qBittorrent 5.2.x 的 Web API 行为，包括 `HTTP 204` 和 `HTTP 202 pending` 响应。
- 发送后会在页面上显示中文状态，例如“发送成功”“qB 已接收”“后台处理中”。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目里的 `mteam-qb-chrome-extension` 文件夹。
5. 打开扩展配置页，填写 qBittorrent Web UI 地址、用户名和密码。

## 配置说明

### qBittorrent Web UI 地址

填写 qBittorrent Web UI 的访问地址，例如：

```text
http://127.0.0.1:8080
```

如果你的 Web UI 运行在域名或公网地址，也可以填写对应地址。

### 用户名和密码

填写 qBittorrent Web UI 的登录用户名和密码。

### 保存路径

可选。留空时使用 qBittorrent 默认保存路径。

### 分类

可选。填写后会作为 qBittorrent 的分类，例如 `M-Team`。

### 发送模式

推荐使用 `upload` 模式。

- `upload`：扩展使用当前 M-Team 登录态下载种子文件，再上传给 qBittorrent。这个模式最稳，适合私站。
- `url`：扩展直接把下载 URL 交给 qBittorrent。只有当 qBittorrent 能直接访问该 URL 时才适合使用。

## 使用

打开 M-Team 种子详情页后，右下角会出现悬浮面板：

- `发送本页`：发送当前详情页的种子。
- `批量发送`：扫描当前已经打开的 M-Team 详情标签页，并逐个发送。
- `设`：打开扩展配置页。

批量发送会按当前 Chrome 中标签页顺序处理，并自动跳过重复的种子 ID。

## qBittorrent 5.2.x 兼容说明

qBittorrent 5.2.x 的 Web API 行为和旧版本不同：

- 登录或添加种子成功时，接口可能返回 `HTTP 204`，没有响应正文。
- 添加种子时，接口可能返回 `HTTP 202`，响应中包含 `pending_count`。

本扩展会把这些情况识别为正常成功或已接收，不会误报失败。

## 常见问题

### 连接测试成功，但发送后显示后台处理中

这是 qBittorrent 已接收任务但还在处理队列中。通常稍等一下就会出现在 qBittorrent 列表里。

### url 模式可以用吗

可以，但不推荐作为默认模式。私站下载链接通常需要浏览器登录态，qBittorrent 可能无法直接访问。建议使用 `upload` 模式。

### 页面控制台还有 userscript 报错

那通常是旧油猴脚本的报错，不属于这个 Chrome 扩展。建议在油猴里禁用旧脚本，避免日志混淆。
