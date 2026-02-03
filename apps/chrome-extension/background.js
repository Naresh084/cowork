let ws = null;
let status = 'Disconnected';
let paused = false;
let lastAction = null;
let port = 8765;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(`ws://localhost:${port}`);
  status = 'Connecting';

  ws.onopen = () => {
    status = 'Connected';
    ws.send(JSON.stringify({ type: 'hello', version: '0.1.0' }));
  };

  ws.onclose = () => {
    status = 'Disconnected';
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab');
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
