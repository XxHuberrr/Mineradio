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
- `GET /api/kugou/search?keywords=...&limit=...`
- `GET /api/kugou/song/url?hash=...&albumId=...&albumAudioId=...&quality=...`
- `GET /api/kugou/user/playlists`
- `GET /api/kugou/playlist/tracks?id=...`
- `GET /api/kugou/lyric?hash=...&albumAudioId=...`
- `POST /api/kugou/playlist/create`
- `POST /api/kugou/playlist/add-song`
- `GET /api/kugou/song/like/check?ids=...`
- `POST /api/kugou/song/like`

Implemented in `public/index.html`:

- Login modal tab for KuGou Concept.
- QR image loading through `/api/kugou/login/qr/key`.
- QR status polling through `/api/kugou/login/qr/check`.
- Account modal display and logout for KuGou Concept.
- Search mode tab `KG` for KuGou-only search.
- `All` search now merges Netease, QQ, and KuGou results.
- KuGou search results are playable through `/api/kugou/song/url`.
- User playlist panels, playlist detail panels, queue loading, and the 3D playlist shelf can load KuGou playlists.
- KuGou songs request lyrics through `/api/kugou/lyric` instead of falling back to Netease lyrics.
- KuGou collect actions write to KuGou playlists, and the collect modal can create a KuGou playlist before adding the current song.
- KuGou heart actions sync with the writable liked playlist instead of showing a placeholder message.

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
- KuGou Android API requests use the lite signature salt `LnT6xpN3khm36zse0QzvmgTZ3waWdRSA`.
- KuGou song URL requests also need a `key` generated from `hash`, lite sign-key salt, `appid`, `mid`, and `userid`.
- KuGou `cloudlist.service` write routes such as `add_list` and `add_song` should follow EchoMusic/KuGouMusicApi and avoid forcing an extra `x-router` header.
- The local cookie can contain display-only non-ASCII fields such as nickname. Outbound KuGou API `Cookie` headers must only include safe ASCII auth/device fields.
- `.kugou-cookie` is local private state and must stay ignored by Git.
- This integration must not bypass VIP, paid music, copyright, region, or platform restrictions.

## Next Steps

- Add a more trustworthy KuGou VIP/member-detail route if one can be verified.
- Keep write-route validation conservative because playlist creation, collect, and heart actions modify a real KuGou account.
- Keep provider logic separate instead of forcing KuGou into existing Netease/QQ branches.
