const STORAGE_KEY = "expenseTrackerData_v2"; // নতুন ভার্সন

let state = {
  settings: { dailyTarget: 500 },
  persons: [], // [{ id, name, createdAt, comments: [] }]
  transactions: [] // [{ id, personId, type, title, amount, note, date }]
};

let currentPersonId = null; // কোন ব্যক্তির ডিটেইলস দেখা হচ্ছে

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n) => Number(n || 0).toLocaleString("bn-BD");
const todayKey = () => new Date().toISOString().slice(0, 10);

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn("Load failed", e);
  }
}

let toastTimer;
function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast " + type;
  }, 2800);
}

function requestNotifPermission() {
  if (!("Notification" in window)) return toast("এই ব্রাউজারে নোটিফিকেশন সাপোর্ট করে না", "error");
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      toast("নোটিফিকেশন চালু হয়েছে ✅", "success");
      $("#notifBar").classList.add("hidden");
    }
  });
}

function sendNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "icon-192.png" });
  }
}

// ক্যালকুলেশন হেল্পার
function getPersonTotal(personId, type) {
  return state.transactions
    .filter((t) => t.personId === personId && t.type === type)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

function todayExpense() {
  const key = todayKey();
  return state.transactions
    .filter((t) => t.type === "expense" && t.date.slice(0, 10) === key)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

// রেন্ডার ফাংশন
function renderHeaderDate() {
  const now = new Date();
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  $("#todayDate").textContent = now.toLocaleDateString("bn-BD", opts);
}

function renderSettingsAndProgress() {
  const target = Number(state.settings.dailyTarget || 0);
  const spent = todayExpense();
  const remaining = target - spent;

  $("#dailyTargetInput").value = target || "";
  $("#todayTarget").textContent = fmt(target);
  $("#todaySpent").textContent = fmt(spent);
  $("#todayRemaining").textContent = fmt(Math.max(0, remaining));

  const pct = target > 0 ? Math.min(100, (spent / target) * 100) : 0;
  const fill = $("#progressFill");
  fill.style.width = pct + "%";
  fill.classList.remove("warn", "danger");
  if (pct >= 100) fill.classList.add("danger");
  else if (pct >= 75) fill.classList.add("warn");
}

function renderGlobalSummary() {
  const inc = state.transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const exp = state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  $("#totalIncome").textContent = fmt(inc) + " ৳";
  $("#totalExpense").textContent = fmt(exp) + " ৳";
  $("#totalBalance").textContent = fmt(inc - exp) + " ৳";
}

function renderPersons() {
  const list = $("#personList");
  const empty = $("#emptyPerson");
  list.innerHTML = "";

  if (state.persons.length === 0) {
    empty.classList.add("show");
    return;
  }
  empty.classList.remove("show");

  state.persons.forEach((p) => {
    const inc = getPersonTotal(p.id, "income");
    const exp = getPersonTotal(p.id, "expense");
    const div = document.createElement("div");
    div.className = "category-item";
    div.innerHTML = `
      <div class="cat-info">
        <div class="cat-name">👤 ${escapeHtml(p.name)}</div>
        <div class="cat-amount">জমা: ${fmt(inc)} ৳ | খরচ: ${fmt(exp)} ৳</div>
      </div>
      <div class="cat-actions">
        <button class="btn danger small" data-del-person="${p.id}">🗑️</button>
      </div>
    `;
    // কার্ডে ক্লিক করলে ডিটেইলস দেখাবে
    div.addEventListener("click", (e) => {
      if (e.target.closest('button')) return; // ডিলিট বাটনে ক্লিক করলে ডিটেইলস খুলবে না
      openPersonDetails(p.id);
    });
    list.appendChild(div);
  });
}

function openPersonDetails(personId) {
  const person = state.persons.find(p => p.id === personId);
  if (!person) return;
  
  currentPersonId = personId;
  $("#personDetailsCard").classList.remove("hidden");
  $("#detailsPersonName").textContent = `👤 ${person.name} এর হিসাব`;
  
  renderPersonDetails(personId);
  
  // স্ক্রল করে ডিটেইলসে নিয়ে যাওয়া
  $("#personDetailsCard").scrollIntoView({ behavior: 'smooth' });
}

function renderPersonDetails(personId) {
  const inc = getPersonTotal(personId, "income");
  const exp = getPersonTotal(personId, "expense");
  
  $("#detailsTotalIncome").textContent = fmt(inc) + " ৳";
  $("#detailsTotalExpense").textContent = fmt(exp) + " ৳";
  $("#detailsBalance").textContent = fmt(inc - exp) + " ৳";

  // লেনদেন রেন্ডার
  const txList = $("#personTransactionList");
  txList.innerHTML = "";
  const txs = state.transactions.filter(t => t.personId === personId).sort((a,b) => new Date(b.date) - new Date(a.date));
  
  if (txs.length === 0) {
    txList.innerHTML = "<div class='empty show' style='display:block;'>কোনো লেনদেন নেই।</div>";
  } else {
    txs.forEach(tx => {
      const dateStr = new Date(tx.date).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const sign = tx.type === "income" ? "+" : "-";
      const div = document.createElement("div");
      div.className = "tx-item " + tx.type;
      div.innerHTML = `
        <div class="tx-left">
          <div class="tx-title">${escapeHtml(tx.title)}</div>
          <div class="tx-meta">${dateStr}${tx.note ? " • " + escapeHtml(tx.note) : ""}</div>
        </div>
        <div class="tx-amount ${tx.type}">${sign}${fmt(tx.amount)} ৳</div>
        <button class="tx-del" data-del-tx="${tx.id}">✖</button>
      `;
      txList.appendChild(div);
    });
  }

  // কমেন্ট রেন্ডার
  const person = state.persons.find(p => p.id === personId);
  const commentList = $("#personCommentList");
  commentList.innerHTML = "";
  if (!person.comments || person.comments.length === 0) {
    commentList.innerHTML = "<div class='empty show' style='display:block;'>কোনো কমেন্ট নেই।</div>";
  } else {
    person.comments.forEach((c, index) => {
      const div = document.createElement("div");
      div.className = "comment-item";
      div.innerHTML = `
        <div>${escapeHtml(c.text)}</div>
        <div style="font-size:0.75rem; color:#888; margin-top:4px;">${c.date}</div>
      `;
      commentList.appendChild(div);
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// মডাল (Popup) তৈরি
function showInputModal({ title, fields, initial = {}, onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay show";

  const fieldHtml = fields.map((f) => {
    const val = initial[f.id] ?? "";
    if (f.type === "textarea") {
      return `<label>${f.label}</label><textarea id="m_${f.id}" rows="3" placeholder="${f.placeholder || ""}">${escapeHtml(val)}</textarea>`;
    }
    return `<label>${f.label}</label><input id="m_${f.id}" type="${f.type}" placeholder="${f.placeholder || ""}" value="${escapeHtml(val)}" />`;
  }).join("");

  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      ${fieldHtml}
      <div class="modal-actions">
        <button class="btn ghost" id="mCancel">বাতিল</button>
        <button class="btn primary" id="mOk">সেভ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#mCancel").onclick = close;
  overlay.querySelector("#mOk").onclick = () => {
    const vals = {};
    fields.forEach((f) => { vals[f.id] = overlay.querySelector("#m_" + f.id).value.trim(); });
    close();
    onSubmit(vals);
  };
  setTimeout(() => overlay.querySelector("input, textarea")?.focus(), 50);
}

// ইভেন্ট সেটআপ
function setupEvents() {
  // টার্গেট সেভ
  $("#saveTargetBtn").addEventListener("click", () => {
    const val = Number($("#dailyTargetInput").value);
    if (!val || val <= 0) return toast("সঠিক টার্গেট দিন", "error");
    state.settings.dailyTarget = val;
    saveState();
    renderSettingsAndProgress();
    toast("✅ টার্গেট সেভ হয়েছে", "success");
  });

  // নতুন ব্যক্তি যোগ
  $("#addPersonBtn").addEventListener("click", () => {
    const name = $("#newPersonInput").value.trim();
    if (!name) return toast("ব্যক্তির নাম লিখুন", "error");
    if (state.persons.some(p => p.name.toLowerCase() === name.toLowerCase())) return toast("এই নাম ইতিমধ্যেই আছে", "warn");
    
    state.persons.push({ id: uid(), name, comments: [], createdAt: new Date().toISOString() });
    $("#newPersonInput").value = "";
    saveState();
    renderPersons();
    toast("✅ ব্যক্তি যোগ হয়েছে", "success");
  });

  // ব্যক্তি ডিলিট
  $("#personList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del-person]");
    if (btn) {
      const id = btn.dataset.delPerson;
      if (confirm("এই ব্যক্তির সব হিসাব ডিলিট করবেন?")) {
        state.persons = state.persons.filter(p => p.id !== id);
        state.transactions = state.transactions.filter(t => t.personId !== id);
        saveState();
        renderPersons();
        renderGlobalSummary();
        if (currentPersonId === id) $("#personDetailsCard").classList.add("hidden");
        toast("ডিলিট হয়েছে", "warn");
      }
    }
  });

  // ডিটেইলস বন্ধ করা
  $("#closeDetailsBtn").addEventListener("click", () => {
    $("#personDetailsCard").classList.add("hidden");
    currentPersonId = null;
  });

  // ব্যক্তির ভেতরে জমা যোগ
  $("#addPersonIncomeBtn").addEventListener("click", () => {
    if (!currentPersonId) return;
    showInputModal({
      title: "💵 জমা যোগ করুন",
      fields: [
        { id: "amount", label: "টাকার পরিমাণ (৳)", type: "number" },
        { id: "note", label: "নোট (ঐচ্ছিক)", type: "text", placeholder: "বিবরণ..." }
      ],
      onSubmit: (vals) => {
        const amt = Number(vals.amount);
        if (!amt || amt <= 0) return toast("সঠিক পরিমাণ দিন", "error");
        state.transactions.push({
          id: uid(), personId: currentPersonId, type: "income", title: "জমা", amount: amt, note: vals.note || "", date: new Date().toISOString()
        });
        saveState();
        renderPersonDetails(currentPersonId);
        renderPersons();
        renderGlobalSummary();
        toast("✅ জমা যোগ হয়েছে", "success");
      }
    });
  });

  // ব্যক্তির ভেতরে খরচ যোগ
  $("#addPersonExpenseBtn").addEventListener("click", () => {
    if (!currentPersonId) return;
    showInputModal({
      title: "➖ খরচ যোগ করুন",
      fields: [
        { id: "title", label: "খরচের খাত (যেমন: বাজার)", type: "text" },
        { id: "amount", label: "টাকার পরিমাণ (৳)", type: "number" },
        { id: "note", label: "নোট (ঐচ্ছিক)", type: "text", placeholder: "কী কিনলেন?" }
      ],
      onSubmit: (vals) => {
        const amt = Number(vals.amount);
        if (!vals.title) return toast("খরচের নাম দিন", "error");
        if (!amt || amt <= 0) return toast("সঠিক পরিমাণ দিন", "error");
        state.transactions.push({
          id: uid(), personId: currentPersonId, type: "expense", title: vals.title, amount: amt, note: vals.note || "", date: new Date().toISOString()
        });
        saveState();
        renderPersonDetails(currentPersonId);
        renderPersons();
        renderGlobalSummary();
        toast("✅ খরচ যোগ হয়েছে", "success");
      }
    });
  });

  // ব্যক্তির ভেতরে কমেন্ট যোগ
  $("#addPersonCommentBtn").addEventListener("click", () => {
    if (!currentPersonId) return;
    showInputModal({
      title: "💬 কমেন্ট যোগ করুন",
      fields: [{ id: "text", label: "আপনার কমেন্ট", type: "textarea" }],
      onSubmit: (vals) => {
        if (!vals.text) return toast("কমেন্ট লিখুন", "error");
        const person = state.persons.find(p => p.id === currentPersonId);
        const today = new Date().toLocaleString("bn-BD", { dateStyle: "short", timeStyle: "short" });
        if (!person.comments) person.comments = [];
        person.comments.push({ text: vals.text, date: today });
        saveState();
        renderPersonDetails(currentPersonId);
        toast("✅ কমেন্ট সেভ হয়েছে", "success");
      }
    });
  });

  // লেনদেন ডিলিট
  $("#personTransactionList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del-tx]");
    if (btn) {
      const id = btn.dataset.delTx;
      if (confirm("এই লেনদেনটি ডিলিট করবেন?")) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveState();
        renderPersonDetails(currentPersonId);
        renderPersons();
        renderGlobalSummary();
        toast("ডিলিট হয়েছে", "warn");
      }
    }
  });

  // PDF ডাউনলোড
  $("#downloadPdfBtn").addEventListener("click", () => {
    if (!currentPersonId) return;
    const person = state.persons.find(p => p.id === currentPersonId);
    const inc = getPersonTotal(currentPersonId, "income");
    const exp = getPersonTotal(currentPersonId, "expense");
    const txs = state.transactions.filter(t => t.personId === currentPersonId).sort((a,b) => new Date(a.date) - new Date(b.date));

    // PDF টেমপ্লেটে ডাটা বসানো
    $("#pdfPersonName").textContent = person.name;
    $("#pdfDate").textContent = new Date().toLocaleDateString("bn-BD");
    $("#pdfIncome").textContent = fmt(inc) + " ৳";
    $("#pdfExpense").textContent = fmt(exp) + " ৳";
    $("#pdfBalance").textContent = fmt(inc - exp) + " ৳";

    const tbody = $("#pdfTableBody");
    tbody.innerHTML = "";
    txs.forEach(tx => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #eee";
      const dateStr = new Date(tx.date).toLocaleDateString("bn-BD");
      const incomeVal = tx.type === "income" ? fmt(tx.amount) + " ৳" : "";
      const expenseVal = tx.type === "expense" ? fmt(tx.amount) + " ৳" : "";
      const title = tx.type === "expense" ? tx.title : (tx.note || "জমা");
      
      tr.innerHTML = `
        <td style="padding: 8px;">${dateStr}</td>
        <td style="padding: 8px;">${escapeHtml(title)}</td>
        <td style="padding: 8px; text-align: right; color: #11998e;">${incomeVal}</td>
        <td style="padding: 8px; text-align: right; color: #d63031;">${expenseVal}</td>
      `;
      tbody.appendChild(tr);
    });

    const pdfComments = $("#pdfComments");
    pdfComments.innerHTML = "";
    if (person.comments && person.comments.length > 0) {
      person.comments.forEach(c => {
        const li = document.createElement("li");
        li.style.marginBottom = "5px";
        li.innerHTML = `${escapeHtml(c.text)} <span style="font-size:0.8rem; color:#888;">(${c.date})</span>`;
        pdfComments.appendChild(li);
      });
    } else {
      pdfComments.innerHTML = "<li>কোনো কমেন্ট নেই</li>";
    }

    // PDF তৈরি
    const element = document.getElementById("pdfTemplate");
    element.style.display = "block"; // সাময়িকভাবে দেখানো
    
    const opt = {
      margin:       10,
      filename:     `${person.name}_Expense_Report.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      element.style.display = "none"; // ডাউনলোড শেষে আবার লুকানো
      toast("✅ PDF ডাউনলোড শুরু হয়েছে", "success");
    });
  });

  $("#enableNotifBtn").addEventListener("click", requestNotifPermission);
}

// অ্যাপ শুরু
function init() {
  loadState();
  renderHeaderDate();
  renderSettingsAndProgress();
  renderGlobalSummary();
  renderPersons();
  setupEvents();
}

document.addEventListener("DOMContentLoaded", init);
