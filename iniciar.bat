@echo off
rem Abre o app Voos em Reais e Pontos. De dois cliques neste arquivo.
title Voos em Reais e Pontos
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
echo.
echo O app parou. Se nao foi voce que fechou, tire um print desta janela e mande para o Claude.
pause
