@echo off
setlocal
title Market Reader price check
cd /d "%~dp0"
set "OUT=%~dp0price-check"
if not exist "%OUT%" mkdir "%OUT%"
set "BASE=http://localhost:3000"

curl -s -o nul -m 5 %BASE%/api/status
if errorlevel 1 (
  echo Market Reader is not running yet, starting it...
  start "" "%SystemRoot%\System32\wscript.exe" "%~dp0Market Reader.js"
  for /l %%i in (1,1,40) do (
    timeout /t 3 /nobreak >nul
    curl -s -o nul -m 5 %BASE%/api/status && goto :up
  )
  echo Market Reader did not start. & pause & exit /b 1
)
:up
echo Checking prices. This takes about 30 seconds...
> "%OUT%\checked-at.txt" echo %date% %time%
curl -s -m 60 "%BASE%/api/status?check=1" > "%OUT%\status.json"
curl -s -m 60 "%BASE%/api/quotes?symbols=AAPL,MSFT,NVDA,AMZN,GOOGL,TSLA,META,SPY,QQQ,BRK.B,JPM,BTC-USD,ETH-USD,EUR/USD" > "%OUT%\quotes.json"
curl -s -m 60 "%BASE%/api/quote/AAPL" > "%OUT%\quote-AAPL.json"
curl -s -m 60 "%BASE%/api/market-status" > "%OUT%\market-status.json"
curl -s -m 60 "%BASE%/api/search?q=berkshire" > "%OUT%\search.json"
curl -s -N -m 12 "%BASE%/api/stream?symbols=AAPL,MSFT,NVDA,SPY" > "%OUT%\stream.txt"
curl -s -m 60 -o "%OUT%\quote-page-AAPL.html" "%BASE%/quote/AAPL"
curl -s -m 60 -X POST "%BASE%/api/stripe/checkout" > "%OUT%\pro-checkout.json"
curl -s -m 60 "%BASE%/api/history/AAPL?range=5Y" > "%OUT%\history-AAPL-5Y.json"
curl -s -m 60 "%BASE%/api/history/AAPL?range=MAX" > "%OUT%\history-AAPL-MAX.json"
curl -s -m 60 "%BASE%/api/history/BTC-USD?range=MAX" > "%OUT%\history-BTC-MAX.json"
curl -s -m 60 "%BASE%/api/history/EURUSD?range=MAX" > "%OUT%\history-EURUSD-MAX.json"
curl -s -m 60 "%BASE%/api/history/BNB-USD?range=5Y" > "%OUT%\history-BNB-5Y.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=1D&lookback=200" > "%OUT%\chart-AAPL-1D-lb200.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=5D&lookback=200" > "%OUT%\chart-AAPL-5D-lb200.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=1M&lookback=200" > "%OUT%\chart-AAPL-1M-lb200.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=6M&lookback=200" > "%OUT%\chart-AAPL-6M-lb200.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=1Y&lookback=200" > "%OUT%\chart-AAPL-1Y-lb200.json"
curl -s -m 90 "%BASE%/api/history/AAPL?range=5Y&lookback=50" > "%OUT%\chart-AAPL-5Y-lb50.json"
curl -s -m 90 "%BASE%/api/history/BTC-USD?range=1D&lookback=200" > "%OUT%\chart-BTC-1D-lb200.json"
curl -s -m 90 "%BASE%/api/history/BTC-USD?range=1M&lookback=100" > "%OUT%\chart-BTC-1M-lb100.json"
curl -s -m 90 "%BASE%/api/history/BTC-USD?range=1Y&lookback=200" > "%OUT%\chart-BTC-1Y-lb200.json"
curl -s -m 90 "%BASE%/api/history/EURUSD?range=1Y&lookback=50" > "%OUT%\chart-EURUSD-1Y-lb50.json"
start "" "%BASE%/quote/AAPL"
echo Done. Results are in the price-check folder.
timeout /t 5 >nul
