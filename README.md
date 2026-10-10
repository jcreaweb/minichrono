# Minichrono

**Minichrono** is a minimal, elegant stopwatch plugin for [Obsidian](https://obsidian.md). It integrates directly into the header view actions bar of your notes, deploying horizontally to the left so it never obstructs your content.

---

### Features

- **Horizontal Leftward Deployment:** Hovering over or clicking the timer icon smoothly expands the control panel to the left along the top toolbar, keeping your note view unobstructed.
- **Circular Second-Hand:** A clean SVG progress ring provides real-time visual feedback, completing a full circular rotation every 60 seconds.
- **Accurate Time Tracking:** Uses timestamp-based elapsed time calculations so it never drifts when Obsidian is in the background or minimized.
- **Intuitive Controls:**
  - **Left-click on time or Play button:** Start / Pause the stopwatch.
  - **Reset button (or right-click on time):** Reset back to `00:00`.
  - **Click icon:** Pin / unpin the control panel to keep it open while working.
- **Dynamic Formatting:** Automatically displays `MM:SS` and seamlessly switches to `HH:MM:SS` after reaching 60 minutes.
- **Command Palette Support:**
  - `Minidoro: Iniciar/pausar cronómetro`
  - `Minidoro: Reiniciar cronómetro`

---

### Installation

#### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create a folder named `minichrono` in your Obsidian vault's plugin directory: `<vault>/.obsidian/plugins/minichrono`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that directory.
4. Reload Obsidian or reload community plugins, then enable **Minichrono**.

---

### Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development with hot reload
npm run dev
```

---

### License

This project is licensed under the [MIT License](LICENSE).
