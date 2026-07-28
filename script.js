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
const modeSelect = document.getElementById('modeSelect');
const sentenceText = document.getElementById('sentenceText');
const saveSentenceBtn = document.getElementById('saveSentenceBtn');
const currentKeyLabel = document.getElementById('currentKeyLabel');
const sentenceEditor = document.getElementById('sentenceEditor');
const macroManager = document.getElementById('macroManager');
const charCountSpan = document.getElementById('charCount');
const autoEnterCheckbox = document.getElementById('autoEnterCheckbox');
const interactiveArea = document.getElementById('interactive-area');
const profileList = document.getElementById('profileList');
const newProfileBtn = document.getElementById('newProfileBtn');
const renameProfileBtn = document.getElementById('renameProfileBtn');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');
const recordProfileBtn = document.getElementById('recordProfileBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const assignProfileBtn = document.getElementById('assignProfileBtn');
const recordingStatus = document.getElementById('recordingStatus');
const macroPreview = document.getElementById('macroPreview');
const presetLibrary = document.getElementById('presetLibrary');
const presetSearch = document.getElementById('presetSearch');
const presetList = document.getElementById('presetList');

// ============ Macro Profiles ============
let macroProfiles = [];
let selectedProfileIndex = -1;
let isRecording = false;
let recordingEvents = [];
let recordTimeout = null;

let switchProfileMap = {};

function loadSwitchProfileMap() {
  const stored = localStorage.getItem('dwnPadSwitchProfileMap');
  if (stored) {
    try { switchProfileMap = JSON.parse(stored); } catch(e) { switchProfileMap = {}; }
  } else {
    switchProfileMap = {};
  }
}

function saveSwitchProfileMap() {
  localStorage.setItem('dwnPadSwitchProfileMap', JSON.stringify(switchProfileMap));
}

function migrateProfiles(profiles) {
  const specialMap = {
    43: 179,  // Tab
    115: 197, // F4
    27: 177,  // Esc
    46: 212,  // Delete
    122: 204, // F11
    36: 210,  // Home
    37: 216,  // Left
    38: 218,  // Up
    39: 215,  // Right
    40: 217,  // Down
  };

  for (let profile of profiles) {
    if (!profile.events) continue;
    for (let ev of profile.events) {
      let code = ev.keycode;
      if (code >= 65 && code <= 90) {
        ev.keycode = code + 32;
      }
      if ((ev.modifiers & 0x04) && code === 115) {
        ev.keycode = 197;
      }
      if ((ev.modifiers & 0x03) && code === 27) {
        ev.keycode = 177;
      }
      if ((ev.modifiers & 0x02) && code === 46) {
        ev.keycode = 212;
      }
      if ((ev.modifiers & 0x08) && code === 43) {
        ev.keycode = 179;
      }
      if (code === 122 && ev.modifiers === 0) {
        ev.keycode = 204;
      }
      if (ev.modifiers & 0x08) {
        if (code === 37) ev.keycode = 216;
        else if (code === 38) ev.keycode = 218;
        else if (code === 39) ev.keycode = 215;
        else if (code === 40) ev.keycode = 217;
      }
    }
  }
  return profiles;
}

function loadProfiles() {
  const stored = localStorage.getItem('dwnPadMacroProfiles');
  if (stored) {
    try {
      macroProfiles = JSON.parse(stored);
      macroProfiles = migrateProfiles(macroProfiles);
      saveProfiles();
    } catch(e) { macroProfiles = []; }
  } else {
    macroProfiles = [];
  }
  renderProfiles();
  if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
    updateUIForSwitch(activeSwitch);
  }
}

function saveProfiles() {
  localStorage.setItem('dwnPadMacroProfiles', JSON.stringify(macroProfiles));
}

function renderProfiles() {
  if (macroProfiles.length === 0) {
    if (profileList) profileList.innerHTML = '<div class="profile-empty">No macro profiles found. Create a new profile to get started.</div>';
    selectedProfileIndex = -1;
    if (deleteProfileBtn) deleteProfileBtn.disabled = true;
    if (renameProfileBtn) renameProfileBtn.disabled = true;
    if (recordProfileBtn) recordProfileBtn.disabled = true;
    if (assignProfileBtn) assignProfileBtn.disabled = true;
    if (macroPreview) macroPreview.textContent = '';
    return;
  }
  let html = '';
  macroProfiles.forEach((p, i) => {
    const sel = i === selectedProfileIndex ? 'selected' : '';
    const count = p.events ? p.events.length : 0;
    html += `<div class="profile-item ${sel}" data-index="${i}">
              <span class="name">${p.name}</span>
              <span class="count">${count} keys</span>
            </div>`;
  });
  if (profileList) profileList.innerHTML = html;
  document.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      selectProfile(idx);
    });
  });
  if (selectedProfileIndex >= 0 && selectedProfileIndex < macroProfiles.length) {
    if (deleteProfileBtn) deleteProfileBtn.disabled = false;
    if (renameProfileBtn) renameProfileBtn.disabled = false;
    if (recordProfileBtn) recordProfileBtn.disabled = false;
    if (assignProfileBtn) assignProfileBtn.disabled = false;
    const p = macroProfiles[selectedProfileIndex];
    if (macroPreview) macroPreview.textContent = p.events ? formatMacroPreview(p.events) : 'Empty';
  } else {
    if (deleteProfileBtn) deleteProfileBtn.disabled = true;
    if (renameProfileBtn) renameProfileBtn.disabled = true;
    if (recordProfileBtn) recordProfileBtn.disabled = true;
    if (assignProfileBtn) assignProfileBtn.disabled = true;
    if (macroPreview) macroPreview.textContent = '';
  }
}

