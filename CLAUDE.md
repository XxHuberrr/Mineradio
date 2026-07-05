# CLAUDE.md

> 本文件为 Mineradio 项目的结构化开发文档，面向 Claude Code / Codex / 人工开发者。
> 内容覆盖项目整体架构、模块职责、关键类与函数、依赖关系及运行方式。
> 与 `AGENTS.md`（项目规则）、`docs/PROJECT_MEMORY.md`（长期记忆）互补：本文件描述「代码是什么」，那两份描述「改动时不能破什么」。

---

## 1. 项目概述

**Mineradio** 是一款 Windows Electron 桌面沉浸式音乐播放器，融合：

- 天气电台（Open-Meteo + 城市定位生成播放队列）
- 网易云音乐与 QQ 音乐双源搜索 / 登录 / 播放 / 歌单 / 红心 / 收藏
- 3D 舞台歌词（绑定封面粒子世界轴）
- 粒子视觉预设（7 套：emily 丝绸、隧道、星球、虚空、黑胶、壁纸脉动、安魂骷髅）
- 基于节奏的电影镜头视觉系统（实时 + 离线双引擎）
- 右键唤起的 3D 歌单架（PSP 风格弧形滚动 + 二级内容详情页）
- DIY 视觉控制台（预设 / 用户存档 / 滑条 / Color Lab）
- 桌面歌词浮层与壁纸模式
- GitHub Releases 自动更新（含国内镜像加速 + 快速补丁）

- **当前版本**：`1.1.1`（见 `package.json`）
- **GitHub 仓库**：`https://github.com/XxHuberrr/Mineradio.git`
- **平台**：Windows x64（NSIS 安装包）
- **授权**：GPL-3.0

---

## 2. 技术栈与依赖

### 运行时依赖（`package.json` dependencies）

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `electron` | ^42.4.1 | 桌面壳（dev 依赖，运行时由打包产物提供） |
| `gsap` | ^3.15.0 | UI 动画（列表进入、模态过渡、splash、登录引导粒子） |
| `mpg123-decoder` | ^1.0.3 | MPEG 解码（用于 dj-analyzer 节拍分析解码） |
| `NeteaseCloudMusicApi` | ^4.32.0 | 网易云音乐 API 封装 |

### 构建依赖（devDependencies）

| 依赖 | 用途 |
| --- | --- |
| `electron-builder` | 打包成 NSIS 安装包 |
| `rcedit` | after-pack 阶段注入 exe 图标与版本信息 |

### 前端 vendor 库（`public/vendor/`，本地打包，非 npm）

| 文件 | 用途 |
| --- | --- |
| `three.r128.min.js` | Three.js r128，3D 场景 / 相机 / 粒子 / ShaderMaterial / Raycaster |
| `music-tempo.min.js` | BPM 与节拍候选估算（在 Worker 中调用） |
| `gsap.min.js` | 与 npm gsap 同源，前端直接引用 |

### 外部资源

- Google Fonts：Cinzel Decorative / Inter / JetBrains Mono / Noto Sans SC / UnifrakturCook
- Open-Meteo API：天气与地理编码
- `ip-api.com`：IP 兜底定位
- GitHub Releases：更新源

---

## 3. 仓库结构

```text
Mineradio/
├─ desktop/                     # Electron 主进程
│  ├─ main.js                   # 主进程入口（窗口、IPC、全局快捷键、桌面歌词/壁纸浮层）
│  ├─ preload.js                # 主窗口 preload，暴露 desktopWindow API
│  └─ overlay-preload.js        # 桌面歌词/壁纸浮层 preload，暴露 desktopOverlay API
├─ public/                      # 前端资源
│  ├─ index.html                # 主 UI（26k+ 行单文件，HTML+CSS+JS 内联）
│  ├─ desktop-lyrics.html       # 桌面歌词浮层页面
│  ├─ wallpaper.html            # 壁纸模式页面
│  ├─ default-user-fx-archive.json  # 内置「默认测试」用户视觉存档
│  ├─ assets/
│  │  └─ skull-decimation-points.bin # 安魂骷髅预设的 3D 点云数据
│  └─ vendor/                   # 本地第三方库（three/gsap/music-tempo）
├─ build/                       # 打包资源
│  ├─ after-pack.js             # electron-builder afterPack 钩子，用 rcedit 注入图标
│  ├─ installer.nsh             # NSIS 安装器自定义脚本（中文极简黑白蓝、路径安全规则）
│  ├─ icon.ico / icon.png       # 应用图标
│  ├─ installerHeader.bmp       # 安装器顶部图
│  └─ installerSidebar.bmp      # 安装器侧边图
├─ docs/                        # 项目文档与记忆
│  ├─ PROJECT_MEMORY.md         # 长期记忆（用户认可/禁止回退的边界）
│  ├─ GLASS_SVG_TEXTURE.md      # 播放器玻璃质感黄金版本说明
│  ├─ 3D_PLAYLIST_SHELF_MEMORY.md # 3D 歌单架手感边界
│  ├─ DESKTOP_LYRICS_VISUAL.md  # 桌面歌词视觉边界
│  ├─ INSTALLER_STYLE.md        # 安装包样式规范
│  ├─ QQ_MUSIC_INTERFACE_NOTES.md # QQ 音乐接口排障记录
│  ├─ SECURITY_REBUILD_2026-06-24.md # 1.1.0 安全重建说明
│  ├─ RELEASE_NOTES_v1.1.0.md   # 1.1.0 发布说明
│  ├─ HANDOFF_NEXT_CHAT.md      # 新对话交接文件
│  └─ SUPPORT.md                # 作者支持页
├─ server.js                    # 本地 HTTP API 服务（音乐源/更新/天气/节拍缓存）
├─ dj-analyzer.js               # Podcast/DJ 节拍分析
├─ package.json                 # 版本、脚本、electron-builder 配置
├─ package-lock.json
├─ AGENTS.md                    # 项目规则（必读）
├─ CHANGELOG.md                 # 更新日志（顶部中文优先）
├─ RELEASE.md                   # 发布流程
├─ SECURITY.md / PRIVACY.md     # 安全与隐私策略
├─ README.md / NOTICE.md / LICENSE
└─ AI_HANDOFF.md                # AI 交接说明
```

