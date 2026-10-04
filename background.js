import { pushClipViaWorker } from './worker_api.js';

// Enable opening the Side Panel when clicking the extension icon
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
}

// Setup Context Menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save_to_doitlater',
    title: 'Save to Do It Later',
    contexts: ['selection', 'page'],
  });
  console.log('Do It Later: Context Menu registered.');
});

// Update extension icon badge count
async function updateBadge() {
  const data = await chrome.storage.local.get(['stagedClips']);
  const clips = data.stagedClips || [];
  const count = clips.length;

  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#FFE177' });
    chrome.action.setBadgeTextColor({ color: '#16161A' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Handle Right-Click Context Menu selection
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save_to_doitlater') return;

  const snippet = (info.selectionText || '').trim();
  const title = (tab?.title || 'Web Clip').trim();
  const sourceUrl = tab?.url || '';
  const pageFavicon = tab?.favIconUrl || '';

  const newClip = {
    id: `clip-${Date.now()}`,
    snippet: snippet.length > 0 ? snippet : title,
    title: title,
    sourceUrl,
    pageFavicon,
    category: 'Web Clip',
    createdAt: Date.now(),
    clientPlatform: 'chrome_ext',
    status: 'pending',
  };

  // 1. Save to local staged queue
  const data = await chrome.storage.local.get(['stagedClips', 'currentUser', 'autoSendEnabled']);
  const stagedClips = data.stagedClips || [];
  stagedClips.unshift(newClip);
  await chrome.storage.local.set({ stagedClips });
  await updateBadge();

  // 2. If auto-send is enabled and user is logged in, dispatch to Cloudflare Worker
  if (data.autoSendEnabled && data.currentUser?.uid) {
    try {
      await pushClipViaWorker(data.currentUser.uid, newClip, data.currentUser.firebaseIdToken);
      // Remove from staged queue on successful push
      const updated = (await chrome.storage.local.get(['stagedClips'])).stagedClips || [];
      const filtered = updated.filter((c) => c.id !== newClip.id);
      await chrome.storage.local.set({ stagedClips: filtered });
      await updateBadge();
    } catch (err) {
      console.warn('Auto-send via Cloudflare Worker failed; kept in local staged queue:', err);
    }
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refresh_badge') {
    updateBadge();
    sendResponse({ ok: true });
  } else if (request.action === 'send_clip_to_app') {
    (async () => {
      try {
        const { clip, currentUser } = request;
        if (!currentUser?.uid) {
          sendResponse({ ok: false, error: 'User not signed in' });
          return;
        }
        await pushClipViaWorker(currentUser.uid, clip, currentUser.firebaseIdToken);

        // 1. Remove from staged clips
        const data = await chrome.storage.local.get(['stagedClips', 'historyClips']);
        const clips = (data.stagedClips || []).filter((c) => c.id !== clip.id);
        
        // 2. Add to history clips
        const historyClips = data.historyClips || [];
        historyClips.unshift({ ...clip, syncedAt: Date.now(), status: 'synced' });
        if (historyClips.length > 80) historyClips.length = 80;

        await chrome.storage.local.set({ stagedClips: clips, historyClips });
        await updateBadge();

        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
