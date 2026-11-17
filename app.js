const STORAGE_KEY = 'smart_khata_v2';

let state = loadState();
let activePersonId = null;
let txFilter = 'all';
let editingTxId = null;
let currentTxType = 'income';
let deferredPrompt = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { people: [], dailyTarget: 0, darkMode: false };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function formatMoney(num) {
  return Number(num || 0).toLocaleString('en-IN');
}

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// থিম সেটআপ
function applyTheme() {
  document.body.classList.toggle('dark', !!state.darkMode);
  document.getElementById('themeToggleBtn').textContent = state.darkMode ? '☀️' : '🌙';
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  saveState();
  applyTheme();
});

// তারিখ প্রদর্শন
function initDate() {
  const now = new Date();
  document.getElementById('todayDate').textContent = now.toLocaleDateString('bn-BD', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  document.getElementById('currentMonthName').textContent = now.toLocaleDateString('bn-BD', {
    month: 'long', year: 'numeric'
  });
}

// ট্যাব নেভিগেশন
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  document.getElementById('personDetailsView').classList.add('hidden');
  
  const target = document.getElementById(tabId);
  target.classList.remove('hidden');
  target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.getElementById('fabAddBtn').classList.toggle('hidden', tabId === 'tabSettings');

  if (tabId === 'tabAnalytics') renderAnalytics();
}

// গ্লোবাল ও আজকের হিসাব রেন্ডার
function renderDashboard() {
  let totalInc = 0, totalExp = 0, todaySpent = 0;
  const today = todayISO();

  state.people.forEach(p => {
    p.transactions.forEach(tx => {
      if (tx.type === 'income') totalInc += Number(tx.amount);
      else {
        totalExp += Number(tx.amount);
        if (tx.date === today) todaySpent += Number(tx.amount);
      }
    });
  });

  document.getElementById('totalIncome').textContent = `${formatMoney(totalInc)} ৳`;
  document.getElementById('totalExpense').textContent = `${formatMoney(totalExp)} ৳`;
  document.getElementById('totalBalance').textContent = `${formatMoney(totalInc - totalExp)} ৳`;

  const target = Number(state.dailyTarget || 0);
  document.getElementById('dailyTargetInput').value = target || '';
  document.getElementById('todayTarget').textContent = formatMoney(target);
  document.getElementById('todaySpent').textContent = formatMoney(todaySpent);
  document.getElementById('todayRemaining').textContent = formatMoney(Math.max(0, target - todaySpent));

  const fill = document.getElementById('progressFill');
  const badge = document.getElementById('targetStatusBadge');
  const tip = document.getElementById('smartTipText');

  if (target <= 0) {
    fill.style.width = '0%';
    badge.textContent = 'সেট নেই';
    badge.className = 'badge';
    tip.textContent = 'সেটিংস ট্যাব থেকে দৈনিক খরচের টার্গেট সেট করুন।';
  } else {
    const pct = Math.min(100, Math.round((todaySpent / target) * 100));
    fill.style.width = `${pct}%`;
    if (todaySpent > target) {
      fill.style.background = 'var(--expense)';
      badge.textContent = `সীমা অতিক্রম (${pct}%)`;
      badge.className = 'badge over';
      tip.textContent = `⚠️ আজকের টার্গেটের চেয়ে ${formatMoney(todaySpent - target)} ৳ বেশি খরচ হয়েছে!`;
    } else if (pct >= 75) {
      fill.style.background = '#fdcb6e';
      badge.textContent = `সতর্কতা (${pct}%)`;
      badge.className = 'badge warn';
      tip.textContent = `আজকের বাজেটের ${pct}% শেষ। বুঝে খরচ করুন।`;
    } else {
      fill.style.background = 'var(--income)';
      badge.textContent = `নিরাপদ (${pct}%)`;
      badge.className = 'badge ok';
      tip.textContent = `✅ দারুণ! এখনো ${formatMoney(target - todaySpent)} ৳ হাতে আছে।`;
    }
  }

  renderPersonList();
}