> 注：`AGENTS.md` 中提到运行版真实代码位于 `E:\桌面\播放器软件\Mineradio\resources\app`；当前开发工作目录为 `e:\Project\Mineradio`。两份内容一致，以当前工作目录为准。

---

## 4. 整体架构

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron 主进程  desktop/main.js                          │
│  - 单实例锁、端口探测、创建主窗口（透明无边框）             │
│  - require('../server.js') 启动本地 HTTP 服务（127.0.0.1）  │
│  - 管理：网易云/QQ 登录窗口、桌面歌词浮层、壁纸浮层         │
│  - 全局快捷键、窗口状态广播、桌面歌词鼠标穿透/锁定          │
└──────────┬──────────────────────────────┬──────────────────┘
           │ preload.js (desktopWindow)    │ overlay-preload.js (desktopOverlay)
           ▼                              ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│  主窗口 BrowserWindow   │   │  浮层窗口                    │
│  loadURL(127.0.0.1:port)│   │  desktop-lyrics.html        │
│  → public/index.html     │   │  wallpaper.html              │
└────────────┬────────────┘   └─────────────────────────────┘
             │ fetch /api/*
             ▼
┌─────────────────────────────────────────────────────────────┐
│  本地 HTTP 服务  server.js (http.createServer, PORT=3000)  │
│  - 网易云 API（NeteaseCloudMusicApi 封装）                  │
│  - QQ 音乐 API（自实现 HTTP+Cookie 调用）                  │
│  - 封面/音频代理、歌词、评论、歌单、红心                    │
│  - Open-Meteo 天气电台、IP 定位                             │
│  - GitHub Releases 更新检查/下载/快速补丁                    │
│  - 节拍图缓存（D:\MineradioCache\beatmaps）                 │
│  - 静态文件服务（public/）                                  │
└──────────┬──────────────────────────────────┬──────────────┘
           │ require('./dj-analyzer')        │ 静态资源
           ▼                                 ▼
┌─────────────────────────────┐    ┌─────────────────────┐
│  dj-analyzer.js             │    │  浏览器加载          │
│  - Podcast/DJ 节拍离线分析  │    │  index.html          │
│  - 低通滤波 + 能量阈值      │    │  vendor/three.js     │
│  - 输出 kicks/beats/tempo   │    │  vendor/gsap.js      │
└─────────────────────────────┘    │  vendor/music-tempo  │
                                  └─────────────────────┘
```

### 启动序列（`desktop/main.js`）

1. `app.requestSingleInstanceLock()` —— 重复启动聚焦已有窗口
2. 注册 Chromium 性能开关（`autoplay-policy`、`enable-gpu-rasterization`、`disable-background-timer-throttling` 等）
3. `app.whenReady()` → `createWindow()`
4. `findOpenPort(3000)` 探测可用端口
5. 设置环境变量：`HOST=127.0.0.1`、`PORT`、`COOKIE_FILE`/`QQ_COOKIE_FILE`（指向 `app.getPath('userData')`）
6. `require('../server.js')` —— server.js 在 require 时即调用 `http.createServer(...).listen(PORT, HOST)`，返回 server 实例
7. `waitForServer(localServer)` 等待 listening
8. 创建透明无边框 `BrowserWindow`（preload + contextIsolation + 无 nodeIntegration）
9. `mainWindow.loadURL('http://127.0.0.1:${port}')` —— 加载 `public/index.html`
10. 绑定窗口状态事件，广播 `desktop-window-state` 给前端

> 主进程不直接读取前端逻辑，所有 UI 与后端交互通过 `fetch('/api/*')` 经本地 HTTP 完成；需要原生能力时通过 preload 暴露的 `desktopWindow` 走 IPC。

---

## 5. Electron 主进程 `desktop/main.js`

### 核心职责

- **单实例与窗口生命周期**：单实例锁、`createWindow()`、窗口状态广播
- **窗口尺寸策略**：16:9 宽高比，最小 960×540，`WINDOWED_SCALE = 3/4`，全屏退出恢复窗口态
- **网易云登录窗口**：`persist:mineradio-netease-login` partition，加载 `music.163.com/#/login`，过滤 cookie 白名单（`MUSIC_U`/`__csrf` 等）
- **QQ 音乐登录窗口**：`persist:mineradio-qqmusic-login` partition，加载 `y.qq.com/n/ryqq/profile`，过滤 cookie 白名单（`qm_keyst`/`qqmusic_key`/`p_skey` 等）
- **桌面歌词浮层**：独立 `BrowserWindow`，置顶 + 点击穿透 + 中键锁定（`GetAsyncKeyState(4)` 轮询），可拖动
- **壁纸浮层**：独立窗口，关联 WorkerW 桌面壁纸层（实验态，默认关闭）
- **全局快捷键**：`configureMineradioGlobalHotkeys(bindings)` 动态注册/注销
- **更新安装器**：`mineradio-open-update-installer` 通过 `shell.openPath` 打开下载好的安装包并重启

### 关键函数

| 函数 | 行号 | 职责 |
| --- | --- | --- |
| `createWindow()` | 1320 | 主窗口创建主流程（端口探测→启动服务→loadURL） |
| `findOpenPort(startPort)` | 93 | 递增探测可用端口 |
| `openNeteaseMusicLoginWindow(owner)` | 400 | 网易云扫码登录窗口 |
| `openQQMusicLoginWindow(owner)` | 501 | QQ 登录窗口 |
| `ensureDesktopShortcut()` | 281 | 首次启动补创建桌面快捷方式 |
| `getWindowState(win)` | 230 | 汇总窗口状态（min/max/fullscreen/visible/focused） |
| `applyWindowedBounds(win)` | 662 | 应用窗口态尺寸约束 |
| `constrainDesktopLyricsBounds(bounds)` | 744 | 桌面歌词边界约束 |
| `configureMineradioGlobalHotkeys(bindings)` | 143 | 全局快捷键注册 |

### IPC 通道（`ipcMain.handle`）

**窗口控制**：`desktop-window-minimize` / `toggle-maximize` / `toggle-fullscreen` / `exit-fullscreen-windowed` / `get-state` / `close`
**文件与快捷键**：`mineradio-export-json-file` / `import-json-file` / `hotkeys-configure-global`
**登录**：`netease-music-open-login` / `clear-login` / `qq-music-open-login` / `clear-login`
**更新**：`mineradio-open-update-installer` / `restart-app`
**桌面歌词**：`mineradio-desktop-lyrics-set-enabled` / `update` / `set-dragging` / `set-pointer-capture` / `set-hot-bounds` / `set-lock-state` / `move-by`
**壁纸**：`mineradio-wallpaper-set-enabled` / `update`

---

## 6. Preload 桥

### `desktop/preload.js`

通过 `contextBridge.exposeInMainWorld('desktopWindow', {...})` 向主窗口暴露：

- 窗口控制：`minimize` / `toggleMaximize` / `toggleFullscreen` / `exitFullscreenWindowed` / `close` / `getState`
- 登录：`openNeteaseMusicLogin` / `clearNeteaseMusicLogin` / `openQQMusicLogin` / `clearQQMusicLogin`
- 更新：`openUpdateInstaller` / `restartApp`
- 快捷键：`configureGlobalHotkeys` / `onGlobalHotkey`
- 文件：`exportJsonFile` / `importJsonFile`
- 桌面歌词：`setDesktopLyricsEnabled` / `updateDesktopLyrics` / `onDesktopLyricsLockState` / `onDesktopLyricsEnabledState`
- 壁纸：`setWallpaperMode` / `updateWallpaperMode`
- 状态监听：`onStateChange`（监听 `desktop-window-state`）

### `desktop/overlay-preload.js`

通过 `exposeInMainWorld('desktopOverlay', {...})` 向浮层窗口暴露：

- `onLyricsState` / `onWallpaperState`：状态广播监听
- `setLyricsDrag` / `setLyricsPointerCapture` / `setLyricsHotBounds` / `setLyricsLockState` / `moveLyricsBy` / `closeLyrics`

> 安全配置：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`、`backgroundThrottling: false`。

---

## 7. 本地 API 服务 `server.js`

### 启动与配置

- 监听 `HOST:PORT`（默认 `0.0.0.0:3000`，Electron 内由主进程设为 `127.0.0.1:<动态端口>`）
- Cookie 持久化：`.cookie`（网易云）、`.qq-cookie`（QQ），路径由 `COOKIE_FILE`/`QQ_COOKIE_FILE` 环境变量决定（运行版指向 `userData`）
- 节拍缓存目录：`D:\MineradioCache\beatmaps`（`MINERADIO_BEAT_CACHE_DIR`）
- 更新工作目录：`updates/downloads`、`updates/backups/patches`
- 启动时合并系统 CA 证书（`applySystemCertificateAuthorities`）

### API 路由分组

**版本与更新**（行号见 server.js）
- `GET /api/app/version` —— 当前版本与更新配置
- `GET /api/update/latest` —— 检查 GitHub Releases latest
- `POST /api/update/download` —— 启动完整安装包下载任务
- `GET /api/update/download/status` —— 下载进度
- `POST /api/update/patch` —— 启动快速补丁任务
- `GET /api/update/patch/status` —— 补丁状态

**搜索与播放**
- `GET /api/search` —— 网易云搜索
- `GET /api/qq/search` —— QQ 搜索
- `GET /api/song/url` —— 网易云歌曲 URL
- `GET /api/qq/song/url` —— QQ 歌曲 URL
- `GET /api/audio` —— 音频流代理
- `GET /api/cover` —— 封面代理

**歌单与红心**
- `GET /api/user/playlists` / `/api/qq/user/playlists`
- `GET /api/playlist/tracks` / `/api/qq/playlist/tracks`
- `GET /api/song/like` / `/api/song/like/check`
- `POST /api/playlist/create` / `/api/playlist/add-song`

**歌词与评论**
- `GET /api/lyric` / `/api/qq/lyric`
- `GET /api/song/comments` / `/api/qq/song/comments`

**歌手**
- `GET /api/artist/detail` / `/api/qq/artist/detail`

**登录**
- `GET /api/login/qr/key` / `create` / `check` —— 网易云扫码
- `POST /api/login/cookie` —— Cookie 登录
- `GET /api/login/status` / `logout`
- `GET /api/qq/login/status` / `cookie` / `logout`

**Podcast**
- `GET /api/podcast/search` / `hot` / `detail` / `programs` / `my` / `my/items`
- `POST /api/podcast/dj-beatmap` —— DJ 节拍分析（调用 `dj-analyzer`）

**Home 与天气**
- `GET /api/discover/home` —— 首页推荐
- `GET /api/weather/radio` —— 天气电台歌单
- `GET /api/weather/ip-location` —— IP 定位兜底

**节拍缓存**
- `GET /api/beatmap/cache/status`
- `POST /api/beatmap/cache` —— 持久化节拍图

### 关键函数（节选）

| 函数 | 职责 |
| --- | --- |
| `handleSearch(keywords, limit)` | 网易云搜索封装 |
| `handleDiscoverHome()` | Home 推荐聚合 |
| `resolveOpenMeteoLocation(query)` | 地理编码 |
| `fetchOpenMeteoWeather(params)` | 拉取天气 |
| `buildWeatherMood(weather, date)` | 由天气生成 mood 与种子词 |
| `weatherRadioSeedQueries(mood)` | mood → 搜索种子词 |
| `scoreWeatherSong(song, mood)` | 天气电台歌曲打分 |
| `classifyNeteasePlaybackRestriction` / `classifyQQPlaybackRestriction` | 播放限制归类（`login_required` / `vip_only` 等） |
| `fetchLatestUpdateInfo()` | 更新信息（GitHub manifest 或 latest.yml） |
| `downloadUpdateAssetWithMirrors(job)` | 镜像列表逐个尝试下载安装包 |
| `downloadAndApplyPatchWithMirrors(job)` | 下载并应用快速补丁 |
| `verifyUpdateBuffer(buffer, job)` | SHA-512 校验 |
| `buildBeatMapFromLowEnergy(...)` | （来自 dj-analyzer）低频能量 → 节拍图 |

### 更新机制要点

- 支持三种更新源：GitHub Releases manifest、`latest.yml`、本地 `MINERADIO_UPDATE_MANIFEST`
- 国内镜像：`gh.llkk.cc` / `ghfast.top` / `gh-proxy.com`（`mineradio.update.mirrors`）
- 快速补丁：限制在 `public/desktop/build` 目录与 `server.js`/`dj-analyzer.js`/`package.json`，单包 ≤12MB
- 补丁命名：`Mineradio-旧版本→新版本.patch.json`
- 从 `v1.0.10` 起只为最近 4 个旧版本生成补丁

---

## 8. 节拍分析 `dj-analyzer.js`

### 导出（`module.exports`）

```js
{
  analyzePodcastDjStream,     // 完整流式节拍分析
  analyzePodcastDjIntro,      // 仅前奏分析
  buildBeatMapFromLowEnergy,  // 从低频/打击能量构建节拍图
}
```

### 核心算法

- **DSP 基础**：`makeBiquad(type, freq, q, sr)` + `runBiquad(st, x)` 实现双二阶滤波（lowpass/highpass）
- **能量分析**：`percentile` / `median` 计算自适应阈值
- `analyzePodcastDjRangeSamples` / `analyzePodcastDjStreamFull` —— 解码音频 + 分帧低通 + 短时能量 + onset 检测
- 输出结构：`{kicks, beats, pulseBeats, cameraBeats, duration, visualBeatCount, tempoSource, analyzedAt}`
- 服务端通过 `/api/podcast/dj-beatmap` 调用，结果缓存到 `D:\MineradioCache\beatmaps`

### 前端离线节拍（在 `public/index.html` 内）

- `analyzeAudioBeats(audioUrl, ...)` —— `OfflineAudioContext` + 低通滤波 + 自适应阈值
- `analyzeMusicTempoInWorker` —— Worker 内调用 `music-tempo` 库估算 BPM/相位
- `scheduleBeatAnalysis` / `scheduleQueueBeatPrefetch` —— 队列预解析

---

## 9. 前端主文件 `public/index.html`

> **单文件 26,879 行**，是项目最庞大、最敏感的文件。改动必须用精确搜索定位，禁止大块重写。

### 文件分区

| 行号范围 | 内容 |
| --- | --- |
| 1-18 | `<head>`：meta、Google Fonts、vendor 库引入、DIY 预加载 |
| 19-1843 | `<style>`（约 1825 行 CSS） |
| 1845-2669 | `<body>` DOM 标记区（约 823 行 UI 容器） |
| 2671-26877 | 主 `<script>`（约 24,200 行业务逻辑） |

### 主要 UI 区域（DOM 容器）

| 容器 | 角色 |
| --- | --- |
| `#desktop-window-shell` / `#desktop-titlebar` | 桌面壳与自绘标题栏 |
| `#splash` / `#splash-canvas` | 启动页（玻璃质感 + wordmark 动画） |
| `#search-area` / `#search-input` / `#search-mode-tabs` / `#search-results` | 顶部搜索（All/NE/QQ/Podcast） |
| `#empty-home` / `.home-grid` / `.home-rail` | 空场 Home（卡片网格 + 歌手轨道） |
| `#fx-panel` / `#preset-grid` / `#user-archive-grid` | 视觉控制台（预设 + 用户存档） |
| `#color-lab-pop` / `#cover-color-pop` | Color Lab 与封面取色弹层 |
| `#playlist-panel` / `#queue-pane` / `#pl-pane` / `#podcast-pane` | 歌单/队列/播客面板 |
| `#stage-lyrics` | 3D 舞台歌词容器 |
| `#bottom-bar` / `#progress-bar` / `#controls` / `#quality-control` / `#volume-control` | 播放控制底栏 |
| `#login-modal` / `#user-modal` / `#cover-crop-modal` / `#collect-modal` / `#local-beat-modal` / `#custom-lyric-modal` / `#track-detail-modal` / `#update-modal` | 各类模态框 |
| `#visual-guide` / `#toast` / `#source-fallback-notice` | 引导与提示 |
| `#canvas-container` / `#album-bg` / `#custom-bg` | Three.js 主舞台与背景层 |

### JS 子系统（按出现顺序）

| 子系统 | 关键函数/对象 | 职责 |
| --- | --- | --- |
| **全局状态** | `audio`/`audioCtx`/`analyser`/`gainNode`、`playlist`/`playQueue`/`currentIdx`、`loginStatus`/`qqLoginStatus`、`userPlaylists` | 集中声明（行 2674-2776） |
| **视觉预设** | `fxDefaults`(3196)、`PACKAGED_DEFAULT_FX_SNAPSHOT`(3272)、`fx`(3381)、`playbackVisualPreset`(3379)、`presetTransition` | 视觉配置核心 |
| **Three.js 场景** | `scene`/`camera`/`renderer`(3719+)、`orbit`(3791)、`RENDER_DPR_CAP=1.35` | 渲染基础 |
| **自由镜头** | `resetFreeCameraToDefault`/`toggleFreeCamera`/`updateFreeCamera` | 用户可控相机 |
| **电影镜头** | `updateCinema(dt)`(5209)、`cinemaDynamics`、`cinemaTrackProfile`、`rtBeat`(3101) | 节拍驱动镜头 |
| **节拍相机** | `processRealtimeBeatEngine`(4391)、`scheduleBeatCamera`(4615)、`updateBeatCamera`(4893) | 实时+离线双引擎 |
| **主粒子系统** | `uniforms`(5808)、GLSL 6 个 preset 分支(5983-6205)、`particles`(6397) | 7 套预设核心 |
| **浮空粒子层** | `createFloatLayer()`(6409)、`FLOAT_COUNT=1300` | 漂浮粒子 |
| **骷髅粒子层** | `SKULL_PRESET_INDEX=6`、`loadSkullParticleAsset()`(6622)、`createSkullParticleLayer` | 安魂预设，加载 `.bin` 点云 |
| **封面背面粒子** | `backCoverGroup`、`BACK_COVER_COUNT=3000` | 背面镜像粒子 |
| **舞台歌词 v9** | `stageLyrics`(7204)、`buildLyricMesh`、`updateStageLyrics3D`、`updateLyricPaletteFromCover` | 3D 歌词（绑定粒子世界轴） |
| **涟漪** | `triggerRipple`/`updateRipples`、`RIPPLE_MAX=12` | 九宫格 bass 触发 |
| **封面深度** | `buildEdgeAndDepth`(9460)、`estimateAIDepth`、`coverDepthCacheId` | CPU/AI 生成深度纹理 |
| **节拍预解析** | `analyzeAudioBeats`(10389)、`analyzeMusicTempoInWorker`、`scheduleQueueBeatPrefetch` | 离线节拍 |
| **Podcast DJ** | `analyzePodcastDjBeats`、`applyPodcastDjProfileFromMap` | 调用 server `/api/podcast/dj-beatmap` |
| **本地节拍缓存** | `readLocalBeatMapCache`/`saveLocalBeatMapCache`、`openLocalBeatModal` | 本地存档与模态 |
| **3D 歌单架** | `shelfManager`(12762) ← `makeShelfManager()`(12964)、`placeCard`(13334)、`step`/`applySelectedIndex`/`pickCardAtScreen` | PSP 弧形滚动 |
| **二级内容框** | `makeContentListManager()`(13924) | 歌单内歌曲行滚动 |
| **播放质量** | `setPlaybackQuality`、`bindQualityControl` | 档位切换 |
| **自定义封面/歌词** | `getCustomCoverForSong`、`getCustomLyricEntry`、`openCustomLyricModal` | 本地映射 |
| **听歌统计** | `beginListenSession`/`finalizeListenSession`/`topListenArtist` | Home 画像 |
| **Home 发现** | `loadHomeDiscover`、`renderHomeMosaic`、`renderHomeTiles` | 首页卡片 |
| **天气电台** | `loadHomeWeatherRadio`、`startWeatherRadio`、`locateWeatherRadio`、`changeWeatherCity` | 天气+电台 |
| **空场 Home / 壁纸** | `shouldShowEmptyHome`、`switchPlaybackVisualToEmily`、`applyStartupStarfieldPreset` | 启动态切换 |
| **歌曲/歌手详情** | `openTrackDetailModal`、`openArtistDetailForSong` | 模态 |
| **红心/收藏** | `toggleLikeSong`、`openCollectModal`、`createPlaylistFromCollect` | 双源 |
| **搜索** | `fetchMusicSearchResults`、`doSearch`、`mergeSongSearchResults`、`scoreSongSearchResult` | 多源合并 |
| **音频上下文** | `initAudio()`(17728)、`playShelfSelectTick`(17763)、`fadeOutAndPauseAudio`、`applyVolumeToAudio` | 频谱+淡入淡出 |
| **播放控制** | `playQueueAt`/`playAudio`/`togglePlay`、`tryAutoPlaybackFallback`、`handlePlaybackUnavailable` | 自动换源 |
| **歌词解析** | `fetchLyric`、`parseLyricText`、`parseYrcText`、`renderLyrics`、`updateLyricsHighlight` | LRC/YRC |
| **队列/面板** | `renderQueuePanel`、`renderUserPlaylistsList`、`loadPlaylistIntoQueueById` | 列表渲染 |
| **视觉控制台** | `presetMeta`、`captureFxArchiveSnapshot`/`applyFxArchiveSnapshot`、`renderUserFxArchives` | 用户存档 |
| **颜色控件** | `applyUiAccentColor`、`setVisualTintCustom`、`openCoverColorPicker`、`updateLyricPaletteFromCover` | 主题色 |
| **更新预览** | `initUpdatePreview`、`openUpdatePanel`、`formatUpdateBytes` | 更新弹窗 |
| **登录** | `showLoginModal`、`refreshLoginStatus`、`refreshQQLoginStatus`、`runLoginGuideParticles` | 双源 |
| **空场引导** | `initIdleGuideCanvas`、`draw(now)` | 待机 canvas |
| **toast/引导** | `showToast`、`bindVisualGuideSurfaceClick`、`loadScriptOnce` | 通用 |
| **手势 v8** | `startGestureControl`、`tickGestureRotation` | 摄像头手势（头部追踪已下线） |
| **UI 半隐藏** | `setFocusZone`、进入/离开阈值（搜索 y<80 / 控制台 x>w-48 / 歌单 x<48） | 三面板统一隐藏 |
| **splash 控制** | `requestSplashEnter`、`applyState`、`unlock` | 启动页状态机 |
| **主循环** | `animate()`(26876) | 每帧采样频谱→更新 uniforms→推进子系统→render |

### 关键全局对象速查

| 对象 | 行号 | 含义 |
| --- | --- | --- |
| `fxDefaults` | 3196 | 视觉默认值（preset/intensity/coverResolution/lyric*/shelf*/performance* 等） |
| `PACKAGED_DEFAULT_FX_SNAPSHOT` | 3272 | 工厂冻结快照（与 `default-user-fx-archive.json` 同步） |
| `fx` | 3381 | 实际生效的视觉配置（`fxDefaults` + 本地布局 merge） |
| `playbackVisualPreset` | 3379 | 当前存档绑定的 preset 编号 |
| `orbit` | 3791 | 相机轨道（userTheta/Phi/Radius + cineOffset） |
| `uniforms` | 5808 | 主粒子 shader 输入（uBass/uMid/uTreble/uBeat/uPreset/uCoverTex/uDepthTex/uRipplePos[] 等） |
| `stageLyrics` | 7204 | 3D 歌词管理对象 |
| `shelfManager` | 12762 | 3D 歌单架单例 |
| `cinemaDynamics` | 3088 | `{avg, lowAvg, peak, scale}` |
| `rtBeat` | 3101 | 实时节拍引擎状态 |
| `djMode` | 3117 | DJ 模式状态机 |
| `renderPerfState` | 26568 | 主循环性能采样（暴露为 `window.__mineradioPerf`） |

