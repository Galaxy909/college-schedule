/**
 * app.js — Логика расписания с поддержкой Групп и Преподавателей:
 * - Переключение между режимами «Группы» и «Преподаватели»
 * - Закрепление преподавателей (звёздочка ⭐ и быстрые чипы под шапкой)
 * - Точный дизайн карточек пар по референсу со скриншота
 * - Живой таймер пар с подсчетом минут и секунд
 */

const state = {
  currentMode: localStorage.getItem("my_schedule_mode") || "group", // "group" | "teacher"
  allGroups: [],
  allTeachers: [],
  pinnedTeachers: JSON.parse(localStorage.getItem("my_pinned_teachers") || "[]"),
  selectedGroupId: localStorage.getItem("my_schedule_group") || null,
  selectedTeacherId: localStorage.getItem("my_schedule_teacher") || null,
  currentSchedule: null,
  selectedDayIndex: 0,
};

// Реальное расписание звонков колледжа (как на скриншоте)
const DEFAULT_BELLS = [
  { num: 1, startStr: "08:15", endStr: "09:50" },
  { num: 2, startStr: "10:00", endStr: "11:35" },
  { num: 3, startStr: "12:05", endStr: "13:40" },
  { num: 4, startStr: "13:50", endStr: "15:25" },
  { num: 5, startStr: "15:35", endStr: "17:10" },
  { num: 6, startStr: "17:20", endStr: "18:55" },
  { num: 7, startStr: "19:05", endStr: "20:40" },
];

function timeToMinutes(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function loadBellSchedule() {
  const saved = localStorage.getItem("my_schedule_bells_v2");
  const raw = saved ? JSON.parse(saved) : DEFAULT_BELLS;
  return raw.map((b) => ({
    num: b.num,
    startStr: b.startStr,
    endStr: b.endStr,
    start: timeToMinutes(b.startStr),
    end: timeToMinutes(b.endStr),
    timeStr: `${b.startStr}–${b.endStr}`,
  }));
}

let BELL_SCHEDULE = loadBellSchedule();

// Очистка текста от переносов строк и лишних пробелов с сайта колледжа
function cleanString(str) {
  if (!str) return "";
  return str.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

// PWA Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js").then((reg) => {
    reg.update();
  }).catch(console.error);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModeUI();
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
  const chipsContainer = document.getElementById("pinned-chips-container");

  if (isTeacher) {
    groupBtn.className = "px-3 py-1.5 rounded-lg transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white";
    teacherBtn.className = "px-3 py-1.5 rounded-lg transition-all font-bold text-white bg-indigo-500 shadow-sm";
    if (chipsContainer) chipsContainer.classList.remove("hidden");
  } else {
    groupBtn.className = "px-3 py-1.5 rounded-lg transition-all font-bold text-white bg-indigo-500 shadow-sm";
    teacherBtn.className = "px-3 py-1.5 rounded-lg transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white";
    if (chipsContainer) chipsContainer.classList.add("hidden");
  }
}

