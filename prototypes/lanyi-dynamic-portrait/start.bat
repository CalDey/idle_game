@echo off
cd /d "%~dp0"
echo 打开 http://127.0.0.1:8765/  (Ctrl+C 停止)
py -m http.server 8765 --bind 127.0.0.1 || python -m http.server 8765 --bind 127.0.0.1
pause
