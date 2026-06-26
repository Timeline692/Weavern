@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo  Starting...
npm run dev
pause
