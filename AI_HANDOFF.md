# Mineradio AI Handoff

这个文件是给后续接管本工作区的 AI 看的。每次完成一个任务后，都要更新本文件的「工作日志」和「未完成事项」，让下一位接手者能快速知道用户偏好、当前状态和最近做过什么。

## 当前权威入口（2026-06-24）

- 当前真实代码/Git 仓库仍是 `E:\桌面\播放器软件\Mineradio\resources\app`。
- 当前版本是 `v1.1.0` 纯净安装发布线；本轮已从当前可信源码重新生成并发布 `dist/Mineradio-1.1.0-Setup.exe`。
- GitHub 仓库已公开：`https://github.com/XxHuberrr/Mineradio`
- `v1.1.0` Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.1.0`
- GitHub `/releases/latest` 仍返回 `v1.0.10`，这是刻意设置，避免旧版软件内更新到 1.1.0。
- `v1.0.10` 及更早旧安装包不再信任，需要在 GitHub Release/README/SECURITY 中标记隔离。
- `v1.1.0` 不提供从 `v1.0.10` 的软件内本地更新，不上传 `latest.yml`，不生成 `v1.0.10 -> v1.1.0` 快速补丁。
- 新对话优先读 `AGENTS.md`、`docs/PROJECT_MEMORY.md`、`docs/HANDOFF_NEXT_CHAT.md`；涉及安全重建或发布时再读 `docs/SECURITY_REBUILD_2026-06-24.md`。本文件下面包含较早历史记录，不能覆盖上述文件的当前结论。

## 用户偏好

- 默认用中文沟通，语气直接、清楚、偏实干。
- 用户希望你主动完成任务，不要只给方案。能本地验证就本地验证。
- 除非用户明确要求“上传 GitHub / 推送 / push / 发布到 Release”，否则不要直接上传或推送到 GitHub；本地提交也要在最终说明里讲清楚。
- 用户很在意视觉质感，尤其讨厌“默认白框”“太素”“没设计感”。Mineradio 视觉方向偏黑色、玻璃、舞台、音乐可视化。
- 做网页、软件界面、安装器时，要优先考虑第一次打开的新用户是否知道软件是干什么的。
- 发布软件时，不能只上传源码。GitHub Release 通常要包含可运行安装包 exe；但 `v1.1.0` 安全发布例外，不上传 `latest.yml`，避免旧版软件内更新直接拉取。
- 安装器默认安装目录优先使用 `D:\Mineradio`，并创建桌面快捷方式。
- 更新逻辑优先轻量快速补丁；完整安装包作为兜底。
- 搜索结果要尽量优先原唱/官方版本，不希望翻唱排在原唱前面。
- 感谢名单曾确认：`emily、小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦`。

## 工作区地图

- `server.js`：本地 API、网易云代理、搜索、首页数据、更新检查、完整安装包下载、快速补丁应用。
- `public/index.html`：主界面和大部分前端逻辑，体量很大，修改前先用 `rg` 定位。
- `desktop/`：Electron 主进程、preload、窗口和系统集成。
- `build/`：应用图标、NSIS 安装器脚本、安装器视觉资源、after-pack 资源注入。
- `dist/`：本地构建产物，已被 git 忽略。根部只放当前发布资产。
- `updates/`：软件运行时更新区，已被 git 忽略。下载和补丁备份分开。
- `backups/`：人工归档/历史实验备份，已被 git 忽略。不要和 `updates/` 混用。
- `node_modules/`：依赖目录，通常不要手动整理。

## 本地分区约定

### dist 发布区

`dist` 根部只保留当前可发布资产。`v1.1.0` 安全发布只上传安装包、可选 blockmap 和 SHA256，不上传 `latest.yml`：

- `Mineradio-<version>-Setup.exe`
- `Mineradio-<version>-Setup.exe.blockmap`
- `Mineradio-<from>-to-<to>.patch.json`

其它内容放到：

- `dist/_archive/previous-releases/`：旧安装包和旧 blockmap。
- `dist/_archive/inconsistent-builds/`：和 `latest.yml` 不匹配的构建，保留但不用于发布。
- `dist/_previews/`：截图、安装器预览、图标预览。
- `dist/_logs/`：builder debug 等构建日志。

### updates 更新区

- `updates/downloads/`：运行时下载的完整安装包或更新资产。
- `updates/backups/patches/`：快速补丁覆盖文件前的备份。
- `updates/tmp/`：临时文件。

对应代码常量在 `server.js`：

- `UPDATE_WORK_DIR`
- `UPDATE_DOWNLOAD_DIR`
- `UPDATE_PATCH_BACKUP_DIR`

### backups 备份区

- `backups/public-html/`：历史前端实验 HTML。
- `backups/tool-cache/`：本地工具缓存或历史缓存文件。

这个目录是人工归档区，不参与软件更新流程。

## 已完成工作日志

### 2026-07-02

- 新增酷狗音乐（KuGou）登录，成为网易云、QQ 之外的第三个平台，登录方式照抄 QQ 官方网页登录窗口模式。改动分三层：
  - `desktop/main.js`：新增 `KUGOU_LOGIN_PARTITION`(`persist:mineradio-kugou-login`)、`KUGOU_LOGIN_URL`(`https://www.kugou.com/`)、`KUGOU_LOGIN_COOKIE_PRIORITY`、`isKugouCookieDomain`、`parseKuGooBlob`、`kugouCookieHasLogin`、`readKugouLoginCookieHeader`、`openKugouMusicLoginWindow`、`clearKugouMusicLoginSession`，注册 `kugou-music-open-login`/`kugou-music-clear-login` 两个 IPC，并注入 `process.env.KUGOU_COOKIE_FILE`。`desktop/preload.js` 暴露 `openKugouMusicLogin`/`clearKugouMusicLogin`。
  - `server.js`：新增 `KUGOU_COOKIE_FILE`、`kugouCookie` 持久化(`saveKugouCookie`)、`KUGOU_HEADERS`、cookie 解析族(`kugouCookieObject`/`parseKuGooCookieValue`/`kugouCookieUserId`/`kugouCookieToken`/`kugouCookieNickname`/`kugouCookieAvatar`/`normalizeKugouCookieInput`)、`normalizeKugouProfile`、`getKugouLoginInfo`，路由 `/api/kugou/login/status`、`/api/kugou/login/cookie`、`/api/kugou/logout`（插在 QQ 路由块之后、`/api/podcast/search` 之前）。
  - `public/index.html`：登录弹窗加酷狗 tab + 蓝色主题(`--source-kugou:#4da2ff`、`.kugou-preview` 等)，账号面板加酷狗 tab/补登/退出；新增状态变量、`normalizeKugouLoginStatus`/`refreshKugouLoginStatus`/`startKugouLoginStatusAutoRefresh`/`openKugouWebLogin`/`submitKugouCookieLogin`；把原先写死 netease/qq 双平台的逻辑（`platformMeta`/`platformStatus`/`firstLoggedProvider`/`renderUserBtn` pill 拼接/`updateUserModalUi` tab 遍历/`enableDualAccountView`/`logoutActiveAccount`/四处 `'qq':'netease'` 折叠→`normalizeProviderKey` 白名单）改为三平台通用；启动 `Promise.all` 和账号入口接上酷狗。
  - `.gitignore` 补 `.kugou-cookie`（原来只忽略 `.cookie`/`.qq-cookie`，会误提交登录 cookie）。
