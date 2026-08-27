# Mineradio 阶段开发记录（2026-08-20）

## 本轮目标

1. 修复队列封面大量请求失败及重复请求问题。
2. 修复歌曲取链成功但播放进度停在 `0`、没有声音的问题。
3. 让 Highway Drive 夜空中的月球、火星、木星、土星、海王星、金星和水星真正显示在可见区域。

## 封面请求治理

### 根因

- AI6666 队列快照保存的是带有效期的 COS 签名地址，截图中的地址已经过期约 8 天。
- 队列每次重绘都会重新设置同一个失效 `src`。
- 原来的 `onerror` 只降低透明度，没有停止后续重复请求，也没有刷新签名地址。
- `/api/cover` 对成功和失败响应都设置一天缓存，可能缓存失败结果。

### 实现

- 使用歌曲稳定键合并 AI6666 封面刷新任务。
- 同一歌曲同时只允许一个详情刷新请求。
- 全局封面刷新并发限制为 `3`。
- 刷新失败后退避 `60s`，队列重绘不会绕过退避再次请求。
- COS 签名即将到期或已经过期时，不再加载旧地址，改为调用 `/api/ai6666/song/detail` 获取新封面。
- 多个刷新结果在 `80ms` 窗口内合并为一次队列重绘。
- 队列图片统一经过同源 `/api/cover` 代理，使用浏览器 HTTP 缓存。
- 成功的签名封面响应使用 `max-age=31536000, immutable`。
- 上游失败和代理异常使用 `Cache-Control: no-store`。

涉及文件：

- `public/js/modules/05-playback/01-cover-custom-map.js`
- `public/js/modules/06-lyrics/01-playlist-panel-shell.js`
- `server.js`
- `tests/cover-request-recovery.test.js`

## 播放卡死修复

### 现场诊断

- 网易云歌曲取链接口返回 `200`。
- `/api/audio` Range 请求返回 `206`。
- 媒体元素触发了 `playing`，并且 `readyState` 达到 `4`。
- 但复用旧 `Audio + MediaElementSource` 时，`currentTime` 始终停在 `0`。
- 播放看门狗随后判断为启动失败，清空音源，因此界面重新显示播放按钮。

### 实现

- 普通网络歌曲换歌时创建新的 `Audio` 生命周期。
- 本地歌曲换歌也使用新的媒体元素。
- 新媒体使用 `captureStream` 建立可视化分析支路，避免再次绑定已经冻结的 `MediaElementSource`。
- 专辑无缝衔接仍保留预加载媒体和现有交接流程，不进行强制替换。

涉及文件：

- `public/js/modules/05-playback/08-audio-graph-controls.js`
- `public/js/modules/05-playback/13-playback-start-audio.js`
- `public/js/modules/05-playback/14-player-controls.js`
- `tests/playback-audio-graph-recovery.test.js`

## Highway Drive 夜空

- 夜空按道路区域稳定轮换七种天体：月球、火星、木星、土星、海王星、金星和水星。
- 七种天体使用 Three.js `SphereGeometry`、本地等距柱状表面贴图和实时光照构成立体球体；土星额外使用 `RingGeometry` 与透明环纹理。
- 表面贴图来自 Solar System Scope 的 2K 天体纹理并缩放为 1024px 宽，按 CC BY 4.0 授权；来源和改动记录见 `public/assets/highway-planets/LICENSE.txt` 与根目录 `NOTICE.md`。
- 原天体坐标位于巨大天空平面的相机可视 UV 范围之外，因此状态正确但画面中不可见。
- 已将天体移动到相机实际可见的上中部，并调整尺寸，避免遮挡道路、播放控制器和右上账户区。
- 星空截图已能清晰看到土星及光环；极光截图已能看到金星。

涉及文件：

- `public/highway-drive-preset.js`
- `tests/highway-drive-preset.test.js`
- `scripts/check-highway-drive-live.js`

## 验收结果

- 当前 Electron 页面队列可见封面：`26`。
- 破损封面：`0`。
- 旧签名地址直接请求：`0`。
- 当前歌曲现场播放验证：`108.85s -> 113.00s`，媒体保持播放、无错误。
- 后续视觉检查时播放进度已到约 `189s`，仍未暂停。
- Highway Drive 六种天气、七天体轮换、桌面画布非空和场景状态检查通过。
- 完整自动化测试：`128/128 PASSED`。
- `git diff --check`：通过。

## 运行状态

- 客户端封面治理和播放修复已经在当前 Electron 页面重新加载并生效。
- 服务端新的长期签名缓存及失败 `no-store` 策略已通过临时端口实测。
- 临时测试服务 PID `29892` 已停止，并确认端口不再监听。
- 当前正在运行的 Mineradio 服务进程需要在下次应用重启后加载新的 `server.js` 缓存响应策略；本轮没有为了热更新服务端而中断用户当前播放。

## QA 产物

- `output/playwright/queue-cover-recovery.png`
- `output/playwright/highway-drive-stars.png`
- `output/playwright/highway-drive-aurora.png`
