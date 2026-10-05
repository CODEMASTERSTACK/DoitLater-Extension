/**
 * Do It Later — Cloudflare Worker API Client
 *
 * All sensitive API keys, secrets, and database credentials remain 100% server-side
 * inside Cloudflare Worker secrets. The Chrome Extension makes authenticated proxy requests.
 */

export const WORKER_BASE_URL = 'https://doitlater-api-proxy.kanasingh974.workers.dev';
export const CLIENT_HEADER = 'doitlater-chrome-extension';

// Google OAuth Web Client ID for Do It Later
export const GOOGLE_OAUTH_CLIENT_ID = '437579957851-c71ko1sm79dqf3eoa4qo1ke1bb1r54g8.apps.googleusercontent.com';

/**
 * Verifies a real Google OAuth ID/Access Token with the Cloudflare Worker.
 * The worker cryptographically validates the token directly with Google & Firebase.
 */
export async function authenticateWithWorker({ idToken, accessToken }) {
  const url = `${WORKER_BASE_URL}/extension/auth`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Client': CLIENT_HEADER,
    },
    body: JSON.stringify({ idToken, accessToken }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Authentication failed with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Pushes a staged thought clip to the user's mobile vault via Cloudflare Worker.
 */
export async function pushClipViaWorker(userId, clip, idToken = null) {
  const url = `${WORKER_BASE_URL}/extension/clip`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Client': CLIENT_HEADER,
    },
    body: JSON.stringify({
      uid: userId,
      clip,
      idToken,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to dispatch clip with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Pairs the laptop extension with the mobile app using a 6-digit sync code.
 */
export async function pairWithCode(code) {
  const url = `${WORKER_BASE_URL}/extension/pair`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Client': CLIENT_HEADER,
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Pairing failed with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Fetches user thoughts from Firestore via Cloudflare Worker.
 */
export async function fetchUserThoughts(userId, idToken = null) {
  const url = new URL(`${WORKER_BASE_URL}/extension/thoughts`);
  url.searchParams.set('uid', userId);
  if (idToken) url.searchParams.set('idToken', idToken);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-App-Client': CLIENT_HEADER,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch thoughts with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Links a web source (URL, title, domain, snippet, favicon) to an existing thought card.
 */
export async function linkSourceToThought(userId, thoughtId, linkData, idToken = null, thoughtTitle = null) {
  const url = `${WORKER_BASE_URL}/extension/thoughts/link`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Client': CLIENT_HEADER,
    },
    body: JSON.stringify({
      uid: userId,
      thoughtId,
      thoughtTitle,
      link: linkData,
      idToken,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to link source with status ${response.status}`);
  }

  return await response.json();
}

