# macOS 尝鲜构建说明

Mineradio 当前正式下载入口仍以 Windows 安装包为主。macOS 支持处于开发者/尝鲜阶段，适合愿意从源码运行或本地构建 `.app` 的用户。

## 开发模式

```bash
npm install
npm start
```

`npm start` 会启动 Electron 窗口和本地 Node 服务。浏览器中的 `http://localhost:3000` 只在这个服务运行时可访问，并不是线上网页。

## 构建本地 App

```bash
npm install
npm run build:mac:dir
open dist/mac*/Mineradio.app
```

生成的 `.app` 是本机未签名构建，不等同于官方发布包。macOS 构建会使用系统左上角红黄绿窗口按钮；首次打开时，如果 macOS 安全设置拦截，可以在系统设置的隐私与安全性页面中允许本机生成的应用继续打开。

## 关闭和重新打开

- 开发模式：在运行 `npm start` 的终端按 `Ctrl+C`。
- 本地 `.app`：像普通 macOS 应用一样退出 Mineradio。
- 如果 `localhost:3000` 打不开，通常说明本地服务没有运行。

## 后续发布路径

后续可以在维护者认可后补充 `.dmg`/`.zip` Release 资产、SHA256 校验、未签名提示，并在具备证书时接入签名和 notarization。
