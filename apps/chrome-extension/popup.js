const statusBadge = document.getElementById('statusBadge');
const portValue = document.getElementById('portValue');
const lastAction = document.getElementById('lastAction');
const togglePause = document.getElementById('togglePause');
const reconnect = document.getElementById('reconnect');

function updateUI(state) {
  statusBadge.textContent = state.status;
  statusBadge.className = 'badge';
  if (state.status === 'Connected') {
    statusBadge.classList.add('connected');
  }
  if (state.paused) {
    statusBadge.classList.add('paused');
  }
  portValue.textContent = state.port || '8765';
  lastAction.textContent = state.lastAction || '—';
  togglePause.textContent = state.paused ? 'Resume' : 'Pause';
}

function fetchStatus() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (state) => {
    if (state) updateUI(state);
  });
}

togglePause.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'togglePause' }, (state) => {
    if (state) updateUI(state);
  });
});

reconnect.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'reconnect' }, (state) => {
    if (state) updateUI(state);
  });
});

fetchStatus();
