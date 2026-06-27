# 发布流程

## v1.1.0 发布边界

- `v1.1.0` 是纯净安装发布版，从当前 `resources/app` 可信源码重新构建。
- 不复用旧 `dist/`、旧安装包、旧 `node_modules`、旧备份包或任何历史 packaged build。
- 不生成 `v1.0.10 -> v1.1.0` 快速补丁。
- 不把 `v1.1.0` 设置为旧版软件内更新通道的 latest；`v1.0.10` 用户需要手动下载新版安装包并纯净安装。
- GitHub Release 需要明确提示：`v1.0.10` 及更早安装包有风险，请隔离旧 `.exe` 安装包，不要继续安装或转发。
- 安装包样式继续沿用 `docs/INSTALLER_STYLE.md` 的中文极简黑白蓝格式。

## 发布前检查

- 确认 `package.json` 和 `package-lock.json` 版本号正确。
- 确认 `mineradio.update.owner/repo` 指向正式仓库。
- 确认 `.cookie`、`.qq-cookie`、`updates/`、`node_modules/`、旧 `dist/` 没有进入 git。
- 确认 README/SECURITY/CHANGELOG/Release 正文包含 `v1.0.10` 旧安装包隔离说明。
- 运行语法检查：`git diff --check`、`node --check server.js`、前端内联脚本解析。
- 运行 Git 跟踪风险残留检查，确认没有跟踪 `.exe/.dll/.scr/.bat/.cmd/.ps1/.vbs/.jse/.wsf/.hta/.xlsm` 等可执行/脚本残留。
- 从当前源码执行 `npm run build:win` 生成 Windows 安装包。
- 在 Apple Silicon Mac 上执行 `npm run build:mac` 生成 macOS arm64 DMG/ZIP。
- 对新生成的安装包和当前源码执行安全扫描。
- 生成并记录新安装包 SHA256。

## macOS Apple Silicon 发布

macOS arm64 构建适用于 M1 / M1 Pro / M2 / M3 / M4 芯片：

```bash
npm install
npm run build:mac
```

建议上传资产：

- `dist/Mineradio-x.y.z-mac-arm64.dmg`
- `dist/Mineradio-x.y.z-mac-arm64.zip`
- `dist/Mineradio-x.y.z-mac-arm64-SHA256SUMS.txt`

没有 Apple Developer ID 时，产物不会签名或 notarize。Release 正文必须明确提示这是未签名开源构建，首次打开时可能需要 Finder 右键“打开”或到系统设置的“隐私与安全性”中允许打开。正式面向普通用户分发前，建议使用 Apple Developer ID 完成签名和 notarization。

## GitHub Release

Release tag：

```text
v1.1.0
```

Release 标题：

```text
Mineradio v1.1.0 纯净安装版
```

建议上传资产：

- `dist/Mineradio-1.1.0-Setup.exe`
- `dist/Mineradio-1.1.0-Setup.exe.blockmap`（可选；本次不作为旧版软件内更新使用）
- `dist/Mineradio-1.1.0-SHA256SUMS.txt`

本次不要上传：

- `latest.yml`
- `v1.0.10 -> v1.1.0` 快速补丁

## 更新检测

应用会请求 GitHub Releases latest。为了避免 `v1.0.10` 旧客户端通过软件内更新直接拉到 `v1.1.0`，本次 GitHub Release 不应设为旧更新通道的 latest。

本地验证更新链路时，可以用临时 manifest：

```json
{
  "latestVersion": "1.1.0-test",
  "release": {
    "name": "Mineradio v1.1.0-test",
    "downloadUrl": "http://127.0.0.1:3144/Mineradio-1.1.0-Setup.exe",
    "notes": ["本地在线更新链路测试"]
  }
}
```