function selectProfile(idx) {
  selectedProfileIndex = idx;
  renderProfiles();
  if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
    updateUIForSwitch(activeSwitch);
  }
}

function keyNameFromCode(code) {
  if (code >= 32 && code <= 126) {
    return String.fromCharCode(code);
  }
  const map = {
    177: 'Esc', 178: 'Backspace', 179: 'Tab', 176: 'Enter',
    212: 'Delete', 209: 'Insert', 210: 'Home', 211: 'End',
    213: 'PageUp', 214: 'PageDown',
    216: 'Left', 217: 'Down', 218: 'Up', 215: 'Right',
    194: 'F1', 195: 'F2', 196: 'F3', 197: 'F4',
    198: 'F5', 199: 'F6', 200: 'F7', 201: 'F8',
    202: 'F9', 203: 'F10', 204: 'F11', 205: 'F12',
    206: 'PrtSc', 207: 'ScrollLock', 208: 'Pause',
    44: 'PrtSc'
  };
  return map[code] || '#' + code;
}

function formatMacroPreview(events) {
  if (!events || events.length === 0) return 'Empty';
  let parts = [];
  for (let e of events) {
    let mods = [];
    if (e.modifiers & 0x01) mods.push('Ctrl');
    if (e.modifiers & 0x02) mods.push('Shift');
    if (e.modifiers & 0x04) mods.push('Alt');
    if (e.modifiers & 0x08) mods.push('Win');
    let key = keyNameFromCode(e.keycode);
    let full = (mods.length ? mods.join('+') + '+' : '') + key;
    parts.push(full);
  }
  return parts.join(' → ');
}

// ============ Preset Library ============
const presetLibraryData = {
  'Essentials': [
    { name: 'Ctrl+C (Copy)', mods: 0x01, code: 99 },
    { name: 'Ctrl+X (Cut)', mods: 0x01, code: 120 },
    { name: 'Ctrl+V (Paste)', mods: 0x01, code: 118 },
    { name: 'Ctrl+Shift+V (Paste Plain)', mods: 0x03, code: 118 },
    { name: 'Ctrl+Z (Undo)', mods: 0x01, code: 122 },
    { name: 'Ctrl+Y (Redo)', mods: 0x01, code: 121 },
    { name: 'Ctrl+A (Select All)', mods: 0x01, code: 97 },
    { name: 'Ctrl+S (Save)', mods: 0x01, code: 115 },
    { name: 'Ctrl+F (Find)', mods: 0x01, code: 102 },
    { name: 'Alt+Tab (Switch App)', mods: 0x04, code: 179 },
    { name: 'Alt+F4 (Close)', mods: 0x04, code: 197 },
    { name: 'Ctrl+Shift+Esc (Task Manager)', mods: 0x03, code: 177 },
    { name: 'Shift+Delete (Permanent Delete)', mods: 0x02, code: 212 },
  ],
  'Windows Key': [
    { name: 'Win+E (Explorer)', mods: 0x08, code: 101 },
    { name: 'Win+I (Settings)', mods: 0x08, code: 105 },
    { name: 'Win+D (Desktop)', mods: 0x08, code: 100 },
    { name: 'Win+L (Lock)', mods: 0x08, code: 108 },
    { name: 'Win+S (Search)', mods: 0x08, code: 115 },
    { name: 'Win+V (Clipboard)', mods: 0x08, code: 118 },
    { name: 'Win+X (Power Menu)', mods: 0x08, code: 120 },
    { name: 'Win+. (Emoji)', mods: 0x08, code: 46 },
    { name: 'Win+Tab (Task View)', mods: 0x08, code: 179 },
    { name: 'Win+G (Game Bar)', mods: 0x08, code: 103 },
    { name: 'Win+R (Run)', mods: 0x08, code: 114 },
    { name: 'Win+A (Quick Settings)', mods: 0x08, code: 97 },
  ],
  'Window Management': [
    { name: 'Win+↑ (Maximize)', mods: 0x08, code: 218 },
    { name: 'Win+↓ (Minimize)', mods: 0x08, code: 217 },
    { name: 'Win+← (Snap Left)', mods: 0x08, code: 216 },
    { name: 'Win+→ (Snap Right)', mods: 0x08, code: 215 },
    { name: 'Win+Home (Minimize Others)', mods: 0x08, code: 210 },
    { name: 'Win+M (Minimize All)', mods: 0x08, code: 109 },
    { name: 'Win+Shift+S (Snipping)', mods: 0x0A, code: 115 },
    { name: 'Win+PrtScn (Screenshot)', mods: 0x08, code: 206 },
    { name: 'F11 (Fullscreen)', mods: 0x00, code: 204 },
  ],
  'Virtual Desktops': [
    { name: 'Win+Ctrl+D (New Desktop)', mods: 0x09, code: 100 },
    { name: 'Win+Ctrl+F4 (Close Desktop)', mods: 0x09, code: 197 },
    { name: 'Win+Ctrl+← (Prev Desktop)', mods: 0x09, code: 216 },
    { name: 'Win+Ctrl+→ (Next Desktop)', mods: 0x09, code: 215 },
  ],
  'Browser & Apps': [
    { name: 'Ctrl+T (New Tab)', mods: 0x01, code: 116 },
    { name: 'Ctrl+W (Close Tab)', mods: 0x01, code: 119 },
    { name: 'Ctrl+Shift+T (Reopen Tab)', mods: 0x03, code: 116 },
    { name: 'Ctrl+Tab (Next Tab)', mods: 0x01, code: 179 },
    { name: 'Ctrl+Shift+Tab (Prev Tab)', mods: 0x03, code: 179 },
    { name: 'Ctrl+Shift+N (Incognito)', mods: 0x03, code: 110 },
    { name: 'Ctrl+P (Print)', mods: 0x01, code: 112 },
    { name: 'Ctrl+Shift+P (Print Preview)', mods: 0x03, code: 112 },
  ],
};

