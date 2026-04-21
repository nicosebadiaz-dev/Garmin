@echo off
cd /d "%~dp0"

if not exist venv (
    echo Primera vez detectada, ejecutando instalacion...
    call install.bat
)

if not exist .env (
    copy .env.example .env
    notepad .env
    pause
)

echo Iniciando Entrenador Garmin...
venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning
