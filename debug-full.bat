@echo off
echo 正在以完整调试模式启动BTC价格浮动窗口...
set NODE_ENV=development
set DEBUG=electron:*
npx electron . --inspect=9229 --trace-warnings 