function renderPresets(filter = '') {
  if (!presetList) return;
  presetList.innerHTML = '';
  let count = 0;
  for (const [category, items] of Object.entries(presetLibraryData)) {
    for (const item of items) {
      const lowerFilter = filter.toLowerCase();
      if (lowerFilter && !item.name.toLowerCase().includes(lowerFilter)) continue;
      const tag = document.createElement('div');
      tag.className = 'preset-tag';
      tag.innerHTML = `<span class="category">${category}:</span> ${item.name}`;
      tag.addEventListener('click', () => {
        importPreset(item);
      });
      presetList.appendChild(tag);
      count++;
    }
  }
  if (count === 0) {
    presetList.innerHTML = '<div style="color:#666;font-style:italic;font-size:0.8rem;padding:4px 0;">No presets match your search.</div>';
  }
}

function importPreset(preset) {
  const name = preset.name;
  let newName = name;
  let suffix = 2;
  while (macroProfiles.some(p => p.name === newName)) {
    newName = name + ' (' + suffix + ')';
    suffix++;
  }
  const events = [{ modifiers: preset.mods, keycode: preset.code }];
  macroProfiles.push({ name: newName, events: events });
  saveProfiles();
  selectProfile(macroProfiles.length - 1);
  renderProfiles();
  if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
    updateUIForSwitch(activeSwitch);
  }
  document.querySelectorAll('.preset-tag').forEach(el => {
    if (el.textContent.includes(preset.name)) {
      el.classList.add('selected');
      setTimeout(() => el.classList.remove('selected'), 1500);
    }
  });
}

// ============ Lock / Unlock ============
function lockInteractive(locked) {
  if (!interactiveArea) return;
  if (locked) {
    interactiveArea.classList.add('locked');
  } else {
    interactiveArea.classList.remove('locked');
  }
}

// ============ Switch selection ============
let activeSwitch = null;
let isLoading = false;
const switchBtns = document.querySelectorAll('.switch-btn');
switchBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!isConnected) return;
    const sw = parseInt(btn.dataset.switch);
    if (activeSwitch === sw) {
      btn.classList.remove('active');
      activeSwitch = null;
      clearKeySelection();
      if (currentKeyLabel) currentKeyLabel.textContent = 'select a key';
      if (modeSelect) {
        modeSelect.value = '';
        modeSelect.disabled = true;
      }
      if (sentenceEditor) sentenceEditor.style.display = 'none';
      if (macroManager) macroManager.style.display = 'none';
      if (presetLibrary) presetLibrary.style.display = 'none';
      if (sentenceText) sentenceText.disabled = true;
      if (saveSentenceBtn) saveSentenceBtn.disabled = true;
      if (charCountSpan) charCountSpan.textContent = '0';
      dimKeyboard(false, 0);
      dimKeyDisplay(false);
      return;
    }
    switchBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeSwitch = sw;
    isLoading = true;
    if (currentKeyLabel) currentKeyLabel.textContent = 'Loading...';
    if (sentenceEditor) sentenceEditor.style.display = 'none';
    if (macroManager) macroManager.style.display = 'none';
    if (presetLibrary) presetLibrary.style.display = 'none';
    if (sentenceText) sentenceText.disabled = true;
    if (saveSentenceBtn) saveSentenceBtn.disabled = true;
    if (modeSelect) {
      modeSelect.disabled = true;
      modeSelect.value = '';
    }
    if (isConnected) {
      (async () => {
        try {
          await sendRawCommand('GET' + sw);
          await delay(20);
          await sendRawCommand('GETSENTENCE' + sw);
          await delay(20);
          await sendRawCommand('GETMODE' + sw);
          await delay(20);
          await sendRawCommand('GETAUTOENTER' + sw);
        } catch (e) {
          console.warn('Failed to fetch switch data:', e);
          if (currentKeyLabel) currentKeyLabel.textContent = 'Error loading';
        }
      })();
    } else {
      clearKeySelection();
      if (modeSelect) {
        modeSelect.value = '';
        modeSelect.disabled = true;
      }
      if (sentenceText) sentenceText.value = '';
      if (charCountSpan) charCountSpan.textContent = '0';
      if (currentKeyLabel) currentKeyLabel.textContent = 'select a key';
      dimKeyboard(false, 0);
      dimKeyDisplay(false);
      isLoading = false;
    }
  });
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Key storage ============
const STORAGE_KEYS = ['arduinoKey1', 'arduinoKey2', 'arduinoKey3', 'arduinoKey4'];
let currentKeyNames = [null, null, null, null];
let currentSentences = ['', '', '', ''];
let currentModes = [0, 0, 0, 0];
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