### 7 套视觉预设

| 编号 | 名称 | GLSL 分支 | 特征 |
| --- | --- | --- | --- |
| 0 | emily / SILK 丝绸 | xy 平面 + z 涟漪 | 默认播放态 |
| 1 | 隧道 | SILK 之后 | 隧道感 |
| 2 | ORBIT 星球 | 保留自转 | 星球轨道 |
| 3 | VOID 虚空 | 粒子隐藏 | 极简虚空 |
| 4 | VINYL 黑胶 | 黑胶旋转 | 唱片质感 |
| 5 | WALLPAPER 壁纸脉动 | 极光带 + 深度火花 | 壁纸模式 |
| 6 | SKULL 安魂骷髅 | 加载 `.bin` 点云 | 低机位仰视，下颌标记点 |

### 本地存储 Key（节选）

`CUSTOM_COVER_STORE_KEY` / `CUSTOM_LYRIC_STORE_KEY` / `CUSTOM_LYRIC_PREF_STORE_KEY` / `LYRIC_LAYOUT_STORE_KEY` / `VISUAL_PRESET_SCHEMA='skull-preset-v2'` / `PLAYBACK_QUALITY_STORE_KEY` / `DIY_MODE_STORE_KEY` / `PLAYLIST_PANEL_PIN_STORE_KEY` / `FREE_CAMERA_STORE_KEY` / `HOTKEY_SETTINGS_STORE_KEY` / `LOCAL_BEATMAP_STORE_KEY` / `HOME_LISTEN_STATS_KEY` / `HOME_WEATHER_CITY_KEY`

