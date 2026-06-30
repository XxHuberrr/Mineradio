# 当前任务进展

## 任务目标

- 在已完成酷狗概念版扫码登录的基础上，继续补齐酷狗歌单、播放、收藏和歌词体验。

## 当前阶段

- 已接入酷狗个人歌单和歌单歌曲列表。
- 已提高酷狗已登录时综合搜索里 KG 结果的排序权重，降低误点网易云或 QQ 结果的概率。
- 已接入酷狗歌曲收藏到酷狗歌单的前后端链路。
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

## 下一步

- 若用户反馈某一首歌仍提示无权限，需要记录具体歌名、来源标签和播放品质，再继续定位酷狗单曲权限接口。
- 后续可继续接酷狗红心、酷狗新建歌单、会员详情等账号库能力。

## 验证记录

- `node --check server.js` 通过，后端语法正常。
- `node scripts\verify-kugou-login-ui.js` 通过。
- `node scripts\verify-kugou-search-playback.js` 通过。
- `node scripts\verify-kugou-playlists-priority.js` 通过。
- `node scripts\verify-kugou-collect-lyrics.js` 通过。
- `git diff --check` 通过，未发现空白格式问题。
- 浏览器检查通过：酷狗已登录，前端拿到 4 个酷狗歌单，页面有 4 张酷狗歌单卡片，无 console error。
- 真实接口验证：`/api/kugou/user/playlists` 返回 4 个歌单；其中第 2 和第 4 个歌单能返回酷狗歌曲。
- 真实播放验证：从酷狗歌单取到的歌曲调用 `/api/kugou/song/url` 返回 `loggedIn=true`、`playable=true`、`hasUrl=true`。
- 真实歌词验证：公开酷狗歌曲返回 `source=kugou-lrc`、`candidates=19`、歌词长度 2006；用户酷狗歌单歌曲返回 `source=kugou-lrc`、`candidates=17`、歌词长度 1855。
- 收藏接口验证：只做了缺参数的非写入验证，`/api/kugou/playlist/add-song` 返回结构化 400；未自动向用户真实歌单写入歌曲。