// ---------- Dimming ----------
function dimKeyboard(dimmed, mode) {
  const keyboard = document.getElementById('keyboard');
  if (!keyboard) return;
  let overlay = keyboard.querySelector('.dim-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'dim-overlay';
    keyboard.prepend(overlay);
  }
  if (dimmed) {
    keyboard.classList.add('dimmed');
    if (mode === 1) overlay.textContent = 'Sentence Mode';
    else if (mode === 2) overlay.textContent = 'Macro Mode';
    else overlay.textContent = '';
  } else {
    keyboard.classList.remove('dimmed');
    overlay.textContent = '';
  }
}

function dimKeyDisplay(dimmed) {
  const keyDisplay = document.getElementById('keyDisplay');
  if (!keyDisplay) return;
  if (dimmed) keyDisplay.classList.add('dimmed-label');
  else keyDisplay.classList.remove('dimmed-label');
}

function updateUIForSwitch(switchNum) {
  if (switchNum === activeSwitch) {
    const key = getCurrentKey(switchNum);
    const mode = currentModes[switchNum - 1];
    const sent = currentSentences[switchNum - 1];
    const autoEnter = currentAutoEnter[switchNum - 1];

    if (mode === 2) {
      const profileIndex = switchProfileMap[switchNum];
      if (profileIndex !== undefined && profileIndex >= 0 && profileIndex < macroProfiles.length) {
        currentKeyLabel.textContent = 'Profile: ' + macroProfiles[profileIndex].name;
      } else {
        currentKeyLabel.textContent = 'No profile assigned';
      }
    } else {
      currentKeyLabel.textContent = key || '-';
    }

    if (modeSelect) {
      modeSelect.value = mode;
      modeSelect.disabled = false;
    }

    if (sentenceText) sentenceText.value = sent || '';
    if (charCountSpan) charCountSpan.textContent = sent ? sent.length : 0;

    const shouldDim = (mode === 1 || mode === 2);
    dimKeyboard(shouldDim, mode);
    dimKeyDisplay(shouldDim);

    if (mode === 1) {
      if (sentenceEditor) sentenceEditor.style.display = 'flex';
      if (macroManager) macroManager.style.display = 'none';
      if (presetLibrary) presetLibrary.style.display = 'none';
      if (sentenceText) sentenceText.disabled = false;
      if (saveSentenceBtn) saveSentenceBtn.disabled = false;
      if (autoEnterCheckbox) autoEnterCheckbox.disabled = false;
    } else if (mode === 2) {
      if (sentenceEditor) sentenceEditor.style.display = 'none';
      if (macroManager) macroManager.style.display = 'block';
      if (presetLibrary) presetLibrary.style.display = 'block';
      if (sentenceText) sentenceText.disabled = true;
      if (saveSentenceBtn) saveSentenceBtn.disabled = true;
      if (autoEnterCheckbox) autoEnterCheckbox.disabled = true;
      if (isConnected) {
        if (newProfileBtn) newProfileBtn.disabled = false;
        renderProfiles();
        renderPresets('');
      }
    } else {
      if (sentenceEditor) sentenceEditor.style.display = 'none';
      if (macroManager) macroManager.style.display = 'none';
      if (presetLibrary) presetLibrary.style.display = 'none';
      if (sentenceText) sentenceText.disabled = true;
      if (saveSentenceBtn) saveSentenceBtn.disabled = true;
      if (autoEnterCheckbox) autoEnterCheckbox.disabled = true;
    }

    if (mode === 0 && key) highlightKey(key);
    else clearKeySelection();
    isLoading = false;
  }
}

function updateAllUI() {
  if (activeSwitch === null) {
    clearKeySelection();
    if (currentKeyLabel) currentKeyLabel.textContent = 'select a key';
    if (modeSelect) {
      modeSelect.value = '';
      modeSelect.disabled = true;
    }
    if (sentenceEditor) sentenceEditor.style.display = 'none';
    if (macroManager) macroManager.style.display = 'none';
    if (presetLibrary) presetLibrary.style.display = 'none';
    if (sentenceText) sentenceText.disabled = true;
    if (saveSentenceBtn) saveSentenceBtn.disabled = true;
    if (charCountSpan) charCountSpan.textContent = '0';
    dimKeyboard(false, 0);
    dimKeyDisplay(false);
    return;
  }
  updateUIForSwitch(activeSwitch);
}

// ---------- SOCD ----------
function updateSOCDUI(state) {
  if (socdCheckbox) socdCheckbox.checked = state === true;
}

// ---------- Debounce ----------
function updateDebounceUI(value) {
  if (!debounceSelect) return;
  const validValues = ['5', '15', '30', '50'];
  const valStr = String(value);
  if (validValues.includes(valStr)) debounceSelect.value = valStr;
  else { console.warn('Unknown debounce value:', value); debounceSelect.value = '50'; }
  debounceSelect.disabled = false;
}

