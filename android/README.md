# Connectty for Android

Modern connection manager for DevOps professionals on Android. Manage SSH, RDP, SFTP connections, cloud provider auto-discovery, and bulk command execution from your Android device.

## Features

### 🆕 Android Terminal Integration (Android 15+)
- **Native tabbed terminal** - Use your SSH connections in Android's Terminal app
- **Set as default shell** - Make Connectty your system terminal provider
- **Seamless experience** - All connections available as terminal tabs
- **Full keyboard support** - Ctrl+C, Ctrl+V, and more shortcuts
- See [ANDROID_TERMINAL_INTEGRATION.md](ANDROID_TERMINAL_INTEGRATION.md) for details

### Core Connection Types
- **SSH** - Full terminal emulation with 256-color support
- **RDP** - Remote Desktop Protocol support (via external RDP clients)
- **SFTP** - Secure file transfers with progress tracking
- **Serial/COM** - USB serial console access (via USB OTG)

### Cloud Provider Discovery
- **AWS EC2** - Auto-discover instances across multiple regions
- **Microsoft Azure** - Discover VMs across subscriptions
- **Google Cloud Platform** - Find Compute Engine instances
- **VMware vSphere/ESXi** - Discover VMs (planned)
- **Proxmox VE** - Discover QEMU VMs and LXC containers (planned)

### Credential Management
- Secure encrypted credential storage using Android Keystore
- AES-256-GCM encryption
- Password, SSH key, and domain credential support
- Auto-assignment to connections based on patterns
- Biometric authentication support

### Additional Features
- Connection grouping and organization
- Saved commands for bulk execution
- Command history tracking
- Session state saving/restoring
- Import/Export connections
- Material Design 3 UI

## Building on Windows

### Prerequisites