---

## 10. 子页面

### `public/desktop-lyrics.html`

桌面歌词浮层。锁定态由主进程保持鼠标穿透，中键锁定/解锁通过 `GetAsyncKeyState(4)` + 歌词热区处理。视觉边界见 `docs/DESKTOP_LYRICS_VISUAL.md`（白底可读、`drop-shadow` 描边，禁用 `mix-blend-mode`）。

### `public/wallpaper.html`

壁纸模式页面（实验态，默认关闭）。方案见 `docs/WALLPAPER_ENGINE_DESKTOP_FUSION_PLAN.md`（如存在）或 `docs/PROJECT_MEMORY.md` 中的壁纸模式方案记录。

### `public/default-user-fx-archive.json`

内置「默认测试」用户视觉存档，首次启动自动种入。`fxDefaults` 与 `PACKAGED_DEFAULT_FX_SNAPSHOT` 与此快照同步。

---

## 11. 构建与发布

### 构建命令

```bash
npm install                 # 安装依赖（运行版 node_modules 可能只含运行依赖，发布前缺 electron-builder 时先执行）
npm start                   # 开发运行（electron .）
npm run build:win:dir       # 仅打包成目录（不生成安装器，快速验证）
npm run build:win           # 打包成 NSIS 安装包（dist/Mineradio-x.y.z-Setup.exe）
```

