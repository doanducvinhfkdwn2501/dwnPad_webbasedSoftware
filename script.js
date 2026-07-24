// ============ WebSerial ============
let port = null;
let writer = null;
let reader = null;
let isConnected = false;
let isDisconnecting = false;

const connectBtn = document.getElementById('connectBtn');
const statusSpan = document.getElementById('status');
const socdCheckbox = document.getElementById('socdCheckbox');

// ============ Switch selection ============
let activeSwitch = 1;
const switchBtns = document.querySelectorAll('.switch-btn');
switchBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeSwitch = parseInt(btn.dataset.switch);
    const key = activeSwitch === 1 ? currentKeyName1 : currentKeyName2;
    if (key) highlightKey(key);
    else clearKeySelection();
  });
});

// ============ Key storage (two switches) ============
const STORAGE_KEY1 = 'arduinoKey1';
const STORAGE_KEY2 = 'arduinoKey2';
let currentKeyName1 = localStorage.getItem(STORAGE_KEY1) || null;
let currentKeyName2 = localStorage.getItem(STORAGE_KEY2) || null;

const keyLabel1 = document.getElementById('keyLabel1');
const keyLabel2 = document.getElementById('keyLabel2');

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

function updateUIForSwitch(switchNum, keyName, isPending = false) {
  const label = switchNum === 1 ? keyLabel1 : keyLabel2;
  if (keyName) {
    label.textContent = isPending ? keyName + ' (pending)' : keyName;
  } else {
    label.textContent = 'No device';
  }
  if (switchNum === activeSwitch) {
    if (keyName) highlightKey(keyName);
    else clearKeySelection();
  }
}

function updateAllUI() {
  updateUIForSwitch(1, currentKeyName1, false);
  updateUIForSwitch(2, currentKeyName2, false);
}

// ---------- SOCD ----------
function updateSOCDUI(state) {
  socdCheckbox.checked = state === true;
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
  socdCheckbox.disabled = true;
  currentKeyName1 = null;
  currentKeyName2 = null;
  localStorage.removeItem(STORAGE_KEY1);
  localStorage.removeItem(STORAGE_KEY2);
  updateAllUI();
  clearKeySelection();
  updateSOCDUI(false);
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
        // Parse prefixed responses
        if (line.startsWith('KEY1:')) {
          const val = line.substring(5);
          currentKeyName1 = val;
          localStorage.setItem(STORAGE_KEY1, val);
          updateUIForSwitch(1, val, false);
        } else if (line.startsWith('KEY2:')) {
          const val = line.substring(5);
          currentKeyName2 = val;
          localStorage.setItem(STORAGE_KEY2, val);
          updateUIForSwitch(2, val, false);
        } else if (line.startsWith('SOCD:')) {
          const val = line.substring(5);
          const isOn = (val === '1' || val.toLowerCase() === 'on');
          updateSOCDUI(isOn);
        } else {
          // unknown – ignore
          console.log('Unknown response:', line);
        }
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

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    isConnected = true;
    connectBtn.textContent = '🔌 Disconnect';
    connectBtn.classList.add('connected');
    statusSpan.textContent = 'Connected';
    statusSpan.className = 'online';
    connectBtn.blur();
    socdCheckbox.disabled = false;

    port.addEventListener('disconnect', handleDisconnect);

    writer = port.writable.getWriter();

    // Start reading loop
    readLoop();

    // Request all three values (their responses will update the UI)
    await sendRawCommand('GET1');
    await sendRawCommand('GET2');
    await sendRawCommand('GETSOCD');
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
  socdCheckbox.disabled = true;
  currentKeyName1 = null;
  currentKeyName2 = null;
  localStorage.removeItem(STORAGE_KEY1);
  localStorage.removeItem(STORAGE_KEY2);
  updateAllUI();
  clearKeySelection();
  updateSOCDUI(false);
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

async function setKeyForSwitch(switchNum, keyName) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'SET' + switchNum + ':' + keyName + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
    if (switchNum === 1) {
      currentKeyName1 = keyName;
      localStorage.setItem(STORAGE_KEY1, keyName);
      updateUIForSwitch(1, keyName, false);
    } else {
      currentKeyName2 = keyName;
      localStorage.setItem(STORAGE_KEY2, keyName);
      updateUIForSwitch(2, keyName, false);
    }
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

async function setSOCD(state) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'SOCD:' + (state ? '1' : '0') + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
    updateSOCDUI(state);
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
      setKeyForSwitch(activeSwitch, key);
    } else {
      if (activeSwitch === 1) {
        currentKeyName1 = key;
        localStorage.setItem(STORAGE_KEY1, key);
        updateUIForSwitch(1, key, true);
      } else {
        currentKeyName2 = key;
        localStorage.setItem(STORAGE_KEY2, key);
        updateUIForSwitch(2, key, true);
      }
    }
  });
});

// ============ SOCD checkbox event ============
socdCheckbox.addEventListener('change', () => {
  if (isConnected) {
    setSOCD(socdCheckbox.checked);
  } else {
    // Store intention but don't send
    localStorage.setItem('socdState', socdCheckbox.checked ? '1' : '0');
  }
});

// ============ Initialisation ============
updateAllUI();
clearKeySelection();
socdCheckbox.disabled = true;
console.log('WebSerial Key Changer (2 switches + SOCD) ready.');