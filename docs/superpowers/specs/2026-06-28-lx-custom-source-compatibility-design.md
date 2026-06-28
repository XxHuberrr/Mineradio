# Mineradio 洛雪自定义音源兼容设计

日期：2026-06-28  
状态：用户已确认设计，待编写实施计划

## 1. 目标

Mineradio 支持直接导入现有洛雪音乐桌面版 `.js` 自定义音源脚本。脚本不需要为 Mineradio 修改，即可为 Mineradio 已有的网易云、QQ 音乐搜索结果解析播放 URL。

本功能只兼容洛雪的“自定义音源”子系统，不复制洛雪的搜索、账号、歌单、下载或界面。Mineradio 继续负责搜索、账号、歌单、播放队列、歌词舞台和音频可视化。

兼容基线是洛雪音乐桌面版在 2026-06-28 的公开自定义源协议：

- `globalThis.lx.version = '2.0.0'`
- `globalThis.lx.env = 'desktop'`
- 事件：`request`、`inited`、`updateAlert`
- 平台键：`kw`、`kg`、`tx`、`wy`、`mg`、`local`
- 动作：`musicUrl`；`local` 额外允许 `lyric`、`pic`
- 音质：`128k`、`320k`、`flac`、`flac24bit`

## 2. 非目标

- 不让洛雪脚本提供搜索、账号登录、用户歌单或评论。
- 不把第三方脚本打包进 Mineradio、提交到 Git 或随安装包分发。
- 不绕过会员权益、DRM、付费限制或平台授权。
- 不保证失效、私有或依赖非标准 Node API 的脚本可运行。
- 不在第一版新增酷我、酷狗、咪咕搜索；只有 Mineradio 能生成相应平台歌曲信息后，才能向脚本请求这些平台的 URL。

## 3. 方案选择

### 采用：兼容宿主层

Mineradio 实现洛雪公开的 `globalThis.lx` 宿主 API，在独立、受限的 Electron 渲染环境运行原始脚本。

优点：

- 现有洛雪脚本无需转换。
- 行为和错误模型最接近洛雪。
- 宿主 API 与 Mineradio 内部代码解耦，后续可跟进协议变化。

### 不采用：导入时转换脚本

静态转换无法可靠处理闭包、动态属性、混淆代码和运行时事件注册，兼容性不足。

### 不采用：在 Node/Electron 主进程直接执行

直接执行会让脚本接触 `require`、`process`、文件系统、账号 Cookie 和 Electron IPC，无法接受。

## 4. 总体架构

新增四个边界清晰的组件：

1. `CustomSourceStore`
   - 导入并解析脚本头部元数据。
   - 保存脚本、启用状态、更新提醒状态和最近一次初始化结果。
   - 一次只允许启用一个脚本，与洛雪行为一致。

2. `LxSourceHost`
   - 创建和销毁隔离的脚本运行环境。
   - 向脚本暴露兼容的 `globalThis.lx`。
   - 负责 `inited`、`request`、`updateAlert` 事件和请求生命周期。

3. `LxMusicInfoAdapter`
   - 把 Mineradio 歌曲对象转换为洛雪当前的 `MusicInfo` 结构。
   - 把 Mineradio 平台键映射为洛雪平台键。
   - 不在适配器内发网络请求或决定播放策略。

4. `PlaybackResolver`
   - 统一处理音质选择、脚本 URL 请求、响应校验、取消、超时和现有播放器回退。
   - 保证自定义源被禁用时，当前网易云/QQ 播放路径不受影响。

前端设置页面只管理脚本和展示状态；脚本执行、HTTP 请求、敏感信息过滤和播放解析均留在 Electron 主进程侧。

## 5. 洛雪宿主 API 兼容

### 5.1 脚本元数据

导入文件必须以块注释开头。解析以下字段，并使用洛雪相同的最大长度：

- `@name`：24
- `@description`：36
- `@author`：56
- `@homepage`：1024
- `@version`：36

缺少 `@name` 时生成本地名称。完全相同的脚本不得重复导入。

### 5.2 `globalThis.lx`

暴露：

- `version`
- `env`
- `currentScriptInfo`
- `EVENT_NAMES`
- `request`
- `on`
- `send`
- `utils.buffer`
- `utils.crypto`
- `utils.zlib`

`currentScriptInfo` 包含 `name`、`description`、`version`、`author`、`homepage`、`rawScript`。

`utils` 与洛雪桌面版 2.0.0 对齐：