### electron-builder 配置要点（`package.json` build 字段）

- `appId: com.mineradio.desktop`
- `main: desktop/main.js`
- `asar: false`（不打包成 asar，便于补丁更新）
- `target: nsis x64`
- `afterPack: build/after-pack.js` —— 用 rcedit 注入图标与 `FileDescription`/`ProductName`
- `files`: `desktop/**`、`public/**`、`build/**`、`server.js`、`dj-analyzer.js`、`package.json`，排除 `index.*.html` 仅保留 `index.html`
- `nsis`: `oneClick: false`、`allowToChangeInstallationDirectory: false`、`include: build/installer.nsh`
- `publish: github`（owner: XxHuberrr, repo: Mineradio）

### NSIS 安装器（`build/installer.nsh`）

- 中文极简黑白蓝格式（白底 `#FFFFFF`、主文字 `#111217`、蓝 `#3257F7`）
- 默认安装路径：优先 `D:\Mineradio`，D 不存在依次尝试 E-Z，最后兜底 `C:\Mineradio`
- 强制独立 `Mineradio` 子目录；阻止非空且非 Mineradio-owned 目录
- 卸载器只删已知顶层文件，不递归删除安装根目录（P0 安全规则）
- 详见 `docs/INSTALLER_STYLE.md`