- 关键约束：`KuGoo` cookie 是 URL 编码的内层 query 串(`KugooID=..&t=..&NickName=..&Pic=..`)，userid=KugooID、token=t/KugooPwd 都藏在内层；desktop 与 server 两侧都必须解析内层 blob 且要求 userId+token 同时存在才算登录，两层判定必须对齐（否则窗口会在未真正登录时关闭，或复用过期 KuGoo 触发登录死循环）。
- 验证：`node --check` 全过；前端内联脚本 `vm` 编译过；cookie 解析单元测试 15/15；desktop 登录判定对齐测试 4/4；起本地 server 端到端测三路由（未登录→无效cookie 400→有效cookie登录并解析昵称→持久化→登出→回未登录）全过；浏览器预览确认三 tab 渲染、酷狗蓝色主题、切平台清空共用 cookie 框、服务端错误不误报掉登录、控制台无报错。
- 4 维对抗式复审(正确性/安全/健壮性/一致性)确认 6 条、逐条对抗验证，已修 3 条（desktop 判定过松[已修]、状态接口 500 误报掉登录[已修]、切平台不清 cookie 框[已修]）。
- 用户确认发布后：版本 `1.1.1` → **`1.2.0`**（新功能 minor），同步改 `package.json`/`package-lock.json`/`CHANGELOG.md`（顶部 `## v1.2.0`）。已执行 `npm run build:win`（exit 0），产物 `dist/Mineradio-1.2.0-Setup.exe`（约 115MB，SHA256 `6a41b82904d18ea8037309d13ef434ff3f0a2e89b2e6672fb9d4a4a928833dc6`）+ `.blockmap`。
- 按用户选择**延续 v1.1.x 安全发布：不上传 `latest.yml`**（老用户不走软件内更新，需手动下载）；构建生成的 `latest.yml` 已移到 `dist/_archive/not-published/`。
- 发布环境约束（本轮实际）：工作目录 `C:\Users\pc\Documents\Mineradio` 是 GitHub **浅克隆(depth 50)**；记录里的 E 盘 `resources\app` 权威源码**本轮不可达**、本机**未装 `gh`**。因此代码用 `git push` 推到 `origin/main`；GitHub Release 与安装包 exe 由**用户手动在网页上传**（未用 gh/API）。
- ⚠️ 两地分叉提醒：本次酷狗登录改动只在 C 盘 clone 里。日后回到 E 盘环境时，需把这批改动（酷狗登录三层 + 1.2.0 版本）合并回 E 盘 `resources\app` 权威源码，否则从 E 盘再发布会丢失酷狗登录。

