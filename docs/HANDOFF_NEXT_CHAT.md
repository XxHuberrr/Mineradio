# Mineradio Next Chat Handoff

更新时间：2026-07-16

## 新对话先执行

```powershell
cd E:\桌面\播放器软件\Mineradio\resources\app
git status --short --branch
git log --oneline -5 --decorate
Get-Content AGENTS.md
Get-Content docs\PROJECT_MEMORY.md
Get-Content docs\HANDOFF_NEXT_CHAT.md
```

如涉及 3D 歌单架、安全重建、发布、安装包或旧备份取用，再读：

```powershell
Get-Content docs\3D_PLAYLIST_SHELF_MEMORY.md
Get-Content docs\SECURITY_REBUILD_2026-06-24.md
Get-Content CHANGELOG.md -TotalCount 80
Get-Content RELEASE.md
```

## 当前状态

- 当前真实代码/Git 仓库：`E:\桌面\播放器软件\Mineradio\resources\app`
- 当前版本：`v1.1.1`
- 当前发布策略：纯净安装版，从当前可信源码重新构建；`v1.0.10` 及更早旧安装包需要隔离，不再建议安装或传播。
- 本次发布不做 `v1.0.10 -> v1.1.0` 软件内本地更新，不上传 `latest.yml`，不生成快速补丁。
- 安装包样式继续沿用 `docs/INSTALLER_STYLE.md` 的中文极简黑白蓝格式。
- GitHub 仓库已公开：`https://github.com/XxHuberrr/Mineradio`
- `v1.1.0` Release：`https://github.com/XxHuberrr/Mineradio/releases/tag/v1.1.0`
- GitHub `/releases/latest` 仍返回 `v1.0.10`，这是刻意设置，避免旧版软件内更新到 1.1.0。

## 2026-07-16 维护迭代

- 新增 `server-security.js`，集中处理本地 API 同源限制、代理目标 IP 校验和重定向逐跳校验。
- `server.js` 的封面代理只接受常用栅格图片，音频代理不再透传 HTML 内容类型，媒体响应启用 `nosniff`。
- `desktop/main.js` 阻止主窗口离开本地应用源，HTTP(S) 外链交给系统浏览器。
- 新增 `npm run check` 和安全边界测试；`.github/workflows/security-check.yml` 会在 Linux 和 Windows 的 Node.js 22 环境执行检查，其中 Windows runner 覆盖真实目录联接（junction）路径；这不等同于 Electron 实机或 Windows 安装包构建。
- 新增 `cookie-storage.js`：Electron 中使用系统 `safeStorage` 加密网易云/QQ Cookie，旧明文文件首次读取后自动迁移，登出删除文件。
- Electron 安全存储不可用时拒绝明文落盘，登录接口返回 `saved: false`，前端提示本次会话未持久化；standalone Node 启动仍保留明文兼容。
- `.cookie` 与 `.qq-cookie` 都会从旧 app 目录迁移到 Electron `userData`；`cookie-storage.js` 已加入安装包文件列表和快速补丁允许列表。
- 新增 `update-signature.js`，快速补丁现在强制验证 Ed25519 签名信封，验证通过前不会进入版本校验或文件写入。
- 新增 `npm run sign:patch` 和 `docs/UPDATE_PATCH_SIGNING.md`；未签名、篡改、未知密钥和错误算法补丁均有回归测试。
- 新增 `update-patch.js`，快速补丁会在写入前全量预检路径、编码、重复目标和哈希；应用途中失败会恢复旧文件、删除本轮新文件并清理本任务创建的空目录。
- 补丁目标路径会记录并约束应用根目录真实路径，逐级拒绝符号链接/Windows 目录联接，并在每个文件写入前复检，防止词法路径在应用目录内但实际写到目录外。
- 补丁预检会记录目标文件身份；预检后出现普通文件、目标被替换或删除时返回 `PATCH_TARGET_CHANGED`，并保留并发本地修改。内部 `.mineradio-patch/.mineradio-restore` 文件名已禁止作为补丁目标。
- 新增文件系统回归测试，覆盖成功备份、预检零写入、Windows 路径冲突、符号链接逃逸、预检后符号链接/普通文件替换、内部事务文件名拒绝、失败回滚和目录清理；`update-patch.js` 已加入安装包与快速补丁允许列表。
- 当前 `package.json` 的生产 `patchSigningKeys` 为空，快速补丁入口默认关闭；下一步需要在受控发布环境建立正式 Ed25519 密钥，只把公钥加入仓库。
- 本轮没有修改 `public/index.html` 的播放、视觉、歌词或 3D 歌单架逻辑。