### 发布流程（`RELEASE.md`）

1. 更新 `package.json` / `package-lock.json` 版本号
2. 更新 `CHANGELOG.md` 顶部中文说明
3. `git diff --check` + `node --check server.js`
4. `npm run build:win`
5. 上传 GitHub Release 资产：`Mineradio-x.y.z-Setup.exe` + `.blockmap` + `latest.yml`（如需走旧版软件内更新）+ 补丁 JSON
6. 计算并记录 SHA256

### 更新机制

- 客户端请求 `/api/update/latest` → server 拉 GitHub Releases latest
- 支持完整安装包下载（多镜像逐个尝试）与快速补丁（仅 `public/desktop/build/server.js/dj-analyzer.js/package.json`）
- 下载完成后校验 SHA-512，不再自动打开安装包，需用户手动确认
- 代理：GitHub CLI / `gh auth` 使用 `127.0.0.1:10808`（旧代理 `26001` 已弃用）

---

## 12. 开发与运行

### 开发环境准备

```bash
cd e:\Project\Mineradio
npm install
npm start
```

### 验证改动

```bash
git diff --check
node --check server.js
```

前端主逻辑在 `public/index.html`，改完后重启 `Mineradio.exe` 即可检查效果。无独立 `npm test`，需用实际 Electron 或浏览器验证关键交互。

