# NOTICE

Mineradio 使用了以下第三方项目或服务。各项目版权归其原作者所有。

## Third-party Libraries

- Electron（桌面运行时使用 castLabs `electron-releases` 构建以支持 Widevine）
- Three.js
- GSAP
- music-tempo
- NeteaseCloudMusicApi
- mpg123-decoder
- Spotify Web Playback SDK（运行时由 Spotify 远程加载，用于 Premium 账号整曲播放）

## Third-party Tooling

- castLabs EVS（Electron Versioning System）：用于对发布包做生产 VMP 签名，使 Widevine 可用。签名由发布者使用自有 castLabs 账号生成，仓库中不包含任何 EVS 凭据。

## Third-party Services

Mineradio 可能与网易云音乐、QQ 音乐、Spotify 等第三方音乐服务进行用户自有账号相关的本地客户端交互。

Spotify 接入采用 BYO（Bring Your Own）Client ID 模式：由用户在 Spotify 开发者后台创建自有应用并填入自己的 Client ID（Authorization Code with PKCE，不使用 Client Secret）。仓库不内置、不共享任何 Client ID/Secret。使用 Spotify 接入需遵守 Spotify 开发者条款。

Mineradio 不是任何音乐平台的官方客户端，也不隶属于网易云音乐、QQ 音乐、腾讯音乐娱乐集团或 Spotify。请用户自行遵守对应平台的服务协议、版权规则和会员权益规则。

## Original Design

Mineradio 名称、MR Logo、界面视觉设计、启动动画方向、粒子视觉体验和电影镜头系统的产品表达属于作者原创设计。

emily 作为 Mineradio 早期视觉底层想法与 `emily` 视觉预设改进方向的共创者和灵感来源之一，特此致谢。

感谢小天才e宝、应春日、锋将军、軌跡、林中、骊、风痕、花椰菜🥦在早期体验、测试反馈和发布准备中的帮助。