1. **Java Development Kit (JDK) 17 or later**
   - Download from [Adoptium](https://adoptium.net/) (recommended)
   - Or [Oracle JDK](https://www.oracle.com/java/technologies/downloads/)
   - Verify installation: `java -version`

2. **Android SDK**
   - **Option A (Recommended):** Install [Android Studio](https://developer.android.com/studio)
     - Includes Android SDK, emulator, and GUI tools
     - Default location: `C:\Users\YourName\AppData\Local\Android\Sdk`

   - **Option B:** Install [Android Command Line Tools](https://developer.android.com/studio#command-tools)
     - Lighter weight, command-line only
     - Extract to desired location (e.g., `C:\Android\SDK`)
     - Run: `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"`

3. **Set Environment Variables**
   ```cmd
   setx ANDROID_HOME "C:\Users\YourName\AppData\Local\Android\Sdk"
   setx PATH "%PATH%;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools\bin"
   ```
   Restart your command prompt after setting variables.

### Build Instructions

1. **Clone or extract the repository**
   ```cmd
   cd connectty\android
   ```

2. **Build Debug APK**
   ```cmd
   build.bat
   ```
   Output: `app\build\outputs\apk\debug\app-debug.apk`

3. **Build Release APK**
   ```cmd
   build-release.bat
   ```
   Output: `app\build\outputs\apk\release\app-release.apk`

4. **Clean Build**
   ```cmd
   clean.bat
   ```

### Alternative: Build with gradlew directly

```cmd
REM Debug build
gradlew.bat assembleDebug

REM Release build
gradlew.bat assembleRelease

REM Clean
gradlew.bat clean
```

### Installing on Device

1. **Enable USB Debugging on your Android device**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times to enable Developer Options
   - Go to Settings → Developer Options
   - Enable "USB Debugging"

2. **Connect device via USB**

3. **Install APK**
   ```cmd
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

   Or drag and drop the APK file to your device.

## Build Configuration

### Minimum Requirements
- **Min SDK:** Android 8.0 (API 26)
- **Target SDK:** Android 14 (API 34)
- **Compile SDK:** Android 14 (API 34)

### Dependencies
- Jetpack Compose for UI
- Room for local database
- Apache MINA SSHD for SSH/SFTP
- AWS, Azure, GCP SDKs for cloud discovery
- Biometric library for fingerprint/face unlock
- Timber for logging

### Gradle Versions
- Gradle: 8.2
- Android Gradle Plugin: 8.2.0
- Kotlin: 1.9.20

## Troubleshooting

### "Java not found"
- Install JDK 17+ from [Adoptium](https://adoptium.net/)
- Add Java to PATH: `C:\Program Files\Eclipse Adoptium\jdk-17\bin`

### "ANDROID_HOME not set"
- Set in System Environment Variables:
  - Variable: `ANDROID_HOME`
  - Value: `C:\Users\YourName\AppData\Local\Android\Sdk`

### "SDK location not found"
- Create `local.properties` in `android/` folder:
  ```properties
  sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk
  ```

### "Build failed with dependency errors"
- Run: `gradlew.bat build --refresh-dependencies`
- Check internet connection (dependencies download from Maven)

### "Execution failed for task ':app:mergeDebugResources'"
- Run: `gradlew.bat clean`
- Delete `.gradle` folder in project root
- Rebuild

## Development

### Project Structure
```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/connectty/android/
│   │   │   ├── data/              # Data layer
│   │   │   │   ├── connection/    # SSH, RDP, SFTP managers
│   │   │   │   ├── local/         # Room database
│   │   │   │   ├── provider/      # Cloud provider discovery
│   │   │   │   └── security/      # Encryption utilities
│   │   │   ├── domain/            # Domain models
│   │   │   └── ui/                # Compose UI
│   │   ├── res/                   # Android resources
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts           # App build config
├── build.gradle.kts               # Project build config
├── settings.gradle.kts            # Gradle settings
├── gradle.properties              # Gradle properties
├── gradlew.bat                    # Windows Gradle wrapper
└── README.md                      # This file
```

### Opening in Android Studio
1. Open Android Studio
2. File → Open → Select `connectty/android` folder
3. Wait for Gradle sync to complete
4. Run/Debug from toolbar

### Running on Emulator
1. Create AVD in Android Studio: Tools → Device Manager
2. Select device with API 26+ (Android 8.0+)
3. Click Run button in Android Studio

## Architecture

### Data Layer
- **Room Database**: SQLite database with type-safe DAO access
- **Encrypted Storage**: Credentials encrypted with AES-256-GCM
- **Android Keystore**: Secure master key storage

### Connection Layer
- **SSH**: Apache MINA SSHD client with PTY support
- **SFTP**: Apache MINA SFTP client for file transfers
- **RDP**: External RDP client integration via Android intents

### Cloud Providers
- **AWS**: EC2 instance discovery using AWS Android SDK
- **Azure**: VM discovery using Azure Resource Manager SDK
- **GCP**: Compute Engine instance discovery using Google Cloud SDK

### UI Layer
- **Jetpack Compose**: Modern declarative UI
- **Material Design 3**: Following Android design guidelines
- **Navigation Component**: Type-safe navigation

## Security

- All credentials are encrypted using AES-256-GCM
- Master encryption key stored in Android Keystore (hardware-backed when available)
- Biometric authentication for credential access
- No credentials stored in plain text
- Database excluded from backups

## Compatibility

### Tested On
- Android 8.0 (API 26) and above
- ARM64, ARM, x86_64, x86 architectures

### Known Limitations
- RDP requires external app (Microsoft Remote Desktop or aRDP)
- Serial/COM requires USB OTG support on device
- Cloud provider discovery requires internet connection

## Contributing

Contributions are welcome! Please ensure:
- Code follows Kotlin coding conventions
- New features include tests
- UI follows Material Design 3 guidelines
- Update documentation for new features

## License

MIT License - see main repository for details

## Support

For issues and feature requests, visit: https://github.com/sp00nznet/connectty/issues