// ব্যক্তি তালিকা
function renderPersonList() {
  const query = document.getElementById('searchPersonInput').value.trim().toLowerCase();
  const listEl = document.getElementById('personList');
  const emptyEl = document.getElementById('emptyPerson');

  const filtered = state.people.filter(p => p.name.toLowerCase().includes(query));
  listEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  filtered.forEach(p => {
    let inc = 0, exp = 0;
    p.transactions.forEach(t => t.type === 'income' ? inc += Number(t.amount) : exp += Number(t.amount));
    const bal = inc - exp;

    const div = document.createElement('div');
    div.className = 'person-item';
    div.innerHTML = `
      <div class="person-left">
        <div class="avatar">${escapeHtml(p.name.charAt(0).toUpperCase())}</div>
        <div>
          <div class="person-name">${escapeHtml(p.name)}</div>
          <div class="person-meta">${p.transactions.length}টি লেনদেন</div>
        </div>
      </div>
      <div class="person-balance ${bal >= 0 ? 'text-income' : 'text-expense'}">
        ${bal >= 0 ? '+' : ''}${formatMoney(bal)} ৳
      </div>
    `;
    div.addEventListener('click', () => openPersonDetails(p.id));
    listEl.appendChild(div);
  });
}

document.getElementById('searchPersonInput').addEventListener('input', renderPersonList);

// ব্যক্তির ডিটেইলস ভিউ
function openPersonDetails(personId) {
  activePersonId = personId;
  txFilter = 'all';
  document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));

  document.querySelectorAll('.tab-view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  const view = document.getElementById('personDetailsView');
  view.classList.remove('hidden');
  view.classList.add('active');
  document.getElementById('fabAddBtn').classList.add('hidden');

  renderPersonDetails();
}

function renderPersonDetails() {
  const person = state.people.find(p => p.id === activePersonId);
  if (!person) return switchTab('tabHome');

  document.getElementById('detailsPersonName').textContent = person.name;
  document.getElementById('detailsPersonPhone').textContent = person.phone ? `📞 ${person.phone}` : '';

  let inc = 0, exp = 0;
  person.transactions.forEach(t => t.type === 'income' ? inc += Number(t.amount) : exp += Number(t.amount));
  document.getElementById('detailsTotalIncome').textContent = `${formatMoney(inc)} ৳`;
  document.getElementById('detailsTotalExpense').textContent = `${formatMoney(exp)} ৳`;
  document.getElementById('detailsBalance').textContent = `${formatMoney(inc - exp)} ৳`;

  const txListEl = document.getElementById('personTransactionList');
  txListEl.innerHTML = '';
  const txs = [...person.transactions]
    .filter(t => txFilter === 'all' || t.type === txFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (txs.length === 0) {
    txListEl.innerHTML = '<div class="empty">কোনো লেনদেন পাওয়া যায়নি।</div>';
  } else {
    txs.forEach(tx => {
      const item = document.createElement('div');
      item.className = `tx-item ${tx.type}`;
      item.innerHTML = `
        <div>
          <div class="tx-note">${escapeHtml(tx.note || (tx.type === 'income' ? 'জমা' : 'খরচ'))}</div>
          <div class="tx-date">📅 ${escapeHtml(tx.date)}</div>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${tx.type === 'income' ? 'text-income' : 'text-expense'}">
            ${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount)} ৳
          </span>
          <button class="tx-mini-btn edit-tx" title="এডিট">✏️</button>
          <button class="tx-mini-btn del-tx" title="মুছুন">🗑️</button>
        </div>
      `;
      item.querySelector('.edit-tx').addEventListener('click', () => openTxModal(tx.type, person.id, tx));
      item.querySelector('.del-tx').addEventListener('click', () => {
        if (confirm('এই লেনদেনটি মুছে ফেলবেন?')) {
          person.transactions = person.transactions.filter(t => t.id !== tx.id);
          saveState();
          renderPersonDetails();
          renderDashboard();
          showToast('লেনদেন মুছে ফেলা হয়েছে');
        }
      });
      txListEl.appendChild(item);
    });
  }

  const cListEl = document.getElementById('personCommentList');
  cListEl.innerHTML = '';
  if (!person.comments.length) {
    cListEl.innerHTML = '<div class="empty">কোনো নোট/কমেন্ট নেই।</div>';
  } else {
    [...person.comments].reverse().forEach(c => {
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = `
        <div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
          <div class="comment-date">${escapeHtml(c.date)}</div>
        </div>
        <button class="tx-mini-btn">✖</button>
      `;
      div.querySelector('button').addEventListener('click', () => {
        person.comments = person.comments.filter(x => x.id !== c.id);
        saveState();
        renderPersonDetails();
      });
      cListEl.appendChild(div);
    });
  }
}

document.getElementById('backToHomeBtn').addEventListener('click', () => switchTab('tabHome'));

document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    txFilter = pill.dataset.filter;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderPersonDetails();
  });
});