### 2026-06-24

- 将 `E:\Download\默认测试.json` 接入为首次启动默认用户存档和默认视觉参数；新增 `public/default-user-fx-archive.json`，并让没有本地用户存档的新用户自动得到「默认测试」槽位。
- 更新 `CHANGELOG.md`、`README.md`、`SECURITY.md`、`RELEASE.md`、`docs/SECURITY_REBUILD_2026-06-24.md` 和 `docs/RELEASE_NOTES_v1.1.0.md`，恢复详细日志并写明 `v1.0.10` 旧安装包隔离、`v1.1.0` 纯净安装、不走软件内更新。
- 已执行 `npm run build:win`，第一次被旧代理 `127.0.0.1:26001` 拦截，切到 `127.0.0.1:10808` 后打包成功。产物：`dist/Mineradio-1.1.0-Setup.exe`、`.blockmap`、`Mineradio-1.1.0-SHA256SUMS.txt`。
- 已运行 `git diff --check`、`node --check server.js`、前端 5 个内联脚本解析、默认 JSON 解析、Git 跟踪高风险残留检查；Defender 对新安装包和 `win-unpacked` 扫描后 `Get-MpThreatDetection` 查询为空。
- 已发布 GitHub Release `v1.1.0`，上传安装包、blockmap、SHA256SUMS；未上传 `latest.yml`。已批量给旧 Release（`v1.0.10` 到 `v0.9.9`）追加旧安装包隔离警示。
- 检查并更新新对话交接：`docs/HANDOFF_NEXT_CHAT.md` 已改为当前 `v1.1.0` 源码安全重建状态。
- 本轮交接检查开始时工作树为干净：`main...origin/main`；随后仅修改 `AI_HANDOFF.md`、`docs/HANDOFF_NEXT_CHAT.md`、`docs/PROJECT_MEMORY.md`，并新增 `docs/3D_PLAYLIST_SHELF_MEMORY.md`。
- 已补全 3D 歌单架专项记忆：控制台模式、常驻/静态镜头、详情页层级、歌词避让、右键歌单架抑制底部控制台、不要推倒重做手感等边界写入 `docs/3D_PLAYLIST_SHELF_MEMORY.md`。
- 项目记忆 `docs/PROJECT_MEMORY.md` 已包含 `2026-06-24 - 1.1.0 安全重建源码优先`，记录不要复用旧感染环境产出的安装包、旧 `dist`、旧 `node_modules` 或临时扫描资料。
- 安全重建日志在 `docs/SECURITY_REBUILD_2026-06-24.md`，后续安装包发布必须从当前 Git-tracked 源码重新构建并扫描。

