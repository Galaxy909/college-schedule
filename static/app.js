/**
 * app.js — Чистый минималистичный интерфейс расписания (Apple/Google Calendar style)
 */

const state = {
  allGroups: [],
  selectedGroupId: localStorage.getItem("my_schedule_group") || null,
  currentSchedule: null,
  selectedDayIndex: 0,
  activeSubgroup: parseInt(localStorage.getItem("my_schedule_subgroup") || "0", 10), // 0 - все, 1 - 1-я, 2 - 2-я
};

const DEFAULT_BELLS = [
  { num: 1, startStr: "08:30", endStr: "10:00" },
  { num: 2, startStr: "10:10", endStr: "11:40" },
  { num: 3, startStr: "12:10", endStr: "13:40" },
  { num: 4, startStr: "13:50", endStr: "15:20" },
  { num: 5, startStr: "15:30", endStr: "17:00" },
  { num: 6, startStr: "17:10", endStr: "18:40" },
];

function timeToMinutes(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function loadBellSchedule() {
  const saved = localStorage.getItem("my_schedule_bells");
  const raw = saved ? JSON.parse(saved) : DEFAULT_BELLS;
  return raw.map((b) => ({
    num: b.num,
    startStr: b.startStr,
    endStr: b.endStr,
    start: timeToMinutes(b.startStr),
    end: timeToMinutes(b.endStr),
    timeStr: `${b.startStr} – ${b.endStr}`,
  }));
}

let BELL_SCHEDULE = loadBellSchedule();

// PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js").catch(console.error);
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  updateSubgroupUI();
  loadGroups();
  startLiveTimer();

  // Закрывать дропдаун при клике мимо него
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("group-dropdown-menu");
    const btn = document.getElementById("group-dropdown-btn");
    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.add("hidden");
      document.getElementById("group-arrow")?.classList.remove("rotate-180");
    }
  });

  if (window.lucide) lucide.createIcons();
});

// ─────────────────────────────────────────────
// 1. Дропдаун со стрелочкой для выбора группы
// ─────────────────────────────────────────────
async function loadGroups() {
  try {
    const res = await fetch("/api/groups");
    if (!res.ok) throw new Error("Ошибка загрузки групп");

    state.allGroups = await res.json();
    renderDropdownGroups(state.allGroups);

    // Если группа уже сохранена — загружаем её, иначе выбираем первую
    if (state.selectedGroupId) {
      selectGroup(state.selectedGroupId);
    } else if (state.allGroups.length > 0) {
      selectGroup(state.allGroups[0].id);
    }
  } catch (err) {
    console.error(err);
    document.getElementById("dropdown-groups-list").innerHTML =
      `<div class="p-3 text-xs text-red-400">Ошибка загрузки групп</div>`;
  }
}

function toggleGroupDropdown() {
  const menu = document.getElementById("group-dropdown-menu");
  const arrow = document.getElementById("group-arrow");
  const isHidden = menu.classList.contains("hidden");

  if (isHidden) {
    menu.classList.remove("hidden");
    arrow?.classList.add("rotate-180");
    const input = document.getElementById("group-dropdown-search");
    if (input) {
      input.value = "";
      renderDropdownGroups(state.allGroups);
      input.focus();
    }
  } else {
    menu.classList.add("hidden");
    arrow?.classList.remove("rotate-180");
  }
}

