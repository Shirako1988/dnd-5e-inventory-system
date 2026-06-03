@echo off
echo === NPM INSTALL ===
npm install || goto error

echo === BUILD ===
npm run build || goto error

echo === GIT STATUS ===
git status

echo.
echo Pruefe oben kurz, ob nur gewollte Dateien geaendert sind.
pause

echo === GIT ADD ===
git add . || goto error

echo === COMMIT ===
git commit -m "%*" || goto error

echo === PUSH ===
git push || goto error

echo.
echo Fertig.
goto end

:error
echo.
echo FEHLER. Vorgang wurde abgebrochen.
pause

:end