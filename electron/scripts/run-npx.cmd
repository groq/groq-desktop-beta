@echo off
REM Windows script for running NPX

REM Add common Node.js paths to PATH
SET "PATH=%USERPROFILE%\.nvm\v23.8.0\bin;%USERPROFILE%\.nvm\v20\bin;%USERPROFILE%\.nvm\v18\bin;%USERPROFILE%\.nvm\v16\bin;%USERPROFILE%\.nvm\current\bin;%PATH%"

REM Print debugging information
echo Running npx with PATH: %PATH%
where node 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Node.js executable not found in PATH
  exit /b 1
)

where npx 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: NPX executable not found in PATH
  exit /b 1
)

REM Run npx with the arguments passed to this script
npx %*