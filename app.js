const API_URL = "https://api.nspace.my";
const LOCAL_CACHE_KEY = "nspace_v2_cache_v1";

const state = {
  journal: [],
  expenses: [],
  notes: [],
  todos: [],
  commitments: [],
  activeTab: "overview",
  selectedDate: todayISO(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(), // 0-11
  filters: {
    noteSearch: "",
    todoStatus: "all",
    todoCategory: "all",
    journalSearch: "",
    expenseCategory: "all",
    expenseFrom: "",
    expenseTo: ""
  }
};

/* ---------------- HELPERS ---------------- */
function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthKey() {
  return todayISO().slice(0, 7); // YYYY-MM
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRM(val) {
  const num = Number(val || 0);
  return `RM ${num.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatHumanDate(isoStr) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr || "";
  const [y, m, d] = isoStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatFullSubtitleDate(isoStr) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr || "";
  const [y, m, d] = isoStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function setStatus(text, type = "") {
  const el = document.getElementById("status");
  if (!el) return;

  const labelEl = el.querySelector(".status-label");
  if (labelEl) {
    labelEl.textContent = text;
  } else {
    el.textContent = text;
  }

  el.title = text;
  el.classList.remove("is-synced", "is-unsynced", "is-syncing");

  if (type === "ok") {
    el.classList.add("is-synced");
  } else if (type === "err") {
    el.classList.add("is-unsynced");
  } else {
    el.classList.add("is-syncing");
  }
}

function detectDeviceMode() {
  const isNarrow = window.innerWidth <= 640;
  const isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const mode = isNarrow || (isCoarsePointer && window.innerWidth <= 820) ? "mobile" : "desktop";
  document.body.dataset.device = mode;
}

function saveLocalCache() {
  try {
    localStorage.setItem(
      LOCAL_CACHE_KEY,
      JSON.stringify({
        journal: state.journal,
        expenses: state.expenses,
        notes: state.notes,
        todos: state.todos,
        commitments: state.commitments,
        savedAt: Date.now()
      })
    );
  } catch (_) {}
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.journal)) state.journal = parsed.journal;
    if (Array.isArray(parsed.expenses)) state.expenses = parsed.expenses;
    if (Array.isArray(parsed.notes)) state.notes = parsed.notes;
    if (Array.isArray(parsed.todos)) state.todos = parsed.todos;
    if (Array.isArray(parsed.commitments)) state.commitments = parsed.commitments;
  } catch (_) {}
}

/* ---------------- NAVIGATION & FORMS ---------------- */
const TABS = ["overview", "notes", "todo", "journal", "expenses", "commitments"];

function switchTab(tab) {
  const validTab = TABS.includes(tab) ? tab : "overview";
  state.activeTab = validTab;

  TABS.forEach((name) => {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const section = document.getElementById(`section${cap}`);
    const btn = document.getElementById(`tab${cap}`);
    if (section) section.classList.toggle("hidden", name !== validTab);
    if (btn) btn.classList.toggle("active", name === validTab);
  });

  renderAll();
}

function setFormOpen(formId, open) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.classList.toggle("hidden", !open);
  if (open) {
    const firstInput = form.querySelector("input:not([type='hidden']), select, textarea");
    if (firstInput) firstInput.focus();
  }
}

function selectCalendarDate(isoDate) {
  if (!isoDate) return;
  state.selectedDate = isoDate;
  const [y, m] = isoDate.split("-").map(Number);
  state.calYear = y;
  state.calMonth = m - 1;

  const jDate = document.getElementById("jDate");
  const eDate = document.getElementById("eDate");
  const nDate = document.getElementById("nDate");
  if (jDate) jDate.value = isoDate;
  if (eDate) eDate.value = isoDate;
  if (nDate) nDate.value = isoDate;

  renderOverview();
}

/* ---------------- API & D1 SYNC ---------------- */
async function refreshAll() {
  setStatus("Syncing", "");
  try {
    const res = await fetch(API_URL, { method: "GET" });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.message || "Failed to load data");
    }

    state.journal = Array.isArray(data.journal) ? data.journal : [];
    state.expenses = Array.isArray(data.expenses) ? data.expenses : [];
    if (Array.isArray(data.notes)) state.notes = data.notes;
    if (Array.isArray(data.todos)) state.todos = data.todos;
    if (Array.isArray(data.commitments)) state.commitments = data.commitments;

    saveLocalCache();
    renderAll();
    setStatus("Synced", "ok");
  } catch (err) {
    renderAll();
    setStatus("Unsynced", "err");
  }
}

async function postAction(payload, optimisticFn) {
  setStatus("Syncing", "");
  if (typeof optimisticFn === "function") {
    optimisticFn();
    saveLocalCache();
    renderAll();
  }

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
    setStatus("Unsynced", "err");
    alert(err.message || "Sync failed");
    return false;
  }
}

/* ---------------- JOURNAL HANDLERS ---------------- */
async function addJournal(e) {
  e.preventDefault();
  const entry = {
    id: `j_${Date.now()}`,
    date: document.getElementById("jDate").value || state.selectedDate || todayISO(),
    time: (document.getElementById("jTime")?.value || "Evening").trim(),
    type: document.getElementById("jType")?.value || "Diary",
    mood: document.getElementById("jMood")?.value || "Calm",
    category: (document.getElementById("jCategory")?.value || "Daily").trim() || "Daily",
    title: document.getElementById("jTitle").value.trim(),
    content: document.getElementById("jContent").value.trim(),
    done: false
  };

  const ok = await postAction(
    {
      action: "add",
      target: "journal",
      date: entry.date,
      time: entry.time,
      type: entry.type,
      mood: entry.mood,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      done: false
    },
    () => {
      state.journal.unshift(entry);
    }
  );

  if (ok) {
    document.getElementById("jTitle").value = "";
    document.getElementById("jContent").value = "";
    setFormOpen("journalForm", false);
  }
}

async function toggleJournalDone(id, currentDone) {
  await postAction(
    { action: "toggle_done", target: "journal", id, done: !currentDone },
    () => {
      const item = state.journal.find((x) => String(x.id) === String(id));
      if (item) item.done = !currentDone;
    }
  );
}

async function deleteJournal(id) {
  if (!confirm("Delete this reflection?")) return;
  await postAction(
    { action: "delete", target: "journal", id },
    () => {
      state.journal = state.journal.filter((x) => String(x.id) !== String(id));
    }
  );
}

/* ---------------- EXPENSES HANDLERS ---------------- */
async function addExpense(e) {
  e.preventDefault();
  const exp = {
    id: `e_${Date.now()}`,
    date: document.getElementById("eDate").value || state.selectedDate || todayISO(),
    amount: parseFloat(document.getElementById("eAmount").value) || 0,
    category: (document.getElementById("eCategory").value || "Food").trim() || "Food",
    payment_method: document.getElementById("ePaymentMethod")?.value || "E-wallet",
    note: (document.getElementById("eNote")?.value || "").trim()
  };

  const ok = await postAction(
    {
      action: "add",
      target: "expense",
      date: exp.date,
      amount: exp.amount,
      category: exp.category,
      payment_method: exp.payment_method,
      note: exp.note
    },
    () => {
      state.expenses.unshift(exp);
    }
  );

  if (ok) {
    document.getElementById("eAmount").value = "";
    document.getElementById("eNote").value = "";
    setFormOpen("expenseForm", false);
  }
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense record?")) return;
  await postAction(
    { action: "delete", target: "expense", id },
    () => {
      state.expenses = state.expenses.filter((x) => String(x.id) !== String(id));
    }
  );
}

/* ---------------- NOTES HANDLERS ---------------- */
async function addNote(e) {
  e.preventDefault();
  const note = {
    id: `n_${Date.now()}`,
    date: document.getElementById("nDate").value || state.selectedDate || todayISO(),
    category: (document.getElementById("nCategory").value || "General").trim() || "General",
    title: document.getElementById("nTitle").value.trim(),
    content: document.getElementById("nContent").value.trim()
  };

  const ok = await postAction(
    { action: "add", target: "notes", ...note },
    () => {
      state.notes.unshift(note);
    }
  );

  if (ok) {
    document.getElementById("nTitle").value = "";
    document.getElementById("nContent").value = "";
    setFormOpen("noteForm", false);
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;
  await postAction(
    { action: "delete", target: "notes", id },
    () => {
      state.notes = state.notes.filter((x) => String(x.id) !== String(id));
    }
  );
}

/* ---------------- TODO HANDLERS ---------------- */
async function addTodo(e) {
  e.preventDefault();
  const todo = {
    id: `t_${Date.now()}`,
    title: document.getElementById("tTitle").value.trim(),
    status: document.getElementById("tStatus").value || "todo",
    priority: document.getElementById("tPriority").value || "Medium",
    due_date: document.getElementById("tDueDate").value || "",
    category: (document.getElementById("tCategory").value || "Personal").trim() || "Personal",
    notes: (document.getElementById("tNotes").value || "").trim()
  };

  const ok = await postAction(
    { action: "add", target: "todo", ...todo },
    () => {
      state.todos.unshift(todo);
    }
  );

  if (ok) {
    document.getElementById("tTitle").value = "";
    document.getElementById("tDueDate").value = "";
    document.getElementById("tNotes").value = "";
    setFormOpen("todoForm", false);
  }
}

async function cycleTodoStatus(id) {
  const order = ["todo", "in_progress", "completed"];
  const item = state.todos.find((x) => String(x.id) === String(id));
  if (!item) return;
  const nextStatus = order[(order.indexOf(item.status || "todo") + 1) % order.length];

  await postAction(
    { action: "update_status", target: "todo", id, status: nextStatus },
    () => {
      item.status = nextStatus;
    }
  );
}

async function deleteTodo(id) {
  if (!confirm("Delete this task?")) return;
  await postAction(
    { action: "delete", target: "todo", id },
    () => {
      state.todos = state.todos.filter((x) => String(x.id) !== String(id));
    }
  );
}

/* ---------------- COMMITMENTS HANDLERS ---------------- */
function isCommitmentPaidThisMonth(item) {
  return item.paid_month === currentMonthKey() || Boolean(item.paid);
}

async function addCommitment(e) {
  e.preventDefault();
  const dueDay = Math.min(31, Math.max(1, parseInt(document.getElementById("cDueDay").value, 10) || 1));
  const commit = {
    id: `c_${Date.now()}`,
    name: document.getElementById("cName").value.trim(),
    amount: parseFloat(document.getElementById("cAmount").value) || 0,
    category: document.getElementById("cCategory").value || "Utilities & Bills",
    due_day: dueDay,
    paid_month: ""
  };

  const ok = await postAction(
    { action: "add", target: "commitments", ...commit },
    () => {
      state.commitments.push(commit);
    }
  );

  if (ok) {
    document.getElementById("cName").value = "";
    document.getElementById("cAmount").value = "";
    document.getElementById("cDueDay").value = "";
    setFormOpen("commitmentForm", false);
  }
}

async function toggleCommitmentPaid(id) {
  const item = state.commitments.find((x) => String(x.id) === String(id));
  if (!item) return;
  const currentlyPaid = isCommitmentPaidThisMonth(item);
  const nextPaidMonth = currentlyPaid ? "" : currentMonthKey();

  await postAction(
    { action: "toggle_paid", target: "commitments", id, paid_month: nextPaidMonth, paid: !currentlyPaid },
    () => {
      item.paid_month = nextPaidMonth;
      item.paid = !currentlyPaid;
    }
  );
}

async function resetCommitmentsMonth() {
  if (!confirm("Reset all commitment payment statuses for this month to upcoming?")) return;
  await postAction(
    { action: "reset_month", target: "commitments", month: currentMonthKey() },
    () => {
      state.commitments.forEach((c) => {
        c.paid_month = "";
        c.paid = false;
      });
    }
  );
}

async function deleteCommitment(id) {
  if (!confirm("Delete this monthly commitment?")) return;
  await postAction(
    { action: "delete", target: "commitments", id },
    () => {
      state.commitments = state.commitments.filter((x) => String(x.id) !== String(id));
    }
  );
}

/* ---------------- RENDERERS ---------------- */
function getCommitmentDueDateForMonth(year, monthIndex, dueDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, Number(dueDay) || 1), lastDay);
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(safeDay).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function renderOverview() {
  const subtitle = document.getElementById("selectedDateSubtitle");
  if (subtitle) subtitle.textContent = formatFullSubtitleDate(state.selectedDate);

  const calLabel = document.getElementById("calMonthLabel");
  const calGrid = document.getElementById("calendarGrid");
  const year = state.calYear;
  const month = state.calMonth;

  if (calLabel) {
    calLabel.textContent = new Date(year, month, 1).toLocaleDateString("en-MY", {
      month: "long",
      year: "numeric"
    });
  }

  if (calGrid) {
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const today = todayISO();

    const journalDates = new Set([
      ...state.journal.map((x) => x.date),
      ...state.notes.map((x) => x.date)
    ]);
    const todoDates = new Set(state.todos.map((x) => x.due_date).filter(Boolean));
    const expenseDates = new Set(state.expenses.map((x) => x.date));
    const commitmentDueMap = new Map();
    state.commitments.forEach((c) => {
      const iso = getCommitmentDueDateForMonth(year, month, c.due_day);
      if (!commitmentDueMap.has(iso)) commitmentDueMap.set(iso, []);
      commitmentDueMap.get(iso).push(c);
    });

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      cells.push(`<div class="cal-day is-muted" aria-hidden="true"><span>${dayNum}</span><span class="cal-dots"></span></div>`);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const iso = `${year}-${mm}-${dd}`;
      const isToday = iso === today;
      const isSelected = iso === state.selectedDate;
      const dueCommits = commitmentDueMap.get(iso) || [];

      const dots = [];
      if (journalDates.has(iso)) dots.push('<i class="dot dot-journal" title="Journal/Note"></i>');
      if (todoDates.has(iso)) dots.push('<i class="dot dot-todo" title="To-do due"></i>');
      if (expenseDates.has(iso)) dots.push('<i class="dot dot-expense" title="Expense"></i>');
      if (dueCommits.length) {
        dots.push(`<i class="dot dot-commitment" title="Commitment due: ${escapeHtml(dueCommits.map((x) => x.name).join(", "))}"></i>`);
      }

      const classes = ["cal-day"];
      if (isToday) classes.push("is-today");
      if (isSelected) classes.push("is-selected");

      const dueTag = dueCommits.length ? `<span class="card-hint">${dueCommits.length} due</span>` : "";

      cells.push(`
        <button type="button" class="${classes.join(" ")}" data-date="${iso}">
          <span>${day}</span>
          <span class="cal-dots">${dots.join("") || dueTag}</span>
        </button>
      `);
    }

    const totalCells = startOffset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let t = 1; t <= trailing; t++) {
      cells.push(`<div class="cal-day is-muted" aria-hidden="true"><span>${t}</span><span class="cal-dots"></span></div>`);
    }

    calGrid.innerHTML = cells.join("");
  }

  // Day at a glance + Daily view + Daily spending + Upcoming tasks
  const sel = state.selectedDate;
  const humanSel = formatHumanDate(sel);

  const glanceLabel = document.getElementById("glanceDateLabel");
  const dailyViewDate = document.getElementById("dailyViewDate");
  if (glanceLabel) glanceLabel.textContent = humanSel;
  if (dailyViewDate) dailyViewDate.textContent = humanSel;

  const dayJournals = state.journal.filter((x) => x.date === sel);
  const dayNotes = state.notes.filter((x) => x.date === sel);
  const dayExpenses = state.expenses.filter((x) => x.date === sel);
  const dayTasksDue = state.todos.filter((x) => x.due_date === sel && x.status !== "completed");

  const daySpent = dayExpenses.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

  const elEntriesCount = document.getElementById("glanceEntryCount");
  const elTaskCount = document.getElementById("glanceTaskCount");
  const elSpentAmt = document.getElementById("glanceSpentAmount");
  const elDailyTotal = document.getElementById("overviewDailyTotal");

  if (elEntriesCount) elEntriesCount.textContent = String(dayJournals.length + dayNotes.length);
  if (elTaskCount) elTaskCount.textContent = String(dayTasksDue.length);
  if (elSpentAmt) elSpentAmt.textContent = formatRM(daySpent);
  if (elDailyTotal) elDailyTotal.textContent = formatRM(daySpent);

  const dailyEntriesContainer = document.getElementById("overviewDailyEntries");
  if (dailyEntriesContainer) {
    const combined = [
      ...dayJournals.map((j) => ({
        title: j.title,
        meta: `Journal · ${j.mood || "Calm"} · ${j.category || "Daily"}`,
        content: j.content
      })),
      ...dayNotes.map((n) => ({
        title: n.title,
        meta: `Note · ${n.category || "General"}`,
        content: n.content
      }))
    ];

    dailyEntriesContainer.innerHTML = combined.length
      ? combined
          .map(
            (item) => `
          <div class="item">
            <div>
              <div class="item-title">${escapeHtml(item.title)}</div>
              <div class="item-meta">${escapeHtml(item.meta)}</div>
              ${item.content ? `<div class="item-content">${escapeHtml(item.content)}</div>` : ""}
            </div>
          </div>`
          )
          .join("")
      : `<div class="empty">No entries on ${escapeHtml(humanSel)}.</div>`;
  }

  const dailyExpContainer = document.getElementById("overviewDailyExpenses");
  if (dailyExpContainer) {
    dailyExpContainer.innerHTML = dayExpenses.length
      ? dayExpenses
          .map(
            (exp) => `
          <div class="item">
            <div>
              <div class="item-title">${escapeHtml(exp.category)}${exp.note ? ` — ${escapeHtml(exp.note)}` : ""}</div>
              <div class="item-meta">${escapeHtml(exp.payment_method || "E-wallet")}</div>
            </div>
            <div class="row-right">
              <span class="amount">${formatRM(exp.amount)}</span>
            </div>
          </div>`
          )
          .join("")
      : `<div class="empty">No expenses on ${escapeHtml(humanSel)}.</div>`;
  }

  const upcomingContainer = document.getElementById("overviewUpcomingTasks");
  if (upcomingContainer) {
    const openTasks = state.todos
      .filter((t) => t.status !== "completed")
      .sort((a, b) => (a.due_date || "9999-99-99").localeCompare(b.due_date || "9999-99-99"))
      .slice(0, 5);

    upcomingContainer.innerHTML = openTasks.length
      ? openTasks
          .map(
            (t) => `
          <div class="item">
            <div>
              <div class="item-title">${escapeHtml(t.title)}</div>
              <div class="item-meta">${escapeHtml(t.category || "Personal")} · ${escapeHtml(t.priority || "Medium")}${t.due_date ? ` · Due ${escapeHtml(formatHumanDate(t.due_date))}` : ""}</div>
            </div>
          </div>`
          )
          .join("")
      : `<div class="empty">No upcoming tasks.</div>`;
  }
}

function renderNotes() {
  const container = document.getElementById("notesList");
  if (!container) return;

  const q = (state.filters.noteSearch || "").trim().toLowerCase();
  const filtered = state.notes.filter((n) => {
    if (!q) return true;
    return `${n.title || ""} ${n.content || ""} ${n.category || ""}`.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">No notes found.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (n) => `
      <div class="item">
        <div>
          <div class="item-title">${escapeHtml(n.title)}</div>
          <div class="item-meta">${escapeHtml(n.date || "")} · ${escapeHtml(n.category || "General")}</div>
          ${n.content ? `<div class="item-content">${escapeHtml(n.content)}</div>` : ""}
        </div>
        <div class="row-right">
          <button class="btn danger sm note-delete" type="button" data-id="${escapeHtml(n.id)}">Delete</button>
        </div>
      </div>`
    )
    .join("");
}

function renderTodo() {
  const catSelect = document.getElementById("todoCategoryFilter");
  if (catSelect) {
    const prevVal = state.filters.todoCategory || "all";
    const cats = Array.from(new Set(state.todos.map((t) => t.category).filter(Boolean)));
    catSelect.innerHTML =
      `<option value="all">All categories</option>` +
      cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    catSelect.value = cats.includes(prevVal) ? prevVal : "all";
    state.filters.todoCategory = catSelect.value;
  }

  const totalEl = document.getElementById("kpiTotalTasks");
  const progEl = document.getElementById("kpiInProgressTasks");
  const doneEl = document.getElementById("kpiCompletedTasks");

  if (totalEl) totalEl.textContent = String(state.todos.length);
  if (progEl) progEl.textContent = String(state.todos.filter((t) => t.status === "in_progress").length);
  if (doneEl) doneEl.textContent = String(state.todos.filter((t) => t.status === "completed").length);

  const container = document.getElementById("todoList");
  if (!container) return;

  const filtered = state.todos.filter((t) => {
    if (state.filters.todoStatus !== "all" && (t.status || "todo") !== state.filters.todoStatus) {
      return false;
    }
    if (state.filters.todoCategory !== "all" && (t.category || "Personal") !== state.filters.todoCategory) {
      return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">No tasks match the current filter.</div>`;
    return;
  }

  const statusLabelMap = {
    todo: "To do",
    in_progress: "In progress",
    completed: "Completed"
  };

  container.innerHTML = filtered
    .map((t) => {
      const isDone = t.status === "completed";
      const label = statusLabelMap[t.status] || "To do";
      return `
        <div class="item">
          <div>
            <div class="item-title ${isDone ? "done" : ""}">${escapeHtml(t.title)}</div>
            <div class="item-meta">${escapeHtml(label)} · ${escapeHtml(t.priority || "Medium")} · ${escapeHtml(t.category || "Personal")}${t.due_date ? ` · Due ${escapeHtml(formatHumanDate(t.due_date))}` : ""}</div>
            ${t.notes ? `<div class="item-content ${isDone ? "done" : ""}">${escapeHtml(t.notes)}</div>` : ""}
          </div>
          <div class="row-right">
            <button class="btn secondary sm todo-cycle" type="button" data-id="${escapeHtml(t.id)}">${escapeHtml(label)}</button>
            <button class="btn danger sm todo-delete" type="button" data-id="${escapeHtml(t.id)}">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

function renderJournal() {
  const container = document.getElementById("journalList");
  if (!container) return;

  const q = (state.filters.journalSearch || "").trim().toLowerCase();
  const filtered = state.journal.filter((j) => {
    if (!q) return true;
    return `${j.title || ""} ${j.content || ""} ${j.category || ""} ${j.mood || ""}`.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">No reflections yet.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (item) => `
      <div class="item">
        <div>
          <div class="item-title ${item.done ? "done" : ""}">${escapeHtml(item.title)}</div>
          <div class="item-meta">${escapeHtml(item.date || "")} · ${escapeHtml(item.mood || "Calm")} · ${escapeHtml(item.category || "Daily")}</div>
          ${item.content ? `<div class="item-content ${item.done ? "done" : ""}">${escapeHtml(item.content)}</div>` : ""}
        </div>
        <div class="row-right">
          <input type="checkbox" class="journal-toggle" data-id="${escapeHtml(item.id)}" data-done="${Boolean(item.done)}" ${item.done ? "checked" : ""} title="Mark done" />
          <button class="btn danger sm journal-delete" type="button" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>`
    )
    .join("");
}

function renderExpenses() {
  const catSelect = document.getElementById("expenseCategoryFilter");
  if (catSelect) {
    const prevVal = state.filters.expenseCategory || "all";
    const cats = Array.from(new Set(state.expenses.map((e) => e.category).filter(Boolean)));
    catSelect.innerHTML =
      `<option value="all">All categories</option>` +
      cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    catSelect.value = cats.includes(prevVal) ? prevVal : "all";
    state.filters.expenseCategory = catSelect.value;
  }

  const monthKey = currentMonthKey();
  const allTimeTotal = state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthTotal = state.expenses
    .filter((e) => (e.date || "").startsWith(monthKey))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const filtered = state.expenses.filter((e) => {
    if (state.filters.expenseCategory !== "all" && e.category !== state.filters.expenseCategory) {
      return false;
    }
    if (state.filters.expenseFrom && (e.date || "") < state.filters.expenseFrom) {
      return false;
    }
    if (state.filters.expenseTo && (e.date || "") > state.filters.expenseTo) {
      return false;
    }
    return true;
  });

  const filteredTotal = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const elAll = document.getElementById("kpiAllTimeSpend");
  const elMonth = document.getElementById("kpiMonthSpend");
  const elFiltered = document.getElementById("kpiFilteredSpend");
  if (elAll) elAll.textContent = formatRM(allTimeTotal);
  if (elMonth) elMonth.textContent = formatRM(monthTotal);
  if (elFiltered) elFiltered.textContent = formatRM(filteredTotal);

  const container = document.getElementById("expenseList");
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">No expense records match the filter.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (item) => `
      <div class="item">
        <div>
          <div class="item-title">${escapeHtml(item.category)}${item.note ? ` — ${escapeHtml(item.note)}` : ""}</div>
          <div class="item-meta">${escapeHtml(item.date || "")} · ${escapeHtml(item.payment_method || "E-wallet")}</div>
        </div>
        <div class="row-right">
          <span class="amount">${formatRM(item.amount)}</span>
          <button class="btn danger sm expense-delete" type="button" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>`
    )
    .join("");
}

function renderCommitments() {
  const cycleLabel = document.getElementById("commitmentCycleLabel");
  if (cycleLabel) {
    cycleLabel.textContent = `Cycle: ${new Date().toLocaleDateString("en-MY", { month: "long", year: "numeric" })}`;
  }

  const totalAmt = state.commitments.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const paidItems = state.commitments.filter((c) => isCommitmentPaidThisMonth(c));
  const unpaidItems = state.commitments.filter((c) => !isCommitmentPaidThisMonth(c));
  const paidAmt = paidItems.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const remainAmt = unpaidItems.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const elTotal = document.getElementById("kpiCommitTotal");
  const elPaid = document.getElementById("kpiCommitPaid");
  const elRemain = document.getElementById("kpiCommitRemaining");
  const elUpcoming = document.getElementById("kpiCommitUpcoming");

  if (elTotal) elTotal.textContent = formatRM(totalAmt);
  if (elPaid) elPaid.textContent = formatRM(paidAmt);
  if (elRemain) elRemain.textContent = formatRM(remainAmt);
  if (elUpcoming) elUpcoming.textContent = String(unpaidItems.length);

  const listEl = document.getElementById("commitmentList");
  if (listEl) {
    if (!state.commitments.length) {
      listEl.innerHTML = `<div class="empty">No monthly commitments added yet.</div>`;
    } else {
      listEl.innerHTML = state.commitments
        .map((c) => {
          const paid = isCommitmentPaidThisMonth(c);
          return `
            <div class="item">
              <div>
                <div class="item-title ${paid ? "done" : ""}">${escapeHtml(c.name)}</div>
                <div class="item-meta">${escapeHtml(c.category || "Utilities & Bills")} · Due day ${escapeHtml(String(c.due_day || 1))} · ${paid ? "Paid" : "Upcoming"}</div>
              </div>
              <div class="row-right">
                <span class="amount">${formatRM(c.amount)}</span>
                <button class="btn secondary sm commit-toggle" type="button" data-id="${escapeHtml(c.id)}">${paid ? "Unmark" : "Mark paid"}</button>
                <button class="btn danger sm commit-delete" type="button" data-id="${escapeHtml(c.id)}">Delete</button>
              </div>
            </div>`;
        })
        .join("");
    }
  }

  const summaryEl = document.getElementById("commitmentCategorySummary");
  if (summaryEl) {
    const byCat = new Map();
    state.commitments.forEach((c) => {
      const cat = c.category || "Utilities & Bills";
      byCat.set(cat, (byCat.get(cat) || 0) + (Number(c.amount) || 0));
    });

    const entries = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    summaryEl.innerHTML = entries.length
      ? entries
          .map(
            ([cat, amt]) => `
          <div class="item">
            <div class="item-title">${escapeHtml(cat)}</div>
            <span class="amount">${formatRM(amt)}</span>
          </div>`
          )
          .join("")
      : `<div class="empty">No category breakdown yet.</div>`;
  }
}

function renderAll() {
  renderOverview();
  renderNotes();
  renderTodo();
  renderJournal();
  renderExpenses();
  renderCommitments();
}

/* ---------------- INIT & EVENT BINDING ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  detectDeviceMode();
  window.addEventListener("resize", detectDeviceMode);

  loadLocalCache();

  const today = todayISO();
  state.selectedDate = today;
  if (document.getElementById("jDate")) document.getElementById("jDate").value = today;
  if (document.getElementById("eDate")) document.getElementById("eDate").value = today;
  if (document.getElementById("nDate")) document.getElementById("nDate").value = today;

  // Top & Tab controls
  document.getElementById("refreshBtn")?.addEventListener("click", refreshAll);
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Calendar controls
  document.getElementById("calendarGrid")?.addEventListener("click", (e) => {
    const dayBtn = e.target.closest(".cal-day[data-date]");
    if (dayBtn) selectCalendarDate(dayBtn.dataset.date);
  });

  document.getElementById("calPrevBtn")?.addEventListener("click", () => {
    state.calMonth -= 1;
    if (state.calMonth < 0) {
      state.calMonth = 11;
      state.calYear -= 1;
    }
    renderOverview();
  });

  document.getElementById("calNextBtn")?.addEventListener("click", () => {
    state.calMonth += 1;
    if (state.calMonth > 11) {
      state.calMonth = 0;
      state.calYear += 1;
    }
    renderOverview();
  });

  document.getElementById("calTodayBtn")?.addEventListener("click", () => {
    const now = new Date();
    state.calYear = now.getFullYear();
    state.calMonth = now.getMonth();
    selectCalendarDate(todayISO());
  });

  // Overview quick actions
  document.getElementById("quickAddEntryBtn")?.addEventListener("click", () => {
    switchTab("journal");
    setFormOpen("journalForm", true);
  });

  document.getElementById("quickAddExpenseBtn")?.addEventListener("click", () => {
    switchTab("expenses");
    setFormOpen("expenseForm", true);
  });

  document.getElementById("viewAllTasksBtn")?.addEventListener("click", () => {
    switchTab("todo");
  });

  // Notes events
  document.getElementById("toggleNoteFormBtn")?.addEventListener("click", () => setFormOpen("noteForm", true));
  document.getElementById("cancelNoteFormBtn")?.addEventListener("click", () => setFormOpen("noteForm", false));
  document.getElementById("noteForm")?.addEventListener("submit", addNote);
  document.getElementById("noteSearch")?.addEventListener("input", (e) => {
    state.filters.noteSearch = e.target.value;
    renderNotes();
  });
  document.getElementById("notesList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".note-delete");
    if (btn) deleteNote(btn.dataset.id);
  });

  // Todo events
  document.getElementById("toggleTodoFormBtn")?.addEventListener("click", () => setFormOpen("todoForm", true));
  document.getElementById("cancelTodoFormBtn")?.addEventListener("click", () => setFormOpen("todoForm", false));
  document.getElementById("todoForm")?.addEventListener("submit", addTodo);
  document.getElementById("todoStatusFilter")?.addEventListener("change", (e) => {
    state.filters.todoStatus = e.target.value;
    renderTodo();
  });
  document.getElementById("todoCategoryFilter")?.addEventListener("change", (e) => {
    state.filters.todoCategory = e.target.value;
    renderTodo();
  });
  document.getElementById("todoList")?.addEventListener("click", (e) => {
    const cycleBtn = e.target.closest(".todo-cycle");
    if (cycleBtn) return cycleTodoStatus(cycleBtn.dataset.id);
    const delBtn = e.target.closest(".todo-delete");
    if (delBtn) deleteTodo(delBtn.dataset.id);
  });

  // Journal events
  document.getElementById("toggleJournalFormBtn")?.addEventListener("click", () => setFormOpen("journalForm", true));
  document.getElementById("cancelJournalFormBtn")?.addEventListener("click", () => setFormOpen("journalForm", false));
  document.getElementById("journalForm")?.addEventListener("submit", addJournal);
  document.getElementById("journalSearch")?.addEventListener("input", (e) => {
    state.filters.journalSearch = e.target.value;
    renderJournal();
  });
  document.getElementById("journalList")?.addEventListener("change", (e) => {
    if (e.target.classList.contains("journal-toggle")) {
      toggleJournalDone(e.target.dataset.id, e.target.dataset.done === "true");
    }
  });
  document.getElementById("journalList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".journal-delete");
    if (btn) deleteJournal(btn.dataset.id);
  });

  // Expenses events
  document.getElementById("toggleExpenseFormBtn")?.addEventListener("click", () => setFormOpen("expenseForm", true));
  document.getElementById("cancelExpenseFormBtn")?.addEventListener("click", () => setFormOpen("expenseForm", false));
  document.getElementById("expenseForm")?.addEventListener("submit", addExpense);
  document.getElementById("expenseCategoryFilter")?.addEventListener("change", (e) => {
    state.filters.expenseCategory = e.target.value;
    renderExpenses();
  });
  document.getElementById("expenseFromDate")?.addEventListener("change", (e) => {
    state.filters.expenseFrom = e.target.value;
    renderExpenses();
  });
  document.getElementById("expenseToDate")?.addEventListener("change", (e) => {
    state.filters.expenseTo = e.target.value;
    renderExpenses();
  });
  document.getElementById("clearExpenseFiltersBtn")?.addEventListener("click", () => {
    state.filters.expenseCategory = "all";
    state.filters.expenseFrom = "";
    state.filters.expenseTo = "";
    if (document.getElementById("expenseCategoryFilter")) document.getElementById("expenseCategoryFilter").value = "all";
    if (document.getElementById("expenseFromDate")) document.getElementById("expenseFromDate").value = "";
    if (document.getElementById("expenseToDate")) document.getElementById("expenseToDate").value = "";
    renderExpenses();
  });
  document.getElementById("expenseList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".expense-delete");
    if (btn) deleteExpense(btn.dataset.id);
  });

  // Commitments events
  document.getElementById("toggleCommitmentFormBtn")?.addEventListener("click", () => setFormOpen("commitmentForm", true));
  document.getElementById("cancelCommitmentFormBtn")?.addEventListener("click", () => setFormOpen("commitmentForm", false));
  document.getElementById("commitmentForm")?.addEventListener("submit", addCommitment);
  document.getElementById("resetCommitmentsMonthBtn")?.addEventListener("click", resetCommitmentsMonth);
  document.getElementById("commitmentList")?.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".commit-toggle");
    if (toggleBtn) return toggleCommitmentPaid(toggleBtn.dataset.id);
    const delBtn = e.target.closest(".commit-delete");
    if (delBtn) deleteCommitment(delBtn.dataset.id);
  });

  renderAll();
  refreshAll();
});
