# Mineradio

![Mineradio cinematic splash screen](./docs/assets/readme/cinema-beat-smoke.png)

Mineradio is an immersive Windows desktop music player that combines weather radio, search playback, a lyric stage, particle visuals, and a 3D playlist shelf into a private music space that feels closer to a live room than a flat playlist.

## Download The Windows Installer

| Download | Best For | Link |
| --- | --- | --- |
| Lanzou mirror | Users who need a faster China-friendly mirror | [Download Mineradio 1.1.1](https://xxhuber.lanzout.com/s/Mineradio) |
| GitHub Release | Users with stable GitHub access | [v1.1.1 Release](https://github.com/XxHuberrr/Mineradio/releases/tag/v1.1.1) |

Download and run `Mineradio-1.1.1-Setup.exe`. Do not download `Source code`, `.blockmap`, `latest.yml`, or use `win-unpacked` as the installer.

## If Windows Blocks The Download

Small unsigned Electron apps can trigger browser, Windows Defender, or SmartScreen warnings. First confirm that the installer came from the links above and that the filename is `Mineradio-1.1.1-Setup.exe`.

1. If your browser flags the download, open the downloads list, choose the `...` menu for the file, then choose the keep option.
2. If SmartScreen opens a blue warning dialog, choose `More info`, then `Run anyway`.
3. If antivirus software explicitly reports malware or quarantines the file, do not force-run it. Delete it, download again from the official links above, and report the issue with a screenshot.

## Support The Author

If Mineradio kept you listening for one more song, you are welcome to buy the author a coffee.

[Open the full support page](./docs/SUPPORT.md)

![Mineradio author support channels](./docs/assets/support/mineradio-author-support-poster.png)

## Current Version

Current version: `1.1.1`

Status: clean public installer release.

Security note: `v1.0.10` and older installers are no longer recommended for installation or redistribution. Quarantine old installers and use `Mineradio-1.1.1-Setup.exe` for a clean install.

## Features

- Open-Meteo weather radio that builds a more fitting queue from your city, location, and weather mood.
- Home view with weather radio, daily recommendations, private radio, continue listening, listening profile, and playlist entry points.
- Galaxy wallpaper background that keeps the idle state clean before playback begins.
- Emily/default playback visuals after playback starts, with synced lyric and particle stages.
- Beat-driven cinematic camera system.
- Dedicated visual mode for long podcasts and DJ tracks.
- Lyric stage, custom lyrics, lyric position controls, and visual controls.
- Custom album-cover upload and cropping.
- Right-click 3D playlist shelf for browsing playlist queues.
- NetEase Cloud Music account, search, playlists, podcast, and playback support.
- QQ Music search, login state, and alternate source support.
- Spotify search integration with cover metadata and legal preview playback when Spotify provides a preview URL.
- GitHub Releases update checking and in-app download entry.
- Built-in default visual archive for a consistent first-launch experience.

## Usage

Windows users can download the installer from GitHub Releases.

The official distribution file is `Mineradio-1.1.1-Setup.exe`. The installer creates a desktop shortcut. If you run a packaged `Mineradio.exe` directly, the app also tries to create the shortcut on first launch.

Users with older versions should uninstall the old app, quarantine old installers, and then install `v1.1.1` cleanly.

## Development

```bash
npm install
npm start
npm run build:win
```

The desktop app is loaded by the Electron main process through the local service. `npm run build:win` creates a Windows NSIS installer in `dist/`.

### Spotify Setup

Spotify search uses the Spotify Web API Client Credentials flow. Set these environment variables before running the app:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_MARKET=US
```

Spotify does not provide full-track audio URLs through the Web API. Mineradio plays Spotify `preview_url` clips when available and can open/fallback to other providers when a preview is unavailable.

## Updates

Mineradio checks the latest GitHub Release. When the remote version is newer than the local version, the in-app update panel shows the release content, downloads the installer into the local user-data directory, and opens it through the system.

For local update testing, point `MINERADIO_UPDATE_MANIFEST` to a local manifest JSON file or HTTP URL.

## Third-Party Music Platform Notice

Mineradio is not an official client for NetEase Cloud Music, QQ Music, Tencent Music Entertainment, or Spotify, and is not affiliated with those platforms.

Third-party integrations are for personal learning, local client experiments, and playback assistance using the user's own accounts. Follow each platform's terms, copyright rules, and membership rules. This project does not bypass paid content, membership restrictions, audio quality limits, or redistribute music content.

## User Data And Privacy

Login cookies, search history, custom covers, custom lyrics, and beat-analysis caches should remain in the local user-data directory or browser local storage. They should not be committed to the repository.

See [PRIVACY.md](./PRIVACY.md) for more details.

## Credits

Mineradio is primarily designed and built by XxHuberrr. Special thanks to emily as an early collaborator and inspiration for the visual foundation and the `emily` visual preset direction.

Thanks also to the early testers and release-preparation helpers who provided feedback and support.

## License

Copyright (C) 2026 XxHuberrr.

This project is licensed under GPL-3.0. See [LICENSE](./LICENSE).

The MR Logo, Mineradio name, interface visual design, and original visual expression belong to the author. Third-party dependencies and services follow their own licenses and terms.
