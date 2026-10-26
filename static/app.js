/**
 * app.js — Liquid Glass & visionOS (Жидкое стекло Apple)
 * Полная поддержка закрепления Групп и Преподавателей,
 * 100% идеальная адаптация под Светлую и Тёмную темы.
 */

const state = {
  currentMode: localStorage.getItem("my_schedule_mode") || "group", // "group" | "teacher"
  allGroups: [],
  allTeachers: [],
  pinnedGroups: JSON.parse(localStorage.getItem("my_pinned_groups") || "[]"),
  pinnedTeachers: JSON.parse(localStorage.getItem("my_pinned_teachers") || "[]"),
  selectedGroupId: localStorage.getItem("my_schedule_group") || null,
  selectedTeacherId: localStorage.getItem("my_schedule_teacher") || null,
  currentSchedule: null,
  selectedDayIndex: 0,
  notificationsEnabled: localStorage.getItem("my_schedule_notif_enabled") === "true",
  notifLeadMinutes: parseInt(localStorage.getItem("my_schedule_notif_lead") || "5", 10),
};

// Очистка устаревших версий расписания звонков из localStorage
try {
  localStorage.removeItem("my_schedule_bells");
  localStorage.removeItem("my_schedule_bells_v2");
} catch (_) {}

// Официальное расписание звонков колледжа на 2026–2027 учебный год
const OFFICIAL_BELLS = {
  // ПОНЕДЕЛЬНИК: Линейка (40 мин), 1 пара в 09:00, большая перемена 12:20 – 12:50
  monday: [
    { num: 1, startStr: "08:15", endStr: "08:55", label: "Линейка" },
    { num: 2, startStr: "09:00", endStr: "10:35", label: "1 пара" },
    { num: 3, startStr: "10:45", endStr: "12:20", label: "2 пара" },
    { num: 4, startStr: "12:50", endStr: "14:25", label: "3 пара" },
    { num: 5, startStr: "14:35", endStr: "16:10", label: "4 пара" },
    { num: 6, startStr: "16:20", endStr: "17:55", label: "5 пара" },
  ],
  // ВТОРНИК – ПЯТНИЦА: стандартный график, большая перемена 11:35 – 12:05
  weekday: [
    { num: 1, startStr: "08:15", endStr: "09:50", label: "1 пара" },
    { num: 2, startStr: "10:00", endStr: "11:35", label: "2 пара" },
    { num: 3, startStr: "12:05", endStr: "13:40", label: "3 пара" },
    { num: 4, startStr: "13:50", endStr: "15:25", label: "4 пара" },
    { num: 5, startStr: "15:35", endStr: "17:05", label: "5 пара" },
    { num: 6, startStr: "17:15", endStr: "18:45", label: "6 пара" },
    { num: 7, startStr: "18:55", endStr: "20:25", label: "7 пара" },
  ],
  // СУББОТА: укороченные пары по 60 минут
  saturday: [
    { num: 1, startStr: "08:15", endStr: "09:15", label: "1 пара" },
    { num: 2, startStr: "09:25", endStr: "10:25", label: "2 пара" },
    { num: 3, startStr: "10:35", endStr: "11:35", label: "3 пара" },
    { num: 4, startStr: "11:45", endStr: "12:45", label: "4 пара" },
    { num: 5, startStr: "12:55", endStr: "13:55", label: "5 пара" },
  ],
};

function timeToMinutes(str) {
  if (!str) return 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function processBellList(list) {
  return list.map((b) => ({
    num: b.num,
    startStr: b.startStr,
    endStr: b.endStr,
    label: b.label || `${b.num} пара`,
    start: timeToMinutes(b.startStr),
    end: timeToMinutes(b.endStr),
    timeStr: `${b.startStr}–${b.endStr}`,
  }));
}

function loadAllBellSchedules() {
  const saved = localStorage.getItem("my_schedule_bells_v3");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        monday: processBellList(parsed.monday || OFFICIAL_BELLS.monday),
        weekday: processBellList(parsed.weekday || OFFICIAL_BELLS.weekday),
        saturday: processBellList(parsed.saturday || OFFICIAL_BELLS.saturday),
      };
    } catch (e) {
      console.warn("Ошибка чтения звонков из localStorage, сброс к заводским:", e);
    }
  }
  return {
    monday: processBellList(OFFICIAL_BELLS.monday),
    weekday: processBellList(OFFICIAL_BELLS.weekday),
    saturday: processBellList(OFFICIAL_BELLS.saturday),
  };
}

let ALL_BELLS = loadAllBellSchedules();

function getDayType(dayInfo) {
  if (!dayInfo) {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 1) return "monday";
    if (dayOfWeek === 6) return "saturday";
    if (dayOfWeek === 0) return "sunday";
    return "weekday";
  }
  const str = dayInfo.toLowerCase();
  if (str.includes("пн") || str.includes("понедельник")) return "monday";
  if (str.includes("сб") || str.includes("суббота")) return "saturday";
  if (str.includes("вс") || str.includes("воскресенье")) return "sunday";
  return "weekday";
}

function getBellsForDay(dayInfo) {
  const type = getDayType(dayInfo);
  if (type === "monday") return ALL_BELLS.monday;
  if (type === "saturday") return ALL_BELLS.saturday;
  return ALL_BELLS.weekday;
}

// Очистка текста от переносов строк и лишних пробелов с сайта колледжа
function cleanString(str) {
  if (!str) return "";
  return str.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

// PWA Service Worker (v7)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js?v=7").then((reg) => {
    reg.update();
  }).catch(console.error);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModeUI();
  initNotificationsUI();
  loadData();
  startLiveTimer();

  // Закрывать дропдаун при клике вне его
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("selector-dropdown-menu");
    const btn = document.getElementById("selector-dropdown-btn");
    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add("hidden");
      document.getElementById("selector-arrow")?.classList.remove("rotate-180");
    }
  });

  if (window.lucide) lucide.createIcons();
});