function switchMode(newMode) {
  if (state.currentMode === newMode) return;
  state.currentMode = newMode;
  localStorage.setItem("my_schedule_mode", newMode);
  initModeUI();
  renderPinnedChips();

  // Закрываем меню если открыто
  document.getElementById("selector-dropdown-menu")?.classList.add("hidden");
  document.getElementById("selector-arrow")?.classList.remove("rotate-180");

  if (newMode === "group") {
    if (state.selectedGroupId) {
      selectGroup(state.selectedGroupId);
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
// 2. Загрузка списков групп и преподавателей
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
      input.placeholder = state.currentMode === "teacher" ? "Поиск преподавателя (напр. Арсланова)..." : "Поиск группы (напр. 911)...";
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
    // Режим Групп
    const filtered = state.allGroups.filter((g) => g.name.toLowerCase().includes(q));
    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Группы не найдены</div>`;
      return;
    }

    filtered.forEach((g) => {
      const item = document.createElement("button");
      const isSelected = g.id === state.selectedGroupId;
      item.className = `w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
        isSelected
          ? "bg-indigo-500/10 text-indigo-500 font-bold"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`;
      item.innerHTML = `
        <span>Группа ${g.name}</span>
        ${isSelected ? `<i data-lucide="check" class="w-3.5 h-3.5 text-indigo-500"></i>` : ""}
      `;
      item.onclick = () => {
        selectGroup(g.id);
        toggleSelectorDropdown();
      };
      container.appendChild(item);
    });
  } else {
    // Режим Преподавателей
    const filtered = state.allTeachers.filter((t) => t.name.toLowerCase().includes(q));
    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Преподаватели не найдены</div>`;
      return;
    }

    // Сначала показываем закрепленных
    const sorted = [...filtered].sort((a, b) => {
      const aPinned = state.pinnedTeachers.includes(a.id) ? 1 : 0;
      const bPinned = state.pinnedTeachers.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

    sorted.forEach((t) => {
      const item = document.createElement("div");
      const isSelected = t.id === state.selectedTeacherId;
      const isPinned = state.pinnedTeachers.includes(t.id);

      item.className = `w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
        isSelected
          ? "bg-indigo-500/10 text-indigo-500 font-bold"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`;

      item.innerHTML = `
        <div class="flex-1 truncate pr-2" onclick="handleTeacherClick('${t.id}')">
          <span>${t.name}</span>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="handlePinToggle('${t.id}', event)" title="${isPinned ? 'Открепить' : 'Закрепить'}"
            class="star-btn ${isPinned ? 'pinned' : ''}">
            <i data-lucide="star" class="w-4 h-4 ${isPinned ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>
          </button>
          ${isSelected ? `<i data-lucide="check" class="w-3.5 h-3.5 text-indigo-500"></i>` : ""}
        </div>
      `;

      container.appendChild(item);
    });
  }

  if (window.lucide) lucide.createIcons();
}

function handleTeacherClick(teacherId) {
  selectTeacher(teacherId);
  toggleSelectorDropdown();
}

function handlePinToggle(teacherId, event) {
  event.stopPropagation();
  togglePinTeacher(teacherId);
  renderDropdownItems();
}

// ─────────────────────────────────────────────
// 4. Закрепление преподавателей (Быстрый доступ)
// ─────────────────────────────────────────────
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

  if (state.currentMode !== "teacher" || state.pinnedTeachers.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  list.innerHTML = "";

  state.pinnedTeachers.forEach((id) => {
    const teacher = state.allTeachers.find((t) => t.id === id);
    if (!teacher) return;

    const isActive = id === state.selectedTeacherId;
    const btn = document.createElement("button");
    btn.className = `chip-btn ${isActive ? "active" : ""}`;
    btn.innerHTML = `
      <i data-lucide="star" class="w-3 h-3 ${isActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}"></i>
      <span>${teacher.name}</span>
    `;
    btn.onclick = () => selectTeacher(id);
    list.appendChild(btn);
  });

  if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// 5. Выбор Группы / Преподавателя и загрузка расписания
// ─────────────────────────────────────────────
async function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  localStorage.setItem("my_schedule_group", groupId);

  const group = state.allGroups.find((g) => g.id === groupId);
  const nameEl = document.getElementById("selected-item-name");
  if (nameEl && group) {
    nameEl.textContent = `Группа ${group.name}`;
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
      `<div class="p-4 text-center text-xs text-red-400">Ошибка при получении расписания</div>`;
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
  if (nameEl && teacher) {
    nameEl.textContent = teacher.name;
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
      `<div class="p-4 text-center text-xs text-red-400">Ошибка при получении расписания</div>`;
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
// 6. Календарная лента дней недели (Пн, Вт, Ср...)
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
      <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${weekday}</span>
      <span class="text-sm font-extrabold text-slate-800 dark:text-slate-100">${dayNumber}</span>
      <span class="w-1 h-1 rounded-full ${day.lessons.length > 0 ? "bg-indigo-400" : "bg-transparent"} mt-0.5"></span>
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
// 7. Список пар: Точный дизайн карточек по референсу
// ─────────────────────────────────────────────
function renderDaySchedule() {
  updateLiveStatusBar();

  const container = document.getElementById("day-schedule-content");
  container.innerHTML = "";

  if (!state.currentSchedule || !state.currentSchedule.days || !state.currentSchedule.days[state.selectedDayIndex]) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Нет данных о занятиях</div>`;
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
  list.className = "space-y-3";

  pairNumbers.forEach((num) => {
    const pairLessons = pairsMap.get(num);
    const bell = BELL_SCHEDULE.find((b) => b.num === num);
    const timeStr = bell ? bell.timeStr : `Пара ${num}`;
    const startStr = bell ? bell.startStr : "";
    const endStr = bell ? bell.endStr : "";

    const card = document.createElement("div");
    card.className = "lesson-card";

    if (state.currentMode === "teacher") {
      // ═════════════════════════════════════════════
      // РЕЖИМ ПРЕПОДАВАТЕЛЯ: 3-колоночный стиль
      // [Время начала/конца] | [Предмет и Группа] | [Кабинет и Номер пары]
      // ═════════════════════════════════════════════
      const lesson = pairLessons[0];
      const subj = cleanString(lesson.subject);
      const group = cleanString(lesson.group);
      const room = cleanString(lesson.room);

      card.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <!-- Колонка 1: Время (друг под другом) -->
          <div class="flex flex-col flex-shrink-0 text-left min-w-[50px]">
            <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">${startStr || "—"}</span>
            <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${endStr}</span>
          </div>

          <!-- Колонка 2: Предмет и Группа (по центру) -->
          <div class="flex-1 min-w-0 px-1 text-left">
            <div class="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug line-clamp-2">${subj}</div>
            ${group ? `<div class="text-xs sm:text-sm font-semibold text-sky-500 dark:text-sky-400 truncate mt-0.5">Группа ${group}</div>` : ""}
          </div>

          <!-- Колонка 3: Кабинет и Пара (справа) -->
          <div class="flex flex-col flex-shrink-0 text-right min-w-[52px]">
            <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">${room || "—"}</span>
            <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${num} пара</span>
          </div>
        </div>
      `;
    } else {
      // ═════════════════════════════════════════════
      // РЕЖИМ ГРУППЫ: разделение по подгруппам или компактный вид
      // ═════════════════════════════════════════════
      const isSplit = pairLessons.length > 1 || pairLessons.some((l) => l.subgroup > 0);

      if (!isSplit) {
        // Случай 1: Общая пара для всей группы (3 колонки)
        const lesson = pairLessons[0];
        const subj = cleanString(lesson.subject);
        const teacher = cleanString(lesson.teacher);
        const room = cleanString(lesson.room);

        card.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col flex-shrink-0 text-left min-w-[50px]">
              <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">${startStr || "—"}</span>
              <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${endStr}</span>
            </div>

            <div class="flex-1 min-w-0 px-1 text-left">
              <div class="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug line-clamp-2">${subj}</div>
              ${teacher ? `<div class="text-xs sm:text-sm font-normal text-slate-500 dark:text-slate-400 truncate mt-0.5">${teacher}</div>` : ""}
            </div>

            <div class="flex flex-col flex-shrink-0 text-right min-w-[52px]">
              <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">${room || "—"}</span>
              <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">${num} пара</span>
            </div>
          </div>
        `;
      } else {
        // Случай 2: Пара с подгруппами (друг под другом)
        const sortedLessons = [...pairLessons].sort((a, b) => a.subgroup - b.subgroup);

        let subgroupsHTML = "";
        sortedLessons.forEach((l, index) => {
          const subj = cleanString(l.subject);
          const teacher = cleanString(l.teacher);
          const room = cleanString(l.room);
          const subTitle = l.subgroup > 0 ? `${l.subgroup}-я подгруппа` : "Вся группа";
          const divider = index > 0 ? `<div class="card-divider"></div>` : "";

          subgroupsHTML += `
            ${divider}
            <div class="space-y-0.5 text-left">
              <div class="flex items-center justify-between text-xs sm:text-sm">
                <span class="subgroup-label font-semibold">${subTitle}</span>
                <span class="font-bold text-slate-900 dark:text-white text-sm sm:text-base">${room}</span>
              </div>
              <div class="font-bold text-base sm:text-lg text-slate-900 dark:text-white leading-snug pt-0.5">${subj}</div>
              ${teacher ? `<div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-normal pt-0.5">${teacher}</div>` : ""}
            </div>
          `;
        });

        card.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">${timeStr}</span>
            <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">${num}-я пара</span>
          </div>

          <div class="card-divider"></div>
          ${subgroupsHTML}
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
    empty.className = "py-12 text-center text-xs text-slate-400 space-y-1";
    empty.innerHTML = `
      <p class="text-base font-bold text-slate-600 dark:text-slate-300">Пар нет 🎉</p>
      <p>На этот день занятий не запланировано</p>
    `;
    container.appendChild(empty);
  } else {
    container.appendChild(list);
  }

  if (window.lucide) lucide.createIcons();
}

// ─────────────────────────────────────────────
// 8. Компактная статусная строка (Текущая пара)
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

  let currentLessons = [];
  let nextLessons = [];
  let isBreak = false;
  let secondsRemaining = 0;
  let activePairNum = null;

  for (const bell of BELL_SCHEDULE) {
    const matching = todayData.lessons.filter((l) => l.number === bell.num);
    if (matching.length === 0) continue;

    if (currentMinutes >= bell.start && currentMinutes < bell.end) {
      currentLessons = matching;
      activePairNum = bell.num;
      const endSec = bell.end * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, endSec - nowSec);
      break;
    }

    if (currentMinutes < bell.start && currentMinutes >= bell.start - 30) {
      nextLessons = matching;
      activePairNum = bell.num;
      isBreak = true;
      const startSec = bell.start * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, startSec - nowSec);
      break;
    }
  }

  const isTeacher = state.currentMode === "teacher";

  if (currentLessons.length > 0) {
    bar.classList.remove("hidden");
    bar.className = "px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    let textDesc = "";
    if (isTeacher) {
      const l = currentLessons[0];
      textDesc = `${cleanString(l.subject)} (каб. ${cleanString(l.room) || '—'}${l.group ? `, Гр. ${cleanString(l.group)}` : ''})`;
    } else {
      if (currentLessons.length === 1) {
        const l = currentLessons[0];
        textDesc = `${cleanString(l.subject)} ${l.room ? `(${cleanString(l.room)})` : ""}`;
      } else {
        textDesc = currentLessons.map((l) => `${l.subgroup} п/г: ${cleanString(l.subject)}`).join(" | ");
      }
    }

    bar.innerHTML = `
      <div class="flex items-center gap-1.5 truncate">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-bold">Идёт ${activePairNum} пара:</span>
        <span class="truncate">${textDesc}</span>
      </div>
      <span class="font-mono font-bold whitespace-nowrap pl-2">${mins}м ${secs < 10 ? "0" : ""}${secs}с</span>
    `;
  } else if (isBreak && nextLessons.length > 0) {
    bar.classList.remove("hidden");
    bar.className = "px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    let textDesc = "";
    if (isTeacher) {
      const l = nextLessons[0];
      textDesc = `${cleanString(l.subject)}${l.group ? ` (Гр. ${cleanString(l.group)})` : ''}`;
    } else {
      if (nextLessons.length === 1) {
        textDesc = cleanString(nextLessons[0].subject);
      } else {
        textDesc = nextLessons.map((l) => `${l.subgroup} п/г: ${cleanString(l.subject)}`).join(" | ");
      }
    }

    bar.innerHTML = `
      <div class="flex items-center gap-1.5 truncate">
        <span class="w-2 h-2 rounded-full bg-amber-500"></span>
        <span class="font-bold">Перемена:</span>
        <span class="truncate">скоро ${activePairNum} пара (${textDesc})</span>
      </div>
      <span class="font-mono font-bold whitespace-nowrap pl-2">до пары ${mins}м ${secs < 10 ? "0" : ""}${secs}с</span>
    `;
  } else {
    bar.classList.add("hidden");
  }
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
function openBellSettings() {
  const modal = document.getElementById("bell-modal");
  const container = document.getElementById("bell-inputs");
  if (!modal || !container) return;

  container.innerHTML = "";

  BELL_SCHEDULE.forEach((b) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs";
    row.innerHTML = `
      <span class="font-bold text-slate-700 dark:text-slate-300 w-14">№${b.num} пара</span>
      <div class="flex items-center gap-1.5 flex-1 justify-end">
        <input type="time" id="bell-start-${b.num}" value="${b.startStr}"
          class="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-mono text-center focus:outline-none" />
        <span class="text-slate-400">–</span>
        <input type="time" id="bell-end-${b.num}" value="${b.endStr}"
          class="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 font-mono text-center focus:outline-none" />
      </div>
    `;
    container.appendChild(row);
  });

  modal.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function closeBellSettings() {
  document.getElementById("bell-modal")?.classList.add("hidden");
}

function saveBellSettings() {
  const newBells = [];
  BELL_SCHEDULE.forEach((b) => {
    const startInput = document.getElementById(`bell-start-${b.num}`);
    const endInput = document.getElementById(`bell-end-${b.num}`);
    if (startInput && endInput) {
      newBells.push({
        num: b.num,
        startStr: startInput.value,
        endStr: endInput.value,
      });
    }
  });

  localStorage.setItem("my_schedule_bells_v2", JSON.stringify(newBells));
  BELL_SCHEDULE = loadBellSchedule();
  closeBellSettings();
  renderDaySchedule();
}

function resetDefaultBells() {
  localStorage.removeItem("my_schedule_bells_v2");
  localStorage.removeItem("my_schedule_bells");
  BELL_SCHEDULE = loadBellSchedule();
  openBellSettings();
  renderDaySchedule();
}

function showLoader(show) {
  const loader = document.getElementById("schedule-loader");
  if (loader) loader.classList.toggle("hidden", !show);
}
