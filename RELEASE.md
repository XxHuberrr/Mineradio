# Mineradio 2.0.3 发布流程

## 发布边界

- 正式版本：`2.0.3`
- Git tag：`v2.0.3`
- Release 标题：`Mineradio 2.0.3`
- 安装包：`Mineradio-2.0.3-Setup.exe`
- 仅从当前可信源码完整构建，不复用旧安装包或旧 `dist/`。
- 正式 Release 不混入 Mineradio_Beat 产物。
- GitHub Release 保持零二进制资产；安装包由网盘分发。
- Release 正文使用 `<!-- mineradio-download-page: 线路名称|https://... -->` 写入 HTTPS 网盘地址，可配置多条线路。

## 网盘分发

- 夸克盘：<https://pan.quark.cn/s/f40289e1c5d3>
- 百度云：<https://pan.baidu.com/s/14fgTABgbfseOg9QuX0Um7Q?pwd=sjhp>（提取码 `sjhp`）
- 蓝奏云：<https://xxhuber.lanzout.com/mineradio2>

## 公开更新说明

- 修复多行歌词与 3D 歌单架的显示层级。
- 优化更新入口与安装包获取流程。

## 发布资产

- `dist/Mineradio-2.0.3-Setup.exe`
- `dist/Mineradio-2.0.3-Setup.exe.blockmap`
- `dist/latest.yml`
- `dist/Mineradio-2.0.3-SHA256SUMS.txt`

以上产物只用于本地验收和网盘上传，不作为 GitHub Release 资产发布。

## 发布前检查

- 运行完整回归检查与 Electron 启动检查。
- 构建并检查 `win-unpacked/resources/app` 内容。
- 验证安装包启动、退出、重启和用户数据恢复。
- 确认仓库不包含 Cookie、Token、凭据、缓存或本机日志。
- 生成并核对 SHA256。
