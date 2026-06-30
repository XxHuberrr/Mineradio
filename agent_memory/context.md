# 项目上下文

## 项目目标

- 在 Mineradio fork 上逐步加入酷狗概念版能力，优先完成登录、搜索和播放地址链路。

## 架构与约定

- 项目是 Electron + Node.js 本地播放器。
- 后端入口是 `server.js`，本地 HTTP 服务为前端提供音乐平台接口。
- 前端主界面集中在 `public/index.html`。
- 酷狗概念版登录态保存在本地 `.kugou-cookie`，该文件必须保持 Git 忽略。

## 关键路径

- `server.js`
- `public/index.html`
- `docs/KUGOU_CONCEPT_INTERFACE_NOTES.md`
- `scripts/verify-kugou-login-ui.js`

## 当前有效假设

- 用户已经能通过酷狗概念版二维码扫码登录。
- 当前阶段只接入酷狗搜索和播放地址，不绕过会员、付费、版权或地区限制。
