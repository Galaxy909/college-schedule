"""
main.py — Главный файл нашего сервера (FastAPI).

Представь это как шеф-повар в ресторане:
- Браузер (клиент) делает заказ: "Дай мне расписание группы 911!"
- Наш сервер принимает заказ, идёт на сайт колледжа (через parser.py),
  готовит чистый JSON и отдаёт браузеру.
"""

import time
import sys
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Наш парсер расписания
import parser as schedule_parser  # переименовываем чтобы не конфликтовал со встроенным "parser"

# ─────────────────────────────────────────────
#  Создаём приложение FastAPI
# ─────────────────────────────────────────────
app = FastAPI(
    title="Расписание Колледжа API",
    description="Современный API поверх расписания mmpkmlz-joomla.tw1.ru",
    version="1.0.0"
)

# CORS — разрешаем браузеру делать запросы к нашему API
# (без этого браузер блокирует запросы из другого порта)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Раздаём файлы фронтенда из папки "static"
# Это как полка в магазине: зашёл на / — получи index.html
app.mount("/static", StaticFiles(directory="static"), name="static")


# ─────────────────────────────────────────────
#  Простой кэш в памяти
#  (как блокнот: записали ответ один раз, следующие 15 минут
#   отдаём из блокнота, не бегая на сайт колледжа заново)
# ─────────────────────────────────────────────
CACHE_TTL = 15 * 60  # 15 минут в секундах
_cache: Dict[str, tuple] = {}


def get_from_cache(key: str):
    """Берём данные из кэша, если они ещё свежие."""
    entry = _cache.get(key)
    if entry:
        timestamp, data = entry
        if time.time() - timestamp < CACHE_TTL:
            return data
        del _cache[key]
    return None


def set_cache(key: str, data: Any):
    """Сохраняем данные в кэш с текущим временем."""
    _cache[key] = (time.time(), data)


# ─────────────────────────────────────────────
#  API Эндпоинты (маршруты)
# ─────────────────────────────────────────────

@app.get("/api/groups")
def api_groups():
    """
    Маршрут: GET /api/groups
    Возвращает список всех групп колледжа.
    Пример ответа:
      [{"id": "cg8.htm", "name": "911"}, {"id": "cg17.htm", "name": "921"}, ...]
    """
    cached = get_from_cache("groups")
    if cached:
        return cached

    groups = schedule_parser.get_groups()
    set_cache("groups", groups)
    return groups


@app.get("/api/schedule/{group_id:path}")
def api_schedule(group_id: str):
    """
    Маршрут: GET /api/schedule/cg8.htm
    Возвращает расписание конкретной группы на неделю.
    """
    cache_key = f"schedule:{group_id}"
    cached = get_from_cache(cache_key)
    if cached:
        return cached

    # Проверяем что группа существует
    groups = schedule_parser.get_groups()
    if not any(g["id"] == group_id for g in groups):
        raise HTTPException(status_code=404, detail=f"Группа '{group_id}' не найдена")

    schedule = schedule_parser.get_schedule(group_id)
    set_cache(cache_key, schedule)
    return JSONResponse(content=schedule)


@app.get("/")
def root():
    """Перенаправляем на index.html при заходе на главную страницу."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/index.html")


# ─────────────────────────────────────────────
#  Точка входа: запуск сервера
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 Запускаем сервер на http://127.0.0.1:8000")
    print("📖 Документация API: http://127.0.0.1:8000/docs")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