// ============ Handle disconnect ============
function handleDisconnect() {
  if (!isConnected) return;
  isConnected = false;
  isDisconnecting = false;
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected (unplugged)';
  statusSpan.className = '';
  if (socdCheckbox) socdCheckbox.disabled = true;
  if (debounceSelect) debounceSelect.disabled = true;
  if (modeSelect) { modeSelect.disabled = true; modeSelect.value = ''; }
  if (sentenceText) sentenceText.disabled = true;
  if (saveSentenceBtn) saveSentenceBtn.disabled = true;
  if (sentenceEditor) sentenceEditor.style.display = 'none';
  if (macroManager) macroManager.style.display = 'none';
  if (presetLibrary) presetLibrary.style.display = 'none';
  if (debounceSelect) debounceSelect.value = '';
  for (let i = 0; i < 4; i++) {
    currentKeyNames[i] = null; currentSentences[i] = ''; currentModes[i] = 0; currentAutoEnter[i] = false;
  }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
  updateSOCDUI(false);
  if (currentKeyLabel) currentKeyLabel.textContent = 'No device';
  if (charCountSpan) charCountSpan.textContent = '0';
  dimKeyboard(false, 0);
  dimKeyDisplay(false);
  lockInteractive(true);
  if (reader) { try { reader.releaseLock(); } catch(e) {} reader = null; }
  if (writer) { try { writer.releaseLock(); } catch(e) {} writer = null; }
  if (port) { try { port.close(); } catch(e) {} port = null; }
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
      if (done) { handleDisconnect(); break; }
      buffer += textDecoder.decode(value, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop();
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('KEY1:')) { const val = line.substring(5); setCurrentKey(1, val); if (activeSwitch === 1) updateUIForSwitch(1); }
        else if (line.startsWith('KEY2:')) { const val = line.substring(5); setCurrentKey(2, val); if (activeSwitch === 2) updateUIForSwitch(2); }
        else if (line.startsWith('KEY3:')) { const val = line.substring(5); setCurrentKey(3, val); if (activeSwitch === 3) updateUIForSwitch(3); }
        else if (line.startsWith('KEY4:')) { const val = line.substring(5); setCurrentKey(4, val); if (activeSwitch === 4) updateUIForSwitch(4); }
        else if (line.startsWith('SENTENCE1:')) { const val = line.substring(10); setCurrentSentence(1, val); if (activeSwitch === 1) updateUIForSwitch(1); }
        else if (line.startsWith('SENTENCE2:')) { const val = line.substring(10); setCurrentSentence(2, val); if (activeSwitch === 2) updateUIForSwitch(2); }
        else if (line.startsWith('SENTENCE3:')) { const val = line.substring(10); setCurrentSentence(3, val); if (activeSwitch === 3) updateUIForSwitch(3); }
        else if (line.startsWith('SENTENCE4:')) { const val = line.substring(10); setCurrentSentence(4, val); if (activeSwitch === 4) updateUIForSwitch(4); }
        else if (line.startsWith('MODE1:')) { const val = parseInt(line.substring(6)); setCurrentMode(1, val); if (activeSwitch === 1) updateUIForSwitch(1); }
        else if (line.startsWith('MODE2:')) { const val = parseInt(line.substring(6)); setCurrentMode(2, val); if (activeSwitch === 2) updateUIForSwitch(2); }
        else if (line.startsWith('MODE3:')) { const val = parseInt(line.substring(6)); setCurrentMode(3, val); if (activeSwitch === 3) updateUIForSwitch(3); }
        else if (line.startsWith('MODE4:')) { const val = parseInt(line.substring(6)); setCurrentMode(4, val); if (activeSwitch === 4) updateUIForSwitch(4); }
        else if (line.startsWith('AUTOENTER1:')) { const val = line.substring(11); setCurrentAutoEnter(1, val === '1'); if (activeSwitch === 1) updateUIForSwitch(1); }
        else if (line.startsWith('AUTOENTER2:')) { const val = line.substring(11); setCurrentAutoEnter(2, val === '1'); if (activeSwitch === 2) updateUIForSwitch(2); }
        else if (line.startsWith('AUTOENTER3:')) { const val = line.substring(11); setCurrentAutoEnter(3, val === '1'); if (activeSwitch === 3) updateUIForSwitch(3); }
        else if (line.startsWith('AUTOENTER4:')) { const val = line.substring(11); setCurrentAutoEnter(4, val === '1'); if (activeSwitch === 4) updateUIForSwitch(4); }
        else if (line.startsWith('SOCD:')) { const val = line.substring(5); updateSOCDUI(val === '1' || val.toLowerCase() === 'on'); }
        else if (line.startsWith('DEBOUNCE:')) { const val = line.substring(9); updateDebounceUI(val); }
        else { console.log('Unknown response:', line); }
      }
    }
  } catch (err) { console.error('Read error:', err); handleDisconnect(); }
}

