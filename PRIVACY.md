# 隐私与用户数据说明

Mineradio 是本地桌面应用。项目不应把用户登录状态、Cookie、播放历史、搜索历史、自定义封面、自定义歌词或本地缓存提交到 GitHub。

## 本地数据

应用可能在本机保存以下数据：

- 网易云音乐登录 Cookie
- QQ 音乐登录 Cookie
- 搜索历史
- 自定义专辑封面
- 自定义歌词
- 歌词布局与视觉控制设置
- 本地节奏分析缓存
- 更新安装包下载缓存

这些数据用于本地体验，不属于开源仓库内容。

登录 Cookie 文件（`.cookie`、`.qq-cookie`）在系统支持时使用 Electron safeStorage 加密落盘（macOS 钥匙串 / Windows DPAPI），旧版明文文件会在启动时自动迁移为密文。

## 位置信息

天气电台需要粗略位置时，会通过 HTTPS 请求 ipwho.is 做 IP 定位（仅城市级），或使用用户手动输入的城市。位置信息只用于向 Open-Meteo 请求天气，不做其他用途，也不会上传到 Mineradio 自己的服务器（Mineradio 没有自己的服务器）。

## 不应上传的内容

以下内容不应提交到 GitHub：

- `.cookie`
- `.qq-cookie`
- `updates/`
- `node_modules/`
- Electron 打包产物
- 用户上传的本地音乐文件
- 用户账号信息、Cookie、Token、二维码登录状态

## 第三方平台

用户通过网易云音乐、QQ 音乐等第三方平台登录时，应遵守对应平台的用户协议。Mineradio 不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。
