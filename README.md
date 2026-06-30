# Mineradio Apple

![Mineradio 暗场启动页](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio Apple 是 Mineradio 的 Apple 兼容维护仓库，目标是在保留原有沉浸式音乐播放器体验的基础上，逐步处理 macOS 与 iPhone 场景下的运行、界面和交互兼容问题。

当前代码基线来自 Windows Electron 桌面版 Mineradio。这个仓库用于后续 Mac 兼容、iPhone 手机兼容和相关文档维护；正式 Apple 版本尚未发布。

## 仓库状态

| 项目 | 状态 |
| --- | --- |
| 当前版本 | `1.1.1` |
| 当前维护方向 | Apple / iPhone 兼容，已新增 iOS WKWebView 工程 |
| 当前工作分支 | `iPhone手机兼容` |
| 默认远程仓库 | `git@github.com:tao666618/Mineradio_apple.git` |
| 原 Windows 仓库 | `https://github.com/XxHuberrr/Mineradio.git` |

## 当前能力

- 天气电台、搜索播放、每日推荐、私人电台和歌单入口
- 歌词舞台、自定义歌词、歌词位置与视觉控制
- 粒子视觉、电影镜头视觉、DJ / 长播客视觉模式
- 3D 歌单架与播放队列浏览
- 网易云音乐账号、搜索、歌单和播客接入
- QQ 音乐搜索、登录态和音源补充接入
- 本地用户存档、默认视觉参数和自定义封面能力
- GitHub Releases 更新检测链路

## Apple 兼容目标

后续维护重点：

1. Mac 桌面运行兼容：启动流程、窗口行为、快捷键、路径和构建配置。
2. iPhone 手机兼容：移动端布局、触控交互、窄屏歌词和播放控制体验。
3. 文档同步维护：每次阶段性提交时同步更新 README，明确当前可运行平台、限制和验证方式。

当前限制：

- 现有打包配置仍以 Windows NSIS 安装包为主。
- iPhone 方向已具备原生 iOS 工程骨架：`ios/MineradioIOS/MineradioIOS.xcodeproj` 通过 `WKWebView` 加载现有 `public/index.html`。
- 当前 iPhone 版本先验证本地界面、触控和窄屏兼容；桌面端 Node 服务、登录弹窗、桌面歌词、壁纸模式和安装器更新入口在 iOS 壳内会降级为不可用。
- `package.json` 中的发布配置仍保留原 Windows 仓库信息，Apple 兼容发布前需要单独调整。

## 开发运行

```bash
npm install
npm start
```

桌面版入口由 Electron 主进程加载本地服务。当前启动脚本会通过 `desktop/start.js` 拉起应用。

Windows 打包命令仍可用于原桌面版验证：

```bash
npm run build:win
```

iPhone / iOS 方向使用 Xcode 26.6 工具链构建。当前终端如果仍指向 Command Line Tools，脚本会通过 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 临时指定完整 Xcode。

```bash
npm run verify:ios
npm run build:ios:sim
npm run build:ios:device
```

- `build:ios:sim`：使用 `iphonesimulator` SDK 编译 `MineradioIOS.app`。
- `build:ios:device`：使用 `iphoneos` SDK 编译真机目标，默认关闭签名，用于验证代码和资源能通过 iPhoneOS 构建。
- `doctor:ios-signing`：检查本机签名证书、已连接 iPhone、开发者模式和 Xcode 签名配置。
- `build:ios:phone`：使用 Xcode 自动签名构建已连接的 `tao’s iphone`。
- `install:ios:phone`：把已签名的 `MineradioIOS.app` 安装并启动到已连接 iPhone。
- 真机安装需要 Xcode 登录 Apple ID。个人免费账号也可以，但仍需要在 Xcode 的 Signing & Capabilities 中选择 Personal Team，让 Xcode 创建 Apple Development 证书和 provisioning profile。
- 当前个人 Team ID：`F92M2WMRFB`；Bundle ID：`com.tao666618.mineradio.ios`。
- 个人开发者证书首次安装后，iPhone 可能会拒绝启动并提示未信任开发者。此时在手机打开“设置 > 通用 > VPN 与设备管理”，信任 `3362045398@qq.com` / Apple Development 开发者后，再点击 Mineradio 图标或重新运行 `npm run install:ios:phone`。
- TestFlight 或正式发布前还需要付费 Apple Developer Program、正式 Bundle ID、发布证书、隐私/网络权限策略和 App Store 合规材料。

当前默认真机脚本绑定的设备是 `tao’s iphone`，设备标识为 `C8CF6284-8E54-518D-963B-12A58C2604FE`。如果更换手机，可通过环境变量覆盖：

```bash
MINERADIO_IOS_DEVICE_ID=<device-id> npm run install:ios:phone
```

## 推荐验证

改动后至少执行：

```bash
git diff --check
node --check server.js
npm run verify:ios
```

涉及 iPhone 工程时，再执行 `npm run build:ios:sim` 和 `npm run build:ios:device`。涉及桌面主进程、窗口、播放、歌词或视觉系统时，还需要实际启动应用检查关键交互。

## 更新机制

Mineradio 会请求 GitHub Releases latest 检测新版本。远端版本高于本地版本时，应用内更新入口会展示 Release 内容、下载安装包到本机用户数据目录，并通过系统打开安装包。

本地验证更新链路时，可以通过 `MINERADIO_UPDATE_MANIFEST` 指向一个本地 manifest JSON 或 HTTP 地址来模拟线上 Release。

Apple 兼容仓库发布前，需要确认更新检查、Release 地址和下载入口已经从原 Windows 仓库切换到当前维护仓库。

## 第三方音乐平台说明

Mineradio 不是网易云音乐、QQ 音乐或腾讯音乐娱乐集团的官方客户端，也不隶属于任何音乐平台。

项目中的第三方平台接入仅用于个人学习、本地客户端体验和用户自有账号的播放辅助。请遵守对应平台的用户协议、版权规则和会员权益规则。项目不会提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。

## 用户数据与隐私

登录 Cookie、搜索历史、自定义封面、自定义歌词、节奏分析缓存等数据只应保存在本机用户数据目录或浏览器本地存储中，不应提交到仓库。

更多说明见 [PRIVACY.md](./PRIVACY.md)。

## 致谢

Mineradio 由 XxHuberrr 主要设计与打造。emily 作为早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此感谢。

同时感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜在早期体验、测试反馈和发布准备中的帮助。

## 版权与授权

Copyright (C) 2026 XxHuberrr.

本项目采用 GPL-3.0 授权。详见 [LICENSE](./LICENSE)。

MR Logo、Mineradio 名称、界面视觉设计与原创视觉表达归作者所有；第三方依赖和第三方服务分别遵循其各自授权与服务条款。
