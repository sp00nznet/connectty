# Complete Windows Build Guide for Connectty Android

This guide will walk you through building the Connectty Android app on Windows from scratch, even if you've never built an Android app before.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step-by-Step Installation](#step-by-step-installation)
3. [Building the App](#building-the-app)
4. [Installing on Your Phone](#installing-on-your-phone)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

You will need:
- A Windows PC (Windows 10 or 11)
- An Android device (Android 8.0+) or Android emulator
- Internet connection for downloading tools
- Approximately 5GB of free disk space

## Step-by-Step Installation

### Step 1: Install Java JDK

1. **Download JDK 17**
   - Visit: https://adoptium.net/temurin/releases/
   - Select:
     - **Operating System:** Windows
     - **Architecture:** x64
     - **Package Type:** JDK
     - **Version:** 17 (LTS)
   - Click the `.msi` download button

2. **Install JDK**
   - Run the downloaded `.msi` installer
   - Accept the license agreement
   - Use default installation path: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x`
   - Check "Add to PATH" option during installation
   - Click "Install"

3. **Verify Installation**
   - Open Command Prompt (press Win+R, type `cmd`, press Enter)
   - Type: `java -version`
   - You should see something like:
     ```
     openjdk version "17.0.x"
     ```

### Step 2: Install Android SDK

**Option A: Using Android Studio (Recommended for Beginners)**

1. **Download Android Studio**
   - Visit: https://developer.android.com/studio
   - Click "Download Android Studio"
   - Accept the terms and conditions
   - Download the `.exe` installer (approximately 1GB)

2. **Install Android Studio**
   - Run the installer
   - Choose "Standard" installation
   - Wait for the setup wizard to download components (may take 15-30 minutes)
   - Note the SDK location (usually `C:\Users\YourName\AppData\Local\Android\Sdk`)

3. **Configure SDK Components**
   - Open Android Studio
   - Click "More Actions" → "SDK Manager"
   - In "SDK Platforms" tab, check:
     - ✓ Android 14.0 (UpsideDownCake) API Level 34
   - In "SDK Tools" tab, check:
     - ✓ Android SDK Build-Tools 34
     - ✓ Android SDK Platform-Tools
     - ✓ Android SDK Tools
   - Click "Apply" and wait for downloads

**Option B: Command Line Tools Only (Smaller Download)**

1. **Download Command Line Tools**
   - Visit: https://developer.android.com/studio#command-tools
   - Scroll to "Command line tools only"
   - Download Windows version (zip file, ~150MB)

2. **Extract and Setup**
   - Create folder: `C:\Android\SDK`
   - Extract downloaded zip to `C:\Android\SDK\cmdline-tools\latest`
   - Open Command Prompt as Administrator
   - Run:
     ```cmd
     cd C:\Android\SDK\cmdline-tools\latest\bin
     sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
     ```
   - Accept licenses by typing `y` and pressing Enter

### Step 3: Set Environment Variables

1. **Open System Environment Variables**
   - Press Win+R
   - Type: `sysdm.cpl`
   - Press Enter
   - Click "Advanced" tab
   - Click "Environment Variables"

2. **Add ANDROID_HOME**
   - In "System variables" section, click "New"
   - Variable name: `ANDROID_HOME`
   - Variable value:
     - If using Android Studio: `C:\Users\YourName\AppData\Local\Android\Sdk`
     - If using Command Line Tools: `C:\Android\SDK`
   - Click "OK"

3. **Update PATH**
   - In "System variables", find "Path" and click "Edit"
   - Click "New" and add: `%ANDROID_HOME%\platform-tools`
   - Click "New" and add: `%ANDROID_HOME%\tools\bin`
   - Click "OK" on all windows

4. **Verify Environment Variables**
   - Close and reopen Command Prompt
   - Type: `echo %ANDROID_HOME%`
   - Should show your SDK path
   - Type: `adb version`
   - Should show ADB version

### Step 4: Get the Connectty Source Code

1. **Download or Clone**
   - If you have Git: `git clone https://github.com/sp00nznet/connectty.git`
   - Or download ZIP from GitHub and extract

2. **Navigate to Android Folder**
   ```cmd
   cd connectty\android
   ```

## Building the App

### Method 1: Using Build Script (Easiest)

1. **Open Command Prompt**
   - Navigate to `connectty\android` folder
   - Type: `build.bat`
   - Press Enter

2. **Wait for Build**
   - First build will download dependencies (3-10 minutes)
   - Subsequent builds are faster (1-2 minutes)
   - Build output: `app\build\outputs\apk\debug\app-debug.apk`

### Method 2: Using Gradle Directly

1. **Build Command**
   ```cmd
   gradlew.bat assembleDebug
   ```

2. **Wait for Completion**
   - Look for "BUILD SUCCESSFUL" message
   - APK location: `app\build\outputs\apk\debug\app-debug.apk`

### Method 3: Using Android Studio

1. **Open Project**
   - Launch Android Studio
   - File → Open
   - Select `connectty\android` folder
   - Wait for Gradle sync (status bar at bottom)

2. **Build APK**
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Wait for "Build successful" notification
   - Click "locate" to find the APK

## Installing on Your Phone

### Prepare Your Android Device

1. **Enable Developer Options**
   - Open Settings on your phone
   - Scroll to "About Phone"
   - Find "Build Number"
   - Tap it 7 times
   - You'll see "You are now a developer!"

2. **Enable USB Debugging**
   - Go to Settings → System → Developer Options
   - Toggle on "USB Debugging"

3. **Connect to PC**
   - Connect phone to PC via USB cable
   - On phone: Tap "Allow USB Debugging" when prompted
   - Check "Always allow from this computer"

### Install via ADB (Method 1)

1. **Verify Device Connection**
   ```cmd
   adb devices
   ```
   Should show your device serial number

2. **Install APK**
   ```cmd
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

3. **Launch App**
   - Find "Connectty" icon on your phone
   - Tap to open

### Install via File Transfer (Method 2)

1. **Copy APK to Phone**
   - Connect phone via USB
   - Open File Explorer on PC
   - Navigate to `connectty\android\app\build\outputs\apk\debug\`
   - Copy `app-debug.apk` to your phone's Downloads folder

2. **Install from Phone**
   - On phone, open Downloads folder with file manager
   - Tap `app-debug.apk`
   - Tap "Install" (may need to allow installations from unknown sources)

## Troubleshooting

### "Java not found" or "Java is not recognized"

**Problem:** Java is not in your PATH

**Solution:**
1. Find your JDK installation (usually `C:\Program Files\Eclipse Adoptium\jdk-17.x.x\bin`)
2. Add to System PATH (see Step 3 above)
3. Restart Command Prompt

### "ANDROID_HOME not set"

**Problem:** Android SDK path not configured

**Solution:**
1. Set ANDROID_HOME environment variable (see Step 3 above)
2. Use the path where you installed Android SDK
3. Restart Command Prompt

### "SDK location not found"

**Problem:** Gradle can't find Android SDK

**Solution:**
1. Create file `local.properties` in `connectty\android\` folder
2. Add line: `sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk`
   - Note: Use double backslashes `\\`
   - Replace `YourName` with your Windows username

### "Build failed with exception"

**Problem:** Missing dependencies or corrupted Gradle cache

**Solution:**
1. Clean the build:
   ```cmd
   gradlew.bat clean
   ```

2. Delete `.gradle` folder in `connectty\android\`

3. Rebuild:
   ```cmd
   gradlew.bat assembleDebug --refresh-dependencies
   ```

### "Unable to download dependencies"

**Problem:** Network issues or firewall blocking downloads

**Solution:**
1. Check internet connection
2. Disable VPN if using one
3. Check firewall isn't blocking Java
4. Try using mobile hotspot instead of corporate network

### "Insufficient storage" during build

**Problem:** Not enough disk space

**Solution:**
1. Free up at least 10GB on C: drive
2. Or change Gradle cache location:
   - Set environment variable: `GRADLE_USER_HOME=D:\gradle_cache`
   - Replace `D:\` with drive that has space

### "Installation failed: INSTALL_FAILED_UPDATE_INCOMPATIBLE"

**Problem:** Old version of app installed with different signature

**Solution:**
1. Uninstall old version from phone
2. Install fresh:
   ```cmd
   adb uninstall com.connectty.android
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

### "adb: command not found"

**Problem:** Platform tools not in PATH

**Solution:**
1. Add `%ANDROID_HOME%\platform-tools` to PATH
2. Or use full path:
   ```cmd
   %ANDROID_HOME%\platform-tools\adb devices
   ```

## Building for Production

### Create Signed Release APK

1. **Generate Keystore** (one-time)
   ```cmd
   keytool -genkey -v -keystore connectty-release.keystore -alias connectty -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Enter passwords and details when prompted
   - Save `connectty-release.keystore` safely

2. **Configure Signing**
   - Create `keystore.properties` in `android/` folder:
     ```properties
     storeFile=../connectty-release.keystore
     storePassword=YOUR_STORE_PASSWORD
     keyAlias=connectty
     keyPassword=YOUR_KEY_PASSWORD
     ```

3. **Build Release APK**
   ```cmd
   build-release.bat
   ```

4. **Output**
   - Location: `app\build\outputs\apk\release\app-release.apk`
   - This APK is ready for distribution

## Next Steps

Once you have the app installed:

1. **Add SSH Connections**
   - Tap "Connections" → "+" button
   - Enter hostname, port, username
   - Add credentials

2. **Configure Cloud Providers**
   - Tap "Providers" → "+" button
   - Select AWS/Azure/GCP
   - Enter API credentials
   - Discover instances

3. **Store Credentials Securely**
   - Tap "Credentials" → "+" button
   - Enter passwords or SSH keys
   - Enable biometric protection

## Getting Help

If you encounter issues not covered here:

1. Check GitHub Issues: https://github.com/sp00nznet/connectty/issues
2. Read the main README: `connectty\android\README.md`
3. Create a new issue with:
   - Your Windows version
   - JDK version (`java -version`)
   - Android SDK version
   - Full error message
   - Steps you've already tried

## Summary Checklist

- [ ] JDK 17+ installed
- [ ] Android SDK installed (via Android Studio or Command Line Tools)
- [ ] ANDROID_HOME environment variable set
- [ ] PATH updated with Android SDK tools
- [ ] Connectty source code downloaded
- [ ] Run `build.bat` successfully
- [ ] APK created in `app\build\outputs\apk\debug\`
- [ ] USB debugging enabled on phone
- [ ] App installed and running

Congratulations! You've successfully built and installed Connectty for Android! 🎉
