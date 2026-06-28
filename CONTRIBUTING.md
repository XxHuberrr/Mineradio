# 为 Mineradio 贡献代码

感谢你愿意为 Mineradio 出一份力。本文档说明如何提交贡献，以及在 GPL-3.0 下你需要遵守的约定。

## 授权与版权（重要）

- 本项目采用 **GPL-3.0**（见 [LICENSE](./LICENSE)）。
- **inbound = outbound**：你提交的任何贡献，都默认以与本项目相同的 **GPL-3.0** 授权并入。提交 PR 即表示你同意这一点。
- 你必须拥有所提交代码的合法权利（自己原创，或来源许可与 GPL-3.0 兼容）。引入第三方代码/资源时，必须在 [NOTICE.md](./NOTICE.md) 注明来源与许可，且许可需与 GPL-3.0 兼容。
- Mineradio 名称、MR Logo、界面视觉设计与原创视觉表达归原作者所有；贡献代码不改变这部分归属。
- **GPL-3.0 §5(a) 修改声明**：本仓库源文件不使用逐文件版权头，沿用此惯例即可。修改记录通过 **Git 提交历史 + [CHANGELOG.md](./CHANGELOG.md) 顶部条目**留存（包含改了什么、贡献者、日期），以此满足「标注修改者与日期」的要求。请在 PR 中同步更新 CHANGELOG。

### Developer Certificate of Origin (DCO)

请为每个 commit 附 `Signed-off-by` 行，声明你有权提交这份代码：

```
git commit -s -m "feat: ..."
```

会自动追加：`Signed-off-by: Your Name <your@email>`（需先配置 `git config user.name` / `user.email`）。

## 提交前必须遵守的硬性约定

这些来自项目长期约束（见 [AGENTS.md](./AGENTS.md)、[PRIVACY.md](./PRIVACY.md)），PR 评审会据此把关：

1. **不入库任何凭据 / 用户数据**。登录 cookie、Spotify token、Client ID、搜索历史、自定义封面/歌词等只存本机用户数据目录或本地存储，**绝不提交**。相关文件已在 `.gitignore` 中（`.cookie`、`.qq-cookie`、`.spotify-token`、`.spotify-config` 等）——不要移除这些条目。
2. **不内置、不共享第三方平台账号或应用凭据**。Spotify 走 **BYO Client ID + PKCE**，由用户自带，**仓库里不得出现任何真实 Client ID/Secret**（见 [docs/SPOTIFY_SETUP.md](./docs/SPOTIFY_SETUP.md)）。
3. **不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力**。第三方平台接入仅用于个人学习与用户自有账号的本地播放辅助。
4. **不破坏既有视觉质感**。不要随意重写 `public/index.html` 的大块视觉系统（粒子、歌词舞台、3D 歌单架、玻璃 SVG 质感），不要动电影镜头视觉系统，除非该改动正是 PR 的目标且已说明。性能优化不得牺牲既有质感，也不得做成「一次性渲染全部内容」。
5. **CHANGELOG 中文优先、写在顶部**。

## 开发与自测

从仓库根目录：

```powershell
npm install
npm start                 # Electron 桌面版本地运行
node --check server.js    # 语法检查（改了 server.js 必跑）
git diff --check          # 检查行尾/空白问题
npm run build:win:dir     # 仅打目录，验证打包/afterPack 钩子
npm run build:win         # 生成 NSIS 安装包（产物在 dist/）
```

没有独立的 `npm test`。改动后请至少：

- 对改过的 JS（`server.js`、`desktop/main.js`、`build/*.js`）跑 `node --check`；
- 用真实 Electron 或浏览器手测受影响的关键交互；
- `git diff --check` 通过。

## 代码风格

- **跟随上下文**：匹配周边代码的命名、缩进、注释密度与写法，不要引入新风格或大规模重排无关代码。
- **注释用中文**，解释「为什么」而非复述「做了什么」，与现有注释一致。
- 前端主逻辑集中在 `public/index.html`；后端音乐源/API 在 `server.js`；Electron 主进程在 `desktop/main.js`；打包资源在 `build/`。
- 改动尽量小而聚焦，一个 PR 只做一件事。

## 提交 PR 的流程

1. **Fork** `https://github.com/XxHuberrr/Mineradio` 到你自己的账号。
2. 从最新 `main` 切出特性分支，命名形如 `feature/xxx` 或 `fix/xxx`。
3. 完成改动，按上文自测，更新 `CHANGELOG.md` 顶部、必要时更新 `README.md` / `NOTICE.md` / `docs/`。
4. commit 用清晰的前缀：`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`，并 `-s` 附 DCO sign-off。
5. push 到你的 fork，向上游 `XxHuberrr/Mineradio` 的 `main` 开 PR，按模板填写说明与自测情况。
6. 回应评审意见；合并方式由维护者决定。

## PR 自查清单

- [ ] 没有提交任何凭据、token、Client ID/Secret、cookie 或用户数据
- [ ] 没有内置/共享第三方平台应用凭据（Spotify 仍为 BYO Client ID）
- [ ] 没有引入绕过付费/会员/音质保护或重分发内容的能力
- [ ] 新引入的第三方依赖与许可已写入 `NOTICE.md`，且许可与 GPL-3.0 兼容
- [ ] `node --check` 通过，`git diff --check` 干净
- [ ] 已手测受影响的关键交互，未破坏既有视觉质感
- [ ] 已更新 `CHANGELOG.md`（中文、置顶），必要文档已同步
- [ ] commit 已 `Signed-off-by`（DCO）