### 2026-06-18

- 发布 `v1.0.4` 到 GitHub：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.0.4`。
- 本次发布包含安装包 `Mineradio-1.0.4-Setup.exe`、`latest.yml`、blockmap，以及 `1.0.0/1.0.1/1.0.2/1.0.3 -> 1.0.4` 四个快速补丁 JSON。
- 主要修复：最小化/隐藏时深度低占用但可见失焦不降帧；全屏 3D 视觉画布尺寸同步避免裁切；控制台隐藏残影；控制台玻璃色差滑条；左侧歌单详情分批加载和置顶；沉浸模式恢复左侧歌单栏、3D 歌单架和封面渐变背景。

### 2026-06-06

- 发布 `v0.9.11`。
- 修复新用户首次进入未登录时展示不可控外部推荐封面的问题。
- 未登录首页改为安全 starter 内容，不再拉取公共推荐。
- 登录弹窗增加“音乐播放器 + 视觉舞台”说明，并提供“先搜索一首歌”路径。
- 视觉引导改成产品用途导向。
- 增加完整安装包下载进度：大小、速度、ETA、状态提示。
- 增加快速补丁通道：`/api/update/patch` 和 `/api/update/patch/status`。
- 生成并上传 `Mineradio-0.9.10-to-0.9.11.patch.json`。
- 注意：已经安装的 `0.9.10` 本身没有补丁器，所以从 `0.9.10` 升到 `0.9.11` 仍需完整安装包一次。

### 2026-06-07

- 重新设计 Windows NSIS 安装器。
- 加入深色标题栏、品牌页头、安装器侧栏、深色欢迎页。
- 跳过默认白色安装模式页。
- 用自定义深色目录页替代默认白色目录页，保留路径输入和 Browse 按钮。
- 默认安装路径仍优先 `D:\Mineradio`。
- 重新打包并覆盖 GitHub Release `v0.9.11` 的安装包、blockmap、latest.yml。
- 提交：`28d3cef Restyle Windows installer`。

### 2026-06-08

- 整理工作区。
- `dist` 根部恢复为当前发布资产区。
- 旧安装包移动到 `dist/_archive/previous-releases/`。
- 安装器预览截图移动到 `dist/_previews/installer-visual-20260607/`。
- builder debug 文件移动到 `dist/_logs/`。
- 历史前端实验文件移动到 `backups/public-html/`。
- 工具缓存文件移动到 `backups/tool-cache/`。
- 创建 `updates/downloads/`、`updates/backups/patches/`、`updates/tmp/`。
- `server.js` 更新为下载区和补丁备份区分离。
- Home 页完成视觉升级：首屏增加唱片、封面套、频谱视觉块，未登录/无封面时的卡片、拼贴和推荐入口都会生成彩色音乐封面占位，减少纯文字和空黑区域。
- 修正 Home 页矮屏排版：右侧卡片和推荐入口不再叠压，标题不会把“今天想听什么”拆成尴尬换行。
- 已用本地 Chrome CDP 验证 `1280x720` 和 `390x720` 首屏，无页面级横向溢出；预览截图保留在 `dist/_previews/home-visual-20260608/`。
- 本次任务没有上传或推送 GitHub，遵守“未明确要求上传就不上传”的新规则。

### 2026-06-10

- 视觉控制台新增“封面清晰度”滑块，用于调节主封面粒子网格密度。
- 默认保持 `119x119`（约 1.42 万粒子），最高提升到 `183x183`（约 3.35 万粒子），让专辑封面粒子化后更清晰。
- 调整封面纹理加载逻辑：高清晰度档位会使用 `384/512` 尺寸的封面画布，避免只增加粒子但纹理源仍然偏糊。
- 清晰度参数会写入本地偏好；当前封面来源会被记录，拖动滑块后当前封面会按新清晰度自动重载。
- 修复部分封面在提高清晰度后出现割裂线的问题：粒子网格改为奇数尺寸，几何位置保留居中点，封面 UV 改为采样 texel 中心，shader 内对封面/上一张封面/边缘贴图采样做安全夹取，避免采样到纹理边界或偶数网格中心缝。
- 已用本地 Chrome CDP 验证滑块：默认 `119x119`，拉满 `183x183`，主粒子/溢光粒子共享高密度几何，dataUrl 封面纹理升到 `512x512`，WebGL `glError=0`。
- 本次任务没有上传或推送 GitHub。

### 2026-06-13

- 用户明确要求上传 GitHub 后，已将 Home 视觉升级、封面清晰度控制、封面粒子割裂线修复和交接说明更新提交并推送到 `origin/main`。
- 已推送提交：`21f6052 Polish home visuals and cover particles`。
- 按用户“不能只上传源码，要包含软件 exe”的要求，继续升版本到 `0.9.12` 并重新构建 Windows 安装包。
- 已生成 `dist/Mineradio-0.9.12-Setup.exe`、`dist/Mineradio-0.9.12-Setup.exe.blockmap`、`dist/latest.yml`。
- 已生成轻量快速补丁 `dist/Mineradio-0.9.11-to-0.9.12.patch.json`，补丁只覆盖 `package.json`、`package-lock.json`、`public/index.html`，用于已安装 `0.9.11` 的用户快速更新视觉和封面粒子修复。
- 已创建并核对 GitHub Release `v0.9.12`：`https://github.com/XxHuberrr/Mineradio/releases/tag/v0.9.12`，远端包含安装包、blockmap、`latest.yml` 和 `0.9.11-to-0.9.12` 快速补丁。
- 本地试做新版开场动画：参考 `ShipSwiftAnimatedLoop` 的霓虹通道分离、光流和切片感，但放弃环形方案，改为横向光刃切入、彩色尾迹、碎片条和黑金控制台背景，主要改动在 `public/index.html`。
- 已用本地 Chrome/CDP 重播 splash 并截取 `updates/tmp/splash-replay-0700.png`、`updates/tmp/splash-replay-1800.png`、`updates/tmp/splash-replay-2900.png`；本次只是本地试效果，没有上传或推送 GitHub。
- 用户反馈上一版“不如动画库惊艳”后，继续把 splash 背景从 2D canvas 升级为 WebGL shader：移植 `ShipSwiftAnimatedLoop` 的 `lineWidth / abs(f)` 高亮线场、RGB channel offset、Neon angular wobble 和 Warp 距离场，并保留 2D fallback。新预览截图为 `updates/tmp/splash-webgl3-0700.png`、`updates/tmp/splash-webgl3-1800.png`、`updates/tmp/splash-webgl3-2900.png`；仍未上传或推送 GitHub。
### 2026-06-14

