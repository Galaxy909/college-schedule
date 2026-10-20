@echo off
chcp 65001 > nul
title Расписание Колледжа — Сервер
echo 🚀 Запускаем сервер расписания...
echo 🌐 Сайт доступен по адресу: http://127.0.0.1:8000
echo.
echo Для остановки сервера закрой это окно или нажми Ctrl + C.
echo.

cd /d "%~dp0"
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000

pause