// ============ Reset all switches to Key mode (no longer used on connect) ============
async function resetAllModes() {
  if (!isConnected || !writer) return;
  for (let i = 1; i <= 4; i++) {
    try {
      await sendRawCommand('SETMODE' + i + ':0');
    } catch (e) {
      console.warn('Failed to reset mode for switch', i, e);
    }
  }
  for (let i = 0; i < 4; i++) currentModes[i] = 0;
  if (activeSwitch !== null) updateUIForSwitch(activeSwitch);
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
    if (socdCheckbox) socdCheckbox.disabled = false;
    if (debounceSelect) { debounceSelect.disabled = true; debounceSelect.value = ''; }
    if (modeSelect) { modeSelect.disabled = true; modeSelect.value = ''; }
    if (sentenceText) sentenceText.disabled = true;
    if (saveSentenceBtn) saveSentenceBtn.disabled = true;
    if (sentenceEditor) sentenceEditor.style.display = 'none';
    if (macroManager) macroManager.style.display = 'none';
    if (presetLibrary) presetLibrary.style.display = 'none';
    if (currentKeyLabel) currentKeyLabel.textContent = 'select a key';
    if (charCountSpan) charCountSpan.textContent = '0';
    dimKeyboard(false, 0);
    dimKeyDisplay(false);
    lockInteractive(false);

    port.addEventListener('disconnect', handleDisconnect);
    writer = port.writable.getWriter();
    readLoop();

    // Fetch global settings without resetting modes
    try {
      await sendRawCommand('GETSOCD');
      await sendRawCommand('GETDEBOUNCE');
      // DO NOT reset modes – keep whatever is stored on the Arduino
    } catch (e) {
      console.warn('Initial commands failed, but connection may still be okay:', e);
      alert('Some initial settings could not be loaded. Try reconnecting or refresh the page.');
    }

    // If a switch was previously active, reload its data
    if (activeSwitch !== null) {
      await sendRawCommand('GET' + activeSwitch);
      await sendRawCommand('GETSENTENCE' + activeSwitch);
      await sendRawCommand('GETMODE' + activeSwitch);
      await sendRawCommand('GETAUTOENTER' + activeSwitch);
    }
    // If the switch is in macro mode, show the macro manager
    if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
      if (newProfileBtn) newProfileBtn.disabled = false;
      renderProfiles();
      renderPresets('');
    }
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
  if (reader) { try { await reader.cancel(); } catch(e) {} reader = null; }
  if (writer) { try { await writer.close(); } catch(e) {} writer = null; }
  if (port) { try { await port.close(); } catch(e) {} port = null; }
  isConnected = false;
  isDisconnecting = false;
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect';
  connectBtn.classList.remove('connected');
  statusSpan.textContent = 'Disconnected';
  statusSpan.className = '';
  if (socdCheckbox) socdCheckbox.disabled = true;
  if (debounceSelect) { debounceSelect.disabled = true; debounceSelect.value = ''; }
  if (modeSelect) { modeSelect.disabled = true; modeSelect.value = ''; }
  if (sentenceText) sentenceText.disabled = true;
  if (saveSentenceBtn) saveSentenceBtn.disabled = true;
  if (sentenceEditor) sentenceEditor.style.display = 'none';
  if (macroManager) macroManager.style.display = 'none';
  if (presetLibrary) presetLibrary.style.display = 'none';
  if (debounceSelect) debounceSelect.value = '';
  for (let i = 0; i < 4; i++) { currentKeyNames[i] = null; currentSentences[i] = ''; currentModes[i] = 0; currentAutoEnter[i] = false; }
  clearKeySelection();
  switchBtns.forEach(b => b.classList.remove('active'));
  activeSwitch = null;
  if (currentKeyLabel) currentKeyLabel.textContent = 'No device';
  if (charCountSpan) charCountSpan.textContent = '0';
  updateSOCDUI(false);
  dimKeyboard(false, 0);
  dimKeyDisplay(false);
  lockInteractive(true);
}

// ============ Sending commands – no auto‑disconnect ============
async function sendRawCommand(cmd) {
  if (!isConnected || !writer) {
    console.warn('Not connected, cannot send:', cmd);
    throw new Error('Not connected');
  }
  try {
    await writer.write(new TextEncoder().encode(cmd + '\n'));
  } catch (err) {
    console.error('Write error for command "' + cmd + '":', err);
    try {
      if (port && port.writable) {
        writer = port.writable.getWriter();
        await writer.write(new TextEncoder().encode(cmd + '\n'));
        return;
      }
    } catch (retryErr) {
      console.error('Retry failed:', retryErr);
    }
    throw new Error('Write failed: ' + err.message);
  }
}

// ============ Mode drop-down ============
if (modeSelect) {
  modeSelect.addEventListener('change', () => {
    // If the placeholder value is selected, ignore
    if (modeSelect.value === '') return;
    const mode = parseInt(modeSelect.value);
    // Only act if a switch is selected and connected
    if (isConnected && activeSwitch !== null) {
      setCurrentMode(activeSwitch, mode);
      updateUIForSwitch(activeSwitch);
      setModeForSwitch(activeSwitch, mode).catch(e => {
        console.warn('Mode change failed:', e);
        alert('Could not change mode on the device. The UI is updated, but the device may still be in the previous mode.');
      });
    }
    // If no switch selected, update the UI to show the appropriate panels? Actually we can't change switch mode without a switch.
    // But we can show macro manager if mode is 2 regardless of switch, as before.
    if (mode === 2) {
      if (macroManager) macroManager.style.display = 'block';
      if (presetLibrary) presetLibrary.style.display = 'block';
      if (newProfileBtn) newProfileBtn.disabled = false;
      renderProfiles();
      renderPresets('');
    } else {
      if (macroManager) macroManager.style.display = 'none';
      if (presetLibrary) presetLibrary.style.display = 'none';
    }
  });
}

// ============ Key setting ============
async function setKeyForSwitch(switchNum, keyName) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'SET' + switchNum + ':' + keyName + '\n';
  try {
    await sendRawCommand(cmd);
    setCurrentKey(switchNum, keyName);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    alert('Failed to set key: ' + err.message);
  }
}

async function setSentenceForSwitch(switchNum, text) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'SETSENTENCE' + switchNum + ':' + text + '\n';
  try {
    await sendRawCommand(cmd);
    setCurrentSentence(switchNum, text);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    alert('Failed to set sentence: ' + err.message);
  }
}

async function setModeForSwitch(switchNum, mode) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'SETMODE' + switchNum + ':' + mode + '\n';
  try {
    await sendRawCommand(cmd);
    setCurrentMode(switchNum, mode);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    throw err;
  }
}