- 根据用户反馈，移除 splash 中刻意的环形/花瓣式爆点，改为更自然的斜向流线相位同步高光，避免“环形像菊花”的观感。
- splash 现在不再自动进入 Home：动画跑完后进入 `ready` 状态，显示轻量“点击进入”，用户点击任意位置或按 Enter/空格后才调用 `dismissSplash()`。这样用户可以停留欣赏动画。
- 已用本地 Chrome/CDP 验证：`updates/tmp/splash-click-ready.png` 显示 6.4 秒后仍停在 splash 且 `className=ready`，`updates/tmp/splash-after-click.png` 显示点击后进入 Home；本次没有上传或推送 GitHub。
- 用户随后明确要求上传 GitHub：已升级到 `0.9.13`，更新 `CHANGELOG.md` 和 `RELEASE.md`，生成 `dist/Mineradio-0.9.12-to-0.9.13.patch.json` 快速补丁，并重新构建 `dist/Mineradio-0.9.13-Setup.exe`、`dist/Mineradio-0.9.13-Setup.exe.blockmap`、`dist/latest.yml`。
- 已推送提交 `4d9044a Prepare Mineradio 0.9.13 release` 到 `origin/main`，并创建 GitHub Release `v0.9.13`：`https://github.com/XxHuberrr/Mineradio/releases/tag/v0.9.13`。远端资产包含安装包、blockmap、`latest.yml` 和 `0.9.12-to-0.9.13` 快速补丁。
- 注意：本机 `gh` 命令曾被失效代理 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:26001` 挡住。使用 GitHub CLI 发布时可在当前命令里临时清空 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 后再执行。

## 未完成/待确认事项

- `v1.1.0` 发布时不要上传 `latest.yml` 或快速补丁；Release 需要通过 `--latest=false` 或等价 API 避免成为旧版软件内更新通道的 latest。
- 搜索结果排序仍需要继续优化：例如“日落大道”应优先梁博原唱，“Beauty and a Beat”应优先原唱/官方版本，避免翻唱排第一。
- 3D 歌单架交互仍需继续优化：悬停展开和点击后可用状态之间要更丝滑，避免用户误以为悬停后可直接使用。
- Home 页面与后方 3D 歌单架的交互穿透问题需要继续关注。
- 如果之后修改发布资产，记得同步 GitHub Release、`latest.yml`、blockmap，并检查本地 `dist` 根部资产是否一致。
- 酷狗（KuGou）目前只接了登录与账号态，**尚未接入酷狗搜索、歌单、播放音源**。后续做时注意：调研发现酷狗网页 `KuGoo.t` 走的 appid(1014 网页体系)与 gateway 安卓签名接口(appid 1005)未必通用，token 可能不能直接调播放/歌单接口；开源实现参考 `MakcRe/KuGouMusicApi`（签名盐值、二维码登录流程、`/user/detail` 等上游接口均在其源码里）。若播放需要，建议改走「自建二维码+自己 appid」路线让 token 天然匹配。
- 酷狗歌单接入时，需修 `public/index.html` `doLogout` 里遗留的 `userPlaylists = qqPlaylists.slice()` 假设（当前"非网易云即 QQ"，三平台后会漏酷狗歌单）；本次登录范围未动、当前无酷狗歌单故无数据丢失。
- 酷狗/QQ 登录窗口的 `setWindowOpenHandler` 允许任意 https 弹窗在窗内加载（比网易云的域名白名单松）——这是**刻意保留**：酷狗/QQ 登录需要微信/QQ/微博等第三方授权跨域跳转，收紧白名单会把授权弹窗丢到外部浏览器破坏登录。webPreferences 已硬化(contextIsolation/sandbox/无 preload)，危害止于钓鱼面。若将来要收紧，需把所有第三方授权域一并加入白名单。

## 每次任务完成后的固定动作

1. 更新本文件的「已完成工作日志」。
2. 如果发现新问题，更新「未完成/待确认事项」。
3. 如果整理了文件，更新「工作区地图」或「本地分区约定」。
4. 如果改了代码，至少运行相关语法检查或构建检查。
5. 如果改了安装包或更新逻辑，检查安装包、blockmap、校验文件和 GitHub Release 是否一致；安全发布时特别确认不要误上传 `latest.yml`。
6. 最后确认 `git status --short`，说明哪些已提交、哪些只是本地忽略产物。
