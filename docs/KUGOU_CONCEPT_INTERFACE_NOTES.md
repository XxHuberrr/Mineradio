# KuGou Concept Interface Notes

## Current Scope

This fork is adding KuGou Concept (`platform: lite`) support in small steps.

Implemented in `server.js`:

- `GET /api/kugou/login/status`
- `GET /api/kugou/login/qr/key`
- `GET /api/kugou/login/qr/create?key=...`
- `GET /api/kugou/login/qr/check?key=...`
- `POST /api/kugou/login/cookie`
- `GET /api/kugou/logout`

Implemented in `public/index.html`:

- Login modal tab for KuGou Concept.
- QR image loading through `/api/kugou/login/qr/key`.
- QR status polling through `/api/kugou/login/qr/check`.
- Account modal display and logout for KuGou Concept.

The QR check route saves `userid` and `token` into the local KuGou cookie file after status `4`, but does not return the token to the frontend response.

## Reference Sources

- EchoMusic frontend login flow:
  - `src/renderer/views/Login.vue`
  - `src/renderer/api/user.ts`
- EchoMusic request/auth handling:
  - `src/renderer/utils/request.ts`
- KuGouMusicApi modules:
  - `module/login_qr_key.js`
  - `module/login_qr_create.js`
  - `module/login_qr_check.js`
  - `util/request.js`
  - `util/helper.js`
  - `util/config.json`

## Notes

- KuGou Concept uses `liteAppid = 3116` and `liteClientver = 11440`.
- QR key creation still uses `appid = 1001`, matching KuGouMusicApi behavior, while the QR page and check route use the lite app id.
- KuGou login requests need signed params, including `dfid`, `mid`, `uuid`, `clientver`, and `clienttime`.
- `.kugou-cookie` is local private state and must stay ignored by Git.
- This integration must not bypass VIP, paid music, copyright, region, or platform restrictions.

## Next Steps

- Wire the login UI to the new KuGou routes.
- Add KuGou search, playlist, lyric, privilege, and song URL routes after login state is stable.
- Keep provider logic separate instead of forcing KuGou into existing Netease/QQ branches.
