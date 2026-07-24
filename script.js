// ============ WebSerial ============
let port = null;
let writer = null;
let reader = null;
let isConnected = false;
let isDisconnecting = false;

const connectBtn = document.getElementById('connectBtn');
const statusSpan = document.getElementById('status');
const keyLabel = document.getElementById('currentKeyLabel');

// ============ LocalStorage key persistence ============
const STORAGE_KEY = 'arduinoKey';
let currentKeyName = localStorage.getItem(STORAGE_KEY) || null;

// ---------- UI update helpers ----------
function clearKeySelection() {
  document.querySelectorAll('.key').forEach(el => el.classList.remove('selected'));
}

function highlightKey(keyName) {
  document.querySelectorAll('.key').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.key[data-key="' + keyName + '"]').forEach(el => {
    el.classList.add('selected');
  });
}

function updateUIWithKey(keyName, isPending = false) {
  if (keyName) {
    keyLabel.textContent = isPending ? keyName + ' (pending)' : keyName;
    highlightKey(keyName);
  } else {
    keyLabel.textContent = 'No device';
    clearKeySelection();
  }
}

// ============ Handle unexpected disconnection ============
function handleDisconnect() {
  if (!isConnected) return;
  isConnected = false;
  isDisconnecting = false;
  connectBtn.disabled = false;
  connectBtn.textContent = '🔌 Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected (unplugged)';
  statusSpan.className = '';
  updateUIWithKey(null);
  if (reader) {
    try { reader.releaseLock(); } catch(e) {}
    reader = null;
  }
  if (writer) {
    try { writer.releaseLock(); } catch(e) {}
    writer = null;
  }
  if (port) {
    try { port.close(); } catch(e) {}
    port = null;
  }
}

// ============ Read loop ============
async function readLoop() {
  if (!port || !port.readable) return;
  const textDecoder = new TextDecoder();
  let buffer = '';

  try {
    reader = port.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handleDisconnect();
        break;
      }
      buffer += textDecoder.decode(value, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop();
      for (let line of lines) {
        line = line.trim();
        if (line.length === 0) continue;
        // This line is the key name from Arduino (reply to GETKEY)
        currentKeyName = line;
        localStorage.setItem(STORAGE_KEY, line);
        updateUIWithKey(line, false);
      }
    }
  } catch (err) {
    console.error('Read error:', err);
    handleDisconnect();
  }
}

// ============ Connect / Disconnect ============
connectBtn.addEventListener('click', async () => {
  if (isDisconnecting) return;

  if (isConnected) {
    if (!confirm('⚠️ Are you sure you want to disconnect?')) return;
    await disconnect();
    return;
  }

  // Connect
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    isConnected = true;
    connectBtn.textContent = '🔌 Disconnect';
    connectBtn.classList.add('connected');
    statusSpan.textContent = 'Connected';
    statusSpan.className = 'online';
    connectBtn.blur();

    port.addEventListener('disconnect', handleDisconnect);

    writer = port.writable.getWriter();

    // Start reading loop
    readLoop();

    // Ask Arduino for the current key
    await sendRawCommand('GETKEY');
    // The reply will come via the read loop and update UI.
  } catch (err) {
    console.error(err);
    alert('Could not connect: ' + err.message);
    handleDisconnect();
  }
});

async function disconnect() {
  if (isDisconnecting) return;
  isDisconnecting = true;
  connectBtn.disabled = true;

  if (reader) {
    try { await reader.cancel(); } catch(e) {}
    reader = null;
  }
  if (writer) {
    try { await writer.close(); } catch(e) {}
    writer = null;
  }
  if (port) {
    try { await port.close(); } catch(e) {}
    port = null;
  }

  isConnected = false;
  isDisconnecting = false;
  connectBtn.disabled = false;
  connectBtn.textContent = '🔌 Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected';
  statusSpan.className = '';
  updateUIWithKey(null);
}

// ============ Sending commands ============
async function sendRawCommand(cmd) {
  if (!isConnected || !writer) {
    alert('Not connected.');
    return;
  }
  try {
    await writer.write(new TextEncoder().encode(cmd + '\n'));
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

async function sendKey(keyName) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const command = 'KEY:' + keyName + '\n';
  try {
    await writer.write(new TextEncoder().encode(command));
    currentKeyName = keyName;
    localStorage.setItem(STORAGE_KEY, keyName);
    updateUIWithKey(keyName, false);
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

// ============ Keyboard UI ============
document.querySelectorAll('.key[data-key]').forEach(el => {
  el.addEventListener('click', () => {
    const key = el.dataset.key;
    if (isConnected) {
      sendKey(key);
    } else {
      currentKeyName = key;
      localStorage.setItem(STORAGE_KEY, key);
      updateUIWithKey(key, true);
    }
  });
});

// ============ Initialisation ============
// Start with no device, no selection.
updateUIWithKey(null);
console.log('WebSerial Key Changer ready.');