document.getElementById('deletePersonBtn').addEventListener('click', () => {
  const person = state.people.find(p => p.id === activePersonId);
  if (person && confirm(`"${person.name}" এবং তার সব হিসাব মুছে ফেলবেন?`)) {
    state.people = state.people.filter(p => p.id !== activePersonId);
    saveState();
    switchTab('tabHome');
    renderDashboard();
    showToast('ব্যক্তি মুছে ফেলা হয়েছে');
  }
});

// মডাল কন্ট্রোল
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}
document.querySelectorAll('.close-modal, .modal-backdrop').forEach(el => {
  el.addEventListener('click', closeAllModals);
});

// নতুন ব্যক্তি মডাল
document.getElementById('openAddPersonModalBtn').addEventListener('click', () => {
  document.getElementById('newPersonInput').value = '';
  document.getElementById('newPersonPhone').value = '';
  document.getElementById('personModal').classList.remove('hidden');
  document.getElementById('newPersonInput').focus();
});

document.getElementById('savePersonBtn').addEventListener('click', () => {
  const name = document.getElementById('newPersonInput').value.trim();
  const phone = document.getElementById('newPersonPhone').value.trim();
  if (!name) return showToast('দয়া করে নাম লিখুন!');

  state.people.unshift({
    id: Date.now().toString(),
    name,
    phone,
    transactions: [],
    comments: []
  });
  saveState();
  closeAllModals();
  renderDashboard();
  showToast(`${name} যোগ করা হয়েছে!`);
});

// লেনদেন মডাল
function openTxModal(type = 'expense', personId = null, editTx = null) {
  if (state.people.length === 0) {
    showToast('প্রথমে অন্তত একজন ব্যক্তি/খাত যোগ করুন!');
    document.getElementById('openAddPersonModalBtn').click();
    return;
  }

  const select = document.getElementById('txPersonSelect');
  select.innerHTML = state.people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  
  if (personId) {
    select.value = personId;
    document.getElementById('txPersonSelectGroup').classList.add('hidden');
  } else {
    document.getElementById('txPersonSelectGroup').classList.remove('hidden');
  }

  editingTxId = editTx ? editTx.id : null;
  document.getElementById('txModalTitle').textContent = editTx ? '✏️ লেনদেন এডিট' : 'নতুন লেনদেন';
  setTxType(editTx ? editTx.type : type);

  document.getElementById('txAmountInput').value = editTx ? editTx.amount : '';
  document.getElementById('txNoteInput').value = editTx ? editTx.note : '';
  document.getElementById('txDateInput').value = editTx ? editTx.date : todayISO();

  document.getElementById('txModal').classList.remove('hidden');
  document.getElementById('txAmountInput').focus();
}

function setTxType(type) {
  currentTxType = type;
  document.getElementById('typeIncomeBtn').className = `type-btn ${type === 'income' ? 'active-income' : ''}`;
  document.getElementById('typeExpenseBtn').className = `type-btn ${type === 'expense' ? 'active-expense' : ''}`;
}

document.getElementById('typeIncomeBtn').addEventListener('click', () => setTxType('income'));
document.getElementById('typeExpenseBtn').addEventListener('click', () => setTxType('expense'));

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const inp = document.getElementById('txAmountInput');
    inp.value = Number(inp.value || 0) + Number(chip.dataset.add);
  });
});

document.getElementById('fabAddBtn').addEventListener('click', () => openTxModal('expense', null));
document.getElementById('addPersonIncomeBtn').addEventListener('click', () => openTxModal('income', activePersonId));
document.getElementById('addPersonExpenseBtn').addEventListener('click', () => openTxModal('expense', activePersonId));

document.getElementById('saveTxBtn').addEventListener('click', () => {
  const personId = document.getElementById('txPersonSelect').value;
  const amount = Number(document.getElementById('txAmountInput').value);
  const note = document.getElementById('txNoteInput').value.trim();
  const date = document.getElementById('txDateInput').value || todayISO();

  if (!amount || amount <= 0) return showToast('সঠিক টাকার পরিমাণ লিখুন!');

  const person = state.people.find(p => p.id === personId);
  if (!person) return;

  if (editingTxId) {
    const tx = person.transactions.find(t => t.id === editingTxId);
    if (tx) {
      tx.type = currentTxType;
      tx.amount = amount;
      tx.note = note;
      tx.date = date;
    }
    showToast('লেনদেন আপডেট হয়েছে!');
  } else {
    person.transactions.push({
      id: Date.now().toString(),
      type: currentTxType,
      amount,
      note,
      date
    });
    showToast('লেনদেন সেভ হয়েছে!');
  }

  saveState();
  closeAllModals();
  renderDashboard();
  if (!document.getElementById('personDetailsView').classList.contains('hidden')) {
    renderPersonDetails();
  }
});

// কমেন্ট মডাল
document.getElementById('addPersonCommentBtn').addEventListener('click', () => {
  document.getElementById('commentInput').value = '';
  document.getElementById('commentModal').classList.remove('hidden');
  document.getElementById('commentInput').focus();
});

document.getElementById('saveCommentBtn').addEventListener('click', () => {
  const text = document.getElementById('commentInput').value.trim();
  if (!text) return showToast('নোট লিখুন!');
  const person = state.people.find(p => p.id === activePersonId);
  if (!person) return;

  person.comments.push({
    id: Date.now().toString(),
    text,
    date: new Date().toLocaleDateString('bn-BD')
  });
  saveState();
  closeAllModals();
  renderPersonDetails();
  showToast('কমেন্ট যোগ হয়েছে');
});

