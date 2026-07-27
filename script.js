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
const modeCheckbox = document.getElementById('modeCheckbox');
const autoEnterCheckbox = document.getElementById('autoEnterCheckbox');
const sentenceText = document.getElementById('sentenceText');
const saveSentenceBtn = document.getElementById('saveSentenceBtn');
const currentKeyLabel = document.getElementById('currentKeyLabel');
const sentenceEditor = document.getElementById('sentenceEditor');
const charCountSpan = document.getElementById('charCount');

// ============ Switch selection ============
let activeSwitch = null;
let isLoading = false;
const switchBtns = document.querySelectorAll('.switch-btn');
switchBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sw = parseInt(btn.dataset.switch);
    activeSwitch = sw;
    isLoading = true;
    currentKeyLabel.textContent = 'Loading...';
    sentenceEditor.style.display = 'none';
    sentenceText.disabled = true;
    saveSentenceBtn.disabled = true;
    modeCheckbox.disabled = true;
    autoEnterCheckbox.disabled = true;
    if (isConnected) {
      sendRawCommand('GET' + sw);
      sendRawCommand('GETSENTENCE' + sw);
      sendRawCommand('GETMODE' + sw);
      sendRawCommand('GETAUTOENTER' + sw);
    } else {
      clearKeySelection();
      modeCheckbox.checked = false;
      autoEnterCheckbox.checked = false;
      sentenceText.value = '';
      charCountSpan.textContent = '0';
      currentKeyLabel.textContent = 'No Device';
      isLoading = false;
    }
  });
});

// ============ Key storage (4 switches) ============
const STORAGE_KEYS = ['arduinoKey1', 'arduinoKey2', 'arduinoKey3', 'arduinoKey4'];
let currentKeyNames = [null, null, null, null];
let currentSentences = ['', '', '', ''];
let currentModes = [false, false, false, false];
let currentAutoEnter = [false, false, false, false];

