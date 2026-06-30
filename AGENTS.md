# Mineradio Project Rules

## Project Identity

Mineradio 是 Windows Electron 桌面音乐播放器，核心体验包括搜索、播放、歌单、歌词、3D 歌单架、粒子视觉预设、DIY 视觉控制台和 GitHub 自动更新。

- 当前可运行程序：`E:\桌面\播放器软件\Mineradio\Mineradio.exe`
- 当前运行版主目录：`E:\桌面\播放器软件\Mineradio`
- 当前真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 原 Windows 版 GitHub 仓库：`https://github.com/XxHuberrr/Mineradio.git`
- Apple 兼容维护仓库：`https://github.com/tao666618/Mineradio_apple.git`
- 当前源码版本：`v1.1.0`
- 统一备份区：`E:\桌面\播放器软件\工作区备份`

## Start Every New Codex Thread Here

新对话开始处理 Mineradio 前，必须先确认当前目录是：

```powershell
E:\桌面\播放器软件\Mineradio\resources\app
```

然后读这些文件：

- `AGENTS.md`
- `docs/PROJECT_MEMORY.md`
- 涉及玻璃 SVG 质感时读取 `docs/GLASS_SVG_TEXTURE.md`
- 涉及发布时读取 `CHANGELOG.md`、`RELEASE.md`、`package.json`

## Repository Layout

```text
Mineradio/resources/app/
├─ public/
│  ├─ index.html        # 主 UI、CSS、歌词、粒子、3D 歌单架、视觉控制台
│  └─ vendor/           # 本地 vendor 依赖
├─ desktop/             # Electron main/preload
├─ build/               # 打包资源和 installer 脚本
├─ docs/                # 项目记忆、设计偏好、长期约束
├─ server.js            # 本地 API、音乐源、更新检查、补丁应用
├─ dj-analyzer.js       # 节奏/音频分析
├─ package.json         # 版本号、构建命令、electron-builder 配置
└─ CHANGELOG.md         # 中文更新说明优先写在顶部
```

## Commands

```powershell
npm start
node --check server.js
npm run build:win:dir
npm run build:win
```

前端主逻辑在 `public/index.html`。这个目录是正在运行的 `Mineradio.exe` 使用的 app 目录，所以改完后重启外层 `E:\桌面\播放器软件\Mineradio\Mineradio.exe` 就能及时检查效果。没有独立 npm test，改动后至少做：

注意：运行版 `resources\app\node_modules` 可能只包含运行依赖。如果发布打包时缺少 `electron-builder`，先在 `E:\桌面\播放器软件\Mineradio\resources\app` 执行 `npm install`，再执行 `npm run build:win`。

```powershell
git diff --check
node --check server.js
```

并用实际 Electron 或浏览器检查关键交互。

## Release Workflow

发布新版本时：

1. 更新 `package.json` 和 `package-lock.json` 版本号。
2. 更新 `CHANGELOG.md` 顶部中文说明。
3. 运行语法/空白检查。
4. 执行 `npm run build:win`。
5. 上传 GitHub Release 资产：
   - `dist/Mineradio-x.y.z-Setup.exe`
   - `dist/Mineradio-x.y.z-Setup.exe.blockmap`
   - `dist/latest.yml`
   - 需要的 `Mineradio-旧版本-x.y.z.json` 轻量补丁
6. 0.9 系列补丁跳过；1.0.x 系列可按需生成跨小版本补丁。

GitHub CLI / `gh auth` / Release 上传需要代理时，优先使用可用本机代理 `127.0.0.1:10808`；不要再走旧代理 `127.0.0.1:26001`，该端口会连接拒绝。临时命令可先清空 `HTTP_PROXY`/`HTTPS_PROXY`，再设为 `http://127.0.0.1:10808`。

Apple / iPhone 兼容分支后续提交到 `https://github.com/tao666618/Mineradio_apple.git`，本地远程名使用 `apple`。不要误推到原 `XxHuberrr/Mineradio.git`；每次面向 Apple 兼容发布或阶段性提交前，同步维护 `README.md`，确保运行方式、平台范围、下载/发布入口和当前限制与代码一致。

## User Preferences

- 交流语言：中文。
- 用户偏好：少废话，直接做，修完验证，能发布就一起发布。
- UI 审美：精致、暗色、高级、流畅，拒绝廉价渐变、过度透明、错位、闪烁和卡顿。
- 视觉质量定义：质感、丝滑度、帧数稳定同时成立；性能优化不能牺牲既有质感。
- 玻璃质感：当前播放器 SVG 玻璃质感是黄金版本，详见 `docs/GLASS_SVG_TEXTURE.md`。
- 备份策略：不要删除旧资料；重复和历史内容移动到 `E:\桌面\播放器软件\工作区备份`。
- 重要：不要再改旧外层源码目录。旧的 `E:\桌面\播放器软件\Mineradio\public` / `desktop` 已经归档；现在只有 `E:\桌面\播放器软件\Mineradio\resources\app\public` / `desktop` 会影响运行版。

## Memory Protocol

当用户说“保留”“这个做得很好”“我喜欢”“记住这个”“保存一下”“以后别忘了”或同类表达时：

1. 判断用户认可的是代码、视觉效果、交互流程、发布流程还是工作习惯。
2. 将结论追加到 `docs/PROJECT_MEMORY.md` 的对应区块。
3. 如果是玻璃 SVG、粒子预设、3D 歌单架等脆弱视觉实现，同时更新对应专项文档。
4. 记录日期、涉及文件、关键参数、不要再改坏的边界。
5. 如果本轮有代码提交，把记忆文档一起提交；如果只是记忆整理，单独提交也可以。

## Guardrails

- 不要随意重写 `public/index.html` 的大块视觉系统；先定位已有函数和状态。
- 不要动电影视觉系统，除非用户明确点名。
- 不要恢复旧的侧边栏闪烁、控制台播放暂停失效、3D 歌单架强制切回星河等问题。
- 不要把搜索结果、左侧歌单、3D 歌单架的性能优化做成一次性渲染全部内容。
- 不要把用户认可的玻璃质感改成普通毛玻璃或廉价透明面板。
