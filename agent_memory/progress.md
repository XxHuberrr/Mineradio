# 当前任务进展

## 任务目标

- 在已完成酷狗概念版扫码登录的基础上，继续补齐酷狗歌单、播放、收藏和歌词体验。

## 当前阶段

- 已接入酷狗个人歌单和歌单歌曲列表。
- 已提高酷狗已登录时综合搜索里 KG 结果的排序权重，降低误点网易云或 QQ 结果的概率。
- 已接入酷狗歌曲收藏到酷狗歌单的前后端链路。
- 已接入酷狗新建歌单链路，收藏弹窗可在酷狗歌曲场景中新建酷狗歌单。
- 已修复酷狗新建歌单和收藏写入失败问题：`cloudlist.service` 写接口已与 EchoMusic 对齐，不再额外携带 `x-router` 请求头。
- 已接入酷狗红心喜欢链路，心形按钮会写入酷狗“我喜欢”歌单。
- 已修复酷狗歌单详情和播放队列里的红心状态同步，酷狗“我喜欢”等歌单打开后会重新同步心形按钮。
- 已接入酷狗歌词查询，优先使用可返回 `id/accesskey` 的 `https://lyrics.kugou.com/search`，再下载 LRC/KRC。
- 本地服务已重启，运行在 `http://127.0.0.1:3000`。

## 已完成

- fork 并克隆原版 Mineradio。
- 添加酷狗概念版登录后端路由和登录 UI。
- 添加 `/api/kugou/search` 和 `/api/kugou/song/url`。
- 前端 `All` 搜索合并网易云、QQ、酷狗结果，并新增 `KG` 搜索模式。
- 添加 `/api/kugou/user/playlists` 和 `/api/kugou/playlist/tracks`。
- 前端个人歌单列表、歌单详情、歌单播放队列、3D 歌单架均已支持酷狗歌单。
- 添加 `/api/kugou/lyric`，前端酷狗歌曲歌词请求不再误走网易云歌词接口。
- 添加 `/api/kugou/playlist/add-song`，前端收藏弹窗会按平台筛选可写歌单，酷狗歌曲只显示酷狗歌单。
- 添加 `/api/kugou/playlist/create`，前端酷狗收藏弹窗会把新建歌单请求发到酷狗路由。
- 添加 `/api/kugou/song/like` 和 `/api/kugou/song/like/check`，前端 KG 心形按钮不再提示“待接口接入”。
- 酷狗“我喜欢”列表拉取已改为单页最多 200、超过时分页获取，避免 `pagesize=500` 返回空导致红心状态误判。

## 下一步

- 若用户反馈某一首歌仍提示无权限，需要记录具体歌名、来源标签和播放品质，再继续定位酷狗单曲权限接口。
- 后续可继续接酷狗会员详情等账号库能力。
- 酷狗真实写入已用用户提到的 `测试` 歌单验证：若不存在则创建，随后添加一首酷狗歌曲并重新读取确认存在。

## 验证记录

- `node --check server.js` 通过，后端语法正常。
- `node scripts\verify-kugou-login-ui.js` 通过。
- `node scripts\verify-kugou-search-playback.js` 通过。
- `node scripts\verify-kugou-playlists-priority.js` 通过。
- `node scripts\verify-kugou-collect-lyrics.js` 通过。
- `node scripts\verify-kugou-like-wiring.js` 通过。
- `node scripts\verify-kugou-playlist-like-sync.js` 通过。
- `node scripts\verify-kugou-playlist-create.js` 通过。
- `git diff --check` 通过，未发现空白格式问题。
- 前端内联脚本解析通过：`checked 2 inline scripts`。
- 浏览器检查通过：酷狗已登录，前端拿到 4 个酷狗歌单，页面有 4 张酷狗歌单卡片，无 console error。
- 浏览器页面级检查通过：酷狗收藏弹窗中 `.collect-create` 显示为 `flex`，说明酷狗场景会显示新建歌单输入框，无 console error。
- 真实接口验证：`/api/kugou/user/playlists` 返回 4 个歌单；其中第 2 和第 4 个歌单能返回酷狗歌曲。
- 真实播放验证：从酷狗歌单取到的歌曲调用 `/api/kugou/song/url` 返回 `loggedIn=true`、`playable=true`、`hasUrl=true`；搜索“许嵩”抽样 10 首酷狗结果，本轮 10 首都能返回播放地址。
- 真实歌词验证：公开酷狗歌曲返回 `source=kugou-lrc`、`candidates=19`、歌词长度 2006；用户酷狗歌单歌曲返回 `source=kugou-lrc`、`candidates=17`、歌词长度 1855。
- 收藏接口验证：只做了缺参数的非写入验证，`/api/kugou/playlist/add-song` 返回结构化 400；未自动向用户真实歌单写入歌曲。
- 红心状态验证：`/api/kugou/playlist/tracks?id=2&limit=500` 返回 409 首；用“我喜欢”歌单第一首调用 `/api/kugou/song/like/check` 返回 `liked=true`。
- 红心写入验证：只做了缺参数的非写入验证，`/api/kugou/song/like` 返回结构化 400；未自动向用户真实“我喜欢”歌单新增歌曲。
- 新建歌单接口验证：缺名称的非写入验证返回结构化 400 和 `Missing KuGou playlist name`；真实写入验证创建了 `测试` 歌单，返回 `id=5`。
- 收藏写入验证：真实写入验证把 `许嵩 - 一见如故` 添加到酷狗 `测试` 歌单，重新拉取 `/api/kugou/playlist/tracks?id=5` 返回 1 首且能匹配到该歌曲。