- `buffer.from`
- `buffer.bufToString`
- `crypto.aesEncrypt`
- `crypto.rsaEncrypt`
- `crypto.randomBytes`
- `crypto.md5`
- `zlib.inflate`
- `zlib.deflate`

### 5.3 初始化

脚本必须调用：

```js
lx.send(lx.EVENT_NAMES.inited, {
  openDevTools: false,
  sources: {}
})
```

宿主只接受 `type: 'music'`。每个平台声明的动作和音质与洛雪允许列表取交集，未知字段被忽略。

初始化超时为 10 秒。初始化前发生同步错误或未处理的 Promise 拒绝，均记为初始化失败。失败脚本不会成为活动音源。

`openDevTools` 只在 Mineradio 开发模式生效，正式安装版忽略该请求。

### 5.4 请求

脚本通过 `lx.on(EVENT_NAMES.request, handler)` 注册一个请求处理器。宿主发送：

```js
{
  source,
  action: 'musicUrl',
  info: {
    type,
    musicInfo
  }
}
```

处理器必须返回 Promise。`musicUrl` 响应必须是长度不超过 2048 的 HTTP/HTTPS URL。

保留 `local` 的 `lyric` 和 `pic` 协议兼容能力，但第一版 Mineradio 界面不承诺为在线网易云/QQ歌曲调用这两个动作，因为洛雪公开协议只允许非 `local` 平台声明 `musicUrl`。

### 5.5 HTTP 请求

`lx.request` 支持洛雪公开参数：

- `method`
- `headers`
- `body`
- `form`
- `formData`
- `timeout`

回调收到 `(err, response, body)`。`response` 包含 `statusCode`、`statusMessage`、`headers`、`bytes`、`raw`、`body`。JSON 响应尽量解析为对象，否则保留文本。

请求仅允许 HTTP/HTTPS，单次超时上限 60 秒，并返回可取消函数。脚本运行环境本身不直接联网，所有请求经过主进程代理执行。

### 5.6 更新提醒

每次脚本运行最多发送一次 `updateAlert`。更新日志最长 1024 字符，更新地址只接受 HTTP/HTTPS。

用户可以对每个脚本关闭更新提醒。Mineradio 只显示提醒和打开网页，不自动下载或替换脚本。

## 6. 歌曲对象映射

Mineradio 平台映射：

| Mineradio | 洛雪 |
| --- | --- |
| `netease` | `wy` |
| `qq` | `tx` |

适配后对象遵循洛雪当前 `MusicInfo` 结构：

```js
{
  id,
  name,
  singer,
  source,
  interval,
  meta: {
    songId,
    albumName,
    albumId,
    picUrl,
    qualitys,
    _qualitys
  }
}
```

QQ 的 `meta` 额外包含：

- `strMediaMid`
- `id`
- `albumMid`

适配器使用 Mineradio 搜索结果已有的网易云歌曲 ID、QQ `songmid`、`media_mid`、专辑 MID、名称、歌手、专辑、封面和时长。缺少非必要字段时使用洛雪可接受的空值；缺少平台歌曲主 ID 时，不向脚本发送不可用请求。

为了兼容仍按旧文档读取平铺字段的存量脚本，第一版同时提供只读别名：

- `songmid`
- `albumId`
- `strMediaMid`
- `copyrightId`
- `hash`

这些别名来自 `meta`，不改变当前洛雪嵌套结构。

## 7. 播放行为

启用自定义源后：

1. 判断活动脚本是否声明支持当前歌曲平台和目标音质。
2. 选择不高于用户目标、且脚本声明支持的最高音质。
3. 请求 `musicUrl`。
4. 校验 URL 后交给 Mineradio 现有音频代理和播放器。
5. 播放器继续驱动歌词、节奏分析、电影镜头和 3D 歌单架，不让脚本接触这些模块。

自定义源是活动播放 URL 提供者，不与内置接口同时竞速。脚本对当前平台不支持、请求失败或 URL 无法播放时，进入 Mineradio 现有自动换源流程，查找同名同歌手的另一平台歌曲；若活动脚本支持该平台，再次通过脚本解析。

只有所有脚本支持的平台均失败后，才显示播放失败。禁用自定义源时，完全恢复当前内置网易云/QQ URL 获取路径。

切歌或用户再次发起播放时，取消上一首尚未完成的脚本请求，过期响应不得覆盖当前歌曲。

## 8. 隔离与安全

脚本在专用、隐藏、沙箱化 Electron 渲染环境运行：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- 禁止窗口打开、导航、下载、权限申请和任意 Electron IPC
- 只通过专用 preload 暴露 `globalThis.lx`

