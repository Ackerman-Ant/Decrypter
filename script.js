const fileInput = document.getElementById('fileInput');
const passwordInput = document.getElementById('password');
const togglePw = document.getElementById('togglePw');
const decryptBtn = document.getElementById('decryptBtn');
const statusEl = document.getElementById('status');
const vaultPlaceholder = document.getElementById('vaultPlaceholder');
const resultPanel = document.getElementById('resultPanel');
const fallbackNote = document.getElementById('fallbackNote');
const managerEl = document.getElementById('managerEl');
const searchInput = document.getElementById('searchInput');
const tabsEl = document.getElementById('tabsEl');
const entriesEl = document.getElementById('entriesEl');
const rawWrap = document.getElementById('rawWrap');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const copyBtnLabel = document.getElementById('copyBtnLabel');
const clearBtn = document.getElementById('clearBtn');

let allEntries = [];
let activeCategory = 'All';
let searchTerm = '';
let clipboardEpoch = 0;
const MASK = '•••••••••••';

const ICONS = {
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
  spinner: '<circle cx="12" cy="12" r="10" opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path>'
};
function getIcon(name, size, cls){
  size = size || 16;
  const classAttr = cls ? 'icon ' + cls : 'icon';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' + classAttr + '">' + (ICONS[name] || '') + '</svg>';
}

function reanimate(el){
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

function legacyCopy(text){
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let ok = false;
  try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
  document.body.removeChild(textarea);
  return ok;
}

async function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch(e){
      // fall through to legacy fallback below
    }
  }
  return legacyCopy(text);
}

function showStatus(msg, type){
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
  reanimate(statusEl);
}

const hasWebCrypto = !!(window.crypto && window.crypto.subtle);
if(!hasWebCrypto){
  showStatus('Web Crypto isn\'t available in this context — open this page via http://localhost or HTTPS, not by double-clicking the file directly. See the note at the bottom of the page.', 'error');
}

togglePw.addEventListener('click', () => {
  const showingText = passwordInput.type === 'text';
  passwordInput.type = showingText ? 'password' : 'text';
  togglePw.innerHTML = getIcon(showingText ? 'eye' : 'eyeOff', 16);
  togglePw.title = showingText ? 'Show password' : 'Hide password';
  togglePw.setAttribute('aria-label', togglePw.title);
});

function fieldRow(field){
  const row = document.createElement('div');
  row.className = 'field-row';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = field.label || '';
  row.appendChild(label);

  const valueEl = document.createElement('span');
  valueEl.className = 'field-value';
  const isSensitive = field.sensitive !== false;
  const realValue = field.value != null ? String(field.value) : '';
  valueEl.textContent = isSensitive ? MASK : realValue;
  row.appendChild(valueEl);

  let revealed = false;
  let toggleBtn = null;

  function setRevealed(state){
    revealed = state;
    valueEl.style.opacity = '0';
    setTimeout(() => {
      valueEl.textContent = revealed ? realValue : MASK;
      valueEl.style.opacity = '1';
    }, 100);
    if(toggleBtn){
      toggleBtn.innerHTML = getIcon(revealed ? 'eyeOff' : 'eye', 14);
      toggleBtn.title = revealed ? 'Hide value' : 'Show value';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
    }
  }

  if(isSensitive){
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'field-btn';
    toggleBtn.innerHTML = getIcon('eye', 14);
    toggleBtn.title = 'Show value';
    toggleBtn.setAttribute('aria-label', 'Show value');
    toggleBtn.addEventListener('click', () => setRevealed(!revealed));
    row.appendChild(toggleBtn);
  }

  const copyFieldBtn = document.createElement('button');
  copyFieldBtn.type = 'button';
  copyFieldBtn.className = 'field-btn';
  copyFieldBtn.innerHTML = getIcon('copy', 14);
  copyFieldBtn.title = 'Copy value';
  copyFieldBtn.setAttribute('aria-label', 'Copy value');
  copyFieldBtn.addEventListener('click', async () => {
    const ok = await copyText(realValue);
    if(ok){
      copyFieldBtn.innerHTML = getIcon('check', 14, 'pop');
      setTimeout(() => { copyFieldBtn.innerHTML = getIcon('copy', 14); }, 1200);
      if(isSensitive){
        clipboardEpoch++;
        const myEpoch = clipboardEpoch;
        setTimeout(() => {
          if(clipboardEpoch === myEpoch){
            copyText('');
          }
        }, 20000);
      }
    }else{
      showStatus('Copy failed — value revealed below, select and copy manually.', 'error');
      if(isSensitive && !revealed){
        setRevealed(true);
      }
    }
  });
  row.appendChild(copyFieldBtn);

  return row;
}

function entryCard(entry){
  const card = document.createElement('div');
  card.className = 'entry-card';

  const head = document.createElement('div');
  head.className = 'entry-head';

  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = entry.title || '(untitled)';
  head.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'entry-badge';
  badge.textContent = entry.category || 'General';
  head.appendChild(badge);

  card.appendChild(head);

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'entry-fields';
  (entry.fields || []).forEach(f => fieldsWrap.appendChild(fieldRow(f)));
  card.appendChild(fieldsWrap);

  if(entry.notes){
    const notes = document.createElement('div');
    notes.className = 'entry-notes';
    notes.textContent = entry.notes;
    card.appendChild(notes);
  }

  return card;
}

