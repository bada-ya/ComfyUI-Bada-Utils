@echo off
chcp 65001 > nul
echo ========================================================
echo   🌊 ComfyUI-Bada-Utils Junction / Symlink Installer
echo ========================================================
echo.

set CURRENT_DIR=%~dp0
set CURRENT_DIR=%CURRENT_DIR:~0,-1%

set TARGET_COMFY=
if exist "..\..\custom_nodes" (
    set TARGET_COMFY=..\..\custom_nodes\ComfyUI-Bada-Utils
) else if exist "..\custom_nodes" (
    set TARGET_COMFY=..\custom_nodes\ComfyUI-Bada-Utils
)

if defined TARGET_COMFY (
    echo [INFO] Detected ComfyUI custom_nodes folder at %TARGET_COMFY%
    if exist "%TARGET_COMFY%" (
        echo [INFO] Existing junction found. Removing old junction...
        rmdir "%TARGET_COMFY%"
    )
    echo [INFO] Creating junction link...
    mklink /J "%TARGET_COMFY%" "%CURRENT_DIR%"
    echo.
    echo [SUCCESS] ComfyUI-Bada-Utils successfully linked!
    goto done
)

echo [INPUT] Could not automatically find ComfyUI directory.
set /p COMFY_PATH="Please enter your ComfyUI root directory path (e.g. D:\ComfyUI): "

if not exist "%COMFY_PATH%\custom_nodes" (
    echo.
    echo [ERROR] "%COMFY_PATH%\custom_nodes" does not exist. Please check the path.
    pause
    exit /b 1
)

set TARGET_COMFY=%COMFY_PATH%\custom_nodes\ComfyUI-Bada-Utils

if exist "%TARGET_COMFY%" (
    echo [INFO] Existing junction found. Removing old junction...
    rmdir "%TARGET_COMFY%"
)

echo [INFO] Creating junction link: %TARGET_COMFY% -> %CURRENT_DIR%
mklink /J "%TARGET_COMFY%" "%CURRENT_DIR%"
echo.
echo [SUCCESS] ComfyUI-Bada-Utils successfully installed to custom_nodes!

:done
echo.
echo Please restart or launch ComfyUI to enjoy ComfyUI-Bada-Utils suite!
echo ========================================================
pause
