let ws = null;
let status = 'Disconnected';
let paused = false;
let lastAction = null;
let port = 8765;
let reconnectDelay = 2000; // Start with 2 seconds
let maxReconnectDelay = 60000; // Max 60 seconds between retries
let reconnectAttempts = 0;

// Dedicated agent tab - never use user's tabs
let agentTabId = null;
let agentWindowId = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(`ws://localhost:${port}`);
  status = 'Connecting';

  ws.onopen = () => {
    status = 'Connected';
    reconnectDelay = 2000; // Reset backoff on successful connection
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type: 'hello', version: '0.1.0' }));
  };

  ws.onclose = () => {
    status = 'Disconnected';
    ws = null;
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s, 60s...
    reconnectAttempts++;
    const delay = Math.min(reconnectDelay * Math.pow(1.5, reconnectAttempts - 1), maxReconnectDelay);
    setTimeout(connect, delay);
  };

  ws.onerror = () => {
    // Error will be followed by onclose, so don't reconnect here
    status = 'Disconnected';
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'capture') {
      const result = await captureVisibleTab();
      sendResponse(message.id, result);
      return;
    }

    if (message.type === 'action') {
      if (paused) {
        sendError(message.id, 'Extension is paused');
        return;
      }
      try {
        const result = await runAction(message.action);
        lastAction = message.action?.name || 'action';
        sendResponse(message.id, result);
      } catch (err) {
        sendError(message.id, err.message || String(err));
      }
    }
  };
}

async function captureVisibleTab() {
  try {
    // First try to get the active tab in the current window
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // If no active tab in current window, try any window
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }

    // Still no tab? Try to get any tab
    if (!tab) {
      const tabs = await chrome.tabs.query({});
      tab = tabs[0];
    }

    if (!tab || !tab.id) {
      throw new Error('No tab available to capture');
    }

    // Make sure the tab is not a chrome:// or extension page (can't capture those)
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
      throw new Error('Cannot capture Chrome internal pages. Please navigate to a regular webpage.');
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const base64 = dataUrl.split(',')[1];
    return {
      data: base64,
      mimeType: 'image/png',
      url: tab.url,
      width: tab.width,
      height: tab.height,
    };
  } catch (err) {
    // Handle specific permission errors
    if (err.message && err.message.includes('activeTab')) {
      throw new Error('Tab capture permission not available. Please click on the extension icon first, or navigate to a regular webpage.');
    }
    throw err;
  }
}

async function runAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab');
  }
  const result = await chrome.tabs.sendMessage(tab.id, { type: 'action', action });
  return result || { success: true };
}

function sendResponse(id, result) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ id, result }));
}

function sendError(id, error) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ id, error }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'getStatus') {
    sendResponse({ status, paused, lastAction, port });
  }
  if (message.type === 'togglePause') {
    paused = !paused;
    sendResponse({ status, paused, lastAction, port });
  }
  if (message.type === 'reconnect') {
    connect();
    sendResponse({ status, paused, lastAction, port });
  }
  return true;
});

connect();
