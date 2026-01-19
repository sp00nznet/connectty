@echo off
REM Release build script for Windows
REM Builds a release APK (requires signing configuration)

echo ========================================
echo Connectty Android Release Build
echo ========================================
echo.

REM Check if Java is installed
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is not installed or not in PATH
    exit /b 1
)

echo Building release APK...
echo.

call gradlew.bat assembleRelease

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    exit /b 1
)

echo.
echo ========================================
echo Release build successful!
echo ========================================
echo.
echo APK location: app\build\outputs\apk\release\app-release.apk
echo.
echo Note: The APK is signed with the debug key by default
echo For production, configure proper signing in app\build.gradle.kts
echo.

pause