// ─────────────────────────────────────────────
// 1. Управление режимами (Группы / Преподаватели)
// ─────────────────────────────────────────────
function initModeUI() {
  const isTeacher = state.currentMode === "teacher";
  const groupBtn = document.getElementById("mode-group-btn");
  const teacherBtn = document.getElementById("mode-teacher-btn");

  if (isTeacher) {
    groupBtn.className = "px-4 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all";
    teacherBtn.className = "px-4 py-1.5 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-indigo-500/30 transition-all";
  } else {
    groupBtn.className = "px-4 py-1.5 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-indigo-500/30 transition-all";
    teacherBtn.className = "px-4 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all";
  }

  renderPinnedChips();
}

function switchMode(newMode) {
  if (state.currentMode === newMode) return;
  state.currentMode = newMode;
  localStorage.setItem("my_schedule_mode", newMode);
  initModeUI();

  document.getElementById("selector-dropdown-menu")?.classList.add("hidden");
  document.getElementById("selector-arrow")?.classList.remove("rotate-180");

  if (newMode === "group") {
    if (state.selectedGroupId) {
      selectGroup(state.selectedGroupId);
    } else if (state.pinnedGroups.length > 0) {
      selectGroup(state.pinnedGroups[0]);
    } else if (state.allGroups.length > 0) {
      selectGroup(state.allGroups[0].id);
    }
  } else {
    if (state.selectedTeacherId) {
      selectTeacher(state.selectedTeacherId);
    } else if (state.pinnedTeachers.length > 0) {
      selectTeacher(state.pinnedTeachers[0]);
    } else if (state.allTeachers.length > 0) {
      selectTeacher(state.allTeachers[0].id);
    }
  }
}

// ─────────────────────────────────────────────
// 2. Загрузка данных
// ─────────────────────────────────────────────
async function loadData() {
  try {
    const [groupsRes, teachersRes] = await Promise.all([
      fetch("/api/groups"),
      fetch("/api/teachers"),
    ]);

    if (groupsRes.ok) state.allGroups = await groupsRes.json();
    if (teachersRes.ok) state.allTeachers = await teachersRes.json();

    renderPinnedChips();

    if (state.currentMode === "teacher") {
      if (state.selectedTeacherId) {
        selectTeacher(state.selectedTeacherId);
      } else if (state.pinnedTeachers.length > 0) {
        selectTeacher(state.pinnedTeachers[0]);
      } else if (state.allTeachers.length > 0) {
        selectTeacher(state.allTeachers[0].id);
      }
    } else {
      if (state.selectedGroupId) {
        selectGroup(state.selectedGroupId);
      } else if (state.pinnedGroups.length > 0) {
        selectGroup(state.pinnedGroups[0]);
      } else if (state.allGroups.length > 0) {
        selectGroup(state.allGroups[0].id);
      }
    }
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
  }
}

// ─────────────────────────────────────────────
// 3. Выпадающее меню выбора (Группы / Преподаватели)
// ─────────────────────────────────────────────
function toggleSelectorDropdown() {
  const menu = document.getElementById("selector-dropdown-menu");
  const arrow = document.getElementById("selector-arrow");
  const isHidden = menu.classList.contains("hidden");

  if (isHidden) {
    menu.classList.remove("hidden");
    arrow?.classList.add("rotate-180");
    const input = document.getElementById("selector-dropdown-search");
    if (input) {
      input.value = "";
      input.placeholder = state.currentMode === "teacher" ? "Поиск преподавателя..." : "Поиск группы (напр. 911)...";
      renderDropdownItems();
      input.focus();
    }
  } else {
    menu.classList.add("hidden");
    arrow?.classList.remove("rotate-180");
  }
}

function filterDropdownItems() {
  renderDropdownItems();
}

