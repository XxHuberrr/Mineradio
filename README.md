# Mineradio

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio 是一款桌面沉浸式音乐播放器，把搜索播放、歌词舞台、粒子视觉、3D 歌单架和完整桌面模式组合成一个更接近现场感的私人音乐空间。支持 Windows 和 macOS (Apple Silicon) 平台。

## 立即下载 Windows 安装包

> 安装包可从夸克盘、百度云、蓝奏云或 GitHub Release 手动下载；软件内更新入口仍只打开网盘线路，不读取 Release 附件。

| 下载入口 | 推荐人群 | 链接 |
| --- | --- | --- |
| 夸克盘 | 夸克用户 | [下载 Mineradio 2.1.0 (Windows)](https://pan.quark.cn/s/df00d9520835) |
| 百度云 | 百度网盘用户（提取码 `SJHP`） | [下载 Mineradio 2.1.0 (Windows)](https://pan.baidu.com/s/1UAAyvXHNJjxVXAHIPtl4Ow?pwd=SJHP) |
| 蓝奏云 | 直接下载 | [下载 Mineradio 2.1.0 (Windows)](https://xxhuber.lanzout.com/s/Mineradio) |
| GitHub Release | GitHub 用户、版本说明与源码 | [下载 Mineradio 2.1.0 (Windows)](https://github.com/XxHuberrr/Mineradio/releases/tag/v2.1.0) |
| GitHub Release (macOS) | Apple Silicon Mac 用户 | [下载 Mineradio 2.1.0 (macOS)](https://github.com/XxHuberrr/Mineradio/releases/tag/v2.1.0) |

安装时只需要下载并运行 `Mineradio-2.1.0-Setup.exe`。不要把 `.blockmap`、`latest.yml` 或 `win-unpacked` 当成正式安装包。

## macOS 版本

Mineradio 提供 Apple Silicon (M 系列芯片) 的 macOS 安装包 `Mineradio-<版本号>-arm64.dmg`，可在 GitHub Release 下载。Intel 芯片的 Mac 暂不支持。

macOS 安装包未进行 Apple 签名与公证，首次打开时 Gatekeeper 会提示"无法验证开发者"：

1. 在「访达 → 应用程序」中找到 Mineradio，右键（或按住 Control 点按）选择「打开」，再点「打开」确认。
2. 或在终端执行 `xattr -cr /Applications/Mineradio.app` 后正常双击打开。

macOS 版差异说明：桌面歌词的锁定/解锁请使用软件内视觉面板的开关（Windows 上的全局鼠标中键切换暂不支持）；应用内更新入口在 macOS 上会跳转到 Release 页面手动下载。

## 下载或安装被拦截怎么办

小众 Electron 桌面软件、未签名安装包有时会被浏览器、Windows Defender 或 SmartScreen 提示风险。请先确认安装包来自上面的网盘入口或官方 GitHub Release，文件名是 `Mineradio-2.1.0-Setup.exe`。

1. 浏览器下载栏提示风险时，打开下载列表，点这条下载右侧的 `...` 三个点，选择 `保留` / `仍要保留` / `显示更多` 后继续保留。
2. Windows SmartScreen 弹出蓝色拦截窗口时，点 `更多信息`，再点 `仍要运行`。
3. 如果杀毒软件明确显示木马、高危或已经隔离，不要强行运行；删除该文件后重新从上面的网盘入口下载，仍然异常请带截图反馈给作者。

## 作者支持

如果 Mineradio 陪你多听了一首歌，也欢迎请作者一杯咖啡。

[查看完整支持页](./docs/SUPPORT.md)

![Mineradio 作者支持渠道](./docs/assets/support/mineradio-author-support-poster.png)

Mineradio 2.1 进一步优化了壁纸与全屏体验，并提升了登录、账号、本地曲库和长时间运行的稳定性。

## 当前版本

当前版本：`2.1.0`

状态：Mineradio 2.1.0 正式版。

> 安全提示：`v1.0.10` 及更早旧安装包不再建议继续安装或传播。请使用本页提供的 `Mineradio-2.1.0-Setup.exe`。

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

Windows 用户可以从本页列出的夸克盘、百度云、蓝奏云或 GitHub Release 下载安装包。

正式分发以 `Mineradio-2.1.0-Setup.exe` 为准，不建议直接使用 `win-unpacked` 目录。安装包会创建桌面快捷方式。

已经安装过旧版本的用户可直接运行 `Mineradio-2.1.0-Setup.exe` 完成更新。软件内更新入口只会打开浏览器下载页，不会在客户端内下载或应用补丁。

## 开发运行

```bash
npm install
npm start
npm run build:win
```

桌面版入口由 Electron 主进程加载本地服务。`npm run build:win` 会生成 Windows NSIS 安装包，产物位于 `dist/`。

## 更新机制

Mineradio 会请求 GitHub Releases latest 检测新版本。远端版本高于本地版本时，应用内更新入口会展示 Release 内容，并通过系统浏览器打开可选网盘线路；即使 Release 附带完整安装包，`2.0.3+` 客户端也不会读取、下载、缓存或应用该附件与补丁。

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

本项目采用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。

MR Logo、Mineradio 名称、界面视觉设计与原创视觉表达归作者所有；第三方依赖和第三方服务分别遵循其各自授权与服务条款。
