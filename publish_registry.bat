@echo off
set "PYTHONPATH="
set "COMFY_EXE=D:\StabilityMatrix\Data\Packages\ComfyUI\venv\Scripts\comfy.exe"

echo ========================================================
echo   ComfyUI-Bada-Utils: Comfy Registry Publisher
echo ========================================================
echo.

if not exist "%COMFY_EXE%" (
    echo [ERROR] Comfy CLI not found: %COMFY_EXE%
    pause
    exit /b 1
)

echo [INFO] Publishing to Comfy Registry...
echo [INFO] A browser window will open for GitHub authorization.
echo.

"%COMFY_EXE%" node publish

echo.
pause
