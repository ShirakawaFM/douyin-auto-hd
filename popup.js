'use strict';

const CONFIG_KEY = 'douyinAutoHDConfig';

const TARGET_OPTIONS = [
  { value: 'max',   label: '最高（默认）' },
  { value: '4k',    label: '4K' },
  { value: '2k',    label: '2K/1440P' },
  { value: '1080p', label: '1080P' },
  { value: '720p',  label: '720P' },
  { value: '540p',  label: '标清 (540P)' },
];

const el = {
  enabled: document.getElementById('enabled'),
  selectWrap: document.getElementById('selectWrap'),
  selectTrigger: document.getElementById('selectTrigger'),
  selectValue: document.getElementById('selectValue'),
  selectMenu: document.getElementById('selectMenu'),
  logList: document.getElementById('logList'),
  hint: document.getElementById('hint'),
  resetBtn: document.getElementById('resetBtn'),
};

let activeTab = null;
let config = { enabled: true, target: 'max' };

function setVersion() {
  try {
    const v = chrome.runtime.getManifest().version;
    const ve = document.getElementById('version');
    if (ve) ve.textContent = 'v' + v;
  } catch (e) { /* ignore */ }
}

setVersion();
init();

async function init() {
  config = await getConfig();
  el.enabled.checked = config.enabled;
  buildMenu();
  setSelected(config.target);

  el.enabled.addEventListener('change', onEnabledChange);
  el.resetBtn.addEventListener('click', onReset);
  el.selectTrigger.addEventListener('click', () => toggleMenu(!isOpen()));
  document.addEventListener('click', onDocClick);

  const tabs = await queryActiveTab();
  activeTab = tabs && tabs[0];

  if (!isDouyinPage(activeTab)) {
    showHint('非抖音页面：请在抖音网页版打开此弹窗');
    return;
  }

  refreshStatus();
}

// ---------------- 下拉菜单 ----------------
function buildMenu() {
  el.selectMenu.innerHTML = '';
  TARGET_OPTIONS.forEach(o => {
    const d = document.createElement('div');
    d.className = 'select-option';
    d.dataset.value = o.value;

    const label = document.createElement('span');
    label.className = 'opt-label';
    label.textContent = o.label;

    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = '✓';

    d.appendChild(label);
    d.appendChild(check);
    d.addEventListener('click', () => onSelectOption(o));
    el.selectMenu.appendChild(d);
  });
}

function setSelected(value) {
  el.selectMenu.querySelectorAll('.select-option').forEach(opt => {
    if (opt.dataset.value === value) {
      opt.classList.add('selected');
      el.selectValue.textContent = opt.querySelector('.opt-label').textContent;
    } else {
      opt.classList.remove('selected');
    }
  });
}

function isOpen() {
  return el.selectWrap.classList.contains('open');
}

function toggleMenu(open) {
  if (open) {
    el.selectWrap.classList.remove('closing');
    el.selectWrap.classList.add('open');
  } else {
    if (isOpen()) {
      el.selectWrap.classList.remove('open');
      el.selectWrap.classList.add('closing');
      setTimeout(() => el.selectWrap.classList.remove('closing'), 180);
    }
  }
}

function onSelectOption(opt) {
  config.target = opt.value;
  setSelected(opt.value);
  toggleMenu(false);
  saveConfig();
  if (activeTab && isDouyinPage(activeTab)) setTimeout(refreshStatus, 350);
}

function onDocClick(e) {
  if (!el.selectWrap.contains(e.target)) toggleMenu(false);
}

// ---------------- 工具 ----------------
function isDouyinPage(tab) {
  if (!tab || !tab.url) return false;
  try {
    const u = new URL(tab.url);
    return u.hostname === 'douyin.com' || u.hostname.endsWith('.douyin.com');
  } catch (e) {
    return false;
  }
}

function queryActiveTab() {
  return new Promise(res => {
    chrome.tabs.query({ active: true, currentWindow: true }, res);
  });
}

function getConfig() {
  return new Promise(res => {
    chrome.storage.local.get(CONFIG_KEY, (r) => {
      const stored = r && r[CONFIG_KEY];
      res({
        enabled: !stored || stored.enabled !== false,
        target: (stored && typeof stored.target === 'string') ? stored.target : 'max',
      });
    });
  });
}

function saveConfig() {
  chrome.storage.local.set({ [CONFIG_KEY]: config });
}

function sendMessage(tabId, msg) {
  return new Promise(res => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError || !resp) res(null);
      else res(resp);
    });
  });
}

// ---------------- 渲染 ----------------
function refreshStatus(attempt = 0) {
  if (!activeTab || !isDouyinPage(activeTab)) return;
  sendMessage(activeTab.id, { type: 'GET_STATUS' }).then((resp) => {
    if (!resp) {
      if (attempt < 2) {
        setTimeout(() => refreshStatus(attempt + 1), 400);
        return;
      }
      showHint('内容脚本未响应：请刷新抖音页面后重新打开弹窗');
      return;
    }
    el.enabled.checked = resp.enabled;
    if (resp.target && resp.target !== config.target) {
      config.target = resp.target;
      setSelected(config.target);
    }
    renderLogs(resp.logs || []);
  });
}

function renderLogs(logs) {
  hideHint();
  el.logList.innerHTML = '';
  if (!logs || !logs.length) {
    const d = document.createElement('div');
    d.className = 'log-empty';
    d.textContent = '暂无记录';
    el.logList.appendChild(d);
    return;
  }
  logs.forEach(line => {
    const d = document.createElement('div');
    d.className = 'log-item';
    d.textContent = line;
    el.logList.appendChild(d);
  });
}

function showHint(text) {
  el.hint.classList.remove('closing');
  el.hint.hidden = false;
  el.hint.textContent = text;
  el.logList.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'log-empty';
  d.textContent = '暂无记录';
  el.logList.appendChild(d);
}

function hideHint() {
  if (el.hint.hidden) return;
  el.hint.classList.add('closing');
  setTimeout(() => {
    el.hint.classList.remove('closing');
    el.hint.hidden = true;
  }, 200);
}

// ---------------- 事件 ----------------
function onEnabledChange() {
  config.enabled = el.enabled.checked;
  saveConfig();
  if (activeTab && isDouyinPage(activeTab)) setTimeout(refreshStatus, 250);
}

function onReset() {
  if (activeTab && isDouyinPage(activeTab)) {
    sendMessage(activeTab.id, { type: 'RESET' }).then(() => {
      setTimeout(refreshStatus, 150);
    });
  } else {
    renderLogs([]);
  }
}
