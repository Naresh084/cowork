# Cowork Installation Guide

## System Requirements

### Windows
- Windows 10 version 1803 or later (Windows 11 recommended)
- WebView2 Runtime (included in installer)
- 4GB RAM minimum, 8GB recommended
- 500MB disk space

### macOS
- macOS 10.15 (Catalina) or later
- Apple Silicon (M1/M2/M3) or Intel processor
- 4GB RAM minimum, 8GB recommended
- 500MB disk space

### Linux
- Ubuntu 22.04+ / Debian 12+ / Fedora 38+
- WebKitGTK 4.1
- 4GB RAM minimum, 8GB recommended
- 500MB disk space

---

## Installation

### Windows

1. Download `Gemini-Cowork_X.X.X_x64-setup.exe` from the [latest release](https://github.com/AiCodingBattle/geminicowork/releases/latest)
2. Run the installer
3. If Windows SmartScreen appears, click "More info" then "Run anyway"
4. Follow the installation wizard
5. Launch Gemini Cowork from the Start Menu

### macOS

#### Apple Silicon (M1/M2/M3)
1. Download `Gemini-Cowork_X.X.X_aarch64.dmg`
2. Open the DMG file
3. Drag Gemini Cowork to Applications folder
4. On first launch, right-click and select "Open" to bypass Gatekeeper

#### Intel Mac
1. Download `Gemini-Cowork_X.X.X_x64.dmg`
2. Follow the same steps as above

### Linux

#### AppImage (Universal)
```bash
# Download
wget https://github.com/AiCodingBattle/geminicowork/releases/latest/download/Gemini-Cowork_X.X.X_amd64.AppImage

# Make executable
chmod +x Gemini-Cowork_X.X.X_amd64.AppImage

# Run
./Gemini-Cowork_X.X.X_amd64.AppImage
```

#### Debian/Ubuntu (.deb)
```bash
# Download
wget https://github.com/AiCodingBattle/geminicowork/releases/latest/download/Gemini-Cowork_X.X.X_amd64.deb

# Install
sudo dpkg -i Gemini-Cowork_X.X.X_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f
```

#### Fedora/RHEL (.rpm)
```bash
# Download
wget https://github.com/AiCodingBattle/geminicowork/releases/latest/download/Gemini-Cowork_X.X.X_x86_64.rpm

# Install
sudo rpm -i Gemini-Cowork_X.X.X_x86_64.rpm
```

---

## First Launch Setup

1. Launch Gemini Cowork
2. Enter your name.
3. Select your provider (Google, OpenAI, Anthropic, OpenRouter, Moonshot, GLM, DeepSeek, or LM Studio).
4. Add provider API key (optional for LM Studio).
5. Set base URL if your provider supports editable base URLs.
6. Select a chat model (or enter a custom model ID).
7. Optionally configure media and integration keys (Google, OpenAI, Fal, Exa, Tavily, Stitch).
8. Start chatting.

Detailed onboarding/settings behavior is documented in `docs/GET_STARTED.md`.

---

## Automatic Updates

Gemini Cowork automatically checks for updates on startup and every 30 minutes while running. When an update is available:

1. The app will show a notification that an update is available
2. The update downloads automatically in the background
3. Once downloaded, the app will restart to apply the update

No manual action is required - updates are installed automatically.

---

## Troubleshooting

### Windows: WebView2 Error
If you see a WebView2 error, download and install the WebView2 Runtime from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Linux: Missing Dependencies
```bash
# Ubuntu/Debian
sudo apt-get install libwebkit2gtk-4.1-0 libayatana-appindicator3-1

# Fedora
sudo dnf install webkit2gtk4.1 libappindicator-gtk3
```

### macOS: "App is damaged" Error
```bash
xattr -cr /Applications/Gemini\ Cowork.app
```

### All Platforms: API Key Issues
Your API key is stored securely in your system's credential manager:
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service (GNOME Keyring/KWallet)

To reset keys, use:
- Settings -> Provider (provider keys + base URL)
- Settings -> Media (Google/OpenAI/Fal media keys + model routing)
- Settings -> Integrations (Exa/Tavily/Stitch and related capability settings)

---

## Uninstallation

### Windows
Use "Add or Remove Programs" or run the uninstaller from Start Menu.

### macOS
Drag Gemini Cowork from Applications to Trash.

### Linux
```bash
# Debian/Ubuntu
sudo apt remove gemini-cowork

# Fedora
sudo dnf remove gemini-cowork

# AppImage: Simply delete the file
```

Data is stored in `~/.geminicowork/` - delete this folder to remove all data.
