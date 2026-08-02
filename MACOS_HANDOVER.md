# Mineradio macOS 支持 - 交接文档

## 概述

本文档记录了 Mineradio 项目的 macOS (Apple Silicon) 适配工作，方便后续开发者接手维护。

## 分支信息

- **分支名称**：`macos-support`
- **基于版本**：`v2.1.0` (main 分支)
- **最新提交**：`a111815`

## 改动文件清单

### 1. `package.json`
- 添加 macOS DMG 构建配置
- 添加 `build:mac` 脚本命令
- 添加 macOS 图标配置 (`build/icon.icns`)

### 2. `desktop/main.js`
- 添加 `Menu` 模块导入
- 添加平台检测逻辑
- 配置 macOS 原生窗口框架 (`titleBarStyle: 'hiddenInset'`)
- 设置交通灯按钮位置
- 添加 macOS 应用菜单 (App/Edit/Window)
- 优化全屏事件处理
- 添加 macOS 特定的 Chromium 开关 (Metal 后端)

### 3. `desktop/preload.js`
- 添加 `platform` 属性暴露给渲染进程
- 添加 macOS 特定的 CSS 类 (`desktop-native-frame`)
- 实现全屏变化事件监听器

### 4. `public/css/index.css`
- 添加 macOS 原生框架样式规则
- 添加全屏优化样式
- 隐藏自定义窗口按钮 (macOS 使用系统原生按钮)

### 5. `public/js/modules/01-scene/00-renderer-quality.js`
- 为 ProMotion 显示器优化渲染设置
- 限制帧率至 60fps
- 降低像素预算和 DPR 上限

### 6. `README.md`
- 添加 macOS 版本说明
- 添加 Gatekeeper 打开说明
- 添加 macOS 下载链接

## 主要功能

### 已实现
- ✅ Apple Silicon (M 系列芯片) 支持
- ✅ DMG 安装包格式
- ✅ 原生窗口框架 (隐藏标题栏，显示交通灯)
- ✅ 全屏功能优化
- ✅ 性能优化 (ProMotion 显示器适配)
- ✅ Metal GPU 渲染后端

### macOS 版差异
- 桌面歌词锁定/解锁使用软件内开关 (不支持鼠标中键)
- 应用内更新入口跳转到 Release 页面手动下载
- 未签名应用需处理 Gatekeeper 提示

## 构建命令

```bash
# 安装依赖
npm install

# 构建 macOS 版本
npm run build:mac

# 输出文件
dist/Mineradio-<version>-arm64.dmg
```

## 待改进事项

1. **代码签名**：目前未签名，需要 Apple Developer 账号进行签名
2. **公证**：未进行 Apple 公证，用户需手动处理 Gatekeeper
3. **Intel Mac 支持**：目前仅支持 Apple Silicon，可考虑添加 x64 架构支持
4. **测试覆盖**：需要更多 macOS 特定的测试用例

## 参考资料

- 原始 macOS 适配 PR: [#277](https://github.com/XxHuberrr/Mineradio/pull/277)
- Metal GPU 渲染 PR: [#260](https://github.com/XxHuberrr/Mineradio/pull/260)
- macOS 支持 PR: [#255](https://github.com/XxHuberrr/Mineradio/pull/255)

## 联系方式

如有问题，请参考 GitHub Issues 或原作者 XxHuberrr。

---

*文档创建时间：2026-08-02*