### 调试

- 主循环性能：浏览器控制台 `window.__mineradioPerf`（fps/frames/skipped/longFrames）
- 视觉配置：`fx`（实时生效配置）、`fxDefaults`（默认值）、`playbackVisualPreset`（当前存档预设）
- 更新链路本地测试：设 `MINERADIO_UPDATE_MANIFEST` 指向本地 manifest JSON 或 HTTP 地址

### 关键环境变量

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `PORT` | 3000 | server 监听端口 |
| `HOST` | 0.0.0.0 | server 监听地址（运行版设 127.0.0.1） |
| `COOKIE_FILE` | ./.cookie | 网易云 cookie 路径 |
| `QQ_COOKIE_FILE` | ./.qq-cookie | QQ cookie 路径 |
| `MINERADIO_UPDATE_DIR` | ./updates | 更新工作目录 |
| `MINERADIO_BEAT_CACHE_DIR` | D:\MineradioCache\beatmaps | 节拍缓存 |
| `MINERADIO_UPDATE_MANIFEST` | - | 本地更新 manifest（测试用） |
| `MINERADIO_VERSION` | package.json version | 版本覆盖（测试用） |

---

## 13. 关键约束与边界（开发必读）

> 完整记忆见 `docs/PROJECT_MEMORY.md`，此处仅列高频踩坑点。

### 通用

- **不要随意重写 `public/index.html` 大块视觉系统**，先用 Grep 精确定位已有函数与状态
- **不要动电影视觉系统**，除非用户明确点名
- **不要恢复**：侧边栏闪烁、控制台播放暂停失效、3D 歌单架强制切回星河等旧问题
- **性能优化不能牺牲既有质感**：质感、丝滑度、帧数稳定同时成立
- 不要把搜索结果、左侧歌单、3D 歌单架做成一次性全量渲染（需虚拟化/分批）
- 不要把用户认可的玻璃质感改成普通毛玻璃或廉价透明面板（见 `docs/GLASS_SVG_TEXTURE.md`）

