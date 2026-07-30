# Mineradio 自定义功能 · 更新与保留指南

你的三个功能（**音效设置** / **离线缓存** / **本地歌单导入与离线歌单**）以 git 分支 `my-features`
的形式保存在本仓库，基线为上游 `v2.0.2`。上游每次发新版，只要 `git rebase origin/main` 把功能
嫁接到新版即可，**不会再像直接改安装目录那样被更新冲掉**。

## 仓库位置
`Mineradio/`（即本目录，`origin` = `github.com/XxHuberrr/Mineradio`）

## 分支结构
```
4abaa19 release: Mineradio 2.0.2          <- 上游基线
c4f8a47 feat: 离线缓存 + 离线(本地)歌单功能
5a79123 feat: 音效设置 (Web Audio 音效链 + 控制台音效 Tab)
e851c0a refactor: 抽出 clearLocalPlaylistCaches() 复用清理逻辑
```

## 日常更新（保留功能）
**方式一 · 一键脚本（Windows PowerShell，推荐）：**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/update-custom.ps1 -Deploy
```
（不带 `-Deploy` 只做 rebase+构建不安装；加 `-NoBuild` 只 rebase 不构建）

**方式二 · 手动：**
```bash
git fetch origin
git rebase origin/main      # 若有冲突：解决后 git rebase --continue
npm install
npm run build:win:dir       # 产物在 dist/win-unpacked
# 完全退出 Mineradio，把 dist/win-unpacked/* 复制到 D:\Mineradio
```

## 已关闭官方自动更新
`package.json` 中 `mineradio.update.disabled: true`，自定义构建不会再去拉官方新版，
因此不会把你的功能覆盖掉。若想换回官方版：删掉该行，或重新下载官方安装包覆盖即可。

## 注意事项
- **离线歌曲在 `D:\MineradioCache\offline`**，与程序目录分离，重装/更新都不会丢。
- 重套后按离线文档 §14 验证；若上游大改控制台/播放流程，重点回归：
  音效 4 区块归位（`09-console-workspace.js`）与离线命中分支（`13-playback-start-audio.js`）。
- 改动的权威锚点见 `AUDIO_FX_CHANGES.md` 与 `Mineradio-离线缓存代码改动说明.md`。
- rebase 时若 `package.json` 冲突：保留你的 `node-id3` / `flac-metadata` 依赖与 `disabled: true`。