function renderDropdownItems() {
  const container = document.getElementById("dropdown-items-list");
  const searchInput = document.getElementById("selector-dropdown-search");
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
  container.innerHTML = "";

  if (state.currentMode === "group") {
    const filtered = state.allGroups.filter((g) => g.name.toLowerCase().includes(q));
    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">Группы не найдены</div>`;
      return;
    }

    // Закрепленные группы выводим первыми
    const sorted = [...filtered].sort((a, b) => {
      const aPinned = state.pinnedGroups.includes(a.id) ? 1 : 0;
      const bPinned = state.pinnedGroups.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

    sorted.forEach((g) => {
      const item = document.createElement("div");
      const isSelected = g.id === state.selectedGroupId;
      const isPinned = state.pinnedGroups.includes(g.id);

      item.className = `w-full px-3 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
        isSelected
          ? "bg-violet-100 dark:bg-gradient-to-r dark:from-violet-600/30 dark:to-indigo-600/30 text-violet-800 dark:text-white font-bold border border-violet-300 dark:border-violet-500/40"
          : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
      }`;

      item.innerHTML = `
        <div class="flex-1 truncate pr-2" onclick="handleGroupClick('${g.id}')">
          <span class="font-display text-sm tracking-tight">Группа ${g.name}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="handleGroupPinToggle('${g.id}', event)" title="${isPinned ? 'Открепить группу' : 'Закрепить группу'}"
            class="star-btn ${isPinned ? 'pinned' : ''}">
            <i data-lucide="star" class="w-4 h-4 ${isPinned ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
          </button>
          ${isSelected ? `<i data-lucide="check" class="w-4 h-4 text-sky-600 dark:text-cyan-400"></i>` : ""}
        </div>
      `;
      container.appendChild(item);
    });
  } else {
    const filtered = state.allTeachers.filter((t) => t.name.toLowerCase().includes(q));
    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">Преподаватели не найдены</div>`;
      return;
    }

    // Закрепленные преподаватели выводим первыми
    const sorted = [...filtered].sort((a, b) => {
      const aPinned = state.pinnedTeachers.includes(a.id) ? 1 : 0;
      const bPinned = state.pinnedTeachers.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

    sorted.forEach((t) => {
      const item = document.createElement("div");
      const isSelected = t.id === state.selectedTeacherId;
      const isPinned = state.pinnedTeachers.includes(t.id);

      item.className = `w-full px-3 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
        isSelected
          ? "bg-violet-100 dark:bg-gradient-to-r dark:from-violet-600/30 dark:to-indigo-600/30 text-violet-800 dark:text-white font-bold border border-violet-300 dark:border-violet-500/40"
          : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
      }`;

      item.innerHTML = `
        <div class="flex-1 truncate pr-2" onclick="handleTeacherClick('${t.id}')">
          <span class="font-display text-sm tracking-tight">${t.name}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="handleTeacherPinToggle('${t.id}', event)" title="${isPinned ? 'Открепить преподавателя' : 'Закрепить преподавателя'}"
            class="star-btn ${isPinned ? 'pinned' : ''}">
            <i data-lucide="star" class="w-4 h-4 ${isPinned ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
          </button>
          ${isSelected ? `<i data-lucide="check" class="w-4 h-4 text-sky-600 dark:text-cyan-400"></i>` : ""}
        </div>
      `;
      container.appendChild(item);
    });
  }

  if (window.lucide) lucide.createIcons();
}

function handleGroupClick(groupId) {
  selectGroup(groupId);
  toggleSelectorDropdown();
}

function handleTeacherClick(teacherId) {
  selectTeacher(teacherId);
  toggleSelectorDropdown();
}

function handleGroupPinToggle(groupId, event) {
  event.stopPropagation();
  togglePinGroup(groupId);
  renderDropdownItems();
}

function handleTeacherPinToggle(teacherId, event) {
  event.stopPropagation();
  togglePinTeacher(teacherId);
  renderDropdownItems();
}

// ─────────────────────────────────────────────
// 4. Закрепление Групп и Преподавателей
// ─────────────────────────────────────────────
function togglePinGroup(groupId) {
  const index = state.pinnedGroups.indexOf(groupId);
  if (index > -1) {
    state.pinnedGroups.splice(index, 1);
  } else {
    state.pinnedGroups.push(groupId);
  }
  localStorage.setItem("my_pinned_groups", JSON.stringify(state.pinnedGroups));
  renderPinnedChips();
}

function togglePinTeacher(teacherId) {
  const index = state.pinnedTeachers.indexOf(teacherId);
  if (index > -1) {
    state.pinnedTeachers.splice(index, 1);
  } else {
    state.pinnedTeachers.push(teacherId);
  }
  localStorage.setItem("my_pinned_teachers", JSON.stringify(state.pinnedTeachers));
  renderPinnedChips();
}

function renderPinnedChips() {
  const container = document.getElementById("pinned-chips-container");
  const list = document.getElementById("pinned-chips-list");
  if (!container || !list) return;

  const isTeacher = state.currentMode === "teacher";
  const items = isTeacher ? state.pinnedTeachers : state.pinnedGroups;

  if (items.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  list.innerHTML = "";

  if (isTeacher) {
    state.pinnedTeachers.forEach((id) => {
      const teacher = state.allTeachers.find((t) => t.id === id);
      if (!teacher) return;

      const isActive = id === state.selectedTeacherId;
      const btn = document.createElement("button");
      btn.className = `chip-btn ${isActive ? "active" : ""}`;
      btn.innerHTML = `
        <i data-lucide="star" class="w-3.5 h-3.5 ${isActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}"></i>
        <span class="font-display tracking-tight">${teacher.name}</span>
      `;
      btn.onclick = () => selectTeacher(id);
      list.appendChild(btn);
    });
  } else {
    state.pinnedGroups.forEach((id) => {
      const group = state.allGroups.find((g) => g.id === id);
      if (!group) return;

      const isActive = id === state.selectedGroupId;
      const btn = document.createElement("button");
      btn.className = `chip-btn ${isActive ? "active" : ""}`;
      btn.innerHTML = `
        <i data-lucide="star" class="w-3.5 h-3.5 ${isActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}"></i>
        <span class="font-display tracking-tight">Группа ${group.name}</span>
      `;
      btn.onclick = () => selectGroup(id);
      list.appendChild(btn);
    });
  }

  if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// 5. Выбор Группы / Преподавателя
// ─────────────────────────────────────────────
async function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  localStorage.setItem("my_schedule_group", groupId);
  renderPinnedChips();

  const group = state.allGroups.find((g) => g.id === groupId);
  const nameEl = document.getElementById("selected-item-name");
  const subEl = document.getElementById("selected-item-sub");
  const avatarEl = document.getElementById("selector-avatar");

  if (group) {
    if (nameEl) nameEl.textContent = `Группа ${group.name}`;
    if (subEl) subEl.textContent = "Студенческая группа";
    if (avatarEl) avatarEl.textContent = group.name.slice(0, 3);
  }

  showLoader(true);
  try {
    const res = await fetch(`/api/schedule/${groupId}`);
    if (!res.ok) throw new Error("Не удалось загрузить расписание группы");

    state.currentSchedule = await res.json();
    detectInitialDay();
    renderDaysRibbon();
    renderDaySchedule();
  } catch (err) {
    console.error(err);
    document.getElementById("day-schedule-content").innerHTML =
      `<div class="p-6 text-center text-xs text-red-500 font-medium">Ошибка при получении расписания</div>`;
  } finally {
    showLoader(false);
  }
}

async function selectTeacher(teacherId) {
  state.selectedTeacherId = teacherId;
  localStorage.setItem("my_schedule_teacher", teacherId);
  renderPinnedChips();

  const teacher = state.allTeachers.find((t) => t.id === teacherId);
  const nameEl = document.getElementById("selected-item-name");
  const subEl = document.getElementById("selected-item-sub");
  const avatarEl = document.getElementById("selector-avatar");

  if (teacher) {
    if (nameEl) nameEl.textContent = teacher.name;
    if (subEl) subEl.textContent = "Преподаватель колледжа";
    if (avatarEl) avatarEl.textContent = "👤";
  }

  showLoader(true);
  try {
    const res = await fetch(`/api/schedule/teacher/${teacherId}`);
    if (!res.ok) throw new Error("Не удалось загрузить расписание преподавателя");

    state.currentSchedule = await res.json();
    detectInitialDay();
    renderDaysRibbon();
    renderDaySchedule();
  } catch (err) {
    console.error(err);
    document.getElementById("day-schedule-content").innerHTML =
      `<div class="p-6 text-center text-xs text-red-500 font-medium">Ошибка при получении расписания</div>`;
  } finally {
    showLoader(false);
  }
}

function detectInitialDay() {
  if (!state.currentSchedule || !state.currentSchedule.days) return;

  const now = new Date();
  const dayStr = String(now.getDate()).padStart(2, "0");
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${dayStr}.${monthStr}`;

  const index = state.currentSchedule.days.findIndex((d) => d.day_info.includes(prefix));
  state.selectedDayIndex = index !== -1 ? index : 0;
}

// ─────────────────────────────────────────────
// 6. Календарная лента дней недели (visionOS)
// ─────────────────────────────────────────────
function renderDaysRibbon() {
  const ribbon = document.getElementById("days-ribbon");
  ribbon.innerHTML = "";

  if (!state.currentSchedule || !state.currentSchedule.days) return;

  state.currentSchedule.days.forEach((day, idx) => {
    const parts = day.day_info.split(" ");
    const datePart = parts[0] || "";
    const weekday = parts[1] || "";
    const dayNumber = datePart.split(".")[0] || "";

    const pill = document.createElement("button");
    const isActive = idx === state.selectedDayIndex;
    pill.className = `day-pill ${isActive ? "active" : ""}`;
    pill.innerHTML = `
      <span class="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">${weekday}</span>
      <span class="font-display text-base font-bold text-slate-900 dark:text-white">${dayNumber}</span>
      <span class="w-1.5 h-1.5 rounded-full ${day.lessons.length > 0 ? (isActive ? "bg-cyan-300" : "bg-sky-500 dark:bg-cyan-400/80") : "bg-transparent"} mt-0.5"></span>
    `;

    pill.onclick = () => {
      state.selectedDayIndex = idx;
      renderDaysRibbon();
      renderDaySchedule();
    };

    ribbon.appendChild(pill);
  });
}

// ─────────────────────────────────────────────
// 7. Карточки пар (Liquid Glass с высокой контрастностью)
// ─────────────────────────────────────────────
function renderDaySchedule() {
  updateLiveStatusBar();

  const container = document.getElementById("day-schedule-content");
  container.innerHTML = "";

  if (!state.currentSchedule || !state.currentSchedule.days || !state.currentSchedule.days[state.selectedDayIndex]) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-500 dark:text-slate-400">Нет данных о занятиях</div>`;
    return;
  }

  const currentDay = state.currentSchedule.days[state.selectedDayIndex];

  // Группируем уроки дня по номеру пары (1, 2, 3...)
  const pairsMap = new Map();
  currentDay.lessons.forEach((l) => {
    if (!pairsMap.has(l.number)) {
      pairsMap.set(l.number, []);
    }
    pairsMap.get(l.number).push(l);
  });

  const pairNumbers = Array.from(pairsMap.keys()).sort((a, b) => a - b);
  const list = document.createElement("div");
  list.className = "space-y-3.5";

  const dayBells = getBellsForDay(currentDay ? currentDay.day_info : null);

  pairNumbers.forEach((num) => {
    const pairLessons = pairsMap.get(num);
    const bell = dayBells.find((b) => b.num === num);
    const timeStr = bell ? bell.timeStr : `Пара ${num}`;
    const startStr = bell ? bell.startStr : "";
    const endStr = bell ? bell.endStr : "";
    const pairLabel = bell ? bell.label : `${num} пара`;

    const card = document.createElement("div");
    card.className = "liquid-card p-4";

    if (state.currentMode === "teacher") {
      // Режим преподавателя: 3 колонки
      const lesson = pairLessons[0];
      const subj = cleanString(lesson.subject);
      const group = cleanString(lesson.group);
      const room = cleanString(lesson.room);

      card.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-col flex-shrink-0 text-left min-w-[55px]">
            <span class="font-display text-sm font-bold text-slate-900 dark:text-white leading-tight">${startStr || "—"}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${endStr}</span>
          </div>

          <div class="flex-1 min-w-0 px-2 text-left">
            <div class="font-display text-base font-bold text-slate-900 dark:text-white leading-snug truncate">${subj}</div>
            ${group ? `<div class="text-xs font-semibold text-sky-700 dark:text-cyan-300 truncate mt-0.5">Группа ${group}</div>` : ""}
          </div>

          <div class="flex flex-col flex-shrink-0 text-right min-w-[55px]">
            <span class="font-display text-sm font-bold text-sky-800 dark:text-cyan-300 leading-tight bg-sky-100/90 dark:bg-cyan-500/10 px-2.5 py-0.5 rounded-lg border border-sky-300/80 dark:border-cyan-500/25 text-center">${room || "—"}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-1 text-center font-medium">${pairLabel}</span>
          </div>
        </div>
      `;
    } else {
      // Режим группы: разделение по подгруппам или общая пара
      const isSplit = pairLessons.length > 1 || pairLessons.some((l) => l.subgroup > 0);

      if (!isSplit) {
        // Общая пара (3 колонки)
        const lesson = pairLessons[0];
        const subj = cleanString(lesson.subject);
        const teacher = cleanString(lesson.teacher);
        const room = cleanString(lesson.room);

        card.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col flex-shrink-0 text-left min-w-[55px]">
              <span class="font-display text-sm font-bold text-slate-900 dark:text-white leading-tight">${startStr || "—"}</span>
              <span class="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${endStr}</span>
            </div>

            <div class="flex-1 min-w-0 px-2 text-left">
              <div class="font-display text-base font-bold text-slate-900 dark:text-white leading-snug truncate">${subj}</div>
              ${teacher ? `<div class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium">${teacher}</div>` : ""}
            </div>

            <div class="flex flex-col flex-shrink-0 text-right min-w-[55px]">
              <span class="font-display text-sm font-bold text-sky-800 dark:text-cyan-300 leading-tight bg-sky-100/90 dark:bg-cyan-500/10 px-2.5 py-0.5 rounded-lg border border-sky-300/80 dark:border-cyan-500/25 text-center">${room || "—"}</span>
              <span class="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-1 text-center font-medium">${pairLabel}</span>
            </div>
          </div>
        `;
      } else {
        // Пара с разделением на подгруппы
        const sortedLessons = [...pairLessons].sort((a, b) => a.subgroup - b.subgroup);

        let subgroupsHTML = "";
        sortedLessons.forEach((l, index) => {
          const subj = cleanString(l.subject);
          const teacher = cleanString(l.teacher);
          const room = cleanString(l.room);
          const isSub1 = l.subgroup === 1;
          const subTitle = l.subgroup > 0 ? `${l.subgroup}-я подгруппа` : "Вся группа";
          
          const badgeClass = isSub1 
            ? "text-sky-800 bg-sky-100 border-sky-300 dark:text-cyan-400 dark:bg-cyan-500/10 dark:border-cyan-500/20" 
            : "text-purple-800 bg-purple-100 border-purple-300 dark:text-violet-400 dark:bg-violet-500/10 dark:border-violet-500/20";

          const divider = index > 0 ? `<div class="card-divider"></div>` : "";

          subgroupsHTML += `
            ${divider}
            <div class="space-y-1 text-left">
              <div class="flex items-center justify-between text-xs">
                <span class="${badgeClass} font-semibold text-[11px] px-2.5 py-0.5 rounded-full border">${subTitle}</span>
                <span class="font-display font-bold text-sm text-slate-800 dark:text-white bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-white/10">${room}</span>
              </div>
              <div class="font-display text-base font-bold text-slate-900 dark:text-white pt-0.5 leading-snug">${subj}</div>
              ${teacher ? `<div class="text-xs text-slate-500 dark:text-slate-400 font-medium">${teacher}</div>` : ""}
            </div>
          `;
        });

        card.innerHTML = `
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-display text-sm font-bold text-slate-900 dark:text-white tracking-wide">${timeStr}</span>
              <span class="text-xs text-slate-600 dark:text-slate-300 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-medium">${pairLabel}</span>
            </div>

            <div class="card-divider"></div>
            ${subgroupsHTML}
          </div>
        `;
      }
    }

    list.appendChild(card);
  });

  const header = document.createElement("div");
  header.className = "flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1 pt-1 pb-1";
  header.innerHTML = `
    <span>${currentDay.day_info}</span>
    <span>${pairNumbers.length} пар</span>
  `;
  container.appendChild(header);

  if (pairNumbers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "py-14 text-center text-xs text-slate-400 space-y-1.5";
    empty.innerHTML = `
      <p class="font-display text-lg font-bold text-slate-700 dark:text-slate-200">Пар нет 🎉</p>
      <p class="text-slate-500 dark:text-slate-400">На этот день занятий не запланировано</p>
    `;
    container.appendChild(empty);
  } else {
    container.appendChild(list);
  }

  if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// 8. visionOS Hero Виджет (Живой таймер текущей пары)
// ─────────────────────────────────────────────
function startLiveTimer() {
  updateLiveStatusBar();
  setInterval(updateLiveStatusBar, 1000);
}

function updateLiveStatusBar() {
  const bar = document.getElementById("live-status-bar");
  if (!bar) return;

  if (!state.currentSchedule || !state.currentSchedule.days) {
    bar.classList.add("hidden");
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();

  const dayStr = String(now.getDate()).padStart(2, "0");
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${dayStr}.${monthStr}`;

  const todayData = state.currentSchedule.days.find((d) => d.day_info.includes(prefix));
  if (!todayData || !todayData.lessons || todayData.lessons.length === 0) {
    bar.classList.add("hidden");
    return;
  }

  // Получаем актуальное расписание звонков ДЛЯ СЕГОДНЯШНЕГО ДНЯ
  const todayBells = getBellsForDay(todayData.day_info);

  // Проверка пуш-уведомлений о скором начале пары (например, за 5 минут)
  checkPairNotificationAlerts(todayData);

  let currentLessons = [];
  let nextLessons = [];
  let isBreak = false;
  let secondsRemaining = 0;
  let activePairNum = null;
  let activeBell = null;

  for (const bell of todayBells) {
    const matching = todayData.lessons.filter((l) => l.number === bell.num);
    if (matching.length === 0) continue;

    if (currentMinutes >= bell.start && currentMinutes < bell.end) {
      currentLessons = matching;
      activePairNum = bell.num;
      activeBell = bell;
      const endSec = bell.end * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, endSec - nowSec);
      break;
    }

    if (currentMinutes < bell.start && currentMinutes >= bell.start - 35) {
      nextLessons = matching;
      activePairNum = bell.num;
      activeBell = bell;
      isBreak = true;
      const startSec = bell.start * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, startSec - nowSec);
      break;
    }
  }

  const isTeacher = state.currentMode === "teacher";

  if (currentLessons.length > 0 && activeBell) {
    bar.classList.remove("hidden");
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    const totalSeconds = (activeBell.end - activeBell.start) * 60;
    const elapsedSeconds = totalSeconds - secondsRemaining;
    const progressPercent = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));

    let subjectTitle = "";
    let roomTitle = "";
    let personOrGroup = "";

    if (isTeacher) {
      const l = currentLessons[0];
      subjectTitle = cleanString(l.subject);
      roomTitle = cleanString(l.room) || "—";
      personOrGroup = l.group ? `Группа ${cleanString(l.group)}` : "";
    } else {
      if (currentLessons.length === 1) {
        const l = currentLessons[0];
        subjectTitle = cleanString(l.subject);
        roomTitle = cleanString(l.room) || "—";
        personOrGroup = cleanString(l.teacher);
      } else {
        subjectTitle = currentLessons.map((l) => `${l.subgroup} п/г: ${cleanString(l.subject)}`).join(" | ");
        roomTitle = currentLessons.map((l) => cleanString(l.room)).filter(Boolean).join(" / ") || "—";
        personOrGroup = currentLessons.map((l) => cleanString(l.teacher)).filter(Boolean).join(" | ");
      }
    }

    bar.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span class="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px]">Идёт ${activeBell.label}</span>
        </div>
        <span class="font-display font-bold text-xs text-slate-900 dark:text-white bg-slate-100/90 dark:bg-white/10 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">
          Осталось ${mins}м ${secs < 10 ? "0" : ""}${secs}с
        </span>
      </div>

      <div class="flex items-center justify-between gap-3 pt-0.5">
        <div class="space-y-0.5 min-w-0 flex-1">
          <h2 class="font-display text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight truncate">
            ${subjectTitle}
          </h2>
          ${personOrGroup ? `<div class="text-xs text-slate-600 dark:text-slate-300 truncate">${personOrGroup}</div>` : ""}
        </div>

        <div class="flex flex-col items-center justify-center px-3.5 py-2 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/15 flex-shrink-0">
          <span class="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Кабинет</span>
          <span class="font-display text-lg font-bold text-sky-700 dark:text-cyan-300">${roomTitle}</span>
        </div>
      </div>

      <!-- Градиентный прогресс-бар -->
      <div class="space-y-1.5 pt-1">
        <div class="w-full h-2 bg-slate-200 dark:bg-slate-900/60 rounded-full overflow-hidden border border-slate-300 dark:border-white/10 p-0.5">
          <div class="h-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400 rounded-full shadow-lg shadow-cyan-500/40 transition-all duration-1000" style="width: ${progressPercent.toFixed(1)}%;"></div>
        </div>
        <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium font-display">
          <span>${activeBell.startStr}</span>
          <span class="text-sky-700 dark:text-cyan-300 font-semibold">${Math.round(progressPercent)}% пройдено</span>
          <span>${activeBell.endStr}</span>
        </div>
      </div>
    `;
  } else if (isBreak && nextLessons.length > 0 && activeBell) {
    bar.classList.remove("hidden");
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    const isBigBreak = secondsRemaining > 15 * 60;
    const breakTitle = isBigBreak ? "Большая перемена" : "Перемена";

    let nextTitle = "";
    if (isTeacher) {
      nextTitle = `${cleanString(nextLessons[0].subject)}${nextLessons[0].group ? ` (Гр. ${cleanString(nextLessons[0].group)})` : ""}`;
    } else {
      nextTitle = nextLessons.map((l) => cleanString(l.subject)).join(" | ");
    }

    bar.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span class="font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[11px]">${breakTitle}</span>
        </div>
        <span class="font-display font-bold text-xs text-slate-900 dark:text-white bg-slate-100/90 dark:bg-white/10 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">
          До звонка ${mins}м ${secs < 10 ? "0" : ""}${secs}с
        </span>
      </div>

      <div class="pt-0.5">
        <div class="text-xs text-slate-600 dark:text-slate-300">Скоро <span class="font-bold text-slate-900 dark:text-white">${activeBell.label}:</span> ${nextTitle}</div>
      </div>
    `;
  } else {
    bar.classList.add("hidden");
  }

  if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// 9. Тема оформления (Светлая / Тёмная)
// ─────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (icon) {
    icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
    if (window.lucide) lucide.createIcons();
  }
}