### 视觉

- 播放器 SVG 玻璃质感是黄金版本：`#mineradio-control-glass-filter` / `generateControlGlassDisplacementMap()` / `--saved-panel-glass-*` / `--saved-button-glass-*`
- 歌词必须绑定封面粒子世界轴：`particles.getWorldPosition()` / `getWorldQuaternion()`，不要恢复相机轴+欧拉角混合算法
- 骷髅预设点云要贴合模型、分布均匀，不要散乱星尘式；双击回正角度 `SKULL_MODEL_BASE_ROTATION_X = -0.26`、`SKULL_MODEL_SCALE = 2.34`，保持低机位仰视
- 3D 歌单架静态默认侧向角度 `-15`，动态默认 `0`；详情页要更大更上，中心高亮行与歌词同水平

### 播放

- 播放暂停按钮曾多次失效，修复后必须实机验证控制台按钮
- QQ 音乐要区分网页账号态 `p_skey` 与播放票据 `qm_keyst`/`qqmusic_key`，缺票据时 `104003` 归类为 `login_required`（见 `docs/QQ_MUSIC_INTERFACE_NOTES.md`）
- 不要让网易云登录态成为 QQ 或其它 Provider 播放的前置条件

### 性能

- 最小化/隐藏窗口才进入深度低占用；可见但失焦、副屏显示保持正常帧率
- 直播后台保持（`liveBackgroundKeep`）开启后不能进入低占用暂停
- 高级性能设置（`performanceBackground`/`performanceQuality`）必须进本地存档与用户存档

### 安装器

- 默认 `D:\Mineradio`，D 不存在再 E-Z，最后才 `C:\Mineradio`
- 绝对不要恢复 `RMDir /r $INSTDIR` 递归删除安装根目录
- 安装器/卸载器安全修复必须走完整 setup，不能用快速补丁作为唯一交付路径

### 发布

- `v1.0.10` 及更早旧安装包不再可信，需隔离标注
- 0.9 系列不再做安装补丁；1.0.x 系列可按需生成跨小版本补丁
- 不要把 `.cookie`/`.qq-cookie`/`updates/`/`node_modules/`/`dist/` 提交到 Git

---

## 14. 文档索引

| 文档 | 用途 |
| --- | --- |
| `AGENTS.md` | 项目规则、命令、发布流程、用户偏好、护栏 |
| `docs/PROJECT_MEMORY.md` | 长期记忆（用户认可/禁止回退的边界，按日期追加） |
| `docs/GLASS_SVG_TEXTURE.md` | 玻璃质感黄金版本参数 |
| `docs/3D_PLAYLIST_SHELF_MEMORY.md` | 3D 歌单架手感与控制台边界 |
| `docs/DESKTOP_LYRICS_VISUAL.md` | 桌面歌词白底可读视觉边界 |
| `docs/INSTALLER_STYLE.md` | 安装包中文极简样式规范 |
| `docs/QQ_MUSIC_INTERFACE_NOTES.md` | QQ 音乐接口排障记录 |
| `docs/SECURITY_REBUILD_2026-06-24.md` | 1.1.0 安全重建说明 |
| `docs/RELEASE_NOTES_v1.1.0.md` | 1.1.0 发布说明 |
| `docs/HANDOFF_NEXT_CHAT.md` | 新对话交接文件 |
| `CHANGELOG.md` | 更新日志（顶部中文优先） |
| `RELEASE.md` | 发布流程 |
| `SECURITY.md` / `PRIVACY.md` | 安全与隐私策略 |

### 记忆协议（来自 `AGENTS.md`）

当用户说「保留」「这个做得很好」「我喜欢」「记住」「保存一下」时：
1. 判断认可的是代码 / 视觉 / 交互 / 发布流程 / 工作习惯
2. 追加到 `docs/PROJECT_MEMORY.md` 对应区块
3. 脆弱视觉实现同时更新对应专项文档
4. 记录日期、涉及文件、关键参数、不要再改坏的边界
5. 有代码提交时把记忆文档一起提交

---

## 15. 快速参考

### 常用命令

```bash
npm start                # 开发运行
node --check server.js   # 语法检查
git diff --check         # 空白检查
npm run build:win        # 生成 NSIS 安装包
npm run build:win:dir    # 仅打包目录
```

### 关键文件入口

- **Electron 入口**：`desktop/main.js`（`package.json` main 字段）
- **HTTP 服务**：`server.js`（require 时即监听）
- **前端入口**：`public/index.html`（由 server 静态服务，Electron loadURL 加载）
- **视觉配置**：`public/index.html` 内 `fxDefaults` / `fx` / `PACKAGED_DEFAULT_FX_SNAPSHOT`
- **默认存档**：`public/default-user-fx-archive.json`

### 关键端点速查

```
GET  /api/search                  # 搜索（网易云）
GET  /api/qq/search               # 搜索（QQ）
GET  /api/song/url                 # 播放 URL
GET  /api/cover                   # 封面代理
GET  /api/audio                   # 音频代理
GET  /api/lyric                   # 歌词
GET  /api/discover/home           # Home 推荐
GET  /api/weather/radio           # 天气电台
GET  /api/update/latest           # 更新检查
POST /api/podcast/dj-beatmap      # DJ 节拍分析
POST /api/beatmap/cache           # 节拍图缓存
```

---

*本文档基于 v1.1.1 源码生成。若架构发生重大变化，需同步更新本文件。*
