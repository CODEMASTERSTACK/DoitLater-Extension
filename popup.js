import {
  pairWithCode,
  pushClipViaWorker,
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
const stagedTabView = document.getElementById('stagedTabView');
const historyTabView = document.getElementById('historyTabView');

// Tab Badges
const stagedTabBadge = document.getElementById('stagedTabBadge');
const historyTabBadge = document.getElementById('historyTabBadge');

// Capture View Elements
const pageDomain = document.getElementById('pageDomain');
const clipTitleInput = document.getElementById('clipTitleInput');
const clipSnippetInput = document.getElementById('clipSnippetInput');
const categoryChips = document.getElementById('categoryChips');
const sendToAppBtn = document.getElementById('sendToAppBtn');
const stageBtn = document.getElementById('stageBtn');
const sendFeedback = document.getElementById('sendFeedback');

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

// Detect Active Browser Tab & Read Selection
async function detectActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      pageDomain.textContent = 'Desktop Web';
      return;
    }

    const tab = tabs[0];
    currentActiveTab = tab;

    if (tab.url && typeof tab.url === 'string') {
      try {
        const u = new URL(tab.url);
        pageDomain.textContent = u.hostname.replace(/^www\./, '');
      } catch (_) {
        pageDomain.textContent = tab.url;
      }
    } else {
      pageDomain.textContent = 'Desktop Web';
    }

    if (tab.title && typeof tab.title === 'string') {
      clipTitleInput.value = tab.title;
      autoResizeTitle();
    }

    // Safely execute selection script on HTTP/HTTPS pages
    const urlStr = tab.url || '';
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
            }
          }
        }
      );
    }
  } catch (err) {
    console.warn('Tab inspection notice:', err);
    pageDomain.textContent = 'Desktop Web';
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
  stagedTabView.classList.toggle('hidden', tabName !== 'staged');
  historyTabView.classList.toggle('hidden', tabName !== 'history');

  if (tabName === 'staged') {
    loadStagedClips();
  } else if (tabName === 'history') {
    loadHistoryClips();
  }
}

// Refresh all lists and badges
async function refreshAllViews() {
  await updateBadgeCounters();
  await loadStagedClips();
  await loadHistoryClips();
}

// Update badges on the navigation tabs
async function updateBadgeCounters() {
  const data = await chrome.storage.local.get(['stagedClips', 'historyClips']);
  const staged = data.stagedClips || [];
  const history = data.historyClips || [];

  stagedTabBadge.textContent = staged.length;
  stagedCount.textContent = staged.length;
  historyTabBadge.textContent = history.length;
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
