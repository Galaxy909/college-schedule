/**
 * app.js — Логика расписания с автоматическим выводом 1 и 2 подгрупп друг под другом
 */

const state = {
  allGroups: [],
  selectedGroupId: localStorage.getItem("my_schedule_group") || null,
  currentSchedule: null,
  selectedDayIndex: 0,
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
// 3. Календарная лента дней (Пн, Вт, Ср...)
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
// 4. Список пар: подгруппы друг под другом, время внизу
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
  list.className = "space-y-2.5";

  pairNumbers.forEach((num) => {
    const pairLessons = pairsMap.get(num);
    const bell = BELL_SCHEDULE.find((b) => b.num === num);
    const timeStr = bell ? bell.timeStr : `Пара ${num}`;

    const card = document.createElement("div");
    card.className = "lesson-card";

    // СЛУЧАЙ А: Пара общая (один предмет для всей группы)
    if (pairLessons.length === 1 && pairLessons[0].subgroup === 0) {
      const lesson = pairLessons[0];
      card.innerHTML = `
        <div class="mb-1.5">
          <span class="text-xs font-bold text-indigo-500 dark:text-indigo-400">Пара № ${lesson.number}</span>
        </div>
        <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-snug">
          ${lesson.subject}
        </h4>
        <div class="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
          ${lesson.room ? `<span class="font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">каб. ${lesson.room}</span>` : ""}
          ${lesson.teacher ? `<span>👤 ${lesson.teacher}</span>` : ""}
        </div>
        <!-- ВРЕМЯ ВНИЗУ ПОД ПРЕДМЕТОМ -->
        <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <span class="time-badge">
            <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
            ${timeStr}
          </span>
        </div>
      `;
    } else {
      // СЛУЧАЙ Б: Пара разделена на 1 и 2 подгруппы (выводим друг под другом)
      // Сортируем: 1 подгруппа сверху, 2 подгруппа под ней
      const sortedSubLessons = [...pairLessons].sort((a, b) => a.subgroup - b.subgroup);

      let subBlocksHTML = "";
      sortedSubLessons.forEach((l) => {
        const isSub1 = l.subgroup === 1;
        const subClass = isSub1 ? "sub-1" : "sub-2";
        const subTitle = isSub1 ? "1 подгруппа" : "2 подгруппа";
        const badgeColor = isSub1 ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10";

        subBlocksHTML += `
          <div class="subgroup-line ${subClass} space-y-1">
            <div class="flex items-center justify-between gap-1">
              <span class="text-[11px] font-extrabold px-1.5 py-0.5 rounded ${badgeColor} uppercase tracking-wider">${subTitle}</span>
              ${l.room ? `<span class="font-bold text-xs text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">каб. ${l.room}</span>` : ""}
            </div>
            <div class="font-bold text-sm text-slate-900 dark:text-white leading-snug">${l.subject}</div>
            ${l.teacher ? `<div class="text-xs text-slate-500 dark:text-slate-400 font-medium">👤 ${l.teacher}</div>` : ""}
          </div>
        `;
      });

      card.innerHTML = `
        <div class="mb-2">
          <span class="text-xs font-bold text-indigo-500 dark:text-indigo-400">Пара № ${num}</span>
        </div>
        <div class="space-y-2">
          ${subBlocksHTML}
        </div>
        <!-- ВРЕМЯ ВНИЗУ ПОД ПРЕДМЕТАМИ -->
        <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <span class="time-badge">
            <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
            ${timeStr}
          </span>
        </div>
      `;
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

  if (currentLessons.length > 0) {
    bar.classList.remove("hidden");
    bar.className = "px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;

    let textDesc = "";
    if (currentLessons.length === 1) {
      const l = currentLessons[0];
      textDesc = `${l.subject} ${l.room ? `(каб. ${l.room})` : ""}`;
    } else {
      textDesc = currentLessons.map((l) => `${l.subgroup} п/г: ${l.subject}`).join(" | ");
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
    if (nextLessons.length === 1) {
      textDesc = nextLessons[0].subject;
    } else {
      textDesc = nextLessons.map((l) => `${l.subgroup} п/г: ${l.subject}`).join(" | ");
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
// 6. Тема оформления
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
// 7. Настройки звонков
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
