# Mineradio

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio 是一款 Windows 桌面沉浸式音乐播放器，把搜索播放、歌词舞台、粒子视觉、3D 歌单架和完整桌面模式组合成一个更接近现场感的私人音乐空间。

## 立即下载 Windows 安装包

> 国内 GitHub 用户可优先使用蓝奏云下载；其他用户可直接使用 GitHub Release。

| 下载入口 | 推荐人群 | 链接 |
| --- | --- | --- |
| 蓝奏云满速下载 | 国内用户优先 | [下载 Mineradio 2.0.2 安装包](https://xxhuber.lanzout.com/s/Mineradio) |
| GitHub Release | GitHub 用户 | [Mineradio 2.0.2 Release](https://github.com/XxHuberrr/Mineradio/releases/tag/v2.0.2) |

安装时只需要下载并运行 `Mineradio-2.0.2-Setup.exe`。不要把 `.blockmap`、`latest.yml` 或 `win-unpacked` 当成正式安装包。

## Linux 适配（Fork 分支 `linux-adapt`）

本 fork 在原版基础上增加了 Linux 平台适配，分支 `linux-adapt` 包含以下改动：

### 改动说明

| 文件 | 改动 |
| --- | --- |
| `desktop/main.js` | `use-angle` 从 `d3d11` 改为 `gl`，修复 Linux 下 Three.js 粒子渲染异常 |
| `public/js/index-loader.js` | 新增鼠标侧键拦截（button 3/4），防止 Electron 页面意外导航 |
| `package.json` | 新增 `linux` 打包配置，支持 `.deb` 安装包生成；`executableArgs` 自动注入 `--no-sandbox --ozone-platform=x11` |

### Linux 安装

```bash
npm install
npm run build:linux
sudo dpkg -i dist/mineradio_2.0.2_amd64.deb
```

### 适用平台

- Ubuntu 24.04+ / Debian 12+ / 其他基于 Debian 的发行版
- Wayland 会话（XWayland 兼容）
- GNOME / KDE / XFCE 桌面环境



## 下载或安装被拦截怎么办

小众 Electron 桌面软件、未签名安装包有时会被浏览器、Windows Defender 或 SmartScreen 提示风险。请先确认安装包来自上面的蓝奏云或 GitHub Release 官方入口，文件名是 `Mineradio-2.0.2-Setup.exe`。

1. 浏览器下载栏提示风险时，打开下载列表，点这条下载右侧的 `...` 三个点，选择 `保留` / `仍要保留` / `显示更多` 后继续保留。
2. Windows SmartScreen 弹出蓝色拦截窗口时，点 `更多信息`，再点 `仍要运行`。
3. 如果杀毒软件明确显示木马、高危或已经隔离，不要强行运行；删除该文件后重新从蓝奏云或 GitHub Release 下载，仍然异常请带截图反馈给作者。

## 作者支持

如果 Mineradio 陪你多听了一首歌，也欢迎请作者一杯咖啡。

[查看完整支持页](./docs/SUPPORT.md)

![Mineradio 作者支持渠道](./docs/assets/support/mineradio-author-support-poster.png)

Mineradio 2.0 重新整理了视觉层次、桌面模式、主页与搜索体验，并收紧了连续播放、启动和后台性能表现。

## 当前版本

当前版本：`2.0.2`（Linux 适配版基于此版本）

状态：Mineradio 2.0.2 正式版。

> 安全提示：`v1.0.10` 及更早旧安装包不再建议继续安装或传播。请使用本页提供的 `Mineradio-2.0.2-Setup.exe`。

## 核心特性

- 首页包含每日推荐、平台推荐、继续听、听歌画像和我的歌单入口
- 完整桌面模式保留播放器、主页、歌单和桌面交互
- 支持本地 MP4 与 Wallpaper Engine 视觉内容
- 播放后切换到 Emily / 默认播放态视觉，歌词舞台与粒子舞台同步工作
- 基于节奏的电影镜头视觉系统
- 面向长播客和 DJ 曲目的专属视觉模式
- 歌词舞台、自定义歌词、歌词位置与视觉控制
- 自定义专辑封面上传与裁剪
- 右键唤起 3D 歌单架，支持歌单队列浏览
- 网易云音乐账号、搜索、歌单、播客等体验接入
- QQ 音乐搜索、登录态与音源补充接入
- GitHub Releases 更新检测与下载入口
- 首次启动内置「默认测试」视觉用户存档，软件内默认视觉参数与该存档一致

## 使用说明

Windows 用户可以在 GitHub Releases 中下载安装包。

正式分发以 `Mineradio-2.0.2-Setup.exe` 为准，不建议直接使用 `win-unpacked` 目录。安装包会创建桌面快捷方式。

已经安装过旧版本的用户可直接运行 `Mineradio-2.0.2-Setup.exe` 完成更新。

## 开发运行

```bash
npm install
npm start
npm run build:win
npm run build:linux    # 构建 .deb 安装包
```

桌面版入口由 Electron 主进程加载本地服务。`npm run build:win` 会生成 Windows NSIS 安装包，产物位于 `dist/`。

## 更新机制

Mineradio 会请求 GitHub Releases latest 检测新版本。远端版本高于本地版本时，应用内更新入口会展示 Release 内容、下载安装包到本机用户数据目录，并通过系统打开安装包。

本地验证更新链路时，可以通过 `MINERADIO_UPDATE_MANIFEST` 指向一个本地 manifest JSON 或 HTTP 地址来模拟线上 Release。

## 第三方音乐平台说明

Mineradio 不是网易云音乐、QQ 音乐或腾讯音乐娱乐集团的官方客户端，也不隶属于任何音乐平台。

项目中的第三方平台接入仅用于个人学习、本地客户端体验和用户自有账号的播放辅助。请遵守对应平台的用户协议、版权规则和会员权益规则。项目不会提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。

## 用户数据与隐私

登录 Cookie、搜索历史、自定义封面、自定义歌词、节奏分析缓存等数据只应保存在本机用户数据目录或浏览器本地存储中，不应提交到仓库。

更多说明见 [PRIVACY.md](./PRIVACY.md)。

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。

## 版权与授权

Copyright (C) 2026 XxHuberrr.

Linux 适配分支维护：YannZhou · 2026

本项目采用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。

MR Logo、Mineradio 名称、界面视觉设计与原创视觉表达归作者所有；第三方依赖和第三方服务分别遵循其各自授权与服务条款。