// ─────────────────────────────────────────────
// 10. Настройки звонков
// ─────────────────────────────────────────────
let currentBellModalTab = "weekday"; // "weekday" | "monday" | "saturday"

function switchBellTab(tab) {
  currentBellModalTab = tab;
  renderBellSettingsInputs();
}

function openBellSettings() {
  const modal = document.getElementById("bell-modal");
  if (!modal) return;

  // Автоматически выбираем вкладку дня недели для выбранного в данный момент дня
  const activeDay = state.currentSchedule && state.currentSchedule.days ? state.currentSchedule.days[state.selectedDayIndex] : null;
  const dayType = getDayType(activeDay ? activeDay.day_info : null);
  currentBellModalTab = (dayType === "monday" || dayType === "saturday") ? dayType : "weekday";

  renderBellSettingsInputs();
  modal.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function closeBellSettings() {
  document.getElementById("bell-modal")?.classList.add("hidden");
}

function renderBellSettingsInputs() {
  const container = document.getElementById("bell-inputs");
  const desc = document.getElementById("bell-tab-description");
  if (!container) return;

  // Подсветка активной вкладки дня
  ["weekday", "monday", "saturday"].forEach((tab) => {
    const btn = document.getElementById(`bell-tab-${tab}`);
    if (btn) {
      if (tab === currentBellModalTab) {
        btn.className = "flex-1 py-1.5 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-sm transition-all text-center";
      } else {
        btn.className = "flex-1 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all text-center";
      }
    }
  });

  if (desc) {
    if (currentBellModalTab === "monday") {
      desc.textContent = "Понедельник: Линейка (08:15–08:55), пары со смещённым временем, большая перемена 12:20 – 12:50.";
    } else if (currentBellModalTab === "saturday") {
      desc.textContent = "Суббота: укороченные пары по 60 минут с 10-минутными переменами.";
    } else {
      desc.textContent = "Вторник – Пятница: стандартный график. Большая перемена: 11:35 – 12:05 (30 мин).";
    }
  }

  container.innerHTML = "";
  const list = ALL_BELLS[currentBellModalTab] || [];

  list.forEach((b) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs";
    row.innerHTML = `
      <span class="font-display font-bold text-slate-800 dark:text-white w-20 truncate">${b.label || `№${b.num} пара`}</span>
      <div class="flex items-center gap-1.5 flex-1 justify-end font-mono">
        <input type="time" id="bell-start-${b.num}" value="${b.startStr}"
          class="px-2 py-1 rounded-xl bg-white dark:bg-white/10 border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white font-mono text-center focus:outline-none focus:border-cyan-400" />
        <span class="text-slate-400">–</span>
        <input type="time" id="bell-end-${b.num}" value="${b.endStr}"
          class="px-2 py-1 rounded-xl bg-white dark:bg-white/10 border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white font-mono text-center focus:outline-none focus:border-cyan-400" />
      </div>
    `;
    container.appendChild(row);
  });
}

