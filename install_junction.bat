@echo off
chcp 65001 > nul
echo ========================================================
echo   ⚓ ComfyUI-Bada-Utils Junction / Symlink Installer
echo ========================================================
echo.

set CURRENT_DIR=%~dp0
set CURRENT_DIR=%CURRENT_DIR:~0,-1%

set TARGET_COMFY=D:\StabilityMatrix\Data\Packages\ComfyUI\custom_nodes\ComfyUI-Bada-Utils

if exist "%TARGET_COMFY%" (
    echo [INFO] Existing ComfyUI-Bada-Utils found at %TARGET_COMFY%
    echo [INFO] Removing old directory / junction...
    rmdir /S /Q "%TARGET_COMFY%"
)

echo [INFO] Creating junction: %TARGET_COMFY% -^> %CURRENT_DIR%
mklink /J "%TARGET_COMFY%" "%CURRENT_DIR%"

echo.
if exist "%TARGET_COMFY%" (
    echo [SUCCESS] ComfyUI-Bada-Utils successfully linked to ComfyUI!
) else (
    echo [WARNING] Could not create junction automatically.
)

echo.
echo ========================================================
pause