## 本轮重点

- 已将 `E:\Download\默认测试.json` 设为首次启动默认用户存档和软件内默认视觉参数。
- 新增 `public/default-user-fx-archive.json`，代码中 `PACKAGED_DEFAULT_FX_SNAPSHOT` 与该 JSON 已脚本比对一致。
- 没有本地 `mineradio-lyric-layout-v1` 时，`readSavedLyricLayout()` 使用 packaged 默认快照；没有本地用户存档 key 时自动创建「默认测试」槽位。
- 已恢复详细日志和发布说明：`CHANGELOG.md`、`README.md`、`SECURITY.md`、`RELEASE.md`、`docs/SECURITY_REBUILD_2026-06-24.md`、`docs/RELEASE_NOTES_v1.1.0.md`。
- 已生成安装包：`dist/Mineradio-1.1.0-Setup.exe`。
- 已生成校验文件：`dist/Mineradio-1.1.0-SHA256SUMS.txt`。
- 已发布资产：安装包、blockmap、SHA256SUMS；未上传 `latest.yml`。
- 已批量给旧 Release（`v1.0.10` 到 `v0.9.9`）正文顶部追加旧安装包隔离警示。

## 已知验证

- `git diff --check`：通过。
- `node --check server.js`：通过。
- 前端 `public/index.html` 2 个内联脚本解析：通过。
- `npm run check`（2026-07-16 macOS 源码快照）：通过，包含本地 API/代理安全测试、Cookie 安全存储测试、快速补丁 Ed25519 签名测试，以及真实路径约束、符号链接拒绝和目录清理的事务回滚测试。
- 尚未运行 Electron 实机，也未执行 Windows 构建；正式发布前需在 Windows 实机确认 DPAPI/safeStorage 的旧明文迁移、重启持久化与登出删除。
- `public/default-user-fx-archive.json` JSON 解析：通过。
- 代码内置默认快照与 `public/default-user-fx-archive.json` 字段比对：一致。
- Git 跟踪高风险残留检查：没有匹配 `.exe/.dll/.scr/.bat/.cmd/.ps1/.vbs/.jse/.wsf/.hta/.xlsm/.msi`。
- `npm run build:win`：第一次被旧代理 `127.0.0.1:26001` 拦截；切到 `127.0.0.1:10808` 后构建成功。
- Defender 状态：实时防护开启，签名版本 `1.453.247.0`。
- Defender 已扫描新安装包和 `dist\win-unpacked`；`Get-MpThreatDetection` 查询为空。
- 安装包 SHA256：`bd53aae4e551f5b0b5a398a51e6ec1de5a9a57cb42e5eecedb0a1647fdcee6e6`。

## 发布注意

- GitHub CLI 命令需要在命令内覆盖代理：

```powershell
$env:HTTP_PROXY='http://127.0.0.1:10808'
$env:HTTPS_PROXY='http://127.0.0.1:10808'
$env:ALL_PROXY='socks5://127.0.0.1:10808'
```

- 发布 `v1.1.0` 时不要上传 `dist/latest.yml`。
- Release 建议上传：
  - `dist/Mineradio-1.1.0-Setup.exe`
  - `dist/Mineradio-1.1.0-Setup.exe.blockmap`
  - `dist/Mineradio-1.1.0-SHA256SUMS.txt`
- Release 正文使用 `docs/RELEASE_NOTES_v1.1.0.md`。
- Release 需要 `--latest=false` 或等价 API，避免旧版客户端通过 `/releases/latest` 自动发现。
- 旧 release 尤其 `v1.0.10` 需要追加隔离警示，不要删除旧资产。

## 不要做

- 不要修改旧外层源码目录，只有 `resources\app` 会影响运行版。
- 不要从 `工作区备份\2026-06-18-workspace-cleanup`、旧 `dist`、旧 `node_modules` 或旧 packaged build 中恢复可执行产物。
- 不要使用 `git reset --hard` 或 `git checkout --` 回滚用户改动。
- 不要把 `v1.1.0` 当作 `v1.0.10` 的软件内更新发布。
- 不要上传 `latest.yml` 或 `v1.0.10 -> v1.1.0` 快速补丁。
