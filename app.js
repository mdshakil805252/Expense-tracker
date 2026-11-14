/* =====================================================
   Personal Expense Tracker — app.js
   ===================================================== */

const STORAGE_KEY = "expenseTrackerData_v1";

let state = {
  settings: { dailyTarget: 500, currency: "৳" },
  categories: [],   
  transactions: []  
};

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
      if (!state.settings) state.settings = { dailyTarget: 500, currency: "৳" };
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
  if (!("Notification" in window)) {
    toast("এই ব্রাউজারে নোটিফিকেশন সাপোর্ট করে না", "error");
    return;
  }
  if (Notification.permission === "granted") {
    toast("নোটিফিকেশন ইতিমধ্যেই চালু আছে ✅", "success");
    $("#notifBar").classList.add("hidden");
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      toast("নোটিফিকেশন চালু হয়েছে ✅", "success");
      $("#notifBar").classList.add("hidden");
      new Notification("খরচের খাতা", {
        body: "দৈনিক টার্গেট অতিক্রম করলে আমি আপনাকে জানাবো।",
      });
    } else {
      toast("নোটিফিকেশন অনুমতি দেওয়া হয়নি", "warn");
    }
  });
}

function sendNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "icon-192.png" });
  }
}

function totalIncome() {
  return state.transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

function totalExpense() {
  return state.transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

function todayExpense() {
  const key = todayKey();
  return state.transactions
    .filter((t) => t.type === "expense" && t.date.slice(0, 10) === key)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

function categoryTotal(catId) {
  return state.transactions
    .filter((t) => t.type === "expense" && t.categoryId === catId)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

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

function renderSummary() {
  const inc = totalIncome();
  const exp = totalExpense();
  $("#totalIncome").textContent = fmt(inc) + " ৳";
  $("#totalExpense").textContent = fmt(exp) + " ৳";
  $("#totalBalance").textContent = fmt(inc - exp) + " ৳";
}

function renderCategories() {
  const list = $("#categoryList");
  const empty = $("#emptyState");
  list.innerHTML = "";

  if (state.categories.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  state.categories.forEach((cat) => {
    const total = categoryTotal(cat.id);
    const div = document.createElement("div");
    div.className = "category-item";
    div.innerHTML = `
      <div class="cat-info">
        <div class="cat-name">${escapeHtml(cat.name)}</div>
        <div class="cat-amount">এই খাতে মোট খরচ: ${fmt(total)} ৳</div>
      </div>
      <div class="cat-actions">
        <button class="btn ghost small" data-action="add-expense" data-id="${cat.id}">➕ খরচ যোগ</button>
        <button class="btn ghost small" data-action="comment" data-id="${cat.id}">💬 কমেন্ট</button>
        <button class="btn danger small" data-action="delete-cat" data-id="${cat.id}">🗑️</button>
      </div>
    `;
    list.appendChild(div);
  });
}

function renderTransactions() {
  const list = $("#transactionList");
  const empty = $("#emptyTx");
  list.innerHTML = "";

  const sorted = [...state.transactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  if (sorted.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  sorted.forEach((tx) => {
    const cat = state.categories.find((c) => c.id === tx.categoryId);
    const title = tx.title || (cat ? cat.name : "খরচ");
    const dateStr = new Date(tx.date).toLocaleString("bn-BD", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const sign = tx.type === "income" ? "+" : "-";
    const div = document.createElement("div");
    div.className = "tx-item " + tx.type;
    div.innerHTML = `
      <div class="tx-left">
        <div class="tx-title">${escapeHtml(title)}</div>
        <div class="tx-meta">${dateStr}${tx.note ? " • " + escapeHtml(tx.note) : ""}</div>
      </div>
      <div class="tx-amount ${tx.type}">${sign}${fmt(tx.amount)} ৳</div>
      <button class="tx-del" data-del="${tx.id}" title="ডিলিট">✖</button>
    `;
    list.appendChild(div);
  });
}

function renderAll() {
  renderSettingsAndProgress();
  renderSummary();
  renderCategories();
  renderTransactions();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let targetAlertShownFor = null;

function checkDailyTarget() {
  const target = Number(state.settings.dailyTarget || 0);
  if (target <= 0) return;
  const spent = todayExpense();
  const key = todayKey();

  if (spent >= target && targetAlertShownFor !== key) {
    targetAlertShownFor = key;
    sendNotification(
      "⚠️ আজকের খরচের টার্গেট শেষ!",
      `আজ ${fmt(spent)} ৳ খরচ হয়েছে (টার্গেট ${fmt(target)} ৳)। আর কোনো খরচ করা যাবে না!`
    );
    toast("⚠️ আজকের টার্গেট ফুরিয়ে গেছে! আর খরচ করা যাবে না।", "error");
  }
}

function showInputModal({ title, fields, initial = {}, onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay show";

  const fieldHtml = fields
    .map((f) => {
      const val = initial[f.id] ?? "";
      if (f.type === "textarea") {
        return `
          <label>${f.label}</label>
          <textarea id="m_${f.id}" rows="3" placeholder="${f.placeholder || ""}">${escapeHtml(val)}</textarea>
        `;
      }
      return `
        <label>${f.label}</label>
        <input id="m_${f.id}" type="${f.type}" placeholder="${f.placeholder || ""}" value="${escapeHtml(val)}" />
      `;
    })
    .join("");

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
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector("#mOk").onclick = () => {
    const vals = {};
    fields.forEach((f) => {
      vals[f.id] = overlay.querySelector("#m_" + f.id).value.trim();
    });
    close();
    onSubmit(vals);
  };

  const firstInput = overlay.querySelector("input, textarea");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function openIncomeModal() {
  showInputModal({
    title: "💵 জমা ক্যাশ যোগ করুন",
    fields: [
      { id: "amount", label: "টাকার পরিমাণ (৳)", type: "number", placeholder: "0" },
      { id: "note", label: "নোট (ঐচ্ছিক)", type: "text", placeholder: "যেমন: বেতন" },
    ],
    onSubmit: (vals) => {
      const amt = Number(vals.amount);
      if (!amt || amt <= 0) return toast("সঠিক পরিমাণ দিন", "error");
      state.transactions.push({
        id: uid(),
        type: "income",
        categoryId: null,
        title: "জমা ক্যাশ",
        amount: amt,
        note: vals.note || "",
        date: new Date().toISOString(),
      });
      saveState();
      renderAll();
      toast("✅ জমা যোগ হয়েছে", "success");
    },
  });
}

function openExpenseModal(catId) {
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) return;

  const target = Number(state.settings.dailyTarget || 0);
  const spent = todayExpense();
  if (target > 0 && spent >= target) {
    toast("⛔ আজকের টার্গেট শেষ! নতুন খরচ করা যাবে না।", "error");
    sendNotification(
      "⛔ খরচ বন্ধ!",
      "আজকের দৈনিক টার্গেট ইতিমধ্যেই শেষ হয়ে গেছে।"
    );
    return;
  }

  showInputModal({
    title: `➕ "${cat.name}" খাতে খরচ`,
    fields: [
      { id: "amount", label: "টাকার পরিমাণ (৳)", type: "number", placeholder: "0" },
      { id: "note", label: "নোট (ঐচ্ছিক)", type: "text", placeholder: "কী কিনলেন?" },
    ],
    onSubmit: (vals) => {
      const amt = Number(vals.amount);
      if (!amt || amt <= 0) return toast("সঠিক পরিমাণ দিন", "error");

      if (target > 0 && spent + amt > target) {
        const ok = confirm(
          `⚠️ এই খরচ যোগ করলে আজকের টার্গেট (${fmt(target)} ৳) অতিক্রম হবে!\n` +
          `এখন পর্যন্ত: ${fmt(spent)} ৳ + ${fmt(amt)} ৳\n\nতবুও যোগ করবেন?`
        );
        if (!ok) return;
      }

      state.transactions.push({
        id: uid(),
        type: "expense",
        categoryId: catId,
        title: cat.name,
        amount: amt,
        note: vals.note || "",
        date: new Date().toISOString(),
      });
      saveState();
      renderAll();
      checkDailyTarget();
      toast("✅ খরচ যোগ হয়েছে", "success");
    },
  });
}

function openCommentModal(catId) {
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) return;
  showInputModal({
    title: `💬 "${cat.name}" — কমেন্ট`,
    fields: [
      {
        id: "comment",
        label: "কমেন্ট লিখুন",
        type: "textarea",
        placeholder: "এই খাত সম্পর্কে কিছু লিখুন...",
      },
    ],
    initial: { comment: cat.comment || "" },
    onSubmit: (vals) => {
      cat.comment = vals.comment || "";
      saveState();
      toast("✅ কমেন্ট সেভ হয়েছে", "success");
    },
  });
}

function setupEvents() {
  $("#saveTargetBtn").addEventListener("click", () => {
    const val = Number($("#dailyTargetInput").value);
    if (!val || val <= 0) {
      toast("সঠিক টার্গেট দিন", "error");
      return;
    }
    state.settings.dailyTarget = val;
    saveState();
    renderAll();
    checkDailyTarget();
    toast("✅ দৈনিক টার্গেট সেভ হয়েছে: " + fmt(val) + " ৳", "success");
  });

  $("#addCategoryBtn").addEventListener("click", addCategory);
  $("#newCategoryInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCategory();
  });

  function addCategory() {
    const name = $("#newCategoryInput").value.trim();
    if (!name) return toast("খরচের নাম লিখুন", "error");
    if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return toast("এই নামে খাত ইতিমধ্যেই আছে", "warn");
    }
    state.categories.push({
      id: uid(),
      name,
      createdAt: new Date().toISOString(),
    });
    $("#newCategoryInput").value = "";
    saveState();
    renderCategories();
    toast("✅ খাত যোগ হয়েছে: " + name, "success");
  }

  $("#categoryList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "add-expense") openExpenseModal(id);
    if (action === "comment") openCommentModal(id);
    if (action === "delete-cat") {
      if (!confirm("এই খাতটি ডিলিট করবেন? এর লেনদেনগুলোও ডিলিট হবে।")) return;
      state.transactions = state.transactions.filter((t) => t.categoryId !== id);
      state.categories = state.categories.filter((c) => c.id !== id);
      saveState();
      renderAll();
      toast("খাত ডিলিট হয়েছে", "warn");
    }
  });

  $("#transactionList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    const id = btn.dataset.del;
    state.transactions = state.transactions.filter((t) => t.id !== id);
    saveState();
    renderAll();
    toast("লেনদেন ডিলিট হয়েছে", "warn");
  });

  $("#enableNotifBtn").addEventListener("click", requestNotifPermission);

  const incBtn = document.createElement("button");
  incBtn.className = "btn primary";
  incBtn.textContent = "💵 জমা ক্যাশ যোগ";
  incBtn.style.marginTop = "12px";
  incBtn.addEventListener("click", openIncomeModal);
  document.querySelector(".summary-card").appendChild(incBtn);

  if ("Notification" in window && Notification.permission === "granted") {
    $("#notifBar").classList.add("hidden");
  }

  setInterval(() => {
    renderSettingsAndProgress();
    if (targetAlertShownFor && targetAlertShownFor !== todayKey()) {
      targetAlertShownFor = null;
    }
    checkDailyTarget();
  }, 60 * 1000);
}

function seedIfEmpty() {
  if (state.categories.length === 0 && state.transactions.length === 0) {
    state.settings = { dailyTarget: 500, currency: "৳" };
    state.categories = [
      { id: uid(), name: "বাজার", createdAt: new Date().toISOString() },
      { id: uid(), name: "যাতায়াত", createdAt: new Date().toISOString() },
    ];
    state.transactions = [
      {
        id: uid(),
        type: "income",
        categoryId: null,
        title: "জমা ক্যাশ",
        amount: 5000,
        note: "শুরুতে জমা",
        date: new Date().toISOString(),
      },
    ];
    saveState();
  }
}

function init() {
  loadState();
  seedIfEmpty();
  renderHeaderDate();
  renderAll();
  setupEvents();
  checkDailyTarget();
}

document.addEventListener("DOMContentLoaded", init);
