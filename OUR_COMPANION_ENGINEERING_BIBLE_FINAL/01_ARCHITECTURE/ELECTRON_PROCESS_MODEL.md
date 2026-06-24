# Electron Process Model

## Windows
1. Companion Window
   - transparent
   - frameless
   - always-on-top optional
   - displays PixiJS character
   - click opens Companion Panel
   - mostly mouse-through except interaction hitbox

2. Companion Panel Window
   - normal floating window
   - opened from companion click or hotkey
   - React UI

## Security requirements
- contextIsolation: true
- nodeIntegration: false
- expose only typed preload APIs
- never expose raw shell execution to renderer
- all tool execution goes through ToolService with validation
