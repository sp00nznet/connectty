# Android Terminal Integration

Connectty supports Android 15's new Terminal app, allowing you to use your SSH connections in a native, tabbed terminal interface.

## What is Android Terminal?

Android Terminal is Google's official terminal emulator introduced in Android 15. It provides:
- **Tabbed interface** - Multiple terminal sessions in tabs
- **Native experience** - Full integration with Android's UI
- **Custom shell providers** - Apps like Connectty can provide terminal sessions
- **Keyboard shortcuts** - Ctrl+C, Ctrl+V, and more
- **Split screen** - Run terminals side-by-side

## Features

When you use Connectty with Android Terminal, you get:

✅ **All your SSH connections as tabs** - Each saved connection appears as an available session
✅ **Quick access** - Open connections directly from Terminal app
✅ **Persistent sessions** - Tabs survive app switching
✅ **Full terminal support** - 256 colors, UTF-8, PTY support
✅ **Secure** - Uses your encrypted credentials from Connectty vault

## Requirements

- **Android 15 or newer** (API 35+)
- **Android Terminal app** installed (usually pre-installed on Android 15+)
- **Connectty** with SSH connections configured

## How to Use

### Setup (One-Time)

1. **Install Connectty**
   ```bash
   adb install app-debug.apk
   ```

2. **Configure SSH Connections in Connectty**
   - Open Connectty app
   - Add your SSH connections (hostname, username, port)
   - Add credentials (password or SSH key)
   - Save connections

3. **Set Connectty as Terminal Provider** (Optional)
   - Open Android Terminal app
   - Tap Settings → Default shell provider
   - Select "Connectty SSH"

### Daily Use

**Method 1: From Android Terminal**

1. Open Android Terminal app
2. Tap the "+" button or menu
3. Select "Connectty SSH"
4. Choose a connection from the list
5. Terminal opens in a new tab!

**Method 2: From Connectty**

1. Open Connectty app
2. Long-press a connection
3. Select "Open in Terminal"
4. Switches to Terminal app with session opened

### Managing Sessions

- **New tab:** Tap "+" in Terminal app, select connection
- **Switch tabs:** Swipe left/right or use tab bar
- **Close tab:** Swipe tab away or disconnect
- **Multiple connections:** Open multiple tabs, even to same server

## How It Works

### Architecture

```
Android Terminal App
        ↓
  (IPC via ContentProvider)
        ↓
ConnecttyTerminalProvider
        ↓
    SSHManager
        ↓
  Apache MINA SSHD
        ↓
   Your SSH Server
```

### Implementation Details

**ConnecttyTerminalProvider** (`terminal/ConnecttyTerminalProvider.kt`):
- Implements Android's TerminalSessionProvider API
- Exposes SSH connections as terminal sessions
- Bridges PTY I/O between Terminal app and SSH

**Key Components:**
1. **Session listing** - Queries database for available SSH connections
2. **Session creation** - Opens SSH connection when Terminal requests
3. **I/O bridging** - Pipes Terminal ↔ SSH traffic in both directions
4. **Lifecycle management** - Handles session start/stop

### Security

- **Encrypted credentials** - AES-256-GCM encryption for passwords/keys
- **Android Keystore** - Hardware-backed key storage
- **No plaintext** - Credentials never exposed to Terminal app
- **Permission-based** - Terminal app needs RUN_COMMAND permission

## Configuration

### AndroidManifest.xml

The provider is declared with:

```xml
<provider
    android:name=".terminal.ConnecttyTerminalProvider"
    android:authorities="com.connectty.android.terminal"
    android:exported="true"
    android:permission="com.android.terminal.permission.RUN_COMMAND">
    <intent-filter>
        <action android:name="com.android.terminal.action.PROVIDE_TERMINAL_SESSIONS" />
    </intent-filter>
    <meta-data
        android:name="com.android.terminal.provider_name"
        android:value="Connectty SSH" />
</provider>
```

### Authority

The provider authority is: `com.connectty.android.terminal`

This must be unique across all apps on the device.

## API Reference

### Query Sessions

Terminal app queries available sessions via ContentProvider:

```kotlin
val uri = Uri.parse("content://com.connectty.android.terminal/sessions")
val cursor = contentResolver.query(uri, null, null, null, null)
```

**Returns:**
- `id` - Connection UUID
- `title` - Connection name (e.g., "Production Server")
- `description` - Connection details (e.g., "user@host:22")
- `is_running` - Boolean, 1 if session active

### Open Session

Terminal app opens a session via `openFile()`:

```kotlin
val uri = Uri.parse("content://com.connectty.android.terminal/session/CONNECTION_ID")
val fd = contentResolver.openFileDescriptor(uri, "rw")
```

**Returns:** ParcelFileDescriptor (PTY slave end)

### Close Session

Terminal app closes via `delete()`:

```kotlin
val uri = Uri.parse("content://com.connectty.android.terminal/session/CONNECTION_ID")
contentResolver.delete(uri, null, null)
```

## Troubleshooting

### "No terminal providers found"

**Problem:** Terminal app doesn't see Connectty

**Solutions:**
1. Ensure Android 15+ is installed
2. Check Connectty is installed: `adb shell pm list packages | grep connectty`
3. Verify provider is registered: `adb shell dumpsys package com.connectty.android`
4. Reinstall Connectty

### "Connection failed"

**Problem:** Session starts but fails to connect

