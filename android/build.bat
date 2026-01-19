@echo off
REM Build script for Windows
REM This script builds the Connectty Android app

echo ========================================
echo Connectty Android Build Script
echo ========================================
echo.

REM Check if Java is installed
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is not installed or not in PATH
    echo Please install JDK 17 or later
    echo Download from: https://adoptium.net/
    exit /b 1
)

echo Java found!
echo.

REM Check Android SDK
if "%ANDROID_HOME%"=="" (
    echo WARNING: ANDROID_HOME not set
    echo Set it to your Android SDK location, e.g.:
    echo set ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
    echo.
    echo Attempting to use default location...
    set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)

if not exist "%ANDROID_HOME%\platform-tools" (
    echo ERROR: Android SDK not found at %ANDROID_HOME%
    echo Please install Android Studio or Android SDK Command Line Tools
    exit /b 1
)

echo Android SDK found at: %ANDROID_HOME%
echo.

REM Make gradlew.bat executable (already should be)
echo Building APK...
echo.

call gradlew.bat assembleDebug

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    exit /b 1
)

echo.
echo ========================================
echo Build successful!
echo ========================================
echo.
echo APK location: app\build\outputs\apk\debug\app-debug.apk
echo.
echo To install on device:
echo   adb install app\build\outputs\apk\debug\app-debug.apk
echo.

pause
