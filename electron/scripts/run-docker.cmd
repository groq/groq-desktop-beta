@echo off
REM Windows script for running Docker

REM Print debugging information
echo Running docker with PATH: %PATH%
where docker 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Docker executable not found in PATH
  exit /b 1
)

REM Use the docker executable with all arguments
docker %*