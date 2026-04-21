@echo off
cd /d "%~dp0"
echo === Instalando Entrenador Garmin ===

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no esta instalado. Instala Python 3.11+ desde python.org
    pause
    exit /b 1
)

if not exist venv (
    echo Creando entorno virtual...
    python -m venv venv
)

echo Instalando dependencias...
venv\Scripts\pip install -r requirements.txt

if not exist .env (
    echo Creando archivo .env desde ejemplo...
    copy .env.example .env
    echo.
    echo IMPORTANTE: Edita el archivo .env con tus credenciales de Garmin Connect
    echo Abriendo .env para editar...
    notepad .env
)

echo.
echo Instalacion completada!
echo Para iniciar la app ejecuta start.bat o start.vbs
pause
