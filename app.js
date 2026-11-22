const API_URL = "https://api.nspace.my";
let state = { journal: [], expenses: [] };

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = "status " + type;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function switchTab(tab) {
  const isJournal = tab === "journal";
  document.getElementById("sectionJournal").classList.toggle("hidden", !isJournal);
  document.getElementById("sectionExpenses").classList.toggle("hidden", isJournal);

  document.getElementById("tabJournal").className = "tab-btn " + (isJournal ? "active" : "secondary");
  document.getElementById("tabExpenses").className = "tab-btn " + (!isJournal ? "active" : "secondary");
}

async function refreshAll() {
  setStatus("Syncing with Cloudflare D1...");
  try {
    const res = await fetch(API_URL, { method: "GET" });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.message || "Failed to load data");
    }
    state.journal = Array.isArray(data.journal) ? data.journal : [];
    state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
    renderJournal();
    renderExpenses();
    setStatus("Synced with Cloudflare D1", "ok");
  } catch (err) {
    setStatus("Sync error: " + err.message, "err");
  }
}

async function postAction(payload) {
  setStatus("Saving...");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.message || "Request failed");
    }
    await refreshAll();
    return true;
  } catch (err) {
    setStatus("Error: " + err.message, "err");
    alert(err.message);
    return false;
  }
}

async function addJournal(e) {
  e.preventDefault();
  await postAction({
    action: "add",
    target: "journal",
    date: document.getElementById("jDate").value,
    time: document.getElementById("jTime").value.trim() || "All Day",
    type: document.getElementById("jType").value,
    category: document.getElementById("jCategory").value.trim() || "Personal",
    title: document.getElementById("jTitle").value.trim(),
    content: document.getElementById("jContent").value.trim(),
    done: false
  });
  document.getElementById("jTitle").value = "";
  document.getElementById("jContent").value = "";
}

async function toggleJournalDone(id, currentDone) {
  await postAction({
    action: "toggle_done",
    target: "journal",
    id,
    done: !currentDone
  });
}

async function deleteJournal(id) {
  if (!confirm("Padam entri journal ini?")) return;
  await postAction({ action: "delete", target: "journal", id });
}

async function addExpense(e) {
  e.preventDefault();
  await postAction({
    action: "add",
    target: "expense",
    date: document.getElementById("eDate").value,
    amount: parseFloat(document.getElementById("eAmount").value) || 0,
    category: document.getElementById("eCategory").value.trim() || "Food",
    note: document.getElementById("eNote").value.trim()
  });
  document.getElementById("eAmount").value = "";
  document.getElementById("eNote").value = "";
}

async function deleteExpense(id) {
  if (!confirm("Padam rekod perbelanjaan ini?")) return;
  await postAction({ action: "delete", target: "expense", id });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderJournal() {
  const container = document.getElementById("journalList");
  if (!state.journal.length) {
    container.innerHTML = '<div class="empty">Tiada rekod journal lagi.</div>';
    return;
  }

  container.innerHTML = state.journal.map(item => `
    <div class="item">
      <div>
        <div class="item-title ${item.done ? "done" : ""}">${escapeHtml(item.title)}</div>
        <div class="item-meta">${escapeHtml(item.date)} · ${escapeHtml(item.time)} · ${escapeHtml(item.type)} · ${escapeHtml(item.category)}</div>
        ${item.content ? `<div class="item-content ${item.done ? "done" : ""}">${escapeHtml(item.content)}</div>` : ""}
      </div>
      <div class="row-right">
        <input type="checkbox" class="journal-toggle" data-id="${escapeHtml(item.id)}" data-done="${Boolean(item.done)}" ${item.done ? "checked" : ""} title="Mark done" />
        <button class="danger journal-delete" type="button" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>
  `).join("");
}

function renderExpenses() {
  const container = document.getElementById("expenseList");
  if (!state.expenses.length) {
    container.innerHTML = '<div class="empty">Tiada rekod perbelanjaan lagi.</div>';
    return;
  }

  container.innerHTML = state.expenses.map(item => `
    <div class="item">
      <div>
        <div class="item-title">${escapeHtml(item.category)}${item.note ? " — " + escapeHtml(item.note) : ""}</div>
        <div class="item-meta">${escapeHtml(item.date)}</div>
      </div>
      <div class="row-right">
        <span class="amount">RM ${Number(item.amount || 0).toFixed(2)}</span>
        <button class="danger expense-delete" type="button" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("jDate").value = todayISO();
  document.getElementById("eDate").value = todayISO();

  document.getElementById("refreshBtn").addEventListener("click", refreshAll);

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("journalForm").addEventListener("submit", addJournal);
  document.getElementById("expenseForm").addEventListener("submit", addExpense);

  document.getElementById("journalList").addEventListener("change", (e) => {
    if (e.target.classList.contains("journal-toggle")) {
      const id = e.target.dataset.id;
      const currentDone = e.target.dataset.done === "true";
      toggleJournalDone(id, currentDone);
    }
  });

  document.getElementById("journalList").addEventListener("click", (e) => {
    if (e.target.classList.contains("journal-delete")) {
      deleteJournal(e.target.dataset.id);
    }
  });

  document.getElementById("expenseList").addEventListener("click", (e) => {
    if (e.target.classList.contains("expense-delete")) {
      deleteExpense(e.target.dataset.id);
    }
  });

  refreshAll();
});