function renderCategoryTabs(){
  const uniqueCats = [...new Set(allEntries.map(e => e.category || 'General'))].sort();
  const tabsData = ['All', ...uniqueCats];
  tabsEl.innerHTML = '';
  tabsData.forEach(cat => {
    const count = cat === 'All' ? allEntries.length : allEntries.filter(e => (e.category || 'General') === cat).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (activeCategory === cat ? ' active' : '');
    btn.textContent = `${cat} (${count})`;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryTabs();
      renderEntries();
    });
    tabsEl.appendChild(btn);
  });
}

function renderEntries(){
  entriesEl.innerHTML = '';
  const filtered = allEntries.filter(e => {
    const cat = e.category || 'General';
    const matchesCat = activeCategory === 'All' || cat === activeCategory;
    const haystack = `${e.title || ''} ${cat} ${e.notes || ''}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });
  if(filtered.length === 0){
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = allEntries.length === 0 ? 'No entries found in this file.' : 'No entries match your search or filter.';
    entriesEl.appendChild(empty);
    return;
  }
  filtered.forEach((e, i) => {
    const card = entryCard(e);
    card.style.animationDelay = (Math.min(i, 8) * 30) + 'ms';
    entriesEl.appendChild(card);
  });
}

searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderEntries();
});

async function decryptFile(){
  const file = fileInput.files[0];
  const password = passwordInput.value;
  const iterations = parseInt(document.getElementById('iterations').value, 10);
  const digest = document.getElementById('digest').value;

  if(!file){ showStatus('Please select an encrypted file.', 'error'); return; }
  if(!password){ showStatus('Please enter a password.', 'error'); return; }

  decryptBtn.disabled = true;
  decryptBtn.innerHTML = getIcon('spinner', 16, 'spin') + '<span>Decrypting…</span>';
  showStatus('Decrypting…', 'ok');

  try{
    const fileBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(fileBuf);

    const header = new TextDecoder().decode(bytes.slice(0,8));
    if(header !== 'Salted__'){
      throw new Error('Missing Salted__ header — was this file encrypted with -salt?');
    }
    const salt = bytes.slice(8,16);
    const ciphertext = bytes.slice(16);

    const enc = new TextEncoder();
    const passKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name:'PBKDF2', salt, iterations, hash: digest },
      passKey,
      48 * 8
    );
    const derivedBytes = new Uint8Array(derived);
    const keyBytes = derivedBytes.slice(0,32);
    const ivBytes = derivedBytes.slice(32,48);

    const aesKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name:'AES-CBC' }, false, ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name:'AES-CBC', iv: ivBytes },
      aesKey,
      ciphertext
    );

    const text = new TextDecoder().decode(decrypted);

    let parsed = null;
    try{ parsed = JSON.parse(text); }catch(e){ parsed = null; }

    const isManaged = parsed && Array.isArray(parsed.entries);

    if(isManaged){
      allEntries = parsed.entries;
      activeCategory = 'All';
      searchTerm = '';
      searchInput.value = '';
      managerEl.style.display = 'block';
      fallbackNote.style.display = 'none';
      rawWrap.style.display = 'none';
      renderCategoryTabs();
      renderEntries();
    }else{
      allEntries = [];
      managerEl.style.display = 'none';
      output.textContent = parsed ? JSON.stringify(parsed, null, 2) : text;
      rawWrap.style.display = 'block';
      fallbackNote.style.display = 'block';
      fallbackNote.textContent = parsed
        ? 'No top-level "entries" array found, so this is shown as raw JSON. See "JSON structure this tool expects" below to enable the categorized view.'
        : 'Decrypted content is not valid JSON, so it is shown as raw text below.';
    }

    vaultPlaceholder.style.display = 'none';
    resultPanel.style.display = 'block';
    reanimate(resultPanel);
    showStatus('Decrypted successfully.', 'ok');
  }catch(err){
    resultPanel.style.display = 'none';
    vaultPlaceholder.style.display = 'block';
    showStatus('Decryption failed: wrong password, wrong settings, or corrupted file.', 'error');
  }finally{
    decryptBtn.disabled = false;
    decryptBtn.innerHTML = getIcon('unlock', 16) + '<span>Decrypt &amp; View</span>';
  }
}

decryptBtn.addEventListener('click', decryptFile);

copyBtn.addEventListener('click', async () => {
  const ok = await copyText(output.textContent);
  if(ok){
    copyBtnLabel.textContent = 'Copied';
    setTimeout(() => { copyBtnLabel.textContent = 'Copy JSON'; }, 1200);
  }else{
    showStatus('Copy failed — select the text above and copy manually.', 'error');
  }
});

clearBtn.addEventListener('click', () => {
  allEntries = [];
  entriesEl.innerHTML = '';
  tabsEl.innerHTML = '';
  output.textContent = '';
  managerEl.style.display = 'none';
  rawWrap.style.display = 'none';
  fallbackNote.style.display = 'none';
  resultPanel.style.display = 'none';
  vaultPlaceholder.style.display = 'block';
  passwordInput.value = '';
  searchInput.value = '';
  showStatus('Cleared from screen memory.', 'ok');
});