**Solutions:**
1. Test connection in Connectty app first
2. Check credentials are configured
3. Verify network connectivity
4. Check SSH server is reachable
5. Look at logs: `adb logcat | grep Connectty`

### "Permission denied"

**Problem:** Terminal can't access provider

**Solutions:**
1. Check Terminal has RUN_COMMAND permission
2. Verify provider `exported="true"` in manifest
3. Ensure authority is unique

### Sessions close immediately

**Problem:** Tabs open then close right away

**Solutions:**
1. Check SSH authentication (password/key)
2. Verify credential is assigned to connection
3. Check server allows SSH connections
4. Review logs for errors

### No output appears

**Problem:** Terminal is blank or frozen

**Solutions:**
1. Try sending input (type something)
2. Check PTY settings (should be 80x24 default)
3. Verify SSH server sends shell prompt
4. Test with simple command: `echo test`

## Advanced Usage

### Custom Terminal Size

Default is 80 columns × 24 rows. To change:

```kotlin
// In ConnecttyTerminalProvider.kt
val result = sshManager.connect(
    connection = serverConnection,
    credential = credentialDomain,
    terminalWidth = 120,  // Change here
    terminalHeight = 40   // And here
)
```

### Session Persistence

Sessions survive:
- App switching
- Screen rotation
- Temporary disconnects

Sessions do NOT survive:
- Device reboot
- Force stop of Connectty app
- Terminal app restart

### Multiple Connections

You can open multiple tabs to:
- Same server (different sessions)
- Different servers
- Mix of different connections

Limit: System memory and SSH server session limits

### Keyboard Shortcuts

In Android Terminal with Connectty:
- `Ctrl+C` - Send SIGINT
- `Ctrl+D` - Send EOF
- `Ctrl+Z` - Send SIGTSTP
- `Ctrl+L` - Clear screen
- `Tab` - Autocomplete (if shell supports)

## Comparison: Connectty App vs Terminal App

| Feature | Connectty App | Android Terminal |
|---------|---------------|------------------|
| Interface | Custom Connectty UI | Native Android Terminal |
| Tabs | Future feature | Built-in |
| Split screen | No | Yes |
| Connection management | Full CRUD | View only |
| SFTP | Yes | No |
| RDP | Yes | No |
| Cloud discovery | Yes | No |
| Credentials | Full vault | Read-only via provider |
| Keyboard shortcuts | Limited | Full support |

**Recommendation:** Use both!
- **Connectty app** - Managing connections, credentials, SFTP, RDP
- **Terminal app** - Daily SSH work with tabs and shortcuts

## Future Enhancements

Planned features for Terminal integration:

- [ ] Session restore after reboot
- [ ] Custom environment variables per connection
- [ ] Pre-login commands (e.g., `cd /var/log`)
- [ ] Connection groups in Terminal UI
- [ ] Quick actions (restart, run script)
- [ ] Terminal theme sync with Connectty
- [ ] Clipboard integration
- [ ] File upload via drag-and-drop

## API Documentation

### ContentProvider URIs

| URI | Method | Description |
|-----|--------|-------------|
| `content://.../sessions` | query() | List all SSH connections |
| `content://.../session/{id}` | openFile() | Open PTY for connection |
| `content://.../session/{id}` | delete() | Close session |

### Permissions

Required permissions:
- `com.android.terminal.permission.RUN_COMMAND` - Terminal → Connectty
- `android.permission.INTERNET` - Connectty → SSH servers

### Content Types

- `vnd.android.cursor.dir/terminal_session` - Session list
- `vnd.android.cursor.item/terminal_session` - Single session

## Examples

### Query All Sessions

```kotlin
val uri = Uri.parse("content://com.connectty.android.terminal/sessions")
context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
    while (cursor.moveToNext()) {
        val id = cursor.getString(0)
        val title = cursor.getString(1)
        val desc = cursor.getString(2)
        val running = cursor.getInt(3) == 1

        println("$title ($desc) - Running: $running")
    }
}
```

### Open Session Programmatically

```kotlin
val connectionId = "uuid-here"
val uri = Uri.parse("content://com.connectty.android.terminal/session/$connectionId")

val pfd = context.contentResolver.openFileDescriptor(uri, "rw")
pfd?.let {
    // Use file descriptor for I/O
    val input = FileInputStream(it.fileDescriptor)
    val output = FileOutputStream(it.fileDescriptor)

    // Read/write terminal data
}
```

## Resources

- [Android Terminal Documentation](https://source.android.com/docs/core/connect/terminal)
- [ContentProvider Guide](https://developer.android.com/guide/topics/providers/content-providers)
- [Connectty GitHub](https://github.com/sp00nznet/connectty)

## Support

For issues with Terminal integration:

1. **Check logs:**
   ```bash
   adb logcat -s Connectty:* AndroidTerminal:*
   ```

2. **Test connection in Connectty app first**

3. **Report issue:** Include:
   - Android version
   - Terminal app version
   - Connectty version
   - Steps to reproduce
   - Full logcat output

## Contributing

Want to improve Terminal integration?

**Ideas:**
- Better error messages in Terminal UI
- Connection shortcuts/favorites
- Terminal theme customization
- Session restore on crash
- Multi-hop SSH (jump hosts)

**Pull requests welcome!**

---

**Built with ❤️ for Android 15+**

Enjoy your tabbed SSH experience! 🚀
