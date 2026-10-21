@echo off
chcp 65001 > nul
title Деплой на сервер (Render)

echo ======================================================
echo    🚀 ОТПРАВКА ИЗМЕНЕНИЙ НА СЕРВЕР (Render / GitHub)
echo ======================================================
echo.

cd /d "%~dp0"

:: Проверяем, есть ли изменения в файлах
for /f "tokens=*" %%i in ('git status --porcelain') do set HAS_CHANGES=1

if not defined HAS_CHANGES (
    echo [i] Новых изменений в файлах нет. На сервере уже актуальная версия!
    echo.
    goto end
)

echo [1/3] Добавляем измененные файлы...
git add .

set /p MSG="Введи описание обновления (нажми Enter для авто): "
if "%MSG%"=="" set MSG=update: обновление сайта и расписания

echo [2/3] Создаем коммит: "%MSG%"...
git commit -m "%MSG%"

echo [3/3] Отправляем на GitHub (Render автоматически обновит сайт)...

if exist ".github_token" (
    set /p GH_TOKEN=<.github_token
)

if defined GH_TOKEN (
    git remote set-url origin https://Galaxy909:%GH_TOKEN%@github.com/Galaxy909/college-schedule.git
    git push origin main
    git remote set-url origin https://github.com/Galaxy909/college-schedule.git
) else (
    git push origin main
)

echo.
echo ======================================================
echo  ✅ ВСЕ ИЗМЕНЕНИЯ УСПЕШНО ОТПРАВЛЕНЫ НА СЕРВЕР!
echo  Render автоматически обновит сайт через 1-2 минуты.
echo ======================================================

:end
echo.
pause