// অ্যানালিটিক্স রেন্ডার
function renderAnalytics() {
  const currentMonth = todayISO().slice(0, 7);
  let mInc = 0, mExp = 0;

  const personExpenses = state.people.map(p => {
    let pExp = 0;
    p.transactions.forEach(tx => {
      if (tx.date.startsWith(currentMonth)) {
        tx.type === 'income' ? mInc += Number(tx.amount) : mExp += Number(tx.amount);
      }
      if (tx.type === 'expense') pExp += Number(tx.amount);
    });
    return { name: p.name, expense: pExp };
  }).sort((a, b) => b.expense - a.expense);

  document.getElementById('monthIncome').textContent = `${formatMoney(mInc)} ৳`;
  document.getElementById('monthExpense').textContent = `${formatMoney(mExp)} ৳`;
  document.getElementById('monthNet').textContent = `${formatMoney(mInc - mExp)} ৳`;

  const chartEl = document.getElementById('analyticsChart');
  const maxExp = Math.max(...personExpenses.map(x => x.expense), 1);

  if (personExpenses.every(x => x.expense === 0)) {
    chartEl.innerHTML = '<div class="empty">এখনো কোনো খরচের ডাটা নেই।</div>';
    return;
  }

  chartEl.innerHTML = personExpenses.filter(x => x.expense > 0).map(item => {
    const pct = Math.round((item.expense / maxExp) * 100);
    return `
      <div>
        <div class="bar-row-label">
          <span>${escapeHtml(item.name)}</span>
          <b>${formatMoney(item.expense)} ৳</b>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// WhatsApp / Share
document.getElementById('sharePersonBtn').addEventListener('click', async () => {
  const person = state.people.find(p => p.id === activePersonId);
  if (!person) return;

  let inc = 0, exp = 0;
  person.transactions.forEach(t => t.type === 'income' ? inc += Number(t.amount) : exp += Number(t.amount));
  const text = `📊 হিসাবের সারসংক্ষেপ\n👤 নাম: ${person.name}\n⬇️ মোট জমা: ${formatMoney(inc)} ৳\n⬆️ মোট খরচ: ${formatMoney(exp)} ৳\n💰 ব্যালেন্স: ${formatMoney(inc - exp)} ৳`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `${person.name} - হিসাব`, text });
      return;
    } catch (e) {}
  }

  const phone = person.phone ? person.phone.replace(/\D/g, '') : '';
  const waNum = phone.startsWith('01') ? `88${phone}` : phone;
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(text)}`, '_blank');
});

