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
- 洛雪自定义音源脚本及其本地状态（Electron `userData/custom-sources`）

这些数据用于本地体验，不属于开源仓库内容。

## 自定义音源脚本

导入的洛雪 `.js` 音源脚本原文只保存在 Electron 用户数据目录的 `custom-sources` 子目录，不会提交到仓库、随安装包分发或自动同步。

自定义脚本可以通过 Mineradio 提供的受限 HTTP/HTTPS 接口向任意网络服务发送歌曲元数据和脚本自身保存的凭据。Mineradio 不会把网易云或 QQ 音乐的登录 Cookie、账号会话自动注入脚本请求。运行时日志会递归遮盖常见的 Cookie、Authorization、Token、Secret、密码和 API Key 字段，但用户仍应只导入可信脚本。

## 不应上传的内容

以下内容不应提交到 GitHub：

- `.cookie`
- `.qq-cookie`
- `updates/`
- `node_modules/`
- Electron 打包产物
- 用户上传的本地音乐文件
- 用户账号信息、Cookie、Token、二维码登录状态
- `custom-sources/` 以及用户导入的音源脚本

## 第三方平台

用户通过网易云音乐、QQ 音乐等第三方平台登录时，应遵守对应平台的用户协议。Mineradio 不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。