async function setAutoEnterForSwitch(switchNum, val) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'SETAUTOENTER' + switchNum + ':' + (val ? '1' : '0') + '\n';
  try {
    await sendRawCommand(cmd);
    setCurrentAutoEnter(switchNum, val);
    if (activeSwitch === switchNum) updateUIForSwitch(switchNum);
  } catch (err) {
    console.error('Write error:', err);
    alert('Failed to set auto-enter: ' + err.message);
  }
}

async function setSOCD(state) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'SOCD:' + (state ? '1' : '0') + '\n';
  try {
    await sendRawCommand(cmd);
    updateSOCDUI(state);
  } catch (err) {
    console.error('Write error:', err);
    alert('Failed to set SOCD: ' + err.message);
  }
}

async function setDebounce(value) {
  if (!isConnected || !writer) { alert('Please connect first.'); return; }
  const cmd = 'DEBOUNCE:' + value + '\n';
  try {
    await sendRawCommand(cmd);
  } catch (err) {
    console.error('Write error:', err);
    alert('Failed to set debounce: ' + err.message);
  }
}

// ============ Macro Profile Actions ============

// New Profile
if (newProfileBtn) {
  newProfileBtn.addEventListener('click', () => {
    const name = prompt('Enter a name for the new macro profile:');
    if (!name || name.trim() === '') return;
    macroProfiles.push({ name: name.trim(), events: [] });
    saveProfiles();
    selectProfile(macroProfiles.length - 1);
    renderProfiles();
    if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
      updateUIForSwitch(activeSwitch);
    }
  });
}

// Rename Profile
if (renameProfileBtn) {
  renameProfileBtn.addEventListener('click', () => {
    if (selectedProfileIndex < 0 || selectedProfileIndex >= macroProfiles.length) return;
    const oldName = macroProfiles[selectedProfileIndex].name;
    const newName = prompt(`Rename "${oldName}" to:`, oldName);
    if (newName === null || newName.trim() === '') return;
    macroProfiles[selectedProfileIndex].name = newName.trim();
    saveProfiles();
    renderProfiles();
    if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
      updateUIForSwitch(activeSwitch);
    }
  });
}

// Delete Profile
if (deleteProfileBtn) {
  deleteProfileBtn.addEventListener('click', () => {
    if (selectedProfileIndex < 0 || selectedProfileIndex >= macroProfiles.length) return;
    if (!confirm(`Delete profile "${macroProfiles[selectedProfileIndex].name}"?`)) return;
    for (const [sw, idx] of Object.entries(switchProfileMap)) {
      if (idx === selectedProfileIndex) {
        delete switchProfileMap[sw];
      }
    }
    saveSwitchProfileMap();
    macroProfiles.splice(selectedProfileIndex, 1);
    saveProfiles();
    selectedProfileIndex = -1;
    renderProfiles();
    if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
      updateUIForSwitch(activeSwitch);
    }
  });
}

// Record Profile
if (recordProfileBtn) {
  recordProfileBtn.addEventListener('click', () => {
    if (selectedProfileIndex < 0 || selectedProfileIndex >= macroProfiles.length) return;
    recordingEvents = [];
    isRecording = true;
    recordProfileBtn.disabled = true;
    recordProfileBtn.textContent = 'Recording…';
    recordProfileBtn.classList.add('recording');
    if (stopRecordBtn) { stopRecordBtn.style.display = 'inline-block'; stopRecordBtn.disabled = false; }
    if (recordingStatus) { recordingStatus.style.display = 'block'; recordingStatus.textContent = 'Recording… (press keys on your physical keyboard)'; }
    if (macroPreview) macroPreview.textContent = 'Recording…';

    document.addEventListener('keydown', handleKeyDown, true);
    if (recordTimeout) clearTimeout(recordTimeout);
    recordTimeout = setTimeout(() => {
      if (isRecording) stopRecording();
    }, 30000);
  });
}

function handleKeyDown(e) {
  if (!isRecording) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
    return;
  }

  let key = e.key;
  let keycode;
  let modifiers = 0;
  if (e.ctrlKey) modifiers |= 0x01;
  if (e.shiftKey) modifiers |= 0x02;
  if (e.altKey) modifiers |= 0x04;
  if (e.metaKey) modifiers |= 0x08;

  if (key.length === 1) {
    keycode = key.charCodeAt(0);
  } else {
    const specialMap = {
      'Tab': 179, 'Enter': 176, 'Shift': 129, 'Control': 128,
      'Alt': 130, 'CapsLock': 0xC1, 'Escape': 177, 'Space': 32,
      'PageUp': 213, 'PageDown': 214, 'End': 211, 'Home': 210,
      'ArrowLeft': 216, 'ArrowUp': 218, 'ArrowRight': 215, 'ArrowDown': 217,
      'Insert': 209, 'Delete': 212,
      'F1': 194, 'F2': 195, 'F3': 196, 'F4': 197,
      'F5': 198, 'F6': 199, 'F7': 200, 'F8': 201,
      'F9': 202, 'F10': 203, 'F11': 204, 'F12': 205
    };
    keycode = specialMap[key] || e.keyCode || e.which;
  }

  if (keycode === 128 || keycode === 129 || keycode === 130 || keycode === 131) {
    return;
  }

  if (recordingEvents.length >= 30) {
    if (recordingStatus) recordingStatus.textContent = 'Max 30 keys reached!';
    stopRecording();
    return;
  }

  recordingEvents.push({ modifiers, keycode });
  if (macroPreview) macroPreview.textContent = formatMacroPreview(recordingEvents);
  if (recordingStatus) recordingStatus.textContent = `Recording… (${recordingEvents.length} keys)`;
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  document.removeEventListener('keydown', handleKeyDown, true);
  if (recordTimeout) clearTimeout(recordTimeout);
  if (recordProfileBtn) { recordProfileBtn.disabled = false; recordProfileBtn.textContent = 'Record'; recordProfileBtn.classList.remove('recording'); }
  if (stopRecordBtn) { stopRecordBtn.style.display = 'none'; stopRecordBtn.disabled = true; }
  if (recordingStatus) recordingStatus.style.display = 'none';

  if (selectedProfileIndex >= 0 && selectedProfileIndex < macroProfiles.length) {
    macroProfiles[selectedProfileIndex].events = recordingEvents.slice();
    saveProfiles();
    renderProfiles();
    if (macroPreview) macroPreview.textContent = formatMacroPreview(recordingEvents);
    if (activeSwitch !== null && currentModes[activeSwitch-1] === 2) {
      updateUIForSwitch(activeSwitch);
    }
  }
}

