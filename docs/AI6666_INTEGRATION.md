# AI6666 音乐接入

Mineradio 通过 AI6666 官方 `/ai6api/music/` API 读取当前账号已有的歌曲，不参与生成流程。接入覆盖账号验证、我的歌曲、我的收藏、搜索、详情、播放、歌词和收藏写回。

## 用户使用

1. 打开 Mineradio 的账号面板，选择 `AI6666`。
2. 在 [AI6666 API 页面](https://ai6666.com/accounts/api/) 创建或复制 API Key。
3. 将形如 `hh_your_api_key` 的 Key 粘贴到输入框，点击“保存并验证”。
4. 验证成功后，左侧歌单目录会出现“AI6666 · 我的歌曲”和“AI6666 · 我的收藏”；搜索栏会出现 `AI` 页签。

账号面板显示连接状态和 credits，但不会显示、回传或记录 Key。点击“清除 AI6666 API Key”会删除本机凭据并清空 AI6666 曲库状态。

## 已接入能力

- 两个虚拟歌单：`mine`（我的歌曲）和 `favorites`（我的收藏）。
- 歌名搜索和完整分页；上游每页不超过 50 条，Mineradio 在本地组合跨页窗口。
- 标题、作者、作者头像、封面、时长、标签、生成模型、创建时间、播放量、评分和收藏状态。
- 播放前按歌曲 ID 重新读取详情，使用最新 `playable_url`。
- 普通播放使用上游 MP3；用户选择无损时，仅在歌曲已经 `wav_ready` 且账号已有 `has_wav_access` 时使用现成 `wav_url`。不会为播放发起 WAV 导出。
- 歌词按 `lrc_synced`（逐字）→ `lrc_lines`（逐行）→ `lyrics`（纯文本估时）的顺序降级，并复用现有歌词缓存、舞台和桌面歌词。
- 红心按钮调用官方收藏切换接口，并以服务端返回状态校正界面；请求携带期望状态时，后端先检查当前状态以保证幂等。
- 搜索、队列快照、重启恢复、自定义封面/歌词、播放统计和歌单分页均使用独立的 `ai6666:<id>` 命名空间。

AI6666 曲目不会参与手动或自动跨平台换源。这样既保留生成曲目的身份，也避免将私人曲名发送到其他音乐平台搜索。

## 凭据与隐私

Key 默认保存在 Electron `userData/.ai6666-credentials.json`。适配器以临时文件写入后原子替换，并在支持 POSIX 权限的平台设置 `0600`。可通过以下环境变量覆盖：

- `AI6666_API_KEY`：只从进程环境读取，不写文件。
- `AI6666_CONFIG_FILE`：覆盖凭据文件路径。
- `AI6666_API_BASE`：覆盖上游地址，主要用于测试。
- `MINERADIO_AI6666_*`：上述变量的兼容前缀版本。

安全边界：

- HTTP 状态 DTO 永远不包含 Key；公开错误只返回固定错误码和安全提示。
- AI6666 本地路由只接受 loopback 连接和可信的本机 HTTP Origin/Referer。
- 配置路由受 Mineradio 登录彩蛋门禁保护。
- Electron 首次凭据重置、重播重置和“退出全部账号”都会删除该文件及迁移副本。
- AI6666 凭据不接入“导出登录 Cookie”功能。
- `.gitignore` 已忽略凭据文件；测试只使用临时目录和假 Key。

由于 Key 曾通过聊天渠道传递，建议完成接入后在 AI6666 后台轮换一次。

## API 契约

所有上游请求使用：

```http
Authorization: Bearer hh_your_api_key
Accept: application/json
```

| 用途 | 上游请求 | Mineradio 本地路由 |
| --- | --- | --- |
| 验证和 credits | `GET /ai6api/music/credits` | `GET /api/ai6666/status` |
| 保存 Key | — | `POST /api/ai6666/config` |
| 清除 Key | — | `POST /api/ai6666/logout` |
| 两个虚拟歌单 | 两次 `GET /ai6api/music/my-songs` | `GET /api/ai6666/user/playlists` |
| 歌单分页 | `GET /ai6api/music/my-songs?tab=...` | `GET /api/ai6666/playlist/tracks` |
| 曲库搜索 | `GET /ai6api/music/my-songs?q=...` | `GET /api/ai6666/search` |
| 首页最新创作 | `GET /ai6api/music/my-songs?tab=mine` | `GET /api/ai6666/recommendations` |
| 单曲详情 | `GET /ai6api/music/song/{song_id}` | `GET /api/ai6666/song/detail` |
| 播放地址 | `GET /ai6api/music/song/{song_id}` | `GET /api/ai6666/song/url` |
| 歌词 | `GET /ai6api/music/song/{song_id}` | `GET /api/ai6666/lyric` |
| 收藏切换 | `POST /ai6api/music/song/{song_id}/favorite` | `POST /api/ai6666/song/favorite` |

列表参数：`tab=mine|favorites`、`page>=1`、`1<=page_size<=50`、可选 `q`。本地歌单和搜索路由对前端提供 `offset`/`limit`，适配器负责换算并合并上游页。

## 明确禁止的运行时调用

正常配置、浏览、搜索、播放、歌词和收藏路径只允许使用上表中的四类上游端点。运行时代码与测试守卫禁止接入：

- 音乐生成或任务创建；
- WAV 导出；
- stem/basic/pro 分轨；
- MP3、封面、LRC 下载端点；
- 任何其他可能消耗额度的生成或导出接口。

歌曲详情返回的 `generation`、`stem_*` 或 `wav_*` 字段只是元信息；读取字段不等于调用对应功能。

## 错误与重试

- 未配置：`AI6666_API_KEY_REQUIRED`（401）。
- Key 无效或过期：`AI6666_AUTH_REQUIRED`（401/403）；新 Key 验证失败时不会保留无效凭据。
- 超时：`AI6666_TIMEOUT`（504）。
- 网络错误：`AI6666_NETWORK_ERROR`（502）。
- 429 或 5xx：只读 GET 最多自动重试一次，并尊重受限的 `Retry-After`；写请求绝不自动重试。
- 非 JSON、响应过大和无播放 URL 均返回显式的安全错误或不可播放状态。

故障排查：

- 列表为空：确认账号下存在 `mine`/`favorites` 内容，并清空搜索词重试。
- 401/403：重新复制完整 Key；若 Key 曾泄露，请先在 AI6666 后台轮换。
- 无法播放：刷新账号状态后重试。MP3 无需 WAV 就绪；选择 WAV 时若当前歌曲没有现成访问权限，会安全降级到 MP3。
- 歌词只有整行：该歌曲可能没有逐字数据；逐行或纯文本降级是预期行为。
- 收藏失败：确认账号连接有效；写请求不会自动重放，可安全手动重试。

## 开发与验证

核心实现位于：

- `ai6666-api.js`：凭据、HTTPS、重试、分页、映射、URL、歌词和收藏适配。
- `server.js`：本地可信路由、能力声明和公开错误边界。
- `desktop/main.js`：稳定 `userData` 路径与安全迁移。
- `public/js/modules/`：账号、搜索、歌单、播放、歌词、队列和收藏 UI。

验收命令：

```powershell
npm test
npm run check
node --test tests/ai6666-api.test.js tests/ai6666-integration.test.js
```

单元测试模拟 `https.request`，不会请求真实 AI6666 服务，也不会使用真实 Key。`ai6666-integration.test.js` 同时锁定前端 provider 触点、私有曲目不跨平台换源、凭据隔离和禁用端点规则。
