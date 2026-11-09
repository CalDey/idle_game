#!/bin/sh
# 若双击 index.html 空白，运行本脚本后访问 http://127.0.0.1:8765/
cd "$(dirname "$0")"
echo "打开 http://127.0.0.1:8765/  （Ctrl+C 停止）"
python3 -m http.server 8765 --bind 127.0.0.1 || python -m http.server 8765 --bind 127.0.0.1
