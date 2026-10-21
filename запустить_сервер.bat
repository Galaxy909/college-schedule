@echo off
chcp 65001 > nul
title Локальный сервер расписания

echo ======================================================
echo    💻 ЗАПУСК ЛОКАЛЬНОГО СЕРВЕРА
echo ======================================================
echo.

cd /d "%~dp0"

echo [i] Открываем браузер на http://localhost:8000 ...
start http://localhost:8000

echo [i] Запускаем сервер FastAPI...
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause
