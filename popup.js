import {
  pairWithCode,
  pushClipViaWorker,
  fetchUserThoughts,
  linkSourceToThought,
} from './worker_api.js';

// Screens
const authScreen = document.getElementById('authScreen');
const mainScreen = document.getElementById('mainScreen');

// Auth Screen Elements
const pairingCodeInput = document.getElementById('pairingCodeInput');
const pairCodeBtn = document.getElementById('pairCodeBtn');
const authFeedback = document.getElementById('authFeedback');
const stepsBtn = document.getElementById('stepsBtn');
const stepsDrawer = document.getElementById('stepsDrawer');
const closeStepsBtn = document.getElementById('closeStepsBtn');

// Main Screen Elements
const userEmailDisplay = document.getElementById('userEmailDisplay');
const signOutBtn = document.getElementById('signOutBtn');
const navSegmented = document.getElementById('navSegmented');
const navTabs = document.querySelectorAll('.nav-tab');

// Tab Views
const captureTabView = document.getElementById('captureTabView');
const thoughtsTabView = document.getElementById('thoughtsTabView');
const stagedTabView = document.getElementById('stagedTabView');
const historyTabView = document.getElementById('historyTabView');

// Tab Badges
const thoughtsTabBadge = document.getElementById('thoughtsTabBadge');
const stagedTabBadge = document.getElementById('stagedTabBadge');
const historyTabBadge = document.getElementById('historyTabBadge');

// Capture View Elements
const pageDomain = document.getElementById('pageDomain');
const clipTitleInput = document.getElementById('clipTitleInput');
const clipSnippetInput = document.getElementById('clipSnippetInput');
const categoryChips = document.getElementById('categoryChips');
const sendToAppBtn = document.getElementById('sendToAppBtn');
const stageBtn = document.getElementById('stageBtn');
const linkCurrentToThoughtBtn = document.getElementById('linkCurrentToThoughtBtn');
const sendFeedback = document.getElementById('sendFeedback');

// Thoughts View Elements
const activeTabBanner = document.getElementById('activeTabBanner');
const thoughtsBannerBadge = document.getElementById('thoughtsBannerBadge');
const thoughtsActiveDomain = document.getElementById('thoughtsActiveDomain');
const thoughtsActiveTitle = document.getElementById('thoughtsActiveTitle');
const thoughtsQuotePreview = document.getElementById('thoughtsQuotePreview');
const thoughtsQuoteText = document.getElementById('thoughtsQuoteText');
const thoughtsSearchInput = document.getElementById('thoughtsSearchInput');
const clearThoughtsSearchBtn = document.getElementById('clearThoughtsSearchBtn');
const thoughtsTypeFilter = document.getElementById('thoughtsTypeFilter');
const refreshThoughtsBtn = document.getElementById('refreshThoughtsBtn');
const thoughtsFeedback = document.getElementById('thoughtsFeedback');
const thoughtsListContainer = document.getElementById('thoughtsListContainer');

// Staged View Elements
const stagedCount = document.getElementById('stagedCount');
const stagedClipsList = document.getElementById('stagedClipsList');
const sendAllBtn = document.getElementById('sendAllBtn');
const stagedFeedback = document.getElementById('stagedFeedback');

// History View Elements
const historyClipsList = document.getElementById('historyClipsList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyFeedback = document.getElementById('historyFeedback');

let currentActiveTab = null;
let selectedCategory = 'Research';
let currentUser = null;
let activeTabName = 'capture';

let allThoughts = [];
let selectedThoughtFilter = 'all';
let thoughtSearchQuery = '';


// Initialize Popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadUserSession();
  setupEventListeners();
  if (currentUser && currentUser.uid) {
    await detectActiveTab();
    await refreshAllViews();
  }
});

// Load persistent user session
async function loadUserSession() {
  const data = await chrome.storage.local.get(['currentUser']);
  currentUser = data.currentUser || null;
  updateScreenView();
}

// Switch between Code Login Screen & Main Workspace
function updateScreenView() {
  if (currentUser && currentUser.uid) {
    authScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    userEmailDisplay.textContent = currentUser.email || 'Authenticated User';
  } else {
    authScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
    pairingCodeInput.focus();
  }
}

// Auto-Expand Title Field as text grows
function autoResizeTitle() {
  if (!clipTitleInput) return;
  clipTitleInput.style.height = 'auto';
  const newHeight = Math.min(Math.max(clipTitleInput.scrollHeight, 42), 140);
  clipTitleInput.style.height = `${newHeight}px`;
}

/**
 * Robust active tab finder.
 * Handles Chrome Side Panel semantics where focus is inside the sidebar
 * and the user is viewing web pages in the main window.
 */
async function getActiveWebTab() {
  try {
    // 1. Try querying active tab in the last focused window
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let tab = tabs && tabs.length > 0 ? tabs[0] : null;

    // 2. If tab is an extension internal page or null, check current window
    if (!tab || !tab.url || tab.url.startsWith('chrome-extension://')) {
      const currentWin = await chrome.windows.getCurrent();
      if (currentWin && currentWin.id) {
        const curTabs = await chrome.tabs.query({ active: true, windowId: currentWin.id });
        if (curTabs && curTabs.length > 0 && curTabs[0].url && !curTabs[0].url.startsWith('chrome-extension://')) {
          tab = curTabs[0];
        }
      }
    }

    // 3. Fallback: scan all active tabs across windows for a real web page
    if (!tab || !tab.url || tab.url.startsWith('chrome-extension://')) {
      const allActive = await chrome.tabs.query({ active: true });
      if (allActive && allActive.length > 0) {
        const webTab = allActive.find(t => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://')));
        tab = webTab || allActive[0];
      }
    }

    return tab || null;
  } catch (err) {
    console.warn('getActiveWebTab error:', err);
    try {
      const fallback = await chrome.tabs.query({ active: true, currentWindow: true });
      return fallback && fallback.length > 0 ? fallback[0] : null;
    } catch (_) {
      return null;
    }
  }
}

// Detect Active Browser Tab & Read Selection
async function detectActiveTab() {
  try {
    const tab = await getActiveWebTab();
    if (!tab || !tab.url) {
      currentActiveTab = null;
      pageDomain.textContent = 'Desktop Web';
      if (thoughtsActiveDomain) thoughtsActiveDomain.textContent = 'Desktop Web';
      if (thoughtsActiveTitle) thoughtsActiveTitle.textContent = 'No active tab detected';
      if (thoughtsBannerBadge) {
        thoughtsBannerBadge.textContent = 'NO TAB';
        thoughtsBannerBadge.className = 'banner-badge system-tab';
      }
      return;
    }

    currentActiveTab = tab;
    const urlStr = tab.url || '';
    const isSystemPage = urlStr.startsWith('chrome://') ||
                         urlStr.startsWith('chrome-extension://') ||
                         urlStr.startsWith('edge://') ||
                         urlStr.startsWith('about:') ||
                         urlStr.startsWith('chrome-search://');

    if (isSystemPage) {
      const sysName = tab.title ? tab.title : 'Internal Settings';
      pageDomain.textContent = 'Browser Settings';
      if (thoughtsActiveDomain) thoughtsActiveDomain.textContent = 'System Page';
      if (thoughtsActiveTitle) thoughtsActiveTitle.textContent = `${sysName} (switch to a webpage to link)`;
      if (thoughtsBannerBadge) {
        thoughtsBannerBadge.textContent = 'SYSTEM PAGE (UNLINKABLE)';
        thoughtsBannerBadge.className = 'banner-badge system-tab';
      }
      if (thoughtsQuotePreview) thoughtsQuotePreview.classList.add('hidden');
      return;
    }

    // Valid external web page
    if (thoughtsBannerBadge) {
      thoughtsBannerBadge.textContent = 'ACTIVE TAB READY';
      thoughtsBannerBadge.className = 'banner-badge';
    }

    let host = 'Desktop Web';
    try {
      const u = new URL(tab.url);
      host = u.hostname.replace(/^www\./, '');
    } catch (_) {
      host = tab.url;
    }

    pageDomain.textContent = host;
    if (thoughtsActiveDomain) thoughtsActiveDomain.textContent = host;

    const pageTitle = tab.title || host;
    clipTitleInput.value = pageTitle;
    if (thoughtsActiveTitle) thoughtsActiveTitle.textContent = pageTitle;
    autoResizeTitle();

    // Safely execute selection script on HTTP/HTTPS pages
    const isScriptablePage = urlStr.startsWith('http://') || urlStr.startsWith('https://');
    if (tab.id && isScriptablePage && chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || '',
        },
        (results) => {
          if (chrome.runtime.lastError) return;
          if (results && results[0] && results[0].result) {
            const selectedText = results[0].result.trim();
            if (selectedText) {
              clipSnippetInput.value = selectedText;
              if (thoughtsQuotePreview && thoughtsQuoteText) {
                thoughtsQuoteText.textContent = selectedText.length > 90 ? selectedText.substring(0, 90) + '...' : selectedText;
                thoughtsQuotePreview.classList.remove('hidden');
              }
            } else if (thoughtsQuotePreview) {
              thoughtsQuotePreview.classList.add('hidden');
            }
          }
        }
      );
    } else if (thoughtsQuotePreview) {
      thoughtsQuotePreview.classList.add('hidden');
    }
  } catch (err) {
    console.warn('Tab inspection notice:', err);
    pageDomain.textContent = 'Desktop Web';
    if (thoughtsActiveDomain) thoughtsActiveDomain.textContent = 'Desktop Web';
  }
}

// Setup Event Handlers
function setupEventListeners() {
  // Mobile pairing code button on Auth Screen
  pairCodeBtn.addEventListener('click', handleMobilePair);
  pairingCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleMobilePair();
  });

  // Auto-format 6 digits with a space in middle (e.g. 123 456)
  pairingCodeInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\s+/g, '');
    if (val.length > 3) {
      val = val.substring(0, 3) + ' ' + val.substring(3, 6);
    }
    e.target.value = val;
  });

  // Steps Instructions Button
  stepsBtn.addEventListener('click', () => {
    stepsDrawer.classList.toggle('hidden');
  });

  closeStepsBtn.addEventListener('click', () => {
    stepsDrawer.classList.add('hidden');
  });

  // Sign Out Button
  signOutBtn.addEventListener('click', async () => {
    currentUser = null;
    await chrome.storage.local.remove(['currentUser']);
    updateScreenView();
    showAuthFeedback('Signed out. Enter your 6-digit sync code anytime to reconnect.', 'info');
  });

  // Auto-resize title textarea as typing
  clipTitleInput.addEventListener('input', autoResizeTitle);

  // Segmented Navigation Tabs
  navSegmented.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.nav-tab');
    if (!tabBtn) return;
    switchTab(tabBtn.dataset.tab);
  });

  // Category Chip Selection
  categoryChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedCategory = chip.dataset.category || 'Research';
  });

  // Send to App Click
  sendToAppBtn.addEventListener('click', handleSendToApp);

  // Stage for Later Click
  stageBtn.addEventListener('click', handleStageForLater);

  // Link Current to Thought Click in Capture View
  if (linkCurrentToThoughtBtn) {
    linkCurrentToThoughtBtn.addEventListener('click', () => {
      switchTab('thoughts');
    });
  }

  // Thoughts Search Input
  if (thoughtsSearchInput) {
    thoughtsSearchInput.addEventListener('input', (e) => {
      thoughtSearchQuery = e.target.value.trim();
      if (clearThoughtsSearchBtn) {
        clearThoughtsSearchBtn.classList.toggle('hidden', !thoughtSearchQuery);
      }
      renderThoughtsList();
    });
  }

  // Clear Thoughts Search Button
  if (clearThoughtsSearchBtn) {
    clearThoughtsSearchBtn.addEventListener('click', () => {
      thoughtsSearchInput.value = '';
      thoughtSearchQuery = '';
      clearThoughtsSearchBtn.classList.add('hidden');
      renderThoughtsList();
      thoughtsSearchInput.focus();
    });
  }

  // Thoughts Type Filter Chips
  if (thoughtsTypeFilter) {
    thoughtsTypeFilter.addEventListener('click', (e) => {
      const chip = e.target.closest('.type-chip');
      if (!chip) return;
      document.querySelectorAll('.type-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedThoughtFilter = chip.dataset.type || 'all';
      renderThoughtsList();
    });
  }

  // Refresh Thoughts Manual Button
  if (refreshThoughtsBtn) {
    refreshThoughtsBtn.addEventListener('click', () => {
      loadThoughtsView(true);
    });
  }

  // Refresh tab detection on banner click
  if (activeTabBanner) {
    activeTabBanner.addEventListener('click', async () => {
      await detectActiveTab();
      showFeedback(thoughtsFeedback, 'Refreshed active browser tab!', 'info');
    });
  }

  // Delegated 1-Click Link Button Click
  if (thoughtsListContainer) {
    thoughtsListContainer.addEventListener('click', async (e) => {
      const linkBtn = e.target.closest('.link-thought-btn');
      if (!linkBtn) return;
      const thoughtId = linkBtn.dataset.thoughtId;
      if (thoughtId) {
        await handleLinkThought(thoughtId, linkBtn);
      }
    });
  }

  // Send All Staged Click
  sendAllBtn.addEventListener('click', handleSendAllStaged);

  // Clear History Click
  clearHistoryBtn.addEventListener('click', handleClearHistory);
}

// Tab Switching
function switchTab(tabName) {
  activeTabName = tabName;
  navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  captureTabView.classList.toggle('hidden', tabName !== 'capture');
  if (thoughtsTabView) thoughtsTabView.classList.toggle('hidden', tabName !== 'thoughts');
  stagedTabView.classList.toggle('hidden', tabName !== 'staged');
  historyTabView.classList.toggle('hidden', tabName !== 'history');

  if (tabName === 'thoughts') {
    detectActiveTab();
    loadThoughtsView();
  } else if (tabName === 'capture') {
    detectActiveTab();
  } else if (tabName === 'staged') {
    loadStagedClips();
  } else if (tabName === 'history') {
    loadHistoryClips();
  }
}

// Real-time tab change listeners for Chrome Side Panel & Popups
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(async () => {
    await detectActiveTab();
  });
}

if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title) {
      await detectActiveTab();
    }
  });
}

