# SynapseAI Executor

A modern, cross-platform Roblox script executor with a beautiful web-based interface.

## Features

- 🎨 **Beautiful Web UI** - Modern gradient design with dark theme
- 🚀 **Script Execution** - Execute Lua scripts in Roblox games
- 📚 **Script Hub** - Pre-loaded with popular scripts (Infinite Jump, Speed Boost, Fly, ESP)
- 💾 **Save & Load** - Save your favorite scripts and load them anytime
- 🔍 **Process Detection** - Automatically detects running Roblox instances
- 📝 **Script Editor** - Live editor with line/character count
- ⚡ **Cross-Platform** - Works on Windows, macOS, and Linux
- ⌨️ **Keyboard Shortcuts** - Cmd+Enter to execute, Cmd+S to save, Cmd+O to load
- 🌐 **Web-Based** - No GUI dependencies, works in any browser

## Quick Install (Recommended)

### For macOS/Linux:

```bash
# Clone the repository
git clone https://github.com/nflgamergod-art/SynapseAI-bot1.git
cd "SynapseAI-bot1/SynapseAI rewrite"

# Run the installer
chmod +x install.sh
./install.sh

# Start the executor
synapse
```

### For Windows:

```bash
# Clone the repository
git clone https://github.com/nflgamergod-art/SynapseAI-bot1.git
cd "SynapseAI-bot1/SynapseAI rewrite"

# Install dependencies
pip install -r requirements.txt

# Run the executor
python main.py
```

## Manual Installation

### Prerequisites

- Python 3.8 or higher
- Roblox installed on your system

### Setup

1. **Clone or download this repository**

```bash
git clone https://github.com/nflgamergod-art/SynapseAI-bot1.git
cd "SynapseAI-bot1/SynapseAI rewrite"
```

2. **Install dependencies:**

```bash
pip install -r requirements.txt
```

### Running the Executor

```bash
python main.py
```

Or if you used the installer:

```bash
synapse
```

The executor will automatically open in your default web browser at `http://localhost:5000`

## Usage

1. **Launch Roblox** and join a game
2. **Open SynapseAI Executor**
3. Click the **"Inject"** button to attach to Roblox
4. **Write or load a script** in the editor
5. Click **"Execute"** to run your script
6. Use **"Script Hub"** to access pre-made scripts

## Script Hub

The executor comes with several pre-loaded scripts:

- **Infinite Jump** - Jump infinitely in any game
- **Speed Boost** - Increase your walking speed
- **Fly Script** - Fly around the map (Press E to toggle)
- **Player ESP** - See players through walls

### Adding Custom Scripts

1. Place your `.lua` script files in the `scripts/` folder
2. Optionally create a `.json` metadata file with the same name containing:
   ```json
   {
     "name": "Script Name",
     "description": "Script description"
   }
   ```
3. Restart the executor or refresh the Script Hub

## Building Standalone Executable

### For macOS:

```bash
pip install pyinstaller
pyinstaller --name="SynapseAI" --windowed --onefile --icon=icon.icns main.py
```

### For Windows:

```bash
pip install pyinstaller
pyinstaller --name="SynapseAI" --windowed --onefile --icon=icon.ico main.py
```

The executable will be in the `dist/` folder.

## Important Notes

⚠️ **Educational Purpose Only**: This executor is for educational purposes and testing in private servers. Always respect game rules and terms of service.

⚠️ **Security**: Never run scripts from untrusted sources. Always review scripts before execution.

⚠️ **Compatibility**: This is a demonstration/framework. Real injection requires platform-specific implementation (DLL injection on Windows, etc.)

## Project Structure

```
SynapseAI/
├── main.py           # Main GUI application
├── executor.py       # Script execution backend
├── script_hub.py     # Script management system
├── requirements.txt  # Python dependencies
├── README.md         # Documentation
├── scripts/          # Script library folder
│   ├── *.lua        # Script files
│   └── *.json       # Script metadata
└── logs/            # Execution logs (auto-generated)
```

## Troubleshooting

### "Roblox is not running" error
- Make sure Roblox is fully launched and you're in a game
- Try restarting Roblox and the executor

### Scripts not appearing in Script Hub
- Check that `.lua` files are in the `scripts/` folder
- Ensure files have correct encoding (UTF-8)

### Import errors
- Reinstall dependencies: `pip install -r requirements.txt --upgrade`
- Verify Python version: `python --version` (should be 3.8+)

## License

This project is open source and available for educational purposes.

## Disclaimer

This software is provided for educational and research purposes only. The authors are not responsible for any misuse or damage caused by this program. Use at your own risk and always follow the terms of service of the games you play.