function saveBellSettings() {
  const currentList = ALL_BELLS[currentBellModalTab] || [];
  const updated = currentList.map((b) => {
    const startInput = document.getElementById(`bell-start-${b.num}`);
    const endInput = document.getElementById(`bell-end-${b.num}`);
    return {
      num: b.num,
      label: b.label,
      startStr: startInput ? startInput.value : b.startStr,
      endStr: endInput ? endInput.value : b.endStr,
    };
  });

  const toSave = {
    monday: currentBellModalTab === "monday" ? updated : ALL_BELLS.monday,
    weekday: currentBellModalTab === "weekday" ? updated : ALL_BELLS.weekday,
    saturday: currentBellModalTab === "saturday" ? updated : ALL_BELLS.saturday,
  };

  localStorage.setItem("my_schedule_bells_v3", JSON.stringify(toSave));
  ALL_BELLS = loadAllBellSchedules();
  closeBellSettings();
  renderDaySchedule();
  updateLiveStatusBar();
}

function resetDefaultBells() {
  localStorage.removeItem("my_schedule_bells_v3");
  ALL_BELLS = loadAllBellSchedules();
  renderBellSettingsInputs();
  renderDaySchedule();
  updateLiveStatusBar();
}

function showLoader(show) {
  const loader = document.getElementById("schedule-loader");
  if (loader) loader.classList.toggle("hidden", !show);
}

