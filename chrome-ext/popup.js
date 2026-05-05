/**
 * popup.js — orchestrates the extension flow.
 *
 * 1. User clicks "Extract" → get active tab.
 * 2. Inject extract.js's extractRaw() into the page via chrome.scripting.executeScript.
 * 3. Run postProcess() on raw to build ExtractedDesign.
 * 4. Generate DESIGN.md / SKILL.md / JSON and render.
 */

const $ = (sel) => document.querySelector(sel);
const msg = (key, sub) => chrome.i18n.getMessage(key, sub) || key;

const state = {
  design: null,
  outputs: { design: '', skill: '', json: '' },
  activeTab: 'design',
};

/** Apply data-i18n attributes to all elements */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const text = msg(key);
    if (text) el.textContent = text;
  });
}

function show(sectionId) {
  ['pre', 'loading', 'result'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === sectionId) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
}

function showError(m) {
  const err = $('#err');
  err.textContent = m;
  err.classList.remove('hidden');
}

function clearError() {
  $('#err').classList.add('hidden');
}

function isRestrictedUrl(url) {
  if (!url) return true;
  if (url.startsWith('chrome://')) return true;
  if (url.startsWith('chrome-extension://')) return true;
  if (url.startsWith('edge://')) return true;
  if (url.startsWith('about:')) return true;
  if (url.startsWith('file://')) return true;
  if (url.startsWith('https://chrome.google.com/webstore')) return true;
  if (url.startsWith('https://chromewebstore.google.com')) return true;
  return false;
}

async function runExtraction() {
  clearError();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showError(msg('errNoTab'));
    return;
  }
  if (isRestrictedUrl(tab.url)) {
    showError(msg('errRestricted'));
    return;
  }

  show('loading');

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRaw,
    });
  } catch (e) {
    show('pre');
    showError(msg('errInjection', [e && e.message ? e.message : String(e)]));
    return;
  }

  const raw = results && results[0] && results[0].result;
  if (!raw) {
    show('pre');
    showError(msg('errNoData'));
    return;
  }

  let design;
  try {
    design = postProcess(raw);
  } catch (e) {
    show('pre');
    showError(msg('errPostprocess', [e && e.message ? e.message : String(e)]));
    return;
  }

  state.design = design;
  try {
    state.outputs.design = generateDesignMd(design, 'extended');
    state.outputs.skill = generateSkillMd(design);
    state.outputs.json = JSON.stringify(design, null, 2);
  } catch (e) {
    show('pre');
    showError(msg('errGenerate', [e && e.message ? e.message : String(e)]));
    return;
  }

  renderResult();
}

function renderResult() {
  const d = state.design;
  $('#meta-title').textContent = d.title || msg('untitled');
  $('#meta-url').textContent = d.url || '';
  renderActiveTab();
  show('result');
}

function renderActiveTab() {
  $('#output').textContent = state.outputs[state.activeTab] || '';
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });
}

function switchTab(tabName) {
  if (!state.outputs[tabName] && tabName !== state.activeTab) return;
  state.activeTab = tabName;
  renderActiveTab();
}

function currentFilename() {
  let slug = 'design';
  try {
    slug = new URL(state.design.url).hostname.replace('www.', '').replace(/\./g, '-');
  } catch (e) {}
  const ext = state.activeTab === 'json' ? 'json' : 'md';
  const base = state.activeTab === 'skill' ? 'SKILL' : state.activeTab === 'json' ? 'design-tokens' : 'DESIGN';
  return `${base}-${slug}.${ext}`;
}

async function copyOutput() {
  const text = state.outputs[state.activeTab] || '';
  try {
    await navigator.clipboard.writeText(text);
    const btn = $('#copy-btn');
    btn.textContent = msg('copied');
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = msg('copy');
      btn.classList.remove('copied');
    }, 1200);
  } catch (e) {
    showError(msg('errClipboard', [e && e.message ? e.message : String(e)]));
  }
}

function downloadOutput() {
  const text = state.outputs[state.activeTab] || '';
  const mime = state.activeTab === 'json' ? 'application/json' : 'text/markdown';
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function resetToPre() {
  state.design = null;
  state.outputs = { design: '', skill: '', json: '' };
  state.activeTab = 'design';
  clearError();
  show('pre');
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  $('#extract-btn').addEventListener('click', runExtraction);
  $('#copy-btn').addEventListener('click', copyOutput);
  $('#download-btn').addEventListener('click', downloadOutput);
  $('#reset-btn').addEventListener('click', resetToPre);
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
});
