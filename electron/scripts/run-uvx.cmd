@echo off
REM Windows script for running UVX

REM Ensure Python environment is properly set
SET PYTHONUNBUFFERED=1
SET PYTHONIOENCODING=utf-8
SET UV_NATIVE_TLS=1

REM Print debugging information
echo Running uvx with PATH: %PATH%
where uvx 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: uvx executable not found in PATH
  exit /b 1
)

REM Execute uvx with all arguments
uvx %*