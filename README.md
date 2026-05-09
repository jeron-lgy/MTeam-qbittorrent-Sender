# MTeam qB Sender

Chrome MV3 extension for sending M-Team torrents to qBittorrent Web UI.

[中文说明](README.zh-CN.md)

## Screenshots

### Options

![Options page](assets/screenshots/options-page.png)

### Floating Panel

![Floating panel](assets/screenshots/floating-panel.png)

## Install

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder: `mteam-qb-chrome-extension`.
5. Open the extension popup or options page and configure qBittorrent.

## Notes

- Recommended mode is `upload`: the extension downloads the torrent file with the current M-Team session and uploads it to qBittorrent.
- `url` mode only works when qBittorrent can directly access the generated M-Team download URL.
- qBittorrent 5.2.x may return `HTTP 204` for successful Web API calls with no response body. This extension treats `204` as success and verifies login with `/api/v2/app/version`.
- The floating panel can send the current detail page, or batch send all currently open M-Team detail tabs.
