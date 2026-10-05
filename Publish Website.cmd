@echo off
setlocal EnableExtensions
title Publish Market Reader as a website
cd /d "%~dp0"
set "VERCEL=npx --yes vercel@latest"

where node >nul 2>nul || ( echo Node.js is not installed. Install it from https://nodejs.org first. & pause & exit /b 1 )

echo.
echo   PUBLISH MARKET READER AS A WEBSITE (Vercel, free Hobby plan)
echo.
echo   Step 1 of 3: log in and link the project.
echo   A browser page opens for you to log in to Vercel. Then answer:
echo     Set up and deploy?                         Y
echo     Which scope?                               your account (press Enter)
echo     Link to existing project?                  N   (Y if you published before)
echo     What's your project's name?                market-reader
echo     In which directory is your code located?   ./apps/web
echo     Want to modify these settings?             N
echo.
pause
call %VERCEL% link
if errorlevel 1 ( echo. & echo Linking did not finish. Run this file again. & pause & exit /b 1 )

echo.
echo   Step 2 of 3: copying your market-data keys (Finnhub, Massive, CoinGecko, Tiingo) to Vercel (the values are not shown).
if exist "apps\web\.env.local" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("apps\web\.env.local") do (
    if not "%%B"=="" (
      if /i "%%A"=="FINNHUB_API_KEY" call :addkey %%A "%%B"
      if /i "%%A"=="MASSIVE_API_KEY" call :addkey %%A "%%B"
      if /i "%%A"=="COINGECKO_API_KEY" call :addkey %%A "%%B"
      if /i "%%A"=="TIINGO_API_KEY" call :addkey %%A "%%B"
    )
  )
) else (
  echo   No apps\web\.env.local found: the site will use demo prices for US stocks.
)

echo.
echo   Step 3 of 3: building and publishing. This takes 2 to 4 minutes...
call %VERCEL% deploy --prod > "%TEMP%\market-reader-url.txt"
if errorlevel 1 ( echo. & echo Publishing failed. The error is shown above. & pause & exit /b 1 )
set /p URL=<"%TEMP%\market-reader-url.txt"
<nul set /p "=%URL%" | clip
echo.
echo   DONE. Market Reader is online at:
echo.
echo       %URL%
echo.
echo   The address is copied to your clipboard. Opening it now...
start "" "%URL%"
pause
exit /b 0

:addkey
<nul set /p "=%~2" > "%TEMP%\mr-key.txt"
call %VERCEL% env rm %1 production --yes >nul 2>nul
call %VERCEL% env add %1 production < "%TEMP%\mr-key.txt" >nul 2>nul && echo     %1 added || echo     %1 could not be added; add it in Vercel under Settings ^> Environment Variables
del "%TEMP%\mr-key.txt" >nul 2>nul
exit /b 0
