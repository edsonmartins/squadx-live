# Windows Setup Guide for SquadX Live

This guide covers Windows-specific setup and troubleshooting for SquadX Live.

## System Requirements

- Windows 10 (version 1903 or later) or Windows 11
- 64-bit operating system
- 4GB RAM minimum (8GB recommended)
- WebRTC-compatible browser for viewers

## Installation

### Using WinGet (Recommended)

```powershell
winget install SquadX Live.SquadX Live
```

### Direct Download

Download the latest `.exe` installer from the [releases page](https://github.com/squadx-live/squadx-live/releases).

## Windows Defender Configuration

Windows Defender may occasionally flag SquadX Live or slow down its operations. This is because SquadX Live:

- Captures screen content
- Injects keyboard/mouse input for remote control
- Makes network connections for WebRTC streaming

### Adding an Exclusion

To prevent false positives and improve performance:

1. Open **Windows Security** (search for it in Start menu)
2. Click **Virus & threat protection**
3. Under "Virus & threat protection settings," click **Manage settings**
4. Scroll down to **Exclusions** and click **Add or remove exclusions**
5. Click **Add an exclusion** → **Folder**
6. Select the SquadX Live installation folder:
   - Default: `C:\Users\<username>\AppData\Local\Programs\SquadX Live`

Alternatively, add just the executable:

1. Click **Add an exclusion** → **File**
2. Navigate to `C:\Users\<username>\AppData\Local\Programs\SquadX Live\SquadX Live.exe`

### PowerShell Method (Administrator)

Run PowerShell as Administrator and execute:

```powershell
# Add folder exclusion
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\Programs\SquadX Live"

# Or add just the executable
Add-MpPreference -ExclusionProcess "$env:LOCALAPPDATA\Programs\SquadX Live\SquadX Live.exe"
```

To verify the exclusion was added:

```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
```

## Administrator Privileges

SquadX Live generally does not require administrator privileges for normal operation. However, you may need elevated privileges in these scenarios:

### When Elevation May Be Required

1. **Remote Control of Elevated Applications**: If you're sharing a screen that contains an application running as Administrator, SquadX Live may need elevation to send input to that application.

2. **Certain Games or Full-Screen Applications**: Some applications with anti-cheat or input protection may require elevated privileges.

3. **System-Wide Hotkeys**: If global hotkeys conflict with other elevated applications.

### Running as Administrator

To run SquadX Live with administrator privileges:

1. Right-click the SquadX Live shortcut or executable
2. Select **Run as administrator**
3. Click **Yes** on the UAC prompt

Or, to always run as administrator:

1. Right-click the SquadX Live shortcut
2. Select **Properties**
3. Click the **Compatibility** tab
4. Check **Run this program as an administrator**
5. Click **OK**

### UAC Prompt Handling

When SquadX Live detects it needs elevated privileges, it will:

1. Show a dialog explaining why elevation is needed
2. Offer to restart with administrator privileges
3. If you accept, Windows will show a UAC prompt

**Note**: Running as administrator is optional and only needed for specific use cases.

## Firewall Configuration

SquadX Live needs network access for:

- WebRTC peer-to-peer connections
- Signaling server communication
- STUN/TURN server communication

### Automatic Configuration

The installer typically configures Windows Firewall automatically. If you experience connection issues:

1. Open **Windows Security** → **Firewall & network protection**
2. Click **Allow an app through firewall**
3. Click **Change settings**
4. Find **SquadX Live** in the list and ensure both **Private** and **Public** are checked
5. If SquadX Live isn't listed, click **Allow another app...** and browse to the executable

### PowerShell Method (Administrator)

```powershell
# Allow SquadX Live through firewall
New-NetFirewallRule -DisplayName "SquadX Live" -Direction Inbound -Program "$env:LOCALAPPDATA\Programs\SquadX Live\SquadX Live.exe" -Action Allow
New-NetFirewallRule -DisplayName "SquadX Live" -Direction Outbound -Program "$env:LOCALAPPDATA\Programs\SquadX Live\SquadX Live.exe" -Action Allow
```

## Troubleshooting

### Screen Capture Not Working

1. Ensure Windows version is 1903 or later
2. Try running as administrator
3. Check if the application you're trying to capture has DRM protection

### Remote Control Not Working

1. Check if the target application is running as administrator (if so, SquadX Live needs elevation)
2. Some applications (games, secure inputs) may block simulated input
3. Try granting accessibility permissions in Windows Settings

### High CPU Usage

1. Lower the capture quality in SquadX Live settings
2. Add SquadX Live to Windows Defender exclusions
3. Close other screen capture/recording software

### Connection Issues

1. Check firewall settings
2. Ensure your network allows WebRTC traffic
3. Try the TURN fallback option in settings
4. Check if corporate VPN is blocking connections

## Uninstallation

### Using Windows Settings

1. Open **Settings** → **Apps** → **Apps & features**
2. Find **SquadX Live** in the list
3. Click **Uninstall**

### Using WinGet

```powershell
winget uninstall SquadX Live.SquadX Live
```

### Removing Configuration Data

User configuration is stored in:

- `%APPDATA%\SquadX Live`
- `%LOCALAPPDATA%\SquadX Live`

To completely remove all data:

```powershell
Remove-Item -Recurse "$env:APPDATA\SquadX Live"
Remove-Item -Recurse "$env:LOCALAPPDATA\SquadX Live"
```

## Getting Help

- [Documentation](https://squadx-live.com/docs)
- [GitHub Issues](https://github.com/squadx-live/squadx-live/issues)
- [Community Forum](https://squadx-live.com/community)
