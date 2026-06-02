@echo off
cd /d "%~dp0"
npm install --registry=https://registry.npmjs.org/
npm run dev
pause
