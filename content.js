/**
 * 抖音网页版 · 自动最高画质（content script） v2.4.3
 *
 * 设计要点：
 *  - 不依赖 DOMContentLoaded，使用 MutationObserver 适配 SPA；
 *  - 不硬编码 class 选择器，全部通过「可见文本」识别画质；
 *  - 画质优先级：4K > 2160P > 1080P > 720P > 标清（并兼容更多档位）；
 *  - 只读取「播放器当前选中」的画质，而非视频源最大画质；
 *  - 流程：检测当前画质 -> 对比最高 -> 点击切换 -> 切换后复读真实画质 -> 回写状态与日志；
 *  - 手动降画质二次确认弹窗 + 「始终保持最高画质」强制锁定模式；
 *  - 直播内容直接跳过全部画质逻辑；
 *  - SPA 切换视频时重置状态重新扫描（强制锁定模式跨视频继承）；
 *  - 防抖 + 失败节流，避免无限循环；全程 try/catch，防止脚本崩溃。
 */
(() => {
  'use strict';

  // 防止重复注入
  if (window.__douyinAutoHDInjected) return;
  window.__douyinAutoHDInjected = true;

  try {
    const v = (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '?';
    console.log('[抖音自动最高画质] content script 已注入 v' + v);
  } catch (e) {}

  const CONFIG_KEY = 'douyinAutoHDConfig';
  const DEFAULT_CONFIG = { enabled: true, target: 'max' };
  const LOG_LIMIT = 50;
  const SCAN_THROTTLE = 500;        // 相邻自动尝试最小间隔（毫秒）
  const RESET_POLL = 5000;          // 画质重置巡检间隔（同时作为心跳）

  const DEBUG = true;               // 调试开关，排查完成后可改为 false
  function debug(...args) {
    if (!DEBUG) return;
    try { console.log('[抖音HD]', ...args); } catch (e) {}
  }

  // 画质规则：按分值从高到低排列，正则对归一化后的文本匹配。
  // 中文标签的分值已对齐真实分辨率；正则全部锚定整段文本，避免把视频标题/搜索词误判为画质选项。
  const QUALITY_RULES = [
    { score: 4000, label: '4K',     re: /^(4K|超清4K)$/ },
    { score: 2160, label: '2160P',  re: /^2160P$/ },
    { score: 1500, label: '臻彩',   re: /^臻彩$/ },
    { score: 1440, label: '2K',     re: /^(2K|超清2K)$/ },
    { score: 1200, label: '蓝光',   re: /^蓝光$/ },
    { score: 1080, label: '1080P',  re: /^(1080P|高清1080P|超清)$/ },
    { score: 720,  label: '720P',   re: /^(720P|高清720P|高清)$/ },
    { score: 540,  label: '540P',   re: /^(540P|标清540P|标清)$/ },
    { score: 480,  label: '480P',   re: /^480P$/ },
    { score: 360,  label: '360P',   re: /^(360P|流畅)$/ },
  ];

  // ---------------- 运行时状态 ----------------
  let config = { ...DEFAULT_CONFIG };
  let currentQuality = '未知';   // 显示给 popup 的「当前实际画质」（原始文本，与播放器同步）
  let playerReady = false;
  let switching = false;         // 防止并发（插件正在自动切换）
  let lastAttempt = 0;           // 节流时间戳
  let lastSwitchAt = 0;          // 上次成功切换时间戳
  let knownBest = null;          // { score, label } 已知最高画质
  let logs = [];
  let lastDebugAt = 0;
  let observer = null;           // MutationObserver 实例（切视频时重建）
  let lastVideoSrc = '';         // 记录当前视频 src，用于检测 SPA 切换视频
  let failStreak = 0;            // 连续扫描失败次数（用于广告拦截干扰提示）
  let adblockHintShown = false;  // 广告拦截提示是否已显示

  let alwaysMaxMode = false;     // 「始终保持最高画质」强制锁定（刷新页面后重置）
  let tempDisableLock = false;   // 本条视频临时关闭自动锁定（切视频时清除）
  let isLiveStream = false;      // 当前是否直播
  let suppressIntercept = false; // 插件自身点击时置 true，避免触发手动降画质拦截
  let modalEl = null;            // 确认弹窗 DOM
  let modalDebounceUntil = 0;    // 弹窗防抖时间戳
  let pendingScore = 0;          // 待确认的低画质分值
  let pendingLabel = '';         // 待确认的低画质文本

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'VIDEO', 'SOURCE', 'CANVAS', 'IFRAME',
    'INPUT', 'TEXTAREA', 'LINK', 'META', 'AUDIO',
  ]);

  // ---------------- 工具函数 ----------------
  function normalize(text) {
    return (text || '').toUpperCase().replace(/\s+/g, '');
  }

  // 匹配画质：返回 { score, label, raw }；raw 为原始文本，用于与播放器显示同步
  function matchQuality(text) {
    const raw = (text || '').trim();
    const t = normalize(raw);
    if (!t || t.length > 30) return null;
    for (const r of QUALITY_RULES) {
      if (r.re.test(t)) return { score: r.score, label: r.label, raw };
    }
    return null;
  }

  // 取元素的「直接文本」，用于识别叶子节点的标签，避免误读父容器聚合文本
  function directText(el) {
    let s = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) s += node.textContent;
    }
    return s.trim();
  }

  function labelOf(el) {
    return directText(el) || (el.textContent || '').trim();
  }

  function isClickable(el) {
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    try {
      const st = window.getComputedStyle ? getComputedStyle(el) : null;
      if (st && st.cursor === 'pointer') return true;
    } catch (e) {}
    return false;
  }

  // 向上查找最近的可点击祖先（抖音把点击处理挂在父容器上，子元素常无 pointer 光标）
  function findClickableUp(el, maxDepth = 5) {
    let cur = el;
    for (let i = 0; cur && i <= maxDepth; i++, cur = cur.parentElement) {
      if (isClickable(cur)) return cur;
    }
    return null;
  }

  // 可见性判定：区分「当前画质标签」与「隐藏下拉里的其它/最大画质」。
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    } catch (e) { return false; }
  }

  // 判断是否直播：域名/路径 + 时长特征
  function isLive(video) {
    try {
      if (/live\.douyin\.com/i.test(location.hostname) || /\/live\//i.test(location.pathname)) return true;
      if (video) {
        const d = video.duration;
        if (d === Infinity || d === Number.POSITIVE_INFINITY || d > 43200) return true; // >12 小时基本是直播
      }
    } catch (e) {}
    return false;
  }

  function findVideo() {
    let videos = [];
    try { videos = Array.from(document.querySelectorAll('video')); } catch (e) {}
    if (!videos.length) return null;
    // 优先选择「正在播放 + 有画面 + 可见」的主播放器，避免选中隐藏的预览/广告视频
    const score = v => {
      let s = (v.videoWidth || 0) * (v.videoHeight || 0);
      if (!v.paused) s += 2000000;
      if ((v.readyState || 0) >= 2) s += 1000000;
      try {
        const r = v.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) s += 500000;
      } catch (e) {}
      return s;
    };
    return videos.reduce((best, v) => score(v) > score(best) ? v : best, videos[0]);
  }

  function describe(el) {
    if (!el) return 'null';
    return '<' + el.tagName.toLowerCase() + ' text="' + (labelOf(el) || '').slice(0, 20)
      + '" visible=' + (isVisible(el) ? 'y' : 'n')
      + ' clickable=' + (isClickable(el) || findClickableUp(el, 5) ? 'y' : 'n') + '>';
  }

  function simulateClick(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e) {}
    });
  }

  // 插件自身点击入口（置 suppressIntercept，避免被手动降画质拦截逻辑误判）
  function safeClick(el) {
    if (!el) return;
    suppressIntercept = true;
    try { simulateClick(el); }
    finally { setTimeout(() => { suppressIntercept = false; }, 300); }
  }

  // 列出页面上所有「画质/清晰度」候选元素（含隐藏项），用于排查为什么找不到入口
  function listQualityCandidates() {
    const out = [];
    const all = document.querySelectorAll('button, [role="button"], div, span, a, li, p');
    for (const el of all) {
      const t = labelOf(el);
      if (!t || t.length > 12) continue;
      if (!(/清晰度|画质/.test(t) || (t.length <= 8 && matchQuality(t)))) continue;
      out.push(el.tagName.toLowerCase() + ':' + JSON.stringify(t.slice(0, 12))
        + ':vis=' + (isVisible(el) ? 'y' : 'n')
        + ':clk=' + ((isClickable(el) || findClickableUp(el, 4)) ? 'y' : 'n'));
      if (out.length >= 12) break;
    }
    return out;
  }

  // 兜底诊断：列出菜单里所有「疑似画质」的可见文本（含未被规则命中的 4K 变体），
  // 用于发现抖音实际用的 4K 文案到底是什么。
  function dumpQualityMenuRaw() {
    const out = [];
    const all = document.querySelectorAll('button, [role="button"], div, span, a, li, p');
    for (const el of all) {
      const t = labelOf(el);
      if (!t || t.length > 16) continue;
      if (!(/[0-9]+\s*[PpKk]/.test(t) || /4K|UHD|超高清|HDR|杜比|2160|1440|1080|720|540|480|360|高清|超清|蓝光|臻彩|标清|流畅|清晰度|画质/i.test(t))) continue;
      if (!isVisible(el)) continue;
      out.push(t);
      if (out.length >= 24) break;
    }
    return out;
  }

  // 一次性诊断：探测抖音播放器实例（xgplayer）及其画质切换 API。
  // 注意：content script 运行在隔离世界，只能访问挂在 DOM 元素上的 expando 属性，
  // 无法访问主世界闭包变量。若探测为空，说明实例在闭包中，需改走页面上下文注入。
  function discoverPlayerAPI() {
    const result = { globals: [], element: [] };
    try {
      ['player', 'Player', 'xgplayer', 'XGPlayer', 'playerInstance'].forEach(g => {
        if (window[g]) result.globals.push(g);
      });
    } catch (e) {}
    const video = findVideo();
    if (video) {
      let node = video;
      for (let depth = 0; node && depth <= 10; depth++, node = node.parentElement) {
        let keys = [];
        try { keys = Object.keys(node); } catch (e) {}
        for (const key of keys) {
          if (!/player|video|definition|quality/i.test(key)) continue;
          let val;
          try { val = node[key]; } catch (e) { continue; }
          if (!val || (typeof val !== 'object' && typeof val !== 'function')) continue;
          let methods = [];
          try {
            const proto = Object.getPrototypeOf(val) || {};
            methods = Object.getOwnPropertyNames(proto).filter(m => /quality|definition|switch|resolution|bitrate/i.test(m)).slice(0, 20);
          } catch (e) {}
          result.element.push({ depth, key, tag: node.tagName, type: typeof val, methods });
        }
      }
    }
    return result;
  }

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function addLog(msg) {
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    logs.unshift(`[${t}] ${msg}`);
    if (logs.length > LOG_LIMIT) logs.length = LOG_LIMIT;
  }

  // ---------------- 识别函数 ----------------

  // 读取「菜单已展开」时的画质选项（只认可见叶子项）
  function findQualityOptions() {
    const out = [];
    let all = [];
    try { all = document.querySelectorAll('*'); } catch (e) {}
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      const q = matchQuality(labelOf(el));
      if (!q) continue;                       // 先做便宜的文本匹配
      if (!isVisible(el)) continue;           // 排除隐藏项（含隐藏下拉）
      let childHasQuality = false;
      for (const child of el.children) {
        if (matchQuality(labelOf(child))) { childHasQuality = true; break; }
      }
      if (childHasQuality) continue;
      out.push({ el, score: q.score, label: q.label, raw: q.raw });
    }
    return out;
  }

  // 读取「全部」画质选项（含隐藏的菜单项）。抖音把画质选项常驻在 DOM 里，
  // 未展开时只是隐藏；直接点击隐藏选项即可切换，无需先打开菜单（避开悬停依赖）。
  function findAllQualityOptions(trigger) {
    const out = [];
    let all = [];
    try { all = document.querySelectorAll('*'); } catch (e) {}
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      const q = matchQuality(labelOf(el));
      if (!q) continue;
      // 排除「当前画质入口」按钮及其内部节点（点入口是开菜单，不是切画质）
      if (trigger && (el === trigger || trigger.contains(el))) continue;
      let childHasQuality = false;
      for (const child of el.children) {
        if (matchQuality(labelOf(child))) { childHasQuality = true; break; }
      }
      if (childHasQuality) continue;
      out.push({ el, score: q.score, label: q.label, raw: q.raw });
    }
    return out;
  }

  // 统计「可见」的画质叶子选项数量：<=1 视为菜单未展开，>=2 视为菜单已展开
  function countVisibleQualityOptions() {
    let count = 0;
    let all = [];
    try { all = document.querySelectorAll('*'); } catch (e) {}
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (!matchQuality(labelOf(el))) continue;
      if (!isVisible(el)) continue;
      let childHasQuality = false;
      for (const child of el.children) {
        if (matchQuality(labelOf(child))) { childHasQuality = true; break; }
      }
      if (childHasQuality) continue;
      count++;
    }
    return count;
  }

  // 查找「当前画质」入口按钮 / 标签：可见优先，且在播放器区域内优先、靠右下优先
  function findQualityTrigger() {
    const video = findVideo();
    const vRect = video ? video.getBoundingClientRect() : null;
    const all = document.querySelectorAll('button, [role="button"], div, span, a, li, p');
    let best = null;
    let bestScore = -1;

    for (const el of all) {
      const t = labelOf(el);
      if (!t) continue;
      let score = -1;
      if (/清晰度|画质|智能|自动|AUTO/.test(t) && t.length <= 12) score = 100;   // 清晰的画质入口（含「智能/自动」模式）
      else if (t.length <= 8 && matchQuality(t)) score = 50;      // 当前画质标签（如「标清 540P」）
      if (score < 0) continue;

      // 可见的加分，隐藏的仍作为候选
      if (isVisible(el)) score += 40;

      if (vRect) {
        const r = el.getBoundingClientRect();
        const inBox = r.left >= vRect.left - 4 && r.right <= vRect.right + 4 &&
                      r.top >= vRect.top - 4 && r.bottom <= vRect.bottom + 4;
        if (inBox) score += 30;               // 位于视频框内
        if (r.left >= vRect.left + vRect.width * 0.4 &&
            r.top >= vRect.top + vRect.height * 0.4) score += 15; // 靠右下（画质按钮通常在此）
      }
      if (isClickable(el) || findClickableUp(el, 4)) score += 10;
      if (directText(el)) score += 5;         // 直接文本（叶子）优先

      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  // 读取播放器「当前实际选中」的画质
  function detectCurrentQuality() {
    const trigger = findQualityTrigger();
    if (trigger) {
      const q = matchQuality(labelOf(trigger));
      if (q) return q;
    }
    return null;
  }

  function dedupeOptions(options) {
    const map = new Map();
    for (const o of options) {
      const prev = map.get(o.label);
      if (!prev || o.score > prev.score) map.set(o.label, o);
    }
    return Array.from(map.values());
  }

  function pickBest(options) {
    let best = null;
    for (const o of options) if (!best || o.score > best.score) best = o;
    return best;
  }

  // 目标清晰度分值上限（默认 max = 不设上限，切最高）
  function targetCeilingScore() {
    const map = { 'max': 999999, '4k': 4000, '2k': 1440, '1080p': 1080, '720p': 720, '540p': 540 };
    const t = String(config.target || 'max').toLowerCase();
    return map[t] !== undefined ? map[t] : 999999;
  }

  // 在目标上限内选最高可用画质
  function pickBestUnderCeiling(options, ceiling) {
    let best = null;
    for (const o of options) {
      if (o.score > ceiling) continue;
      if (!best || o.score > best.score) best = o;
    }
    return best;
  }

  // 从点击事件向上找「画质选项」元素（返回 {el, score, label, raw}）
  function findQualityOptionFromEvent(e) {
    let node = e.target;
    for (let i = 0; node && i <= 10; i++) {
      if (node.nodeType === 1) {
        const t = labelOf(node);
        if (t && t.length <= 12) {
          const q = matchQuality(t);
          if (q) return { el: node, score: q.score, label: q.label, raw: q.raw };
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  // ---------------- 弹窗（二次确认） ----------------
  function ensureModalStyle() {
    if (document.getElementById('dyhd-modal-style')) return;
    try {
      const style = document.createElement('style');
      style.id = 'dyhd-modal-style';
      style.textContent = [
        '.dyhd-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:2147483000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}',
        '.dyhd-modal{position:relative;width:340px;max-width:90vw;background:#171a21;border:1px solid #262b36;border-radius:16px;padding:20px 20px 18px;color:#e8eaf0;box-shadow:0 18px 60px rgba(0,0,0,.55);}',
        '.dyhd-modal-close{position:absolute;top:10px;right:12px;background:transparent;border:none;color:#8b93a5;font-size:20px;line-height:1;cursor:pointer;padding:4px;}',
        '.dyhd-modal-close:hover{color:#e8eaf0;}',
        '.dyhd-modal-title{font-size:15px;font-weight:700;margin:0 24px 8px 0;}',
        '.dyhd-modal-body{font-size:13px;color:#8b93a5;margin-bottom:16px;line-height:1.6;}',
        '.dyhd-modal-actions{display:flex;gap:10px;}',
        '.dyhd-btn{flex:1;padding:9px 0;border-radius:10px;border:1px solid #262b36;font-size:13px;cursor:pointer;transition:background .2s,color .2s,border-color .2s,filter .2s;}',
        '.dyhd-btn-ok{background:#262b36;color:#e8eaf0;}',
        '.dyhd-btn-ok:hover{background:#333a47;}',
        '.dyhd-btn-always{background:linear-gradient(135deg,#ff5c8a,#25f4ee);color:#0f1115;border:none;font-weight:600;}',
        '.dyhd-btn-always:hover{filter:brightness(1.08);}',
      ].join('');
      document.head.appendChild(style);
    } catch (e) {}
  }

  function showConfirmModal(opt) {
    const now = Date.now();
    if (modalEl || now < modalDebounceUntil) return; // 防抖/去重
    try {
      ensureModalStyle();
      pendingScore = opt.score;
      pendingLabel = opt.raw || opt.label;

      const overlay = document.createElement('div');
      overlay.className = 'dyhd-modal-overlay';

      const card = document.createElement('div');
      card.className = 'dyhd-modal';

      const close = document.createElement('button');
      close.className = 'dyhd-modal-close';
      close.textContent = '×';
      close.addEventListener('click', (ev) => { ev.stopPropagation(); onModalCancel(); });

      const title = document.createElement('div');
      title.className = 'dyhd-modal-title';
      title.textContent = '是否确认切换为低画质？';

      const body = document.createElement('div');
      body.className = 'dyhd-modal-body';
      body.textContent = '插件默认自动锁定当前视频最高画质。';

      const actions = document.createElement('div');
      actions.className = 'dyhd-modal-actions';

      const ok = document.createElement('button');
      ok.className = 'dyhd-btn dyhd-btn-ok';
      ok.textContent = '确定';
      ok.addEventListener('click', (ev) => { ev.stopPropagation(); onModalConfirm(); });

      const always = document.createElement('button');
      always.className = 'dyhd-btn dyhd-btn-always';
      always.textContent = '始终保持最高画质';
      always.addEventListener('click', (ev) => { ev.stopPropagation(); onModalAlwaysMax(); });

      actions.appendChild(ok);
      actions.appendChild(always);
      card.appendChild(close);
      card.appendChild(title);
      card.appendChild(body);
      card.appendChild(actions);
      overlay.appendChild(card);
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) onModalCancel(); });

      modalEl = overlay;
      document.body.appendChild(overlay);
      addLog('检测到手动降画质，已弹出确认弹窗');
    } catch (err) { debug('modal error', String(err)); }
  }

  function closeModal() {
    if (modalEl) { try { modalEl.remove(); } catch (e) {} modalEl = null; }
    modalDebounceUntil = Date.now() + 1200;
  }

  function onModalCancel() {
    addLog('已取消手动降画质，保持最高画质');
    closeModal();
  }

  function onModalConfirm() {
    closeModal();
    tempDisableLock = true;
    addLog(`已确认切换为低画质（${pendingLabel}），本条视频临时关闭自动锁定`);
    applyManualSelection(pendingScore);
  }

  function onModalAlwaysMax() {
    closeModal();
    alwaysMaxMode = true;
    addLog('已开启「始终保持最高画质」强制锁定模式，保持最高画质');
    // 质量未发生改变（弹窗前已拦截），无需额外切换
  }

  // 应用用户选择的手动低画质（重新点击对应选项）
  async function applyManualSelection(score) {
    try {
      let options = findQualityOptions();
      if (!options.length) {
        const trigger = findQualityTrigger();
        if (trigger) { safeClick(findClickableUp(trigger, 5) || trigger); await sleep(600); options = findQualityOptions(); }
      }
      const target = options.find(o => o.score === score) || pickBest(dedupeOptions(options));
      if (target) {
        safeClick(findClickableUp(target.el, 5) || target.el);
        currentQuality = target.raw || target.label;
        await sleep(400);
      }
    } catch (err) { debug('applyManualSelection error', String(err)); }
  }

  // ---------------- 手动降画质拦截 ----------------
  function onDocClick(e) {
    try {
      if (suppressIntercept || switching) return;
      if (isLiveStream) return;
      const opt = findQualityOptionFromEvent(e);
      if (!opt) return;
      // 菜单未展开（可见画质选项 <=1）→ 点击的是「画质入口」，放行打开菜单
      if (countVisibleQualityOptions() <= 1) return;
      // 已展开菜单中点击了某个选项
      if (tempDisableLock) return;                            // 本条视频临时关闭锁定
      if (!knownBest || opt.score >= knownBest.score) return; // 选的是最高或未知，放行

      // 手动降画质：拦截原生画质切换，暂停变更
      e.stopPropagation();
      e.preventDefault();
      if (alwaysMaxMode) {
        addLog('强制锁定：已拦截手动降画质，保持最高画质');
      } else {
        showConfirmModal(opt);
      }
    } catch (err) { debug('click intercept error', String(err)); }
  }

  // ---------------- 核心：自动切换 ----------------
  async function switchIfNeeded() {
    try {
      if (!config.enabled || switching) return;
      const now = Date.now();
      if (now - lastAttempt < SCAN_THROTTLE) return;
      lastAttempt = now;

      const video = findVideo();
      if (!video) {
        if (playerReady) { playerReady = false; currentQuality = '未知'; knownBest = null; }
        return;
      }
      playerReady = true;

      // 直播检测：跳过全部画质逻辑
      const live = isLive(video);
      if (live !== isLiveStream) {
        isLiveStream = live;
        if (live) addLog('识别到直播，跳过画质逻辑');
      }
      if (live) { currentQuality = '直播'; return; }

      // SPA 切换视频检测：src 变化即视为新视频，重置所有缓存并强制重扫
      const src = (video.src || video.currentSrc || '') || '';
      if (src && lastVideoSrc && src !== lastVideoSrc) {
        resetForNewVideo();
      }
      if (src) lastVideoSrc = src;

      // 本条视频临时关闭自动锁定（用户在弹窗点了「确定」）
      if (tempDisableLock) return;

      // 1) 找入口按钮 + 读当前画质（只扫描一次，提速）
      const trigger = findQualityTrigger();
      const current = trigger ? matchQuality(labelOf(trigger)) : null;
      if (current) currentQuality = current.raw || current.label;

      // 2) 已到达目标清晰度：安静退出
      if (knownBest && current && current.score === knownBest.score) return;

      // 3) 刚切换过且读不到当前画质：静默，避免反复弹菜单
      if (!current && lastSwitchAt && (now - lastSwitchAt) < RESET_POLL) return;

      switching = true;
      try {
        // 4) 读取全部画质选项（含隐藏菜单项），无需先打开菜单
        const options = findAllQualityOptions(trigger);
        const ceiling = targetCeilingScore();
        const best = pickBestUnderCeiling(dedupeOptions(options), ceiling);

        // 诊断输出（约每 3 秒一次）
        if (now - lastDebugAt > 3000) {
          lastDebugAt = now;
          debug('scan', JSON.stringify({
            video: (video.videoWidth || 0) + 'x' + (video.videoHeight || 0),
            live: isLiveStream,
            current: current ? current.raw : null,
            trigger: describe(trigger),
            optionCount: options.length,
            options: options.slice(0, 12).map(o => o.raw || o.label),
            candidates: listQualityCandidates(),
            qualityTexts: dumpQualityMenuRaw(),
          }));
        }

        if (!best) {
          failStreak++;
          if (!adblockHintShown && failStreak >= 3) {
            adblockHintShown = true;
            addLog('连续多次未识别到画质菜单：疑似广告拦截扩展干扰，请将 douyin.com 加入白名单后刷新页面');
          }
          return;
        }
        failStreak = 0; // 识别成功，重置失败计数
        knownBest = { score: best.score, label: best.label };

        if (current && current.score === best.score) return; // 已到目标清晰度

        // 5) 直接点击最高画质选项（选项可能隐藏，合成点击仍会触发 React 处理）
        safeClick(findClickableUp(best.el, 5) || best.el);
        lastSwitchAt = Date.now();
        addLog(`自动切换至最高画质：${best.raw || best.label}`);

        // 6) 切换后复读真实画质，回写状态与日志
        await sleep(250);
        const after = detectCurrentQuality();
        if (after) {
          currentQuality = after.raw || after.label;
          addLog(`切换完成，当前画质：${currentQuality}`);
        } else {
          currentQuality = best.raw || best.label;
        }
      } finally {
        switching = false;
      }
    } catch (err) {
      switching = false;
      debug('error', String((err && err.stack) || err));
    }
  }

  // ---------------- 扫描调度 ----------------
  let scanTimer = null;
  function scheduleScan(delay = 600) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      switchIfNeeded();
    }, delay);
  }

  // 检测到新视频：清空所有缓存状态（强制锁定模式跨视频保留），重建观察器，强制重新扫描
  function resetForNewVideo() {
    knownBest = null;
    currentQuality = '未知';
    playerReady = false;
    lastSwitchAt = 0;
    failStreak = 0;
    adblockHintShown = false;
    tempDisableLock = false;   // 临时关闭锁定仅对本条视频生效，切视频清除
    addLog('检测到新视频，重置状态并重新扫描');
    startObserver();
    scheduleScan(50);
  }

  // 全局监听 body（含 portal 挂载的画质浮层）；切视频时可重建
  function startObserver() {
    try {
      if (observer) { observer.disconnect(); observer = null; }
      const root = document.body || document.documentElement;
      observer = new MutationObserver(() => scheduleScan(600));
      observer.observe(root, { childList: true, subtree: true });
    } catch (e) { debug('observer error', String(e)); }
  }

  // ---------------- 配置读写 ----------------
  function loadConfig() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(CONFIG_KEY, (res) => {
        if (chrome.runtime.lastError) return;
        const stored = res && res[CONFIG_KEY];
        if (stored && typeof stored.enabled === 'boolean') config.enabled = stored.enabled;
        if (stored && typeof stored.target === 'string') config.target = stored.target;
        addLog('配置已加载：' + (config.enabled ? '开' : '关') + '，目标清晰度：' + (config.target === 'max' ? '最高' : config.target.toUpperCase()));
        scheduleScan(100);
      });
    } catch (e) {}
  }

  function saveConfig() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.set({ [CONFIG_KEY]: { enabled: config.enabled } });
    } catch (e) {}
  }

  // ---------------- 消息通信 ----------------
  function setupMessaging() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'PING':
          sendResponse({ ok: true });
          break;
        case 'GET_STATUS':
          sendResponse({
            ok: true,
            enabled: config.enabled,
            target: config.target || 'max',
            playerReady,
            currentQuality,
            knownBest: knownBest ? knownBest.label : null,
            isLive: isLiveStream,
            alwaysMax: alwaysMaxMode,
            logs: logs.slice(),
          });
          break;
        case 'SET_ENABLED':
          config.enabled = !!msg.value;
          saveConfig();
          addLog(config.enabled ? '已开启自动最高画质' : '已关闭自动最高画质');
          if (config.enabled) scheduleScan(50);
          sendResponse({ ok: true, enabled: config.enabled });
          break;
        case 'RESET':
          logs = [];
          knownBest = null;
          currentQuality = '未知';
          lastSwitchAt = 0;
          failStreak = 0;
          adblockHintShown = false;
          alwaysMaxMode = false;
          tempDisableLock = false;
          addLog('日志已重置，将重新扫描');
          if (config.enabled) scheduleScan(50);
          sendResponse({ ok: true });
          break;
      }
    });

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[CONFIG_KEY]) return;
        const v = changes[CONFIG_KEY].newValue;
        if (!v) return;
        let changed = false;
        if (typeof v.enabled === 'boolean') { config.enabled = v.enabled; changed = true; }
        if (typeof v.target === 'string') {
          if (v.target !== config.target) {
            config.target = v.target;
            knownBest = null;     // 目标变了，重新评估
            lastSwitchAt = 0;
          }
          changed = true;
        }
        if (changed && config.enabled) scheduleScan(50);
      });
    }
  }

  // ---------------- 初始化 ----------------
  function init() {
    loadConfig();
    setupMessaging();

    // 全局容错：任何未捕获异常都不让脚本崩溃（保持 popup 心跳响应）
    try {
      window.addEventListener('error', (e) => { debug('window error', e && e.message); });
      window.addEventListener('unhandledrejection', (e) => { debug('unhandledrejection', e && e.reason); });
    } catch (e) {}

    // SPA 下 <video> 复用，切换视频时触发这些事件，据此快速重扫
    ['loadedmetadata', 'canplay', 'play', 'durationchange', 'emptied'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        if (e.target && e.target.tagName === 'VIDEO') scheduleScan(80);
      }, true);
    });

    // 手动降画质拦截（捕获阶段，早于 React 委托处理）
    document.addEventListener('click', onDocClick, true);

    // 全局监听 body（含 portal 挂载的画质浮层）
    startObserver();

    // 定期巡检（心跳）：处理画质被页面重置 + 保证脚本持续活跃响应 popup
    setInterval(() => {
      if (config.enabled) switchIfNeeded();
    }, RESET_POLL);

    addLog('内容脚本已注入，等待播放器…');

    // 一次性诊断：探测播放器实例与画质 API（用于后续实现免悬停直切）
    try {
      setTimeout(() => { debug('player', JSON.stringify(discoverPlayerAPI())); }, 2500);
    } catch (e) {}

    scheduleScan(300);
  }

  init();
})();
