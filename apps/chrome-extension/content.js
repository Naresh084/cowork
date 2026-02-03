chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'action') return;

  const { name, args } = message.action || {};

  try {
    switch (name) {
      case 'open_web_browser':
      case 'navigate':
        if (args?.url) window.location.href = args.url;
        break;
      case 'search':
        if (args?.query) {
          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
        }
        break;
      case 'click_at':
        dispatchMouseEvent(args?.x, args?.y, 'click');
        break;
      case 'hover_at':
        dispatchMouseEvent(args?.x, args?.y, 'mousemove');
        break;
      case 'type_text_at':
        typeTextAt(args);
        break;
      case 'scroll_document':
        window.scrollBy(0, args?.direction === 'up' ? -500 : 500);
        break;
      case 'scroll_at':
        window.scrollBy(0, args?.direction === 'up' ? -(args?.amount || 500) : (args?.amount || 500));
        break;
      case 'drag_and_drop':
        dragAndDrop(args);
        break;
      case 'go_back':
        history.back();
        break;
      case 'go_forward':
        history.forward();
        break;
      case 'wait_5_seconds':
        setTimeout(() => sendResponse({ success: true }), 5000);
        return true;
      case 'key_combination':
        dispatchKeyCombo(args?.keys || []);
        break;
    }

    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message || String(err) });
  }
  return true;
});

function dispatchMouseEvent(x, y, type) {
  const target = document.elementFromPoint(x, y);
  if (!target) return;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
}

function typeTextAt(args) {
  const x = args?.x || 0;
  const y = args?.y || 0;
  const text = args?.text || '';
  const target = document.elementFromPoint(x, y);
  if (!target) return;
  target.focus();
  if (args?.clear_text) {
    if (target.value !== undefined) target.value = '';
  }
  document.execCommand('insertText', false, text);
  if (args?.press_enter) {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    target.dispatchEvent(event);
  }
}

function dragAndDrop(args) {
  const fromX = args?.x || 0;
  const fromY = args?.y || 0;
  const toX = args?.to_x || 0;
  const toY = args?.to_y || 0;
  const source = document.elementFromPoint(fromX, fromY);
  const target = document.elementFromPoint(toX, toY);
  if (!source || !target) return;

  const dataTransfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true }));
  target.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }));
  source.dispatchEvent(new DragEvent('dragend', { dataTransfer, bubbles: true }));
}

function dispatchKeyCombo(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  const event = new KeyboardEvent('keydown', { key: keys[keys.length - 1], bubbles: true });
  document.activeElement?.dispatchEvent(event);
}