// ─────────────────────────────────────────────
// 11. Уведомления о начале пар (Web Notifications & PWA)
// ─────────────────────────────────────────────

const notifiedPairsToday = {};

function initNotificationsUI() {
  updateNotifUI();
}

function openNotificationsModal() {
  const modal = document.getElementById("notif-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  updateNotifUI();
  if (window.lucide) lucide.createIcons();
}

function closeNotificationsModal() {
  document.getElementById("notif-modal")?.classList.add("hidden");
}

function updateNotifUI() {
  const isEnabled = state.notificationsEnabled && ("Notification" in window && Notification.permission === "granted");
  const dot = document.getElementById("notif-dot");
  const icon = document.getElementById("notif-icon");
  const statusLabel = document.getElementById("notif-status-label");
  const toggleBtn = document.getElementById("notif-toggle-btn");

  if (dot) {
    dot.classList.toggle("hidden", !isEnabled);
  }

  if (icon) {
    if (isEnabled) {
      icon.className = "w-4 h-4 text-emerald-500 animate-pulse";
    } else {
      icon.className = "w-4 h-4 text-violet-600 dark:text-violet-400";
    }
  }

  if (statusLabel) {
    if (!("Notification" in window)) {
      statusLabel.textContent = "Не поддерживается браузером";
      statusLabel.className = "text-[11px] text-rose-500 font-medium";
    } else if (Notification.permission === "denied") {
      statusLabel.textContent = "Заблокировано в браузере ⚠️";
      statusLabel.className = "text-[11px] text-rose-500 font-medium";
    } else if (isEnabled) {
      statusLabel.textContent = `Включено (за ${state.notifLeadMinutes} мин до пары)`;
      statusLabel.className = "text-[11px] text-emerald-600 dark:text-emerald-400 font-medium";
    } else {
      statusLabel.textContent = "Выключено";
      statusLabel.className = "text-[11px] text-slate-500 dark:text-slate-400";
    }
  }

  if (toggleBtn) {
    if (isEnabled) {
      toggleBtn.textContent = "Отключить";
      toggleBtn.className = "px-4 py-1.5 rounded-xl font-bold text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all";
    } else {
      toggleBtn.textContent = "Включить";
      toggleBtn.className = "px-4 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all";
    }
  }

  // Обновляем подсветку кнопок [3, 5, 10] минут
  [3, 5, 10].forEach((mins) => {
    const btn = document.getElementById(`lead-${mins}`);
    if (btn) {
      btn.classList.toggle("active", state.notifLeadMinutes === mins);
    }
  });

  if (window.lucide) lucide.createIcons();
}

async function toggleNotificationsState() {
  if (!("Notification" in window)) {
    alert("К сожалению, этот браузер не поддерживает Push-уведомления.");
    return;
  }

  if (state.notificationsEnabled && Notification.permission === "granted") {
    state.notificationsEnabled = false;
    localStorage.setItem("my_schedule_notif_enabled", "false");
    updateNotifUI();
    return;
  }

  if (Notification.permission === "denied") {
    alert("Уведомления заблокированы сайтом!\n\nЧтобы включить:\n1. Нажми на значок настроек сайта возле URL\n2. Разреши уведомления\n3. Перезагрузи страницу");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      state.notificationsEnabled = true;
      localStorage.setItem("my_schedule_notif_enabled", "true");
      updateNotifUI();
      sendSystemNotification(
        "🔔 Уведомления успешно включены!",
        `Мы предупредим тебя за ${state.notifLeadMinutes} минут до начала каждой пары!`,
        "welcome-notif"
      );
    } else {
      state.notificationsEnabled = false;
      localStorage.setItem("my_schedule_notif_enabled", "false");
      updateNotifUI();
    }
  } catch (err) {
    console.error("Ошибка при запросе разрешения уведомлений:", err);
  }
}

