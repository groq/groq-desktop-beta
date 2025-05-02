@echo off
REM Windows script for running Deno

REM Print debugging information
echo Running deno with PATH: %PATH%
where deno 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Deno executable not found in PATH: %PATH% 1>&2
  exit /b 1
)

REM Execute deno with the arguments passed to this script
deno %*