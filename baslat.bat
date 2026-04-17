@echo off
cd /d "%~dp0"
echo.
echo === SiteBot - Lokal Test ===
echo.

if "%ANTHROPIC_API_KEY%"=="" (
  echo [!] ANTHROPIC_API_KEY ayarli degil!
  echo     Lutfen API anahtarini gir:
  set /p ANTHROPIC_API_KEY=API Key:
)

call npm install --silent 2>nul
echo [OK] Paketler hazir
echo.
echo Sunucu baslatiliyor...
echo Tarayici aciliyor: http://localhost:4000
timeout /t 2 /nobreak >nul
start http://localhost:4000
node server.js
pause