function setNotifLeadTime(mins) {
  state.notifLeadMinutes = mins;
  localStorage.setItem("my_schedule_notif_lead", String(mins));
  updateNotifUI();
}

// Воспроизведение звука колокольчика через Web Audio API (кристально чистый стереозвук)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.45);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.7);
  } catch (e) {
    console.log("Audio chime error:", e);
  }
}

async function sendSystemNotification(title, body, tag = "pair-alert") {
  // Звук
  playNotificationChime();

  // Вибрация (для мобилок)
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch (_) {}
  }

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  // Через Service Worker
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body: body,
          icon: "/static/icon-192.png",
          badge: "/static/icon-192.png",
          tag: tag,
          renotify: true,
          vibrate: [200, 100, 200],
          data: { url: window.location.href }
        });
        return;
      }
    } catch (e) {
      console.warn("SW showNotification fallback:", e);
    }
  }

  // Fallback
  try {
    new Notification(title, {
      body: body,
      icon: "/static/icon-192.png",
      tag: tag
    });
  } catch (err) {
    console.error("Notification creation error:", err);
  }
}

function testNotificationAction() {
  playNotificationChime();
  if ("vibrate" in navigator) {
    try { navigator.vibrate([200, 100, 200]); } catch (_) {}
  }

  if (!("Notification" in window)) {
    alert("Этот браузер не поддерживает Notification API.");
    return;
  }

  if (Notification.permission === "granted") {
    sendSystemNotification(
      "🔔 Проверка уведомлений!",
      `Всё чётко работает! За ${state.notifLeadMinutes} мин до пары тебе прилетит такое же уведомление со звуком, кабинетом и предметом.`,
      "test-alert"
    );
  } else if (Notification.permission === "denied") {
    alert("Уведомления заблокированы сайтом! Разреши их в настройках браузера (значок замочка возле адреса).");
  } else {
    Notification.requestPermission().then((perm) => {
      updateNotifUI();
      if (perm === "granted") {
        state.notificationsEnabled = true;
        localStorage.setItem("my_schedule_notif_enabled", "true");
        updateNotifUI();
        sendSystemNotification(
          "🔔 Уведомления включены!",
          `Всё настроено! Ты будешь получать напоминания за ${state.notifLeadMinutes} минут до пары.`,
          "test-alert"
        );
      }
    });
  }
}

