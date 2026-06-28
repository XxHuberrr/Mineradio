# Spotify 接入说明（自带 Client ID）

Mineradio 的 Spotify 支持采用 **BYO（Bring Your Own）Client ID** 模式：每位用户在 Spotify 开发者后台创建自己的应用，把自己的 **Client ID** 填进 Mineradio。

软件**不内置、也不共享任何 Client ID**，原因有两点：

- **合规**：Spotify 开发者条款要求每个集成方使用自己的应用凭据，不允许在第三方之间共享。
- **配额**：Spotify 默认的 Development Mode 单应用只能授权 25 个用户；如果全网共用一个 Client ID 会迅速触顶。每人用自己的应用就各自独立、互不挤占。

> 这套思路和 Lyricify 等社区项目一致：与其求一个大配额，不如让每个用户自带凭据。

## 一、前置条件

- 一个 **Spotify Premium** 账号。Spotify Web Playback SDK（整曲在 app 内播放）**只对 Premium 开放**；免费账号无法整曲播放。
- 能正常访问 `accounts.spotify.com` 与 `api.spotify.com`。

## 二、创建你自己的 Spotify 应用

1. 打开 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 并登录。
2. 点击 **Create app**。
3. 填写：
   - **App name / App description**：随意，例如 `My Mineradio`。
   - **Redirect URI**：**必须精确填写**

     ```
     http://127.0.0.1:8888/callback
     ```

     一个字符都不能差（协议、`127.0.0.1`、端口 `8888`、路径 `/callback`）。这是 Mineradio 本地回调地址，Spotify 只会把登录结果回调到这里。
   - **Which API/SDKs are you planning to use?**：勾选 **Web API** 与 **Web Playback SDK**。
4. 同意条款并保存。
5. 进入应用的 **Settings**，复制 **Client ID**。

> **不需要 Client Secret。** Mineradio 走 Authorization Code with **PKCE** 流程，只用 Client ID，不在客户端保存任何 secret。

## 三、在 Mineradio 里填入 Client ID

1. 打开 Mineradio，进入登录区域，选择 **Spotify**。
2. 在 **Client ID** 输入框粘贴你刚复制的 Client ID。
3. 如果需要核对，点登录面板里 Redirect URI 旁的「复制」，确认它和你在 Dashboard 填的完全一致。
4. 点 **保存 Client ID**。
5. 点登录，按浏览器提示完成 Spotify 授权，回到 Mineradio 即登录成功。

填入的 Client ID 保存在本机用户数据目录（桌面版为 Electron `userData` 下的 `.spotify-config`），**不会进入仓库、不会上传任何服务器**。换 Client ID 时旧的登录态与 PKCE 临时态会一并清除。

## 四、登录后能用什么

- Spotify 搜索、歌单读取（私有 / 协作歌单）。
- Web Playback SDK 整曲播放（需 Premium）。
- 多平台并排：和网易云、QQ 音乐同时登录后，右上角账号区可并排展示三家；首页「我的歌单」会把**最近播放那首歌的来源**对应的歌单分组顶到最上面。

申请的 Scope：`streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative`。

## 五、自行打包发布时的证书（VMP 签名）说明

仅**自己运行源码**或**为自己安装**时无需关心本节；只有当你要把构建产物**打包分发给别人**时才需要。

Spotify Web Playback SDK 在 app 内解码，依赖 Widevine。castLabs Electron 随包的是**开发签名**，Spotify 生产授权服务器会拒绝它（表现为播放几秒就没声音）。要让下载用户能整曲播放，发布包必须带 **EVS 生产 VMP 签名**：

- 打包钩子 `build/after-pack.js` 会在 rcedit 改写 exe **之后**自动调用
  `python -m castlabs_evs.vmp -n sign-pkg <appOutDir>` 完成生产签名，并写出 `Mineradio.exe.sig`。
- 需要先用自己的 castLabs 账号 `python -m castlabs_evs.account` 登录一次（凭据会缓存）。打包脚本一律用 `-n` 非交互模式，**绝不在脚本里输入密码**。
- 环境变量开关：`SKIP_VMP_SIGN`（跳过签名）、`MINERADIO_REQUIRE_VMP`（签名失败即让构建失败）、`EVS_PYTHON`（指定 python 路径）。

EVS 是 castLabs 提供的**免费**生产 VMP 签名服务，签名内容绑定二进制、与机器/用户无关，可随发布包分发。需要付费认证的只有「魔改过的 Chromium/Electron 内核」，本项目使用官方 `castlabs/electron-releases` 原样 drop-in，不在此列。**真正需要你自己评估的再分发边界是 Spotify 开发者条款**（第三方应用内整曲播放），而非签名证书本身。

## 常见问题

- **登录回调失败 / 卡在浏览器**：99% 是 Redirect URI 没填成 `http://127.0.0.1:8888/callback`。回 Dashboard 改正后重试。
- **能登录但放不了整曲**：确认是 Premium 账号；自行分发的包还要确认已做 EVS 生产签名。
- **想换 Client ID**：重新填入并保存即可，旧登录态会自动清除。
- **端口冲突**：默认回调端口 `8888`。如需改动，需同时调整环境变量 `SPOTIFY_REDIRECT_PORT` 和 Dashboard 里的 Redirect URI（两边端口必须一致）。