// PDF ডাউনলোড
document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  const person = state.people.find(p => p.id === activePersonId);
  if (!person) return;
  if (typeof html2pdf === 'undefined') {
    return showToast('PDF লাইব্রেরি লোড হয়নি (ইন্টারনেট চেক করুন)');
  }

  let inc = 0, exp = 0;
  person.transactions.forEach(t => t.type === 'income' ? inc += Number(t.amount) : exp += Number(t.amount));

  document.getElementById('pdfPersonName').textContent = person.name;
  document.getElementById('pdfDate').textContent = new Date().toLocaleDateString('bn-BD');
  document.getElementById('pdfIncome').textContent = `${formatMoney(inc)} ৳`;
  document.getElementById('pdfExpense').textContent = `${formatMoney(exp)} ৳`;
  document.getElementById('pdfBalance').textContent = `${formatMoney(inc - exp)} ৳`;

  document.getElementById('pdfTableBody').innerHTML = person.transactions.map(tx => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(tx.date)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(tx.note || '-')}</td>
      <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #00b894;">${tx.type === 'income' ? formatMoney(tx.amount) + ' ৳' : '-'}</td>
      <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #d63031;">${tx.type === 'expense' ? formatMoney(tx.amount) + ' ৳' : '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding:10px; text-align:center;">কোনো লেনদেন নেই</td></tr>';

  document.getElementById('pdfComments').innerHTML = person.comments.map(c =>
    `<li>${escapeHtml(c.text)} (${escapeHtml(c.date)})</li>`
  ).join('') || '<li>কোনো কমেন্ট নেই</li>';

  showToast('PDF তৈরি হচ্ছে...');
  const el = document.getElementById('pdfTemplate');
  html2pdf().set({
    margin: 10,
    filename: `${person.name}_hisab.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(el).save();
});

// সেটিংস, ব্যাকআপ ও রিস্টোর
document.getElementById('saveTargetBtn').addEventListener('click', () => {
  state.dailyTarget = Math.max(0, Number(document.getElementById('dailyTargetInput').value));
  saveState();
  renderDashboard();
  showToast('টার্গেট সেভ হয়েছে!');
});

document.getElementById('exportBackupBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `khata_backup_${todayISO()}.json`;
  a.click();
  showToast('ব্যাকআপ ডাউনলোড হয়েছে!');
});

document.getElementById('importBackupInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (Array.isArray(parsed.people)) {
        state = parsed;
        saveState();
        applyTheme();
        renderDashboard();
        showToast('ডাটা সফলভাবে রিস্টোর হয়েছে!');
      } else {
        showToast('ভুল ব্যাকআপ ফাইল!');
      }
    } catch {
      showToast('ফাইল পড়া যায়নি!');
    }
  };
  reader.readAsText(file);
});

document.getElementById('resetAllDataBtn').addEventListener('click', () => {
  if (confirm('সতর্কতা! আপনার সব হিসাব চিরতরে মুছে যাবে। আপনি কি নিশ্চিত?')) {
    state = { people: [], dailyTarget: 0, darkMode: state.darkMode };
    saveState();
    renderDashboard();
    showToast('সব ডাটা মুছে ফেলা হয়েছে');
  }
});

// PWA ইনস্টল বাটন
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installAppBtn').classList.remove('hidden');
});

document.getElementById('installAppBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installAppBtn').classList.add('hidden');
});

// ===== অ্যাপ থেকে বের হলেই বাংলায় ব্যাকআপ রিমাইন্ডার =====
let allowAppExit = false;

function checkNotifyBar() {
  const bar = document.getElementById('notifyPermissionBar');
  if (!bar) return;
  if ('Notification' in window && Notification.permission === 'default') {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

document.getElementById('enableNotifyBtn')?.addEventListener('click', async () => {
  if (!('Notification' in window)) return showToast('এই ব্রাউজারে নোটিফিকেশন সাপোর্ট নেই');
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('🔔 ব্যাকআপ রিমাইন্ডার চালু হয়েছে!');
  }
  checkNotifyBar();
});

function pushExitGuard() {
  if (!allowAppExit && (!history.state || !history.state.khataGuard)) {
    history.pushState({ khataGuard: true }, '');
  }
}
window.addEventListener('load', pushExitGuard);
window.addEventListener('pointerdown', pushExitGuard);

window.addEventListener('popstate', () => {
  if (allowAppExit) return;

  const openModal = document.querySelector('.modal:not(.hidden)');
  if (openModal) {
    closeAllModals();
    pushExitGuard();
    return;
  }

  const isHomeActive = document.getElementById('tabHome').classList.contains('active');
  if (!isHomeActive) {
    switchTab('tabHome');
    pushExitGuard();
    return;
  }

  pushExitGuard();
  document.getElementById('exitBackupMsg').textContent =
    'নতুন তথ্য যদি যোগ করে থাকেন ব্যাকআপ নিয়ে নিন।';
  document.getElementById('exitBackupModal').classList.remove('hidden');
});

document.getElementById('exitDownloadBackupBtn')?.addEventListener('click', () => {
  document.getElementById('exportBackupBtn').click();
  document.getElementById('exitBackupModal').classList.add('hidden');
});

document.getElementById('exitStayBtn')?.addEventListener('click', () => {
  document.getElementById('exitBackupModal').classList.add('hidden');
});

document.getElementById('exitConfirmLeaveBtn')?.addEventListener('click', () => {
  allowAppExit = true;
  document.getElementById('exitBackupModal').classList.add('hidden');
  history.back();
  window.close();
  showToast('বের হতে ফোনের Back বাটনে আরেকবার চাপ দিন');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('💰 আমার খরচের খাতা', {
          body: 'নতুন তথ্য যদি যোগ করে থাকেন ব্যাকআপ নিয়ে নিন।',
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          tag: 'backup-reminder',
          renotify: true
        });
      }).catch(() => {});
    }
  } else if (document.visibilityState === 'visible') {
    allowAppExit = false;
    pushExitGuard();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (!allowAppExit) {
    e.preventDefault();
    e.returnValue = 'নতুন তথ্য যদি যোগ করে থাকেন ব্যাকআপ নিয়ে নিন।';
  }
});

// ইনিশিয়ালাইজ
applyTheme();
initDate();
renderDashboard();
checkNotifyBar();
