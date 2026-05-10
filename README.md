# PT qB Sender

Chrome MV3 extension for sending PT site torrents to qBittorrent Web UI.

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
5. Open the extension options page and configure qBittorrent.

## Built-In Sites

The floating panel only appears on enabled built-in PT sites or custom PT domains added in options. Built-in sites can be toggled individually:

- M-Team: `m-team.io`, `m-team.cc`
- ToTheGlory: `totheglory.im`
- HDHome: `hdhome.org`
- HDSky: `hdsky.me`
- Audiences: `audiences.me`
- KeepFriends: `keepfrds.com`
- HhanClub: `hhanclub.top`
- TJUPT: `tjupt.org`
- PTLSP: `ptlsp.com`
- SpringSunday: `springsunday.net`
- HDArea: `hdarea.club`
- HDDolby: `hddolby.com`

LAN pages, NAS dashboards, and router admin pages will not show the send panel just because they contain `details` or `download` links. Add smaller PT sites manually in options under "站点支持".

## Notes

- Recommended mode is `upload`: the extension downloads the torrent file with the current browser session and uploads it to qBittorrent.
- `url` mode only works when qBittorrent can directly access the generated download URL.
- qBittorrent 5.2.x may return `HTTP 204` for successful Web API calls with no response body. This extension treats `204` as success and verifies login with `/api/v2/app/version`.
- qBittorrent may return `HTTP 202` with pending tasks after adding torrents. This extension treats that as accepted when there are no failures.
- The floating panel can send the current detail page, or batch send all currently open supported PT detail tabs.