if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      await detectActiveTab();
    }
  });
}

window.addEventListener('focus', async () => {
  await detectActiveTab();
});

// Refresh all lists and badges
async function refreshAllViews() {
  await updateBadgeCounters();
  await loadThoughtsView(false);
  await loadStagedClips();
  await loadHistoryClips();
}

// Update badges on the navigation tabs
async function updateBadgeCounters() {
  const data = await chrome.storage.local.get(['stagedClips', 'historyClips', 'cachedThoughts']);
  const staged = data.stagedClips || [];
  const history = data.historyClips || [];
  const thoughts = data.cachedThoughts || [];

  stagedTabBadge.textContent = staged.length;
  stagedCount.textContent = staged.length;
  historyTabBadge.textContent = history.length;
  if (thoughtsTabBadge && thoughts.length > 0) {
    thoughtsTabBadge.textContent = thoughts.length;
    thoughtsTabBadge.style.display = 'inline-block';
  }
}

// Handle 6-Digit Mobile Sync Code Verification
async function handleMobilePair() {
  const code = (pairingCodeInput.value || '').trim();
  if (!code || code.replace(/\s+/g, '').length < 6) {
    showAuthFeedback('Please enter the full 6-digit sync code from your mobile app.', 'error');
    pairingCodeInput.focus();
    return;
  }

  try {
    pairCodeBtn.disabled = true;
    pairCodeBtn.innerHTML = '<span>Verifying code...</span>';

    const result = await pairWithCode(code);
    currentUser = {
      uid: result.uid,
      email: result.email,
      name: result.name,
      picture: null,
      firebaseIdToken: null,
    };

    await chrome.storage.local.set({ currentUser });
    pairingCodeInput.value = '';
    updateScreenView();
    await detectActiveTab();
    await refreshAllViews();
  } catch (err) {
    console.error('Pairing error:', err);
    showAuthFeedback(err.message, 'error');
  } finally {
    pairCodeBtn.disabled = false;
    pairCodeBtn.innerHTML = `<span>Connect Account</span><svg class="btn-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  }
}

// Create Clip Object from Form Inputs
function buildCurrentClip() {
  const title = (clipTitleInput.value || '').trim();
  const snippet = (clipSnippetInput.value || '').trim();

  if (!title && !snippet) {
    return null;
  }

  return {
    id: `clip-${Date.now()}`,
    title: title || 'Thought from Desktop',
    snippet: snippet.length > 0 ? snippet : title,
    sourceUrl: currentActiveTab?.url || '',
    pageFavicon: currentActiveTab?.favIconUrl || '',
    category: selectedCategory,
    createdAt: Date.now(),
    clientPlatform: 'chrome_ext',
    deviceHostname: 'Desktop Chrome',
    status: 'pending',
  };
}

// Send Current Input to Mobile App via Cloudflare Worker
async function handleSendToApp() {
  if (!currentUser || !currentUser.uid) {
    updateScreenView();
    showAuthFeedback('Enter your 6-digit sync code to connect with your mobile device.', 'error');
    return;
  }

  const clip = buildCurrentClip();
  if (!clip) {
    showFeedback(sendFeedback, 'Enter or highlight a thought before dispatching.', 'error');
    return;
  }

  try {
    sendToAppBtn.disabled = true;
    sendToAppBtn.innerHTML = '<span>Dispatching...</span>';

    await pushClipViaWorker(currentUser.uid, clip, currentUser.firebaseIdToken);

    // Save to history archive
    await recordHistoryClip(clip);

    showFeedback(sendFeedback, 'Dispatched to your mobile vault. You may now close this tab in peace.', 'success');
    clipSnippetInput.value = '';
    clipTitleInput.value = '';
    autoResizeTitle();
    await updateBadgeCounters();
  } catch (err) {
    console.error('Failed to send clip:', err);
    showFeedback(sendFeedback, `Dispatch notice: ${err.message}`, 'error');
  } finally {
    sendToAppBtn.disabled = false;
    sendToAppBtn.innerHTML = `<svg class="btn-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Send to Mobile</span>`;
  }
}

// Stage for Later Review
async function handleStageForLater() {
  const clip = buildCurrentClip();
  if (!clip) {
    showFeedback(sendFeedback, 'Enter or highlight a thought before staging.', 'error');
    return;
  }

  const data = await chrome.storage.local.get(['stagedClips']);
  const staged = data.stagedClips || [];
  staged.unshift(clip);
  await chrome.storage.local.set({ stagedClips: staged });

  showFeedback(sendFeedback, 'Staged for review. Procrastination properly structured.', 'info');
  clipSnippetInput.value = '';
  clipTitleInput.value = '';
  autoResizeTitle();

  await updateBadgeCounters();
  await loadStagedClips();
  chrome.runtime.sendMessage({ action: 'refresh_badge' });
}

