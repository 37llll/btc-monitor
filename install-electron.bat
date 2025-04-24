@echo off
echo 正在以管理员权限安装Electron...
powershell.exe -Command "Start-Process cmd -ArgumentList '/c cd %~dp0 && npm install electron --save-dev --no-bin-links' -Verb RunAs"
echo 安装命令已发送，请在弹出的管理员窗口中确认操作。 