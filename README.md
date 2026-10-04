# Do It Later — Desktop Sidebar & Web Clipper

A browser extension that connects directly with your **Do It Later** mobile app. Capture articles, code snippets, and thoughts from your laptop directly into your phone's personal vault.

Designed as a native browser sidebar with offline queuing, one-click synchronization, and zero hardcoded credentials.

---

## Features

- **Chrome Sidebar Integration**: Docks comfortably into the browser's side panel. Resizes naturally alongside any tab.
- **Fast 6-Digit Code Pairing**: No OAuth setup or redirect URI configuration required. Log into the mobile app, tap the laptop icon in the Study tab, enter the 6-digit code, and you are connected.
- **Auto-Expanding Title Field**: Title input dynamically expands as you type or capture longer headlines.
- **Right-Click Web Clipper**: Highlight any text on any webpage, right-click, and select **Save to Do It Later**.
- **Staged to Review Queue**: Stage thoughts for batch delivery or dispatch immediately.
- **Sync History Archive**: Dispatched clips automatically move from Staged to History with delivery timestamps and quick-copy actions.
- **Serverless Proxy Security**: All sensitive keys and database communication are mediated via Cloudflare Worker. Zero API keys exposed client-side.

---

## Installation Guide (Any Chromium Browser)

You do **not** need the Chrome Web Store. Follow these steps to install the extension directly from this repository:

### 1. Download or Clone the Repository
If you haven't already cloned the repository, clone or download the folder:
```bash
git clone https://github.com/your-username/doitlater.git
```
The extension folder is located at:
```
doitlater/extension/
```

### 2. Load into Your Browser

#### Google Chrome
1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `extension/` folder from this repository.
5. Click the puzzle icon in the Chrome toolbar and **pin** **Do It Later** for easy access.

#### Microsoft Edge
1. Open Edge and navigate to: `edge://extensions/`
2. Turn on **Developer mode** in the left sidebar.
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the extension to your toolbar.

#### Brave Browser
1. Open Brave and navigate to: `brave://extensions/`
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` folder.

#### Arc Browser
1. Open Arc and press `Ctrl + T` (or `Cmd + T` on Mac).
2. Type `arc://extensions` and press Enter.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the `extension/` folder.

---

## How to Connect to Your Mobile App

1. Open the **Do It Later** app on your phone.
2. Sign in to your account.
3. On the **Study** tab, tap the circular **Laptop terminal icon** next to the search bar.
4. A card will display your permanent **6-digit sync code**.
5. Click the **Do It Later** icon in your browser to open the sidebar.
6. Enter your 6-digit code and click **Connect Account**.
7. You are connected! Any thought or highlight clipped from your browser will now appear in your mobile app inbox.

---

## Directory Structure

```
extension/
├── manifest.json       # Manifest V3 specification and sidebar configuration
├── background.js       # Background service worker (side panel handler, context menu, badge sync)
├── worker_api.js       # Cloudflare Worker API proxy client (handles pairing and clip dispatch)
├── popup.html          # Sidebar interface (Capture, Staged, and History tabs)
├── popup.css           # Bento neo-brutalist styling with responsive sidebar layout
├── popup.js            # Sidebar logic, auto-expanding title, queue management, and pairing
├── icons/              # Extension brand icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # Installation and usage instructions
```

---

## Privacy & Security

- **No Third-Party Trackers**: Operates entirely between your browser, the Cloudflare Worker proxy, and your personal user database.
- **Isolated User Storage**: Clips are dispatched into your private user inbox (`users/{userId}/inbox`) requiring mobile authentication to accept or dismiss.
- **Zero Exposed Secrets**: All database and AI endpoints are secured server-side.