// Record dispatched clip into History Archive
async function recordHistoryClip(clip) {
  const data = await chrome.storage.local.get(['historyClips']);
  const history = data.historyClips || [];
  history.unshift({
    ...clip,
    syncedAt: Date.now(),
    status: 'synced',
  });
  if (history.length > 100) history.length = 100;
  await chrome.storage.local.set({ historyClips: history });
}

// Load Staged Clips
async function loadStagedClips() {
  const data = await chrome.storage.local.get(['stagedClips']);
  const clips = data.stagedClips || [];
  stagedCount.textContent = clips.length;
  stagedTabBadge.textContent = clips.length;

  if (clips.length === 0) {
    stagedClipsList.innerHTML = `
      <div class="empty-queue-card">
        <div class="empty-icon-circle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="empty-title">Queue is clear</div>
        <div class="empty-desc">Your review queue is currently empty. Highlight text on any site, right-click, and select "Save to Do It Later".</div>
      </div>
    `;
    sendAllBtn.classList.add('hidden');
    return;
  }

  sendAllBtn.classList.remove('hidden');
  stagedClipsList.innerHTML = clips
    .map((clip) => {
      const domain = clip.sourceUrl ? getDomainFromUrl(clip.sourceUrl) : 'Desktop Web';
      const timeStr = formatRelativeTime(clip.createdAt);

      return `
        <div class="staged-card" data-id="${clip.id}">
          <div class="card-top-row">
            <span class="card-category-badge">${escapeHtml(clip.category || 'Note')}</span>
            <span class="card-time">${timeStr}</span>
          </div>
          <div class="card-title-text">${escapeHtml(clip.title)}</div>
          ${clip.snippet ? `<div class="card-snippet-text">${escapeHtml(clip.snippet)}</div>` : ''}
          <div class="card-actions-row">
            <span class="card-domain-badge" title="${escapeHtml(clip.sourceUrl || '')}">${escapeHtml(domain)}</span>
            <div class="card-btn-group">
              <button class="neo-btn neo-btn-xs neo-btn-primary send-single-btn" data-id="${clip.id}">
                <span>Send</span>
              </button>
              <button class="text-btn danger remove-clip-btn" data-id="${clip.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.send-single-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('button').dataset.id;
      await sendSingleStagedClip(id);
    });
  });

  document.querySelectorAll('.remove-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await removeStagedClip(id);
    });
  });
}

// Send a single staged clip via Cloudflare Worker
async function sendSingleStagedClip(clipId) {
  if (!currentUser || !currentUser.uid) {
    updateScreenView();
    showAuthFeedback('Enter your 6-digit sync code to connect with your mobile device.', 'error');
    return;
  }

  const data = await chrome.storage.local.get(['stagedClips']);
  const clips = data.stagedClips || [];
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return;

  try {
    showFeedback(stagedFeedback, 'Dispatching to phone...', 'info');
    await pushClipViaWorker(currentUser.uid, clip, currentUser.firebaseIdToken);

    // 1. Remove from staged clips
    const updatedStaged = clips.filter((c) => c.id !== clipId);
    await chrome.storage.local.set({ stagedClips: updatedStaged });

    // 2. Add to history archive
    await recordHistoryClip(clip);

    // 3. Refresh UI & badges
    await refreshAllViews();
    chrome.runtime.sendMessage({ action: 'refresh_badge' });
    showFeedback(stagedFeedback, 'Dispatched to mobile vault and archived in History.', 'success');
  } catch (err) {
    showFeedback(stagedFeedback, `Dispatch failed: ${err.message}`, 'error');
  }
}

// Send all staged clips via Cloudflare Worker
async function handleSendAllStaged() {
  if (!currentUser || !currentUser.uid) {
    updateScreenView();
    showAuthFeedback('Enter your 6-digit sync code to connect with your mobile device.', 'error');
    return;
  }

  const data = await chrome.storage.local.get(['stagedClips']);
  const clips = data.stagedClips || [];
  if (clips.length === 0) return;

  sendAllBtn.disabled = true;
  sendAllBtn.innerHTML = '<span>Sending...</span>';

  let sentCount = 0;
  for (const clip of clips) {
    try {
      await pushClipViaWorker(currentUser.uid, clip, currentUser.firebaseIdToken);
      await recordHistoryClip(clip);
      sentCount++;
    } catch (err) {
      console.warn('Failed to send clip:', clip.id, err);
    }
  }

  await chrome.storage.local.set({ stagedClips: [] });
  await refreshAllViews();
  chrome.runtime.sendMessage({ action: 'refresh_badge' });

  sendAllBtn.disabled = false;
  sendAllBtn.innerHTML = `<span>Send All</span><svg class="btn-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  showFeedback(stagedFeedback, `Dispatched ${sentCount} clips to your phone and archived them in History.`, 'success');
}

// Remove staged clip
async function removeStagedClip(clipId) {
  const data = await chrome.storage.local.get(['stagedClips']);
  const clips = (data.stagedClips || []).filter((c) => c.id !== clipId);
  await chrome.storage.local.set({ stagedClips: clips });
  await refreshAllViews();
  chrome.runtime.sendMessage({ action: 'refresh_badge' });
}

// Load History Clips
async function loadHistoryClips() {
  const data = await chrome.storage.local.get(['historyClips']);
  const history = data.historyClips || [];
  historyTabBadge.textContent = history.length;

  if (history.length === 0) {
    historyClipsList.innerHTML = `
      <div class="empty-queue-card">
        <div class="empty-icon-circle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="empty-title">Archive is empty</div>
        <div class="empty-desc">Dispatched notes and research clips will be cataloged here once sent to your phone.</div>
      </div>
    `;
    clearHistoryBtn.classList.add('hidden');
    return;
  }

  clearHistoryBtn.classList.remove('hidden');
  historyClipsList.innerHTML = history
    .map((item) => {
      const domain = item.sourceUrl ? getDomainFromUrl(item.sourceUrl) : 'Desktop Web';
      const timeStr = formatRelativeTime(item.syncedAt || item.createdAt);

      return `
        <div class="history-card" data-id="${item.id}">
          <div class="card-top-row">
            <span class="card-category-badge">${escapeHtml(item.category || 'Note')}</span>
            <span class="card-time">${timeStr}</span>
          </div>
          <div class="card-title-text">${escapeHtml(item.title)}</div>
          ${item.snippet ? `<div class="card-snippet-text">${escapeHtml(item.snippet)}</div>` : ''}
          <div class="card-actions-row">
            <span class="card-domain-badge" title="${escapeHtml(item.sourceUrl || '')}">${escapeHtml(domain)}</span>
            <div class="card-btn-group">
              <button class="text-btn copy-clip-btn" data-text="${escapeHtml(item.snippet || item.title)}">Copy</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.copy-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const text = e.target.dataset.text;
      if (text) {
        await navigator.clipboard.writeText(text);
        const originalText = e.target.textContent;
        e.target.textContent = 'Copied';
        setTimeout(() => {
          e.target.textContent = originalText;
        }, 1500);
      }
    });
  });
}

// Clear History Archive
async function handleClearHistory() {
  await chrome.storage.local.set({ historyClips: [] });
  await loadHistoryClips();
  await updateBadgeCounters();
  showFeedback(historyFeedback, 'Archive cleared.', 'info');
}

// Utility: Extract domain name from URL
function getDomainFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch (_) {
    return 'Web';
  }
}

// Utility: Format relative time
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Recently';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Feedback helpers
function showAuthFeedback(msg, type = 'info') {
  authFeedback.textContent = msg;
  authFeedback.className = `feedback-msg ${type}`;
  authFeedback.classList.remove('hidden');
}

function showFeedback(element, msg, type = 'info') {
  if (!element) return;
  element.textContent = msg;
  element.className = `feedback-msg ${type}`;
  element.classList.remove('hidden');
  setTimeout(() => {
    element.classList.add('hidden');
  }, 4500);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==============================================
// THOUGHTS EXPLORER & COMPANION LINKER LOGIC
// ==============================================

/**
 * Loads user thoughts using SWR (Stale-While-Revalidate):
 * 1. Immediate read from chrome.storage.local for <50ms render
 * 2. Background fresh revalidation from Cloudflare Worker / Firestore
 */
async function loadThoughtsView(forceRefresh = false) {
  if (!currentUser || !currentUser.uid) {
    if (thoughtsListContainer) {
      thoughtsListContainer.innerHTML = `
        <div class="empty-thoughts-state">
          <p>Please enter your 6-digit sync code to view and link your thoughts.</p>
        </div>
      `;
    }
    return;
  }

  // 1. SWR Cache Read: instant display
  if (!forceRefresh) {
    const cached = await chrome.storage.local.get(['cachedThoughts']);
    if (cached.cachedThoughts && Array.isArray(cached.cachedThoughts) && cached.cachedThoughts.length > 0) {
      allThoughts = cached.cachedThoughts;
      renderThoughtsList();
      if (thoughtsTabBadge) {
        thoughtsTabBadge.textContent = allThoughts.length;
        thoughtsTabBadge.style.display = 'inline-block';
      }
    }
  }

  // 2. Fresh Revalidation from Worker
  try {
    const res = await fetchUserThoughts(currentUser.uid, currentUser.firebaseIdToken || null);
    if (res && res.thoughts) {
      allThoughts = res.thoughts;
      await chrome.storage.local.set({ cachedThoughts: allThoughts });
      renderThoughtsList();
      if (thoughtsTabBadge) {
        thoughtsTabBadge.textContent = allThoughts.length;
        thoughtsTabBadge.style.display = 'inline-block';
      }
    }
  } catch (err) {
    console.warn('Background thoughts fetch notice:', err);
    if (!allThoughts || allThoughts.length === 0) {
      if (thoughtsListContainer) {
        thoughtsListContainer.innerHTML = `
          <div class="empty-thoughts-state">
            <p>Unable to sync thoughts from your vault right now.</p>
            <button class="neo-btn neo-btn-sm neo-btn-yellow" id="retryFetchThoughtsBtn" style="margin-top: 8px;">Retry</button>
          </div>
        `;
        const retryBtn = document.getElementById('retryFetchThoughtsBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => loadThoughtsView(true));
      }
    }
  }
}

/**
 * Renders the filtered and searched list of thought cards.
 */
function renderThoughtsList() {
  if (!thoughtsListContainer) return;
  try {
    const currentTabUrl = currentActiveTab?.url || '';

  const filtered = allThoughts.filter((thought) => {
    // Filter by category or type
    if (selectedThoughtFilter === 'study') {
      const isStudyType = ['study', 'note', 'idea'].includes((thought.type || '').toLowerCase());
      const isStudyCat = ['study', 'research', 'learning', 'note', 'reading'].some(k => (thought.category || '').toLowerCase().includes(k));
      if (!isStudyType && !isStudyCat) return false;
    }
    if (selectedThoughtFilter === 'deepWork') {
      const isDeepType = ['deepwork', 'task', 'reminder', 'quickaction'].includes((thought.type || '').toLowerCase());
      const isDeepCat = ['deep', 'work', 'project', 'task', 'code', 'dev'].some(k => (thought.category || '').toLowerCase().includes(k));
      if (!isDeepType && !isDeepCat) return false;
    }
    if (selectedThoughtFilter === 'linked') {
      const links = thought.linkedSources || [];
      if (links.length === 0 && !thought.sourceUrl) return false;
    }

    // Filter by search query
    if (thoughtSearchQuery) {
      const q = thoughtSearchQuery.toLowerCase();
      const titleMatch = (thought.title || '').toLowerCase().includes(q);
      const contentMatch = (thought.content || '').toLowerCase().includes(q);
      const tagMatch = Array.isArray(thought.tags) && thought.tags.some(t => String(t).toLowerCase().includes(q));
      const sourceMatch = (thought.sourceTitle || '').toLowerCase().includes(q) || (thought.sourceUrl || '').toLowerCase().includes(q);
      if (!titleMatch && !contentMatch && !tagMatch && !sourceMatch) return false;
    }

    return true;
  });

  if (allThoughts.length === 0) {
    thoughtsListContainer.innerHTML = `
      <div class="empty-thoughts-state">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ink-secondary);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <p style="font-weight: 800; color: var(--ink-obsidian); font-size: 13px; margin-top: 4px;">No thoughts synced yet</p>
        <p style="font-size: 11px; color: var(--ink-secondary); max-width: 260px; line-height: 1.4;">Open the <strong>Do It Later</strong> mobile app (Study tab) to sync your thoughts vault to this extension.</p>
        <button class="neo-btn neo-btn-sm neo-btn-yellow" id="retryFetchThoughtsBtn" style="margin-top: 8px;">
          <span>Check Again</span>
        </button>
      </div>
    `;
    const retryBtn = document.getElementById('retryFetchThoughtsBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => loadThoughtsView(true));
    return;
  }

  if (filtered.length === 0) {
    thoughtsListContainer.innerHTML = `
      <div class="empty-thoughts-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ink-secondary);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <p>${thoughtSearchQuery ? 'No thoughts matching search query.' : 'No thoughts found in this category.'}</p>
      </div>
    `;
    return;
  }

  thoughtsListContainer.innerHTML = filtered.map((thought) => {
    const typeLabel = thought.type === 'study' ? 'Study' : thought.type === 'deepWork' ? 'Deep Work' : 'Thought';
    const typeClass = thought.type === 'study' ? 'study' : thought.type === 'deepWork' ? 'deepWork' : 'general';
    const timeStr = formatThoughtDate(thought.createdAt);

    // Collect linked sources
    const linkedSources = Array.isArray(thought.linkedSources) ? [...thought.linkedSources] : [];
    if (thought.sourceUrl && !linkedSources.some(s => s.url === thought.sourceUrl)) {
      linkedSources.push({
        url: thought.sourceUrl,
        title: thought.sourceTitle || getDomainFromUrl(thought.sourceUrl),
        domain: getDomainFromUrl(thought.sourceUrl),
      });
    }

    const isCurrentPageLinked = currentTabUrl && linkedSources.some(s => s.url === currentTabUrl);
    const tags = Array.isArray(thought.tags) ? thought.tags : [];

    return `
      <div class="thought-card" data-thought-id="${escapeHtml(thought.id)}">
        <div class="thought-card-top">
          <span class="thought-type-badge ${typeClass}">${typeLabel}</span>
          <span class="thought-card-date">${timeStr}</span>
        </div>

        <div class="thought-card-title">${escapeHtml(thought.title || 'Untitled Thought')}</div>

        ${thought.content ? `<div class="thought-card-content">${escapeHtml(thought.content)}</div>` : ''}

        ${tags.length > 0 ? `
          <div class="thought-tags-row">
            ${tags.map(t => `<span class="thought-tag-item">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}

        ${linkedSources.length > 0 ? `
          <div class="thought-linked-sources">
            <div class="linked-sources-header">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>Linked References (${linkedSources.length})</span>
            </div>
            <div class="linked-sources-list">
              ${linkedSources.slice(0, 3).map(src => `
                <a href="${escapeHtml(src.url)}" target="_blank" class="linked-source-chip" title="${escapeHtml(src.title || src.url)}">
                  <span>🔗</span>
                  <span>${escapeHtml(src.title || src.domain || src.url)}</span>
                </a>
              `).join('')}
              ${linkedSources.length > 3 ? `<span class="thought-tag-item">+${linkedSources.length - 3} more</span>` : ''}
            </div>
          </div>
        ` : ''}

        <div class="thought-card-actions">
          <button class="link-thought-btn ${isCurrentPageLinked ? 'linked-success' : ''}" data-thought-id="${escapeHtml(thought.id)}">
            ${isCurrentPageLinked ? `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Linked</span>
            ` : `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>Link Current Tab</span>
            `}
          </button>
        </div>
      </div>
    `;
  }).join('');
  } catch (err) {
    console.error('Error in renderThoughtsList:', err);
  }
}

/**
 * Handles 1-click linking of current active tab to a specific thought.
 */
async function handleLinkThought(thoughtId, buttonEl) {
  if (!currentUser || !currentUser.uid) {
    showFeedback(thoughtsFeedback, 'Please enter your sync code first.', 'error');
    return;
  }

  // 1. Always re-query the current active tab at the exact time of linking
  await detectActiveTab();

  if (!currentActiveTab || !currentActiveTab.url) {
    showFeedback(thoughtsFeedback, 'No active browser tab found to link.', 'error');
    return;
  }

  const url = currentActiveTab.url;
  const isSystemPage = url.startsWith('chrome://') ||
                       url.startsWith('chrome-extension://') ||
                       url.startsWith('edge://') ||
                       url.startsWith('about:') ||
                       url.startsWith('chrome-search://');

  if (isSystemPage) {
    showFeedback(
      thoughtsFeedback,
      `Cannot link "${currentActiveTab.title || 'system settings'}". Please switch to a web article or page first.`,
      'warning'
    );
    return;
  }

  const title = currentActiveTab.title || 'Web Page';
  const domain = getDomainFromUrl(url);
  const snippet = clipSnippetInput?.value?.trim() || '';
  const favicon = currentActiveTab.favIconUrl || '';

  const linkData = {
    url,
    title,
    domain,
    snippet,
    favicon,
    linkedAt: new Date().toISOString(),
  };

  const originalHtml = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.innerHTML = `<div class="loading-spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></div><span>Linking...</span>`;

  try {
    const targetIdx = allThoughts.findIndex(t => t.id === thoughtId);
    const targetTitle = targetIdx !== -1 ? allThoughts[targetIdx].title : null;
    await linkSourceToThought(currentUser.uid, thoughtId, linkData, currentUser.firebaseIdToken || null, targetTitle);
    if (targetIdx !== -1) {
      if (!allThoughts[targetIdx].linkedSources) {
        allThoughts[targetIdx].linkedSources = [];
      }
      // Deduplicate
      allThoughts[targetIdx].linkedSources = allThoughts[targetIdx].linkedSources.filter(s => s.url !== url);
      allThoughts[targetIdx].linkedSources.unshift(linkData);
      allThoughts[targetIdx].source = 'extension';
      allThoughts[targetIdx].sourceUrl = url;
      allThoughts[targetIdx].sourceTitle = title;
      
      await chrome.storage.local.set({ cachedThoughts: allThoughts });
    }

    buttonEl.classList.add('linked-success');
    buttonEl.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Linked</span>
    `;

    showFeedback(thoughtsFeedback, `Linked page to "${allThoughts[targetIdx]?.title || 'Thought'}"!`, 'success');

    // Re-render thoughts list to update the linked sources display
    setTimeout(() => {
      renderThoughtsList();
    }, 800);
  } catch (err) {
    console.error('handleLinkThought error:', err);
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
    showFeedback(thoughtsFeedback, err.message || 'Failed to link page.', 'error');
  }
}

/**
 * Formats a thought's timestamp for clean display.
 */
function formatThoughtDate(dateVal) {
  if (!dateVal) return 'Recently';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_) {
    return 'Recently';
  }
}