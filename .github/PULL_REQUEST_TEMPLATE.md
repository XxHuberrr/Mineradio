<!-- 提交前请先读 CONTRIBUTING.md。PR 默认以 GPL-3.0 并入（inbound = outbound）。 -->

## 这个 PR 做了什么

<!-- 简述目的与改动范围，关联 issue（如有）。一个 PR 尽量只做一件事。 -->

## 改动类型

- [ ] feat（新功能）
- [ ] fix（修复）
- [ ] docs（文档）
- [ ] refactor / chore（重构 / 杂项）

## 自测情况

<!-- 跑了哪些命令、手测了哪些交互、结果如何。 -->

- [ ] `node --check`（改了 JS 时）
- [ ] `git diff --check` 干净
- [ ] 用真实 Electron / 浏览器手测了受影响交互
- [ ] `npm run build:win:dir`（涉及打包/afterPack 时）

## 合规自查清单

- [ ] 没有提交任何凭据、token、Client ID/Secret、cookie 或用户数据
- [ ] 没有内置/共享第三方平台应用凭据（Spotify 仍为 BYO Client ID）
- [ ] 没有引入绕过付费/会员/音质保护或重分发内容的能力
- [ ] 新引入的第三方依赖与许可已写入 `NOTICE.md`，且与 GPL-3.0 兼容
- [ ] 未破坏既有视觉质感（粒子 / 歌词舞台 / 3D 歌单架 / 玻璃 SVG）
- [ ] 已更新 `CHANGELOG.md`（中文、置顶），必要文档已同步
- [ ] commit 已 `Signed-off-by`（DCO，`git commit -s`）