function setCurrentKey(switchNum, keyName) {
  currentKeyNames[switchNum - 1] = keyName;
  localStorage.setItem(STORAGE_KEYS[switchNum - 1], keyName);
}
function getCurrentKey(switchNum) {
  return currentKeyNames[switchNum - 1] || null;
}
function setCurrentSentence(switchNum, text) {
  currentSentences[switchNum - 1] = text;
}
function setCurrentMode(switchNum, mode) {
  currentModes[switchNum - 1] = mode;
}
function setCurrentAutoEnter(switchNum, val) {
  currentAutoEnter[switchNum - 1] = val;
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

function updateUIForSwitch(switchNum) {
  if (switchNum === activeSwitch) {
    const key = getCurrentKey(switchNum);
    const mode = currentModes[switchNum - 1];
    const sent = currentSentences[switchNum - 1];
    const autoEnter = currentAutoEnter[switchNum - 1];
    
    currentKeyLabel.textContent = key || '-';
    modeCheckbox.checked = mode;
    modeCheckbox.disabled = false;
    autoEnterCheckbox.checked = autoEnter;
    autoEnterCheckbox.disabled = false;
    
    sentenceText.value = sent || '';
    charCountSpan.textContent = sent ? sent.length : 0;
    
    if (mode) {
      sentenceEditor.style.display = 'flex';
      sentenceText.disabled = false;
      saveSentenceBtn.disabled = false;
      autoEnterCheckbox.disabled = false;
    } else {
      sentenceEditor.style.display = 'none';
      sentenceText.disabled = true;
      saveSentenceBtn.disabled = true;
      autoEnterCheckbox.disabled = true;
    }
    
    if (!mode && key) {
      highlightKey(key);
    } else {
      clearKeySelection();
    }
    isLoading = false;
  }
}

function updateAllUI() {
  if (activeSwitch === null) {
    clearKeySelection();
    currentKeyLabel.textContent = 'No Device';
    modeCheckbox.checked = false;
    modeCheckbox.disabled = true;
    autoEnterCheckbox.checked = false;
    autoEnterCheckbox.disabled = true;
    sentenceEditor.style.display = 'none';
    sentenceText.disabled = true;
    saveSentenceBtn.disabled = true;
    charCountSpan.textContent = '0';
    return;
  }
  updateUIForSwitch(activeSwitch);
}

// ---------- SOCD ----------
function updateSOCDUI(state) {
  socdCheckbox.checked = state === true;
}

// ---------- Debounce ----------
function updateDebounceUI(value) {
  const validValues = ['5', '15', '30', '50'];
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
  connectBtn.textContent = 'Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected (unplugged)';
  statusSpan.className = '';
  socdCheckbox.disabled = true;
  debounceSelect.disabled = true;
  modeCheckbox.disabled = true;
  autoEnterCheckbox.disabled = true;
  sentenceText.disabled = true;
  saveSentenceBtn.disabled = true;
  sentenceEditor.style.display = 'none';
  debounceSelect.value = '';
  for (let i = 0; i < 4; i++) {
    currentKeyNames[i] = null;
    currentSentences[i] = '';
    currentModes[i] = false;
    currentAutoEnter[i] = false;
  }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
  updateSOCDUI(false);
  currentKeyLabel.textContent = 'No Device';
  charCountSpan.textContent = '0';
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
          if (activeSwitch === 1) updateUIForSwitch(1);
        } else if (line.startsWith('KEY2:')) {
          const val = line.substring(5);
          setCurrentKey(2, val);
          if (activeSwitch === 2) updateUIForSwitch(2);
        } else if (line.startsWith('KEY3:')) {
          const val = line.substring(5);
          setCurrentKey(3, val);
          if (activeSwitch === 3) updateUIForSwitch(3);
        } else if (line.startsWith('KEY4:')) {
          const val = line.substring(5);
          setCurrentKey(4, val);
          if (activeSwitch === 4) updateUIForSwitch(4);
        } else if (line.startsWith('SENTENCE1:')) {
          const val = line.substring(10);
          setCurrentSentence(1, val);
          if (activeSwitch === 1) updateUIForSwitch(1);
        } else if (line.startsWith('SENTENCE2:')) {
          const val = line.substring(10);
          setCurrentSentence(2, val);
          if (activeSwitch === 2) updateUIForSwitch(2);
        } else if (line.startsWith('SENTENCE3:')) {
          const val = line.substring(10);
          setCurrentSentence(3, val);
          if (activeSwitch === 3) updateUIForSwitch(3);
        } else if (line.startsWith('SENTENCE4:')) {
          const val = line.substring(10);
          setCurrentSentence(4, val);
          if (activeSwitch === 4) updateUIForSwitch(4);
        } else if (line.startsWith('MODE1:')) {
          const val = line.substring(6);
          setCurrentMode(1, val === '1');
          if (activeSwitch === 1) updateUIForSwitch(1);
        } else if (line.startsWith('MODE2:')) {
          const val = line.substring(6);
          setCurrentMode(2, val === '1');
          if (activeSwitch === 2) updateUIForSwitch(2);
        } else if (line.startsWith('MODE3:')) {
          const val = line.substring(6);
          setCurrentMode(3, val === '1');
          if (activeSwitch === 3) updateUIForSwitch(3);
        } else if (line.startsWith('MODE4:')) {
          const val = line.substring(6);
          setCurrentMode(4, val === '1');
          if (activeSwitch === 4) updateUIForSwitch(4);
        } else if (line.startsWith('AUTOENTER1:')) {
          const val = line.substring(11);
          setCurrentAutoEnter(1, val === '1');
          if (activeSwitch === 1) updateUIForSwitch(1);
        } else if (line.startsWith('AUTOENTER2:')) {
          const val = line.substring(11);
          setCurrentAutoEnter(2, val === '1');
          if (activeSwitch === 2) updateUIForSwitch(2);
        } else if (line.startsWith('AUTOENTER3:')) {
          const val = line.substring(11);
          setCurrentAutoEnter(3, val === '1');
          if (activeSwitch === 3) updateUIForSwitch(3);
        } else if (line.startsWith('AUTOENTER4:')) {
          const val = line.substring(11);
          setCurrentAutoEnter(4, val === '1');
          if (activeSwitch === 4) updateUIForSwitch(4);
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
    if (!confirm('Are you sure you want to disconnect?')) return;
    await disconnect();
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    isConnected = true;
    connectBtn.textContent = 'Disconnect';
    connectBtn.classList.add('connected');
    statusSpan.textContent = 'Connected';
    statusSpan.className = 'online';
    connectBtn.blur();
    socdCheckbox.disabled = false;
    debounceSelect.disabled = true;
    debounceSelect.value = '';
    modeCheckbox.disabled = true;
    autoEnterCheckbox.disabled = true;
    sentenceText.disabled = true;
    saveSentenceBtn.disabled = true;
    sentenceEditor.style.display = 'none';
    currentKeyLabel.textContent = 'No Device';
    charCountSpan.textContent = '0';

    port.addEventListener('disconnect', handleDisconnect);

    writer = port.writable.getWriter();

    readLoop();

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
  connectBtn.textContent = 'Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected';
  statusSpan.className = '';
  socdCheckbox.disabled = true;
  debounceSelect.disabled = true;
  modeCheckbox.disabled = true;
  autoEnterCheckbox.disabled = true;
  sentenceText.disabled = true;
  saveSentenceBtn.disabled = true;
  sentenceEditor.style.display = 'none';
  debounceSelect.value = '';
  for (let i = 0; i < 4; i++) {
    currentKeyNames[i] = null;
    currentSentences[i] = '';
    currentModes[i] = false;
    currentAutoEnter[i] = false;
  }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
  currentKeyLabel.textContent = 'No Device';
  charCountSpan.textContent = '0';
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
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

async function setSentenceForSwitch(switchNum, text) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'SETSENTENCE' + switchNum + ':' + text + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
    setCurrentSentence(switchNum, text);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

async function setModeForSwitch(switchNum, mode) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'SETMODE' + switchNum + ':' + (mode ? '1' : '0') + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
    setCurrentMode(switchNum, mode);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    handleDisconnect();
    alert('Lost connection to Arduino.');
  }
}

