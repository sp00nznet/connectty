# Matrix Plugin - Visual cmatrix Effect

A purely visual plugin that displays Matrix-style falling green characters in the slide-out plugin panel. Perfect for adding a cyberpunk aesthetic to your terminal management experience.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
5. [Frontend Implementation](#frontend-implementation)
6. [Customization](#customization)
7. [Examples](#examples)

---

## Overview

The Matrix plugin is a lightweight visual effect plugin that displays falling characters reminiscent of the iconic Matrix movie. It's purely cosmetic and runs entirely in the frontend, making it a zero-overhead addition to your plugin panel.

### Plugin ID
`matrix`

### Requirements
- Modern browser with Canvas API support
- Plugin panel enabled in settings

---

## Features

✅ **Matrix-style falling characters** - Green characters cascading down the screen
✅ **Japanese Katakana support** - Use authentic Matrix characters
✅ **Customizable speed** - Adjust animation speed (1-10)
✅ **Adjustable density** - Control character density (1-10)
✅ **Font size control** - Change character size (8-32px)
✅ **Color customization** - Change from classic green to any color
✅ **Zero backend overhead** - Pure frontend implementation
✅ **Smooth animation** - Uses requestAnimationFrame for performance

---

## Configuration

### MatrixConfig Interface

```typescript
interface MatrixConfig {
  speed: number;        // Animation speed (1-10, default: 5)
  density: number;      // Character density (1-10, default: 5)
  fontSize: number;     // Font size in pixels (default: 14)
  color: string;        // Color of characters (default: '#0F0')
  useJapanese: boolean; // Use Japanese katakana (default: true)
}
```

### Default Configuration

```typescript
{
  speed: 5,           // Medium speed
  density: 5,         // Medium density
  fontSize: 14,       // Readable size
  color: '#0F0',      // Classic Matrix green
  useJapanese: true   // Authentic Matrix katakana
}
```

### Configuration Ranges

| Property | Min | Max | Default | Description |
|----------|-----|-----|---------|-------------|
| `speed` | 1 | 10 | 5 | Animation speed (1=slow, 10=fast) |
| `density` | 1 | 10 | 5 | Character columns (1=sparse, 10=dense) |
| `fontSize` | 8 | 32 | 14 | Character size in pixels |
| `color` | - | - | `'#0F0'` | Any valid CSS color |
| `useJapanese` | - | - | `true` | Boolean toggle |

---

## API Reference

### Get Default Configuration

```typescript
await window.connectty.matrix.getDefaultConfig(): Promise<MatrixConfig>
```

Returns the default Matrix configuration.

**Example:**
```typescript
const defaultConfig = await window.connectty.matrix.getDefaultConfig();
console.log(defaultConfig);
// { speed: 5, density: 5, fontSize: 14, color: '#0F0', useJapanese: true }
```

### Validate Configuration

```typescript
await window.connectty.matrix.validateConfig(
  config: Partial<MatrixConfig>
): Promise<MatrixConfig>
```

Validates and normalizes a Matrix configuration. Clamps values to valid ranges and provides defaults for missing properties.

**Example:**
```typescript
const config = await window.connectty.matrix.validateConfig({
  speed: 15,  // Will be clamped to 10
  color: '#FF0000'  // Red Matrix!
});
// Returns: { speed: 10, density: 5, fontSize: 14, color: '#FF0000', useJapanese: true }
```

### Get Character Set

```typescript
await window.connectty.matrix.getCharacterSet(
  useJapanese: boolean
): Promise<string>
```

Returns the character set used for the Matrix effect.

**Example:**
```typescript
// Get Japanese katakana (authentic Matrix)
const japaneseChars = await window.connectty.matrix.getCharacterSet(true);
// Returns: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Get ASCII characters
const asciiChars = await window.connectty.matrix.getCharacterSet(false);
// Returns: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}|;:,.<>?'
```

---

## Frontend Implementation

### Basic Matrix Component

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { MatrixConfig } from '@connectty/shared';

export function MatrixPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState<MatrixConfig | null>(null);
  const [characters, setCharacters] = useState('');
  const animationRef = useRef<number>();

  useEffect(() => {
    // Load configuration
    loadConfig();
  }, []);

  useEffect(() => {
    if (!config || !characters) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup canvas
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const columns = Math.floor(canvas.width / config.fontSize);
    const drops: number[] = Array(columns).fill(1);

    // Animation function
    const draw = () => {
      // Fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Set text style
      ctx.fillStyle = config.color;
      ctx.font = `${config.fontSize}px monospace`;

      // Draw characters
      for (let i = 0; i < drops.length; i++) {
        const char = characters[Math.floor(Math.random() * characters.length)];
        const x = i * config.fontSize;
        const y = drops[i] * config.fontSize;

        ctx.fillText(char, x, y);

        // Reset drop randomly
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i]++;
      }

      // Schedule next frame
      const delay = 50 - (config.speed * 4);  // Convert speed to delay
      setTimeout(() => {
        animationRef.current = requestAnimationFrame(draw);
      }, delay);
    };

    // Start animation
    draw();

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [config, characters]);

  const loadConfig = async () => {
    const defaultConfig = await window.connectty.matrix.getDefaultConfig();
    setConfig(defaultConfig);

    const chars = await window.connectty.matrix.getCharacterSet(defaultConfig.useJapanese);
    setCharacters(chars);
  };

  return (
    <div className="matrix-panel" style={{ width: '100%', height: '100%', background: '#000' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

### Settings Component

```tsx
import React, { useState, useEffect } from 'react';
import type { MatrixConfig } from '@connectty/shared';

export function MatrixSettings() {
  const [config, setConfig] = useState<MatrixConfig | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await window.connectty.settings.get();
    if (settings.matrixConfig) {
      setConfig(settings.matrixConfig);
    } else {
      const defaultConfig = await window.connectty.matrix.getDefaultConfig();
      setConfig(defaultConfig);
    }
  };

  const saveSettings = async () => {
    if (!config) return;

    const validated = await window.connectty.matrix.validateConfig(config);
    await window.connectty.settings.set({
      matrixConfig: validated
    });

    alert('Matrix settings saved!');
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="matrix-settings">
      <h3>Matrix Effect Settings</h3>

      <div className="setting-group">
        <label>Speed: {config.speed}</label>
        <input
          type="range"
          min="1"
          max="10"
          value={config.speed}
          onChange={(e) => setConfig({...config, speed: parseInt(e.target.value)})}
        />
      </div>

      <div className="setting-group">
        <label>Density: {config.density}</label>
        <input
          type="range"
          min="1"
          max="10"
          value={config.density}
          onChange={(e) => setConfig({...config, density: parseInt(e.target.value)})}
        />
      </div>

      <div className="setting-group">
        <label>Font Size: {config.fontSize}px</label>
        <input
          type="range"
          min="8"
          max="32"
          value={config.fontSize}
          onChange={(e) => setConfig({...config, fontSize: parseInt(e.target.value)})}
        />
      </div>

      <div className="setting-group">
        <label>Color</label>
        <input
          type="color"
          value={config.color}
          onChange={(e) => setConfig({...config, color: e.target.value})}
        />
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.useJapanese}
            onChange={(e) => setConfig({...config, useJapanese: e.target.checked})}
          />
          Use Japanese Characters
        </label>
      </div>

      <button onClick={saveSettings}>Save Settings</button>
    </div>
  );
}
```

---

## Customization

### Speed Variations

```typescript
// Slow, contemplative Matrix
{ speed: 2, density: 3 }

// Classic Matrix speed
{ speed: 5, density: 5 }

// Fast, intense Matrix
{ speed: 9, density: 8 }
```

### Color Themes

```typescript
// Classic green
{ color: '#0F0' }

// Blue Matrix
{ color: '#00F' }

// Red Alert
{ color: '#F00' }

// Cyan/Tron style
{ color: '#0FF' }

// Purple hacker aesthetic
{ color: '#A020F0' }
```

### Density Variations

```typescript
// Sparse (few columns)
{ density: 2 }

// Medium (balanced)
{ density: 5 }

// Dense (many columns)
{ density: 9 }
```

---

## Examples

### Example 1: Enable Matrix Plugin

```typescript
// Get current settings
const settings = await window.connectty.settings.get();

// Enable Matrix plugin
await window.connectty.settings.set({
  pluginsEnabled: true,
  enabledPlugins: [...(settings.enabledPlugins || []), 'matrix']
});
```

### Example 2: Custom Blue Matrix

```typescript
const blueMatrix = await window.connectty.matrix.validateConfig({
  speed: 6,
  density: 7,
  fontSize: 16,
  color: '#00FFFF',  // Cyan
  useJapanese: true
});

await window.connectty.settings.set({
  matrixConfig: blueMatrix
});
```

### Example 3: ASCII-only Fast Matrix

```typescript
const asciiMatrix = await window.connectty.matrix.validateConfig({
  speed: 8,
  density: 6,
  fontSize: 12,
  color: '#0F0',
  useJapanese: false  // Use ASCII instead of katakana
});

await window.connectty.settings.set({
  matrixConfig: asciiMatrix
});
```

### Example 4: Dynamic Matrix Component with Settings

```tsx
export function DynamicMatrixPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState<MatrixConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ... animation logic from basic example ...

  const updateConfig = async (newConfig: Partial<MatrixConfig>) => {
    const validated = await window.connectty.matrix.validateConfig({
      ...config,
      ...newConfig
    });
    setConfig(validated);

    // Save to settings
    await window.connectty.settings.set({
      matrixConfig: validated
    });
  };

  return (
    <div className="dynamic-matrix-panel">
      {/* Settings toggle */}
      <button
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        ⚙️
      </button>

      {/* Settings panel */}
      {showSettings && config && (
        <div className="settings-overlay">
          <button onClick={() => updateConfig({ speed: config.speed + 1 })}>
            Speed +
          </button>
          <button onClick={() => updateConfig({ speed: config.speed - 1 })}>
            Speed -
          </button>
          <button onClick={() => updateConfig({ useJapanese: !config.useJapanese })}>
            {config.useJapanese ? 'Use ASCII' : 'Use Japanese'}
          </button>
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} />
    </div>
  );
}
```

---

## CSS Styling

```css
.matrix-panel {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.matrix-panel canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.settings-toggle {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(0, 255, 0, 0.1);
  border: 1px solid #0F0;
  color: #0F0;
  padding: 5px 10px;
  cursor: pointer;
  font-family: monospace;
}

.settings-toggle:hover {
  background: rgba(0, 255, 0, 0.2);
}

.settings-overlay {
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #0F0;
  padding: 15px;
  font-family: monospace;
  color: #0F0;
}

.settings-overlay button {
  display: block;
  width: 100%;
  margin: 5px 0;
  background: rgba(0, 255, 0, 0.1);
  border: 1px solid #0F0;
  color: #0F0;
  padding: 8px;
  cursor: pointer;
  font-family: monospace;
}

.settings-overlay button:hover {
  background: rgba(0, 255, 0, 0.2);
}
```

---

## Performance Considerations

### Optimization Tips

1. **Use requestAnimationFrame** - Provides smooth 60fps animation
2. **Adjust speed instead of framerate** - Better performance than changing FPS
3. **Limit canvas size** - Don't exceed plugin panel dimensions
4. **Use fade effect** - Avoids clearing entire canvas each frame
5. **Debounce resize events** - Prevent excessive canvas resizes

### Resource Usage

- **CPU**: ~1-2% on modern hardware
- **Memory**: ~10-20MB for canvas buffer
- **GPU**: Hardware-accelerated if available
- **Network**: Zero (pure frontend)

---

## Troubleshooting

### Matrix Not Displaying

**Issue**: Canvas shows black screen only

**Solutions**:
1. Check that plugin is enabled: `settings.enabledPlugins.includes('matrix')`
2. Verify canvas has dimensions: `canvas.offsetWidth > 0`
3. Ensure characters loaded: Check `getCharacterSet()` returns string
4. Check browser console for errors

### Animation Too Slow/Fast

**Issue**: Speed doesn't match expectations

**Solutions**:
1. Adjust speed setting (1-10 range)
2. Modify delay calculation: `delay = 50 - (config.speed * 4)`
3. Use different FPS: Change `requestAnimationFrame` timing

### Characters Not Showing

**Issue**: No characters visible on canvas

**Solutions**:
1. Verify font size isn't too small: `config.fontSize >= 8`
2. Check color contrast: Ensure color isn't black on black
3. Verify character set loaded: `characters.length > 0`
4. Check canvas context: `ctx !== null`

---

## Advanced Customizations

### Multiple Colors

```typescript
// Cycle through colors
const colors = ['#0F0', '#0FF', '#F0F', '#FF0'];
let colorIndex = 0;

setInterval(() => {
  colorIndex = (colorIndex + 1) % colors.length;
  updateConfig({ color: colors[colorIndex] });
}, 5000);
```

### Responsive Density

```typescript
// Adjust density based on window width
const updateDensity = () => {
  const width = window.innerWidth;
  const density = width > 1920 ? 8 : width > 1280 ? 5 : 3;
  updateConfig({ density });
};

window.addEventListener('resize', updateDensity);
```

### Glow Effect

```css
.matrix-panel canvas {
  filter: blur(0.5px);
  text-shadow: 0 0 10px #0F0;
}
```

---

## Summary

The Matrix plugin provides:

✅ **Pure visual effect** - No backend processing
✅ **Highly customizable** - Speed, density, size, color
✅ **Authentic Matrix aesthetic** - Japanese katakana support
✅ **Minimal overhead** - Lightweight and performant
✅ **Easy integration** - Simple API and examples
✅ **Settings persistence** - Configuration saved to settings

Perfect for adding a cyberpunk touch to your terminal management interface!
