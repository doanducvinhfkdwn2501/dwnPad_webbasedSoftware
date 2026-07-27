// ============ WebSerial ============
let port = null;
let writer = null;
let reader = null;
let isConnected = false;
let isDisconnecting = false;

const connectBtn = document.getElementById('connectBtn');
const statusSpan = document.getElementById('status');
const socdCheckbox = document.getElementById('socdCheckbox');
const debounceSelect = document.getElementById('debounceSelect');

// ============ Switch selection ============
let activeSwitch = null;
const switchBtns = document.querySelectorAll('.switch-btn');
switchBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sw = parseInt(btn.dataset.switch);
    activeSwitch = sw;
    if (isConnected) {
      sendRawCommand('GET' + sw);
    } else {
      clearKeySelection();
    }
  });
});

// ============ Key storage (4 switches) ============
const STORAGE_KEYS = ['arduinoKey1', 'arduinoKey2', 'arduinoKey3', 'arduinoKey4'];
let currentKeyNames = [null, null, null, null];

function getCurrentKey(switchNum) {
  return currentKeyNames[switchNum - 1] || null;
}
function setCurrentKey(switchNum, keyName) {
  currentKeyNames[switchNum - 1] = keyName;
  localStorage.setItem(STORAGE_KEYS[switchNum - 1], keyName);
}

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

function updateUIForSwitch(switchNum, keyName) {
  // Only update the keyboard highlight if this switch is active
  if (switchNum === activeSwitch) {
    if (keyName) highlightKey(keyName);
    else clearKeySelection();
  }
}

function updateAllUI() {
  // Just clear highlights if no switch is active
  if (activeSwitch === null) {
    clearKeySelection();
  } else {
    const key = getCurrentKey(activeSwitch);
    if (key) highlightKey(key);
    else clearKeySelection();
  }
}

// ---------- SOCD ----------
function updateSOCDUI(state) {
  socdCheckbox.checked = state === true;
}

// ---------- Debounce ----------
function updateDebounceUI(value) {
  const validValues = ['15', '30', '50'];
  const valStr = String(value);
  if (validValues.includes(valStr)) {
    debounceSelect.value = valStr;
  } else {
    console.warn('Unknown debounce value from Arduino:', value, '– defaulting to 50');
    debounceSelect.value = '50';
  }
  debounceSelect.disabled = false;
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
  debounceSelect.disabled = true;
  debounceSelect.value = '';
  for (let i = 0; i < 4; i++) {
    currentKeyNames[i] = null;
  }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
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
        if (line.startsWith('KEY1:')) {
          const val = line.substring(5);
          setCurrentKey(1, val);
          updateUIForSwitch(1, val);
        } else if (line.startsWith('KEY2:')) {
          const val = line.substring(5);
          setCurrentKey(2, val);
          updateUIForSwitch(2, val);
        } else if (line.startsWith('KEY3:')) {
          const val = line.substring(5);
          setCurrentKey(3, val);
          updateUIForSwitch(3, val);
        } else if (line.startsWith('KEY4:')) {
          const val = line.substring(5);
          setCurrentKey(4, val);
          updateUIForSwitch(4, val);
        } else if (line.startsWith('SOCD:')) {
          const val = line.substring(5);
          const isOn = (val === '1' || val.toLowerCase() === 'on');
          updateSOCDUI(isOn);
        } else if (line.startsWith('DEBOUNCE:')) {
          const val = line.substring(9);
          updateDebounceUI(val);
        } else {
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
    debounceSelect.disabled = true;
    debounceSelect.value = '';

    port.addEventListener('disconnect', handleDisconnect);

    writer = port.writable.getWriter();

    // Start reading loop
    readLoop();

    // Fetch global settings (SOCD and debounce) – no keys yet
    await sendRawCommand('GETSOCD');
    await sendRawCommand('GETDEBOUNCE');
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
  debounceSelect.disabled = true;
  debounceSelect.value = '';
  for (let i = 0; i < 4; i++) {
    currentKeyNames[i] = null;
  }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
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
    setCurrentKey(switchNum, keyName);
    updateUIForSwitch(switchNum, keyName);
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

async function setDebounce(value) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'DEBOUNCE:' + value + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
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
      if (activeSwitch === null) {
        alert('Please select a switch first (click one of the square buttons).');
        return;
      }
      setKeyForSwitch(activeSwitch, key);
    } else {
      if (activeSwitch === null) {
        alert('Please select a switch first (click one of the square buttons).');
        return;
      }
      setCurrentKey(activeSwitch, key);
      updateUIForSwitch(activeSwitch, key);
    }
  });
});

// ============ SOCD checkbox event ============
socdCheckbox.addEventListener('change', () => {
  if (isConnected) {
    setSOCD(socdCheckbox.checked);
  } else {
    localStorage.setItem('socdState', socdCheckbox.checked ? '1' : '0');
  }
});

// ============ Debounce dropdown event ============
debounceSelect.addEventListener('change', () => {
  const val = debounceSelect.value;
  if (val === '') return;
  if (isConnected) {
    setDebounce(val);
  } else {
    localStorage.setItem('debounceValue', val);
  }
});

// ============ Initialisation ============
clearKeySelection();
switchBtns.forEach(b => b.classList.remove('active'));
activeSwitch = null;
socdCheckbox.disabled = true;
debounceSelect.disabled = true;
debounceSelect.value = '';
console.log('WebSerial Key Changer (4 switches + SOCD + debounce) ready.');