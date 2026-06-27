# Mineradio macOS 构建说明

本文档记录当前 macOS 适配状态。

## 当前状态

macOS 版本处于本地测试阶段。Electron 主应用可以按 macOS 目标打包，更新资产选择也会按平台优先选择 `.dmg` / `.zip`，但公开分发前仍需要补齐签名与公证。

## 本地运行

```bash
npm ci
npm start
```

## 本地打包

无 Apple Developer 证书时，使用下面的命令跳过自动签名发现：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:dir
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

如果 Electron 或 DMG 工具包从 GitHub CDN 下载很慢，可以使用镜像源：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

产物位于 `dist/`。

## 已适配内容

- 新增 `build:mac` 和 `build:mac:dir`。
- 新增 `build.mac` 与 `build.dmg` 配置。
- 新增 `build/icon.icns`。
- macOS 不再追加 Windows 专属的 `use-angle=d3d11` Chromium switch。
- 更新检测在 macOS 优先读取 `latest-mac.yml`。
- GitHub Release 资产在 macOS 优先选择 `.dmg` / `.zip`。
- 更新弹窗文案改为跨平台的“安装文件 / 更新文件”。

## 平台降级

- 壁纸模式依赖 Windows WorkerW，macOS 暂不支持。
- 桌面歌词可以保留基础覆盖窗口能力，但 Windows 中键全局切换能力不会在 macOS 启用。
- 未签名 `.app` / `.dmg` 会被 Gatekeeper 提示，需要用户手动允许；公开分发建议完成 Developer ID 签名和 notarization。

## 发布注意

如果独立发布 macOS 版本，Release 资产建议命名为：

- `Mineradio-${version}-mac-arm64.dmg`
- `Mineradio-${version}-mac-arm64.zip`

当前 `package.json` 保持默认 GitHub Release 更新源。fork 独立发布时，可以通过 `MINERADIO_UPDATE_OWNER` / `MINERADIO_UPDATE_REPO` 指向自己的发布仓库。
