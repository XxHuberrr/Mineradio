# Mineradio for Linux

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

> **Linux x86 适配版** — 基于 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio)，由 [jade2-fff](https://github.com/jade2-fff) 移植，保持与上游同步更新。

Mineradio 是一款沉浸式音乐播放器，把天气电台、搜索播放、歌词舞台、粒子视觉和 3D 歌单架组合成一个更接近现场感的私人音乐空间。本仓库是针对 Linux x86_64 平台的适配版本。

## 立即下载 Linux 版

| 安装方式 | 适用发行版 | 下载 |
| --- | --- | --- |
| AppImage（免安装，推荐） | 所有主流发行版 | [Mineradio-1.1.1-x86_64.AppImage](https://github.com/jade2-fff/Mineradio-for-linux/releases/download/v1.1.1/Mineradio-1.1.1-x86_64.AppImage) |
| deb 包 | Debian / Ubuntu / 深度 | [Mineradio-1.1.1-amd64.deb](https://github.com/jade2-fff/Mineradio-for-linux/releases/download/v1.1.1/Mineradio-1.1.1-amd64.deb) |

> [查看所有 Release](https://github.com/jade2-fff/Mineradio-for-linux/releases)

## Linux 适配说明

- **构建目标**：AppImage + deb（x64）
- **GPU 渲染**：Windows d3d11 → Linux OpenGL + Wayland 自适应（ozone）
- **已适配**：窗口图标、更新选包、AppImage 自动 chmod+启动、节奏缓存目录跨平台化
- **已知降级**（不影响核心播放）：
  - 桌面歌词中键全局解锁（依赖 Windows PowerShell，Linux 上静默跳过）
  - 壁纸嵌入桌面图标层（依赖 Win32 WorkerW API，Linux 上静默跳过）

### 推荐安装字体

```bash
sudo apt install fonts-noto-cjk fonts-inter
```

## 同步上游更新

本项目保持与原作者仓库 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) 同步。当上游有新版本发布时，执行以下命令拉取合并：

```bash
git fetch upstream
git merge upstream/main
# 如有冲突，手动解决后：
# git add .
# git commit
git push origin main
```

## Linux 安装

有两种安装方式，按需选择：

### 方式一：AppImage（免安装，推荐）

AppImage 是单个可执行文件，下载后赋予执行权限即可双击运行，无需安装。

```bash
# 下载后赋予执行权限（文件名以实际 Release 为准）
chmod +x Mineradio-1.1.1-x86_64.AppImage

# 运行
./Mineradio-1.1.1-x86_64.AppImage
```

> 如果双击无法运行，可能是文件管理器未启用「允许执行」，在文件属性里勾选「作为程序执行」即可。

### 方式二：deb 包（系统安装，适合 Debian/Ubuntu 系）

```bash
# 安装
sudo dpkg -i Mineradio-1.1.1-x64.deb

# 如提示缺少依赖，补一下再安装
sudo apt-get install -f

# 安装后从应用菜单启动 Mineradio，或命令行运行
mineradio
```

安装包会自动注册到系统应用菜单，卸载使用 `sudo apt remove mineradio`。

### 系统依赖

基于 Electron 的应用需要以下运行库，大多数桌面发行版已默认包含，缺失时按需安装：

```bash
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  xdg-utils libatspi2.0-0 libdrm2 libgbm1
```

> AppImage 用户通常无需手动安装，AppImage 会自带大部分依赖。

### 常见问题：双击没反应 / 启动秒退

deb 安装后双击没反应，通常是 Electron 的 `chrome-sandbox` 权限不对。一条命令修复：

```bash
sudo chown root:root /opt/Mineradio/chrome-sandbox && sudo chmod 4755 /opt/Mineradio/chrome-sandbox
```

> AppImage 用户如果也遇到，先解包再执行相同操作：
> ```bash
> ./Mineradio-*.AppImage --appimage-extract
> sudo chown root:root squashfs-root/chrome-sandbox && sudo chmod 4755 squashfs-root/chrome-sandbox
> ./squashfs-root/AppRun
> ```

### 从源码构建

如果 Release 里没有你需要的包，可从源码自行构建：

```bash
git clone https://github.com/jade2-fff/Mineradio-for-linux.git
cd Mineradio-for-linux
npm install
npm run build:linux        # 生成 AppImage + deb，产物在 dist/
```

## 原版 Windows 下载

## 立即下载 Windows 安装包

> 国内 GitHub 小白用户：优先使用蓝奏云下载，打开链接后直接下载 `Mineradio-1.1.1-Setup.exe`，速度通常比 GitHub Release 更稳、更接近满速。

| 下载入口 | 推荐人群 | 链接 |
| --- | --- | --- |
| 蓝奏云满速下载 | 国内用户优先 | [下载 Mineradio 1.1.1 安装包](https://xxhuber.lanzout.com/s/Mineradio) |
| GitHub Release 备用 | 能稳定访问 GitHub 的用户 | [v1.1.1 Release](https://github.com/XxHuberrr/Mineradio/releases/tag/v1.1.1) |

安装时只需要下载并运行 `Mineradio-1.1.1-Setup.exe`。不要下载 `Source code`、`.blockmap`、`latest.yml`，也不要把 `win-unpacked` 当成正式安装包。

## 下载或安装被拦截怎么办

小众 Electron 桌面软件、未签名安装包有时会被浏览器、Windows Defender 或 SmartScreen 提示风险。请先确认安装包来自上面的蓝奏云或 GitHub Release 官方入口，文件名是 `Mineradio-1.1.1-Setup.exe`。

1. 浏览器下载栏提示风险时，打开下载列表，点这条下载右侧的 `...` 三个点，选择 `保留` / `仍要保留` / `显示更多` 后继续保留。
2. Windows SmartScreen 弹出蓝色拦截窗口时，点 `更多信息`，再点 `仍要运行`。
3. 如果杀毒软件明确显示木马、高危或已经隔离，不要强行运行；删除该文件后重新从蓝奏云或 GitHub Release 下载，仍然异常请带截图反馈给作者。

## 作者支持

如果 Mineradio 陪你多听了一首歌，也欢迎请作者一杯咖啡。

[查看完整支持页](./docs/SUPPORT.md)

![Mineradio 作者支持渠道](./docs/assets/support/mineradio-author-support-poster.png)

1.1.1 的核心目标是把 Mineradio 重新整理成一份可公开下载的纯净安装版：默认视觉参数来自内置「默认测试」用户存档，首次启动就进入统一的视觉手感；3D 歌单架、歌词层级、用户存档和后台性能策略都在同一轮里收口。

## 当前版本

当前版本：`1.1.1`

状态：1.1.1 纯净安装发布版。

> 安全提示：`v1.0.10` 及更早旧安装包不再建议继续安装或传播，请先隔离旧安装包。请使用本页提供的 `Mineradio-1.1.1-Setup.exe` 进行纯净安装。

## 核心特性

- Open-Meteo 天气电台，根据当前位置、城市和天气 mood 生成更合适的播放队列
- 首页包含天气电台、每日推荐、私人电台、继续听、听歌画像和我的歌单入口
- Wallpaper 银河首页背景，未播放状态保持干净的星河氛围
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

正式分发以 `Mineradio-1.1.1-Setup.exe` 为准，不建议直接下载 `win-unpacked` 目录作为正式分发包。安装包会创建桌面快捷方式；直接运行打包版 `Mineradio.exe` 时，应用也会在首次启动时补创建桌面快捷方式。

已经安装过旧版本的用户，建议卸载旧版本、隔离旧安装包后，再使用 `v1.1.1` 安装包纯净安装。

## 开发运行

```bash
npm install

# 开发模式启动
npm start

# Windows 构建
npm run build:win

# Linux 构建（AppImage + deb）
npm run build:linux

# Linux 仅打包目录（调试用，更快）
npm run build:linux:dir
```

桌面版入口由 Electron 主进程加载本地服务。`npm run build:win` 会生成 Windows NSIS 安装包，`npm run build:linux` 会生成 AppImage 和 deb 安装包，产物均位于 `dist/`。

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

本项目采用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。

MR Logo、Mineradio 名称、界面视觉设计与原创视觉表达归作者所有；第三方依赖和第三方服务分别遵循其各自授权与服务条款。