if (stopRecordBtn) {
  stopRecordBtn.addEventListener('click', stopRecording);
}

// Assign Profile to Switch
if (assignProfileBtn) {
  assignProfileBtn.addEventListener('click', async () => {
    if (selectedProfileIndex < 0 || selectedProfileIndex >= macroProfiles.length) return;
    if (activeSwitch === null) { alert('Please select a switch first.'); return; }
    const profile = macroProfiles[selectedProfileIndex];
    if (!profile.events || profile.events.length === 0) { alert('This macro is empty.'); return; }

    let data = '';
    for (let e of profile.events) {
      data += e.modifiers + ',' + e.keycode + ',';
    }
    data = data.slice(0, -1);

    const cmd = 'SETMACRO' + activeSwitch + ':' + data + '\n';
    try {
      await sendRawCommand(cmd);
      try {
        await setModeForSwitch(activeSwitch, 2);
      } catch (modeErr) {
        console.warn('Could not set mode to Macro for switch', activeSwitch, modeErr);
      }

      switchProfileMap[activeSwitch] = selectedProfileIndex;
      saveSwitchProfileMap();

      if (macroPreview) macroPreview.textContent = 'Assigned!';
      setTimeout(() => { if (macroPreview) macroPreview.textContent = formatMacroPreview(profile.events); }, 1500);
      if (activeSwitch !== null) {
        updateUIForSwitch(activeSwitch);
      }
    } catch (err) {
      console.error('Assign error:', err);
      alert('Failed to assign macro: ' + err.message);
    }
  });
}

// ============ Preset Library – Search ============
if (presetSearch) {
  presetSearch.addEventListener('input', () => {
    renderPresets(presetSearch.value);
  });
}

// ============ Keyboard UI ============
document.querySelectorAll('.key[data-key]').forEach(el => {
  el.addEventListener('click', () => {
    if (!isConnected) return;
    const key = el.dataset.key;
    if (activeSwitch === null) { alert('Please select a switch first.'); return; }
    const mode = currentModes[activeSwitch - 1];
    if (mode !== 0) {
      setModeForSwitch(activeSwitch, 0);
      setTimeout(() => setKeyForSwitch(activeSwitch, key), 100);
    } else {
      setKeyForSwitch(activeSwitch, key);
    }
  });
});

// ============ SOCD, Debounce, AutoEnter, Sentence Save ============
if (socdCheckbox) {
  socdCheckbox.addEventListener('change', () => {
    if (isConnected) setSOCD(socdCheckbox.checked);
    else localStorage.setItem('socdState', socdCheckbox.checked ? '1' : '0');
  });
}
if (debounceSelect) {
  debounceSelect.addEventListener('change', () => {
    const val = debounceSelect.value;
    if (val === '') return;
    if (isConnected) setDebounce(val);
    else localStorage.setItem('debounceValue', val);
  });
}
if (autoEnterCheckbox) {
  autoEnterCheckbox.addEventListener('change', () => {
    if (isConnected && activeSwitch !== null) setAutoEnterForSwitch(activeSwitch, autoEnterCheckbox.checked);
  });
}
if (saveSentenceBtn) {
  saveSentenceBtn.addEventListener('click', () => {
    if (isConnected && activeSwitch !== null && sentenceText) {
      setSentenceForSwitch(activeSwitch, sentenceText.value);
    }
  });
}
if (sentenceText) {
  sentenceText.addEventListener('input', () => {
    if (charCountSpan) charCountSpan.textContent = sentenceText.value.length;
  });
}

// ============ Initialisation ============
loadSwitchProfileMap();
loadProfiles();
clearKeySelection();
switchBtns.forEach(b => b.classList.remove('active'));
activeSwitch = null;
if (socdCheckbox) socdCheckbox.disabled = true;
if (debounceSelect) { debounceSelect.disabled = true; debounceSelect.value = ''; }
if (modeSelect) { modeSelect.disabled = true; modeSelect.value = ''; }
if (sentenceText) sentenceText.disabled = true;
if (saveSentenceBtn) saveSentenceBtn.disabled = true;
if (sentenceEditor) sentenceEditor.style.display = 'none';
if (macroManager) macroManager.style.display = 'none';
if (presetLibrary) presetLibrary.style.display = 'none';
if (currentKeyLabel) currentKeyLabel.textContent = 'No device';
if (charCountSpan) charCountSpan.textContent = '0';
dimKeyboard(false, 0);
dimKeyDisplay(false);
lockInteractive(true);
console.log('dwnPad Key Changer ready.');