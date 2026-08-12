# Mineradio 2.1.0 发布流程

## 发布边界

- 正式版本：`2.1.0`
- Git tag：`v2.1.0`
- Release 标题：`Mineradio 2.1.0`
- 安装包：`Mineradio-2.1.0-Setup.exe`
- 仅从当前可信源码完整构建，不复用旧安装包或旧 `dist/`。
- 正式 Release 不混入 Mineradio_Beat 产物。
- GitHub Release 仅附带完整安装包 `Mineradio-2.1.0-Setup.exe`，供用户手动下载；不上传 `latest.yml`、blockmap 或补丁。
- `2.0.3+` 客户端不得从 Release assets 识别或下载安装包，软件内更新仍只读取正文中的网盘线路。
- Release 正文使用 `<!-- mineradio-download-page: 线路名称|https://... -->` 写入 HTTPS 网盘地址，可配置多条线路。

## 网盘分发

- 夸克盘：<https://pan.quark.cn/s/f40289e1c5d3>
- 百度云：<https://pan.baidu.com/s/14fgTABgbfseOg9QuX0Um7Q?pwd=sjhp>（提取码 `sjhp`）
- 蓝奏云：<https://xxhuber.lanzout.com/mineradio2>

## 公开更新说明

- 优化 Wallpaper Engine 壁纸与全屏模式的兼容性。
- 改进登录、账号状态和本地曲库体验。
- 提升长时间运行与连续播放稳定性。

## 发布资产

- `dist/Mineradio-2.1.0-Setup.exe`
- `dist/Mineradio-2.1.0-Setup.exe.blockmap`
- `dist/latest.yml`
- `dist/Mineradio-2.1.0-SHA256SUMS.txt`

GitHub Release 只上传 `dist/Mineradio-2.1.0-Setup.exe`；其余产物只用于本地验收和校验，不作为 Release 资产发布。

## 发布前检查

- 运行完整回归检查与 Electron 启动检查。
- 构建并检查 `win-unpacked/resources/app` 内容。
- 验证安装包启动、退出、重启和用户数据恢复。
- 确认仓库不包含 Cookie、Token、凭据、缓存或本机日志。
- 生成并核对 SHA256。