主播放器页面不执行音源脚本。脚本无法读取 Mineradio DOM、账号 Cookie、用户歌单、本地文件、环境变量或系统命令。

`lx.request` 不自动附加 Mineradio 的网易云、QQ 或更新服务 Cookie，也不继承播放器登录 Session。请求与响应日志在落盘前遮盖：

- `Cookie`
- `Set-Cookie`
- `Authorization`
- `Proxy-Authorization`
- 名称包含 `token`、`secret`、`key` 的敏感头和值

脚本导入时明确提示：第三方脚本可以把它自己收到的歌曲信息发送到网络。用户确认后才保存并启用。

脚本保存在 Electron `userData` 下的独立自定义音源存储中，不进入项目目录、Git、快速补丁或安装包。

## 9. 设置与状态

在现有设置中新增“自定义音源”区域：

- 导入 `.js`
- 已导入脚本列表
- 名称、作者、版本和主页
- 启用/停用
- 删除
- 更新提醒开关
- 支持平台和音质
- 初始化状态与最近错误
- 开发模式下查看脱敏日志

列表允许保存多个脚本，但一次只有一个处于活动状态。启用另一个脚本时，先停止旧宿主，再启动新宿主；新脚本初始化失败则恢复旧脚本。

不新增独立搜索源按钮，不改变网易云/QQ 登录界面。

## 10. 错误处理

错误分为：

- `IMPORT_INVALID`：脚本格式或元数据无效
- `INIT_TIMEOUT`：10 秒内未发送 `inited`
- `INIT_FAILED`：初始化期间抛错
- `SOURCE_UNSUPPORTED`：脚本未声明当前平台
- `QUALITY_UNSUPPORTED`：无可用音质
- `REQUEST_TIMEOUT`：请求超过限制
- `REQUEST_CANCELLED`：切歌、停用或切换脚本
- `INVALID_RESPONSE`：返回类型、长度或协议无效
- `HTTP_FAILED`：`lx.request` 网络失败
- `PLAYBACK_FAILED`：URL 取得成功但播放器无法加载

用户提示使用简短中文；详细错误进入脱敏日志。取消请求不弹错误提示。

脚本更新采用先验证后替换：新脚本在临时宿主初始化成功后才覆盖旧版本；失败时保留旧版本和活动状态。

## 11. 验证策略

### 单元验证

- 元数据解析、长度限制、重复检测。
- Mineradio 到洛雪平台和 `MusicInfo` 映射。
- 平台、动作、音质交集。
- URL、歌词和封面响应校验。
- 敏感字段脱敏。
- 请求取消和过期响应丢弃。

### 宿主契约验证

使用本地测试脚本覆盖：

- `globalThis.lx` 全部公开字段。
- `inited` 成功、失败、重复调用和超时。
- `musicUrl` 各音质。
- `request` 的 body、form、formData、JSON、文本、取消和超时。
- AES、RSA、MD5、随机字节、Buffer、zlib。
- `updateAlert` 次数和长度限制。
- 尝试访问 `require`、`process`、文件系统和 Electron IPC 必须失败。

### Mineradio 集成验证

- 网易云 `wy` 和 QQ `tx` 搜索结果可传给兼容脚本。
- 自定义源启用时使用脚本 URL。
- 当前平台失败后按既有逻辑跨平台换源。
- 禁用脚本后恢复内置接口。
- 切歌不会被旧请求覆盖。
- 歌词、进度、音质、节奏分析和视觉系统不回退。
- 打包版首次启动不存在任何预装第三方脚本。

### 验收标准

选取至少三个公开可获得、符合洛雪 2.0.0 文档的现有 `.js` 音源脚本，在不修改脚本内容的前提下：

- 能成功导入并初始化；
- 能识别其声明的平台和音质；
- 对 Mineradio 网易云或 QQ 搜索结果至少完成一次有效 `musicUrl` 请求；
- 脚本失败不会拖死或污染主播放器；
- 卸载、快速补丁和 Git 状态均不包含用户脚本或脚本凭据。

若脚本依赖洛雪未公开的内部对象、Node 全局或已失效的远端服务，不计为宿主兼容失败，但必须给出可诊断错误。

## 12. 预计涉及文件

实施计划预计会新增独立音源宿主模块，并小范围修改：

- `desktop/main.js`
- `desktop/preload.js`
- `server.js`
- `public/index.html`
- `package.json`
- 新增的 `desktop/custom-source/` 模块
- 新增的契约测试脚本和测试夹具

不得继续把全部兼容实现堆入 `server.js` 或 `public/index.html`。