function checkPairNotificationAlerts(todayData) {
  if (!state.notificationsEnabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!todayData || !todayData.lessons || todayData.lessons.length === 0) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();
  const nowSec = currentMinutes * 60 + currentSeconds;

  const dayStr = String(now.getDate()).padStart(2, "0");
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const dateKey = `${dayStr}.${monthStr}`;

  const todayBells = getBellsForDay(todayData.day_info);

  for (const bell of todayBells) {
    const matching = todayData.lessons.filter((l) => l.number === bell.num);
    if (matching.length === 0) continue;

    const startSec = bell.start * 60;
    const leadSec = state.notifLeadMinutes * 60;
    const alertWindowSec = 60;

    const notifKey = `${dateKey}_pair_${bell.num}_${bell.start}`;

    // Если время попадает в окно за N минут до пары
    if (nowSec >= (startSec - leadSec) && nowSec < (startSec - leadSec + alertWindowSec)) {
      if (!notifiedPairsToday[notifKey]) {
        notifiedPairsToday[notifKey] = true;

        let subject = "";
        let room = "";

        if (state.currentMode === "teacher") {
          subject = cleanString(matching[0].subject);
          room = cleanString(matching[0].room);
        } else {
          subject = matching.map((l) => cleanString(l.subject)).join(" / ");
          room = matching.map((l) => cleanString(l.room)).filter(Boolean).join(" / ");
        }

        const roomText = room ? ` (каб. ${room})` : "";
        const title = `🔔 До ${bell.label} осталось ${state.notifLeadMinutes} мин!`;
        const body = `${subject}${roomText}. Начало в ${bell.startStr}. Пора выдвигаться!`;

        sendSystemNotification(title, body, notifKey);
      }
    }
  }
}