function renderDropdownGroups(groups) {
  const container = document.getElementById("dropdown-groups-list");
  container.innerHTML = "";

  if (groups.length === 0) {
    container.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">Группы не найдены</div>`;
    return;
  }

  groups.forEach((g) => {
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
      toggleGroupDropdown();
    };
    container.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function filterDropdownGroups() {
  const q = document.getElementById("group-dropdown-search").value.toLowerCase().trim();
  const filtered = state.allGroups.filter((g) => g.name.toLowerCase().includes(q));
  renderDropdownGroups(filtered);
}

// ─────────────────────────────────────────────
// 2. Выбор группы и загрузка расписания
// ─────────────────────────────────────────────
async function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  localStorage.setItem("my_schedule_group", groupId);

  const group = state.allGroups.find((g) => g.id === groupId);
  const nameEl = document.getElementById("selected-group-name");
  if (nameEl && group) {
    nameEl.textContent = `Группа ${group.name}`;
  }

  showLoader(true);

  try {
    const res = await fetch(`/api/schedule/${groupId}`);
    if (!res.ok) throw new Error("Не удалось загрузить расписание");

    state.currentSchedule = await res.json();

    // Определяем сегодняшний день недели или берем первый
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

// Поиск сегодняшнего дня в расписании
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
// 3. Календарная лента дней (Пн, Вт, Ср...)
// ─────────────────────────────────────────────
function renderDaysRibbon() {
  const ribbon = document.getElementById("days-ribbon");
  ribbon.innerHTML = "";

  if (!state.currentSchedule || !state.currentSchedule.days) return;

  state.currentSchedule.days.forEach((day, idx) => {
    // day_info выглядит как "19.10.2026 Пн"
    const parts = day.day_info.split(" ");
    const datePart = parts[0] || ""; // "19.10.2026"
    const weekday = parts[1] || ""; // "Пн"
    const dayNumber = datePart.split(".")[0] || ""; // "19"

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
// 4. Минималистичный список пар на выбранный день
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

  // Фильтр по подгруппе
  const filteredLessons = currentDay.lessons.filter((l) => {
    if (state.activeSubgroup === 0) return true;
    return l.subgroup === 0 || l.subgroup === state.activeSubgroup;
  });

  // Заголовок дня
  const header = document.createElement("div");
  header.className = "flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1 pt-1 pb-1";
  header.innerHTML = `
    <span>${currentDay.day_info}</span>
    <span>${filteredLessons.length} пар</span>
  `;
  container.appendChild(header);

  if (filteredLessons.length === 0) {
    const empty = document.createElement("div");
    empty.className = "py-12 text-center text-xs text-slate-400 space-y-1";
    empty.innerHTML = `
      <p class="text-base font-bold text-slate-600 dark:text-slate-300">Пар нет 🎉</p>
      <p>Для выбранной подгруппы на этот день занятий не запланировано</p>
    `;
    container.appendChild(empty);
    return;
  }

  // Список пар
  const list = document.createElement("div");
  list.className = "space-y-1.5";

  filteredLessons.forEach((lesson) => {
    const bell = BELL_SCHEDULE.find((b) => b.num === lesson.number);
    const timeStr = bell ? bell.timeStr : `Пара ${lesson.number}`;

    const row = document.createElement("div");
    row.className = "lesson-row";

    // Цвет полоски: изумруд для 1 п/г, янтарь для 2 п/г, индиго для всех
    const subClass = lesson.subgroup === 1 ? "sub-1" : lesson.subgroup === 2 ? "sub-2" : "";

    // Бейдж подгруппы если она разделена
    let subTag = "";
    if (lesson.subgroup === 1) {
      subTag = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">1 п/г</span>`;
    } else if (lesson.subgroup === 2) {
      subTag = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">2 п/г</span>`;
    }

    row.innerHTML = `
      <div class="lesson-bar ${subClass}"></div>

      <!-- Время и номер пары -->
      <div class="min-w-[70px] text-left pt-0.5">
        <span class="block text-xs font-bold text-slate-900 dark:text-white leading-none">${timeStr.split("–")[0].trim()}</span>
        <span class="block text-[10px] font-medium text-slate-400 mt-1">${timeStr.split("–")[1]?.trim() || ""}</span>
        <span class="inline-block text-[9px] font-bold uppercase tracking-wider text-indigo-500 mt-1">№${lesson.number} пара</span>
      </div>

      <!-- Основная инфа: предмет, кабинет, препод -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-1 mb-1">
          <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-snug">
            ${lesson.subject}
          </h4>
          ${subTag}
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          ${lesson.room ? `<span class="font-bold text-slate-700 dark:text-slate-200">каб. ${lesson.room}</span>` : ""}
          ${lesson.teacher ? `<span>• ${lesson.teacher}</span>` : ""}
        </div>
      </div>
    `;

    list.appendChild(row);
  });

  container.appendChild(list);
}

// ─────────────────────────────────────────────
// 5. Компактная статусная строка (Текущая пара)
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
  if (!todayData) {
    bar.classList.add("hidden");
    return;
  }

  const todayLessons = todayData.lessons.filter((l) => {
    if (state.activeSubgroup === 0) return true;
    return l.subgroup === 0 || l.subgroup === state.activeSubgroup;
  });

  if (todayLessons.length === 0) {
    bar.classList.add("hidden");
    return;
  }

  let currentLesson = null;
  let nextLesson = null;
  let isBreak = false;
  let secondsRemaining = 0;

  for (const bell of BELL_SCHEDULE) {
    const lesson = todayLessons.find((l) => l.number === bell.num);
    if (!lesson) continue;

    if (currentMinutes >= bell.start && currentMinutes < bell.end) {
      currentLesson = lesson;
      const endSec = bell.end * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, endSec - nowSec);
      break;
    }

    if (currentMinutes < bell.start && currentMinutes >= bell.start - 30) {
      nextLesson = lesson;
      isBreak = true;
      const startSec = bell.start * 60;
      const nowSec = currentMinutes * 60 + currentSeconds;
      secondsRemaining = Math.max(0, startSec - nowSec);
      break;
    }
  }

  if (currentLesson) {
    bar.classList.remove("hidden");
    bar.className = "px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    bar.innerHTML = `
      <div class="flex items-center gap-1.5 truncate">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-bold">Идёт ${currentLesson.number} пара:</span>
        <span class="truncate">${currentLesson.subject} ${currentLesson.room ? `(каб. ${currentLesson.room})` : ""}</span>
      </div>
      <span class="font-mono font-bold whitespace-nowrap pl-2">${mins}м ${secs < 10 ? "0" : ""}${secs}с</span>
    `;
  } else if (isBreak && nextLesson) {
    bar.classList.remove("hidden");
    bar.className = "px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    bar.innerHTML = `
      <div class="flex items-center gap-1.5 truncate">
        <span class="w-2 h-2 rounded-full bg-amber-500"></span>
        <span class="font-bold">Перемена:</span>
        <span class="truncate">скоро ${nextLesson.number} пара ${nextLesson.subject}</span>
      </div>
      <span class="font-mono font-bold whitespace-nowrap pl-2">до пары ${mins}м ${secs < 10 ? "0" : ""}${secs}с</span>
    `;
  } else {
    bar.classList.add("hidden");
  }
}

// ─────────────────────────────────────────────
// 6. Подгруппы [Все] [1] [2]
// ─────────────────────────────────────────────
function setSubgroup(sg) {
  state.activeSubgroup = sg;
  localStorage.setItem("my_schedule_subgroup", sg);
  updateSubgroupUI();
  renderDaySchedule();
}

function updateSubgroupUI() {
  [0, 1, 2].forEach((num) => {
    const btn = document.getElementById(`sg-${num}`);
    if (btn) {
      if (num === state.activeSubgroup) {
        btn.classList.add("active-pill");
      } else {
        btn.classList.remove("active-pill");
      }
    }
  });
}

// ─────────────────────────────────────────────
// 7. Тема оформления
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
// 8. Настройки звонков
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
}

function closeBellSettings() {
  document.getElementById("bell-modal")?.classList.add("hidden");
}

function saveBellSettings() {
  const newBells = [];
  for (let i = 1; i <= 6; i++) {
    const startInput = document.getElementById(`bell-start-${i}`);
    const endInput = document.getElementById(`bell-end-${i}`);
    if (startInput && endInput) {
      newBells.push({
        num: i,
        startStr: startInput.value,
        endStr: endInput.value,
      });
    }
  }

  localStorage.setItem("my_schedule_bells", JSON.stringify(newBells));
  BELL_SCHEDULE = loadBellSchedule();
  closeBellSettings();
  renderDaySchedule();
}

function resetDefaultBells() {
  localStorage.removeItem("my_schedule_bells");
  BELL_SCHEDULE = loadBellSchedule();
  openBellSettings();
  renderDaySchedule();
}

function showLoader(show) {
  const loader = document.getElementById("schedule-loader");
  if (loader) loader.classList.toggle("hidden", !show);
}
