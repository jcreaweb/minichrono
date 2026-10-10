import { App, Plugin, PluginSettingTab, Setting, Notice, WorkspaceLeaf, addIcon, setIcon } from 'obsidian';
import { StopwatchTimer, StopwatchState, StopwatchSettings, DEFAULT_SETTINGS } from './StopwatchTimer';

export default class StopwatchPlugin extends Plugin {
    settings: StopwatchSettings;
    private timer: StopwatchTimer;

    // UI Elements
    private containerEl: HTMLDivElement | null = null;
    private controlPanelEl: HTMLDivElement | null = null;
    private pieCircleEl: SVGCircleElement | null = null;
    private panelTimeEl: HTMLButtonElement | null = null;
    private playPauseBtn: HTMLButtonElement | null = null;
    private resetBtn: HTMLButtonElement | null = null;
    private isPanelPinned = false;
    private hideTimeout: number | null = null;

    async onload() {
        await this.loadSettings();

        // Register the custom timer icon (SVG structure)
        addIcon('minidoro-timer', `
            <svg viewBox="0 0 20 20" class="minidoro-pie-chart">
                <circle class="minidoro-progress-track" cx="10" cy="10" r="8" fill="transparent" stroke-width="3"></circle>
                <circle class="minidoro-progress-circle" cx="10" cy="10" r="8" fill="transparent" stroke-width="3"></circle>
            </svg>
        `);

        this.timer = new StopwatchTimer(
            this,
            this.settings,
            (elapsed, progress) => this.updateUI(elapsed, progress),
            () => this.updateUI(this.timer.getElapsedSeconds(), (this.timer.getElapsedSeconds() % 60) / 60)
        );

        this.addSettingTab(new StopwatchSettingTab(this.app, this));

        // Register commands for keyboard shortcuts
        this.addCommand({
            id: 'start-pause-stopwatch',
            name: 'Iniciar/pausar cronómetro',
            callback: () => {
                this.handlePlayPauseClick();
            }
        });

        this.addCommand({
            id: 'reset-stopwatch',
            name: 'Reiniciar cronómetro',
            callback: () => {
                this.handleResetClick();
            }
        });

        // Register active leaf change event
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => this.refreshHeaderButton(leaf)));
        this.app.workspace.onLayoutReady(() => this.refreshHeaderButton());

        // Register DOM event for document click to ensure cleanup of pinned panel
        this.registerDomEvent(document, 'click', (event: MouseEvent) => {
            this.handleDocumentClick(event);
        });
    }

    onunload() {
        if (this.hideTimeout !== null) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        this.removeHeaderButton();
        this.timer.reset();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.timer.updateSettings(this.settings);
    }

    private refreshHeaderButton(leaf: WorkspaceLeaf | null = null) {
        this.removeHeaderButton();

        const targetLeaf = leaf || this.app.workspace.getLeaf(false);
        if (!targetLeaf) return;

        setTimeout(() => {
            if (!targetLeaf.view) return;

            const actionsContainer = targetLeaf.view.containerEl.querySelector('.view-actions');
            if (actionsContainer && !actionsContainer.querySelector('.minidoro-container')) {
                this.createHeaderButton(actionsContainer);
                this.updateUI(this.timer.getElapsedSeconds(), 0);
            }
        }, 0);
    }

    private createHeaderButton(parent: Element) {
        this.containerEl = parent.createEl('div', { cls: 'minidoro-container' });

        // Event Listeners for Hover
        this.containerEl.addEventListener('mouseenter', this.showPanel);
        this.containerEl.addEventListener('mouseleave', this.hidePanel);

        const pieButton = this.containerEl.createEl('button', { cls: 'minidoro-pie-button' });
        pieButton.setAttribute('aria-label', 'Minidoro cronómetro');
        pieButton.onclick = (event) => {
            event.stopPropagation();
            this.isPanelPinned = !this.isPanelPinned;
            if (this.isPanelPinned) {
                this.showPanel();
            } else {
                this.hidePanel();
            }
        };

        // Custom icon SVG
        setIcon(pieButton, 'minidoro-timer');

        // Reference to progress circle SVG element
        this.pieCircleEl = pieButton.querySelector('.minidoro-progress-circle');

        parent.prepend(this.containerEl);

        this.createControlPanel();
    }

    private createControlPanel() {
        if (!this.containerEl) return;
        this.controlPanelEl = this.containerEl.createEl('div', { cls: 'minidoro-control-panel' });

        // Time display button (Click to start/pause, right-click to reset)
        this.panelTimeEl = this.controlPanelEl.createEl('button', {
            cls: 'minidoro-panel-time',
            attr: { 'title': 'Clic: Iniciar/Pausar | Clic derecho: Reiniciar' }
        });
        this.panelTimeEl.setText('00:00');
        this.panelTimeEl.onclick = (e) => {
            e.stopPropagation();
            this.handlePlayPauseClick();
        };
        this.panelTimeEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleResetClick();
        };

        // Play/Pause button
        this.playPauseBtn = this.controlPanelEl.createEl('button', {
            cls: 'minidoro-btn minidoro-play-btn',
            attr: { 'title': 'Iniciar / Pausar' }
        });
        setIcon(this.playPauseBtn, 'play');
        this.playPauseBtn.onclick = (e) => {
            e.stopPropagation();
            this.handlePlayPauseClick();
        };

        // Reset button
        this.resetBtn = this.controlPanelEl.createEl('button', {
            cls: 'minidoro-btn minidoro-reset-btn',
            attr: { 'title': 'Reiniciar (00:00)' }
        });
        setIcon(this.resetBtn, 'rotate-ccw');
        this.resetBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleResetClick();
        };
    }

    private removeHeaderButton() {
        if (this.hideTimeout !== null) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        this.containerEl?.remove();
        this.containerEl = this.controlPanelEl = this.pieCircleEl = this.panelTimeEl = this.playPauseBtn = this.resetBtn = null;
        this.isPanelPinned = false;
    }

    private showPanel = () => {
        if (this.hideTimeout !== null) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        this.controlPanelEl?.addClass('is-panel-visible');
    };

    private hidePanel = () => {
        if (!this.isPanelPinned) {
            this.hideTimeout = window.setTimeout(() => {
                this.controlPanelEl?.removeClass('is-panel-visible');
                this.hideTimeout = null;
            }, 300);
        }
    };

    private handleDocumentClick = (event: MouseEvent) => {
        if (this.containerEl && !this.containerEl.contains(event.target as Node)) {
            if (this.isPanelPinned) {
                this.isPanelPinned = false;
                if (this.hideTimeout !== null) {
                    clearTimeout(this.hideTimeout);
                    this.hideTimeout = null;
                }
                this.controlPanelEl?.removeClass('is-panel-visible');
            }
        }
    };

    private updateUI(elapsedSeconds: number, progress: number) {
        if (!this.pieCircleEl || !this.panelTimeEl) return;

        const state = this.timer.getState();

        // Update classes
        this.pieCircleEl.removeClass('minidoro-running', 'minidoro-paused', 'minidoro-idle');

        if (state === StopwatchState.Running) {
            this.pieCircleEl.addClass('minidoro-running');
        } else if (state === StopwatchState.Paused) {
            this.pieCircleEl.addClass('minidoro-paused');
        } else {
            this.pieCircleEl.addClass('minidoro-idle');
        }

        // Circular progress (segundero 60s)
        const radius = this.pieCircleEl.r?.baseVal?.value || 8;
        const circumference = 2 * Math.PI * radius;

        this.pieCircleEl.style.setProperty('--progress', progress.toString());
        this.pieCircleEl.style.setProperty('--circumference', circumference.toString());

        // Update display text
        this.panelTimeEl.setText(this.formatTime(elapsedSeconds));

        // Update play/pause icon
        if (this.playPauseBtn) {
            this.playPauseBtn.empty();
            if (state === StopwatchState.Running) {
                setIcon(this.playPauseBtn, 'pause');
                this.playPauseBtn.setAttribute('aria-label', 'Pausar cronómetro');
                this.playPauseBtn.addClass('is-active');
            } else {
                setIcon(this.playPauseBtn, 'play');
                this.playPauseBtn.setAttribute('aria-label', 'Iniciar cronómetro');
                this.playPauseBtn.removeClass('is-active');
            }
        }
    }

    private formatTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const mm = minutes.toString().padStart(2, '0');
        const ss = seconds.toString().padStart(2, '0');

        if (hours > 0) {
            const hh = hours.toString().padStart(2, '0');
            return `${hh}:${mm}:${ss}`;
        }
        return `${mm}:${ss}`;
    }

    private handlePlayPauseClick = () => {
        if (this.timer.isRunning()) {
            this.timer.pause();
        } else {
            this.timer.start();
        }
    };

    private handleResetClick = () => {
        this.timer.reset();
        new Notice('Cronómetro reiniciado');
    };
}

class StopwatchSettingTab extends PluginSettingTab {
    plugin: StopwatchPlugin;

    constructor(app: App, plugin: StopwatchPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Configuración de Minidoro Cronómetro' });

        new Setting(containerEl)
            .setName('Atajos y controles')
            .setDesc('Puedes desplegar el cronómetro pasando el ratón sobre su icono o haciendo clic para fijarlo. También puedes asignar atajos de teclado desde Preferencias > Combinaciones de teclas para Iniciar/Pausar o Reiniciar.');
    }
}