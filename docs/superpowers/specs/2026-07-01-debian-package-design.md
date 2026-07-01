# Debian Package Design

## Goal

在现有 Linux AppImage 支持上增加独立的 x64 Debian 包构建与真实安装测试，同时不改变现有 AppImage 的文件、菜单入口和默认构建行为。

## Selected Approach

- 保留 `npm run build:linux`，作为 x64 AppImage 构建的兼容命令。
- 新增 `npm run build:linux:appimage`，明确构建 x64 AppImage。
- 新增 `npm run build:linux:deb`，明确构建 x64 Debian 包。
- 三个命令都显式传入 `--x64`，不依赖构建机的 CPU 架构。
- `build.linux.target` 继续只声明 AppImage，避免默认命令同时生成两种格式。
- 在 Linux 构建配置中提供 Debian 必需的维护者姓名与电子邮箱。

未采用通用的 `npm run build:linux -- <target>`，因为专用脚本更易发现、审阅和在 CI 中使用。未采用手写 `dpkg-deb` 或 `fpm`，因为 electron-builder 已能复用当前应用文件、图标和桌面元数据。

## Automated Tests

扩展 `test/package-config.test.js`，验证：

- `build:linux` 仍指向 AppImage 构建。
- `build:linux:appimage` 和 `build:linux:deb` 均存在且目标明确。
- 默认 Linux target 仍只有 AppImage x64。
- Debian 维护者字段包含有效的姓名和电子邮箱格式。

## Package Verification

使用 Node.js 24 执行 `npm run build:linux:deb`，然后通过 `dpkg-deb` 检查包名、版本、架构、维护者、桌面入口、图标和应用可执行文件。

## Installation Verification

1. 记录 `~/.local/bin/Mineradio.AppImage` 与 `~/.local/share/applications/Mineradio.desktop` 的 SHA-256。
2. 使用 apt 安装新生成的 deb。
3. 从系统安装路径启动 Mineradio，并验证本地版本接口可用。
4. 卸载 deb，不执行 `autoremove`。
5. 再次核对 AppImage 和用户级桌面入口 SHA-256，确认二者未被修改。

## Scope

- 只支持当前 Linux x64 架构。
- 不修改应用 UI、播放逻辑或 Windows 配置。
- 不发布 Release 资产；本轮只构建、测试、提交并更新现有 PR。
