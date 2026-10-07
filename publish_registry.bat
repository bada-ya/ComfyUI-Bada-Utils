@echo off
chcp 65001 > nul
set "PYTHONPATH="
set "COMFY_EXE=D:\utill\AI\Data\Packages\ComfyUI_new\venv\Scripts\comfy.exe"

echo ========================================================
echo   ComfyUI-Bada-Utils: Comfy Registry Publisher
echo ========================================================
echo.

if not exist "%COMFY_EXE%" (
    echo [ERROR] Comfy CLI not found at %COMFY_EXE%
    pause
    exit /b 1
)

echo Please paste your Comfy Registry API Key (pat-...) and press Enter:
set /p REG_TOKEN="API Key: "

if "%REG_TOKEN%"=="" (
    echo [ERROR] API Key was not provided.
    pause
    exit /b 1
)

echo.
echo [INFO] Publishing v1.0.3 to Comfy Registry...
"%COMFY_EXE%" node publish --token "%REG_TOKEN%"

echo.
pause