async function setAutoEnterForSwitch(switchNum, val) {
  if (!isConnected || !writer) {
    alert('Please connect to the Arduino first.');
    return;
  }
  const cmd = 'SETAUTOENTER' + switchNum + ':' + (val ? '1' : '0') + '\n';
  try {
    await writer.write(new TextEncoder().encode(cmd));
    setCurrentAutoEnter(switchNum, val);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
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
      if (activeSwitch === activeSwitch) updateUIForSwitch(activeSwitch);
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

// ============ Mode checkbox event ============
modeCheckbox.addEventListener('change', () => {
  if (isConnected) {
    if (activeSwitch !== null) {
      setModeForSwitch(activeSwitch, modeCheckbox.checked);
    }
  } else {
    if (activeSwitch !== null) {
      setCurrentMode(activeSwitch, modeCheckbox.checked);
      updateUIForSwitch(activeSwitch);
    }
  }
});

// ============ Auto Enter checkbox event ============
autoEnterCheckbox.addEventListener('change', () => {
  if (isConnected) {
    if (activeSwitch !== null) {
      setAutoEnterForSwitch(activeSwitch, autoEnterCheckbox.checked);
    }
  } else {
    if (activeSwitch !== null) {
      setCurrentAutoEnter(activeSwitch, autoEnterCheckbox.checked);
      updateUIForSwitch(activeSwitch);
    }
  }
});

// ============ Save sentence button ============
saveSentenceBtn.addEventListener('click', () => {
  if (isConnected && activeSwitch !== null) {
    const text = sentenceText.value;
    setSentenceForSwitch(activeSwitch, text);
  }
});

// ============ Character counter ============
sentenceText.addEventListener('input', () => {
  charCountSpan.textContent = sentenceText.value.length;
});

// ============ Initialisation ============
clearKeySelection();
switchBtns.forEach(b => b.classList.remove('active'));
activeSwitch = null;
socdCheckbox.disabled = true;
debounceSelect.disabled = true;
modeCheckbox.disabled = true;
autoEnterCheckbox.disabled = true;
sentenceText.disabled = true;
saveSentenceBtn.disabled = true;
sentenceEditor.style.display = 'none';
debounceSelect.value = '';
currentKeyLabel.textContent = 'No Device';
charCountSpan.textContent = '0';
console.log('dwnPad Key Changer ready.');