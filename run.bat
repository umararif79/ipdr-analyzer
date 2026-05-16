@echo off
setlocal enabledelayedexpansion

:menu
cls
echo ====================================================
echo   IPDR Log Analyzer - Launch Menu
echo ====================================================
echo.
echo  1. Run Everything (Frontend + Backend)
echo  2. Run Backend Only
echo  3. Run Frontend Only
echo  4. Exit
echo.
echo ====================================================
set /p choice="Select an option (1-4): "

if "%choice%"=="1" goto run_all
if "%choice%"=="2" goto run_backend
if "%choice%"=="3" goto run_frontend
if "%choice%"=="4" exit
echo Invalid choice, please try again.
pause
goto menu

:run_all
echo Starting everything...
npm start
pause
goto menu

:run_backend
echo Starting backend server...
npm run server
pause
goto menu

:run_frontend
echo Starting frontend dev server...
npm run dev
pause
goto menu
