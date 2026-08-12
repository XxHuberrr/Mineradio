# Changelog

## v2.1.3 - Desktop MVP (feature/mvp-visual-lrc)

基于 v2.1.0 的桌面音乐播放器 MVP（演示分支）包含以下主要改进：

- 新增视觉粒子/波形可视化与歌词（.lrc）解析显示
- 本地播放支持：mp3/wav/m4a/flac/ogg/aac，并按中文排序
- 收藏（Favorites）与最近播放（Recent）持久化（localStorage）
- 简单持久化：保存上次打开的音乐文件夹
- 安全的 preload -> 主进程 IPC（仅暴露 select-folder / read-file / state API）

注意事项：
- 演示分支包含 electron 运行脚本，网络受限时请手动安装 electron 或使用离线二进制
- 建议 PR 中不包含 node_modules 或 electron 二进制；若需要，请将这些大文件移到 release 或提供下载方式

更多改进和待办：歌词同步精度、可视化调优、打包与安装器（electron-builder）。
