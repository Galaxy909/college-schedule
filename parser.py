"""
parser.py — Супер-парсер расписания с дисковым кэшем! 🕵️‍♂️

Сервер колледжа иногда отвечает по 20 секунд, поэтому наш парсер:
1. Имеет увеличенный таймаут (60 сек).
2. Использует заголовок User-Agent (как настоящий браузер).
3. Сохраняет ответы на диск в папку cache/ — благодаря этому сайт открывается
   МГНОВЕННО (за доли секунды), а не ждёт каждый раз по полминуты!
"""

import os
import json
import time
import sys
from typing import List, Dict, Any
import httpx
from bs4 import BeautifulSoup

# Настройка Windows консоли для нормального вывода русского текста
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "https://mmpkmlz-joomla.tw1.ru"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Заголовок настоящего браузера (чтобы сервер колледжа не тормозил запрос)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
}


def _read_disk_cache(filename: str, max_age_seconds: int = 1800) -> Any:
    """Читает данные из файла кэша, если он свежее max_age_seconds (30 минут)."""
    filepath = os.path.join(CACHE_DIR, filename)
    if os.path.exists(filepath):
        try:
            mtime = os.path.getmtime(filepath)
            # Если файл не старый
            if time.time() - mtime < max_age_seconds:
                with open(filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
    return None


def _write_disk_cache(filename: str, data: Any):
    """Сохраняет данные на диск."""
    filepath = os.path.join(CACHE_DIR, filename)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка записи кэша: {e}")


def get_groups() -> List[Dict[str, str]]:
    """
    Получить список всех групп колледжа.
    Кэш на 24 часа (86400 сек) — группы не меняются каждый час.
    """
    cached = _read_disk_cache("groups.json", max_age_seconds=86400)
    if cached:
        return cached

    url = f"{BASE_URL}/cg.htm"
    try:
        # Ставим таймаут 60 сек, так как сервер колледжа медленный
        with httpx.Client(timeout=60.0, headers=HEADERS) as client:
            response = client.get(url)
            response.encoding = "utf-8"
            soup = BeautifulSoup(response.text, "html.parser")

            groups = []
            links = soup.find_all("a", class_="z0")
            for link in links:
                group_name = link.text.strip()
                group_file = link.get("href", "").strip()
                if group_name and group_file:
                    groups.append({
                        "id": group_file,
                        "name": group_name
                    })

            if groups:
                _write_disk_cache("groups.json", groups)
                return groups
    except Exception as e:
        print(f"⚠️ Ошибка при загрузке групп с сайта: {e}")

    # Если загрузка не удалась, но есть старый кэш — отдаем его!
    old_cache = _read_disk_cache("groups.json", max_age_seconds=99999999)
    if old_cache:
        return old_cache

    return []


def get_schedule(group_file: str) -> Dict[str, Any]:
    """
    Получить расписание для конкретной группы (например, "cg8.htm").
    Кэш на 4 часа (14400 сек).
    """
    cache_name = f"schedule_{group_file}.json"
    cached = _read_disk_cache(cache_name, max_age_seconds=14400)
    if cached:
        return cached

    url = f"{BASE_URL}/{group_file}"
    try:
        with httpx.Client(timeout=60.0, headers=HEADERS) as client:
            response = client.get(url)
            response.encoding = "utf-8"
            soup = BeautifulSoup(response.text, "html.parser")

            h1 = soup.find("h1")
            group_name = h1.text.replace("Группа:", "").strip() if h1 else group_file

            ref = soup.find("div", class_="ref")
            updated_at = ref.text.strip() if ref else ""

            table = soup.find("table", class_="inf")
            if not table:
                return {"group": group_name, "updated_at": updated_at, "days": []}

            days_data = []
            current_day = None

            for row in table.find_all("tr"):
                if row.find("td", class_="hd0"):
                    continue

                cells = row.find_all("td")
                if not cells:
                    continue

                first_cell = cells[0]
                if first_cell.get("rowspan"):
                    day_text = first_cell.get_text(separator=" ").strip()
                    current_day = {
                        "day_info": day_text,
                        "lessons": []
                    }
                    days_data.append(current_day)
                    lesson_num_cell = cells[1]
                    lesson_cells = cells[2:]
                else:
                    lesson_num_cell = cells[0]
                    lesson_cells = cells[1:]

                lesson_num = lesson_num_cell.text.strip()
                if not lesson_num.isdigit():
                    continue

                subgroup_index = 1
                for cell in lesson_cells:
                    if "nul" in cell.get("class", []):
                        subgroup_index += 1
                        continue

                    subject_tag = cell.find("a", class_="z1")
                    room_tag = cell.find("a", class_="z2")
                    teacher_tag = cell.find("a", class_="z3")
                    colspan = int(cell.get("colspan", 1))

                    if subject_tag:
                        subject_name = subject_tag.text.strip()
                        room_name = room_tag.text.strip() if room_tag else ""
                        teacher_name = teacher_tag.text.strip() if teacher_tag else ""

                        subgroup = 0 if colspan >= 2 else subgroup_index

                        if current_day:
                            current_day["lessons"].append({
                                "number": int(lesson_num),
                                "subject": subject_name,
                                "room": room_name,
                                "teacher": teacher_name,
                                "subgroup": subgroup
                            })

                    subgroup_index += 1

            result = {
                "group": group_name,
                "updated_at": updated_at,
                "days": days_data
            }

            if days_data:
                _write_disk_cache(cache_name, result)

            return result
    except Exception as e:
        print(f"⚠️ Ошибка при парсинге расписания {group_file}: {e}")
        old_cache = _read_disk_cache(cache_name, max_age_seconds=99999999)
        if old_cache:
            return old_cache

    return {"group": group_file, "updated_at": "", "days": []}


if __name__ == "__main__":
    print("🚀 Тестируем парсер...")
    groups = get_groups()
    print(f"✅ Найдено групп: {len(groups)}")
    if groups:
        print(f"Первая группа: {groups[0]}")
        sched = get_schedule(groups[0]["id"])
        print(f"Успешно спарсили расписание: {sched['group']}, дней: {len(sched['days'])}")
