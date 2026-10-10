import { App, Plugin, PluginSettingTab, Setting, Notice, addIcon, setIcon } from 'obsidian';
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
    private isPanelPinned = false;
    private hideTimeout: number | null = null;
    private isDragging = false;

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

        this.addCommand({
            id: 'reset-position-stopwatch',
            name: 'Restablecer posición del cronómetro',
            callback: () => {
                this.resetWidgetPosition();
            }
        });

        // Initialize floating widget once layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.createFloatingWidget();
        });

        // Register DOM event for document click to unpin panel
        this.registerDomEvent(document, 'click', (event: MouseEvent) => {
            this.handleDocumentClick(event);
        });

        // Reposition on window resize if off-screen
        this.registerDomEvent(window, 'resize', () => {
            if (this.containerEl) {
                this.clampWidgetPosition(this.containerEl);
            }
        });
    }

    onunload() {
        if (this.hideTimeout !== null) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        this.containerEl?.remove();
        this.containerEl = this.controlPanelEl = this.pieCircleEl = this.panelTimeEl = this.playPauseBtn = null;
        this.timer.reset();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.timer.updateSettings(this.settings);
    }

    public resetWidgetPosition() {
        this.settings.floatingPosition = null;
        void this.saveSettings();
        if (this.containerEl) {
            this.applyInitialPosition(this.containerEl);
        }
        new Notice('Posición del cronómetro restablecida');
    }

    private createFloatingWidget() {
        if (this.containerEl) return;

        // Mount directly to document.body so it is completely fixed to viewport and never scrolls
        this.containerEl = document.body.createEl('div', { cls: 'minidoro-container' });

        this.applyInitialPosition(this.containerEl);
        this.initDraggable(this.containerEl);

        // Hover listeners
        this.containerEl.addEventListener('mouseenter', () => {
            if (!this.isDragging) this.showPanel();
        });
        this.containerEl.addEventListener('mouseleave', () => {
            if (!this.isDragging) this.hidePanel();
        });

        // Main button
        const pieButton = this.containerEl.createEl('button', { cls: 'minidoro-pie-button' });
        pieButton.setAttribute('aria-label', 'Minichrono (Arrastra para mover | Clic para fijar)');
        pieButton.setAttribute('title', 'Arrastra para mover | Clic para fijar panel');

        pieButton.onclick = (event) => {
            if (this.isDragging) return;
            event.stopPropagation();
            this.isPanelPinned = !this.isPanelPinned;
            if (this.isPanelPinned) {
                this.showPanel();
            } else {
                this.hidePanel();
            }
        };

        // Icon SVG
        setIcon(pieButton, 'minidoro-timer');

        // Reference to progress circle SVG
        this.pieCircleEl = pieButton.querySelector('.minidoro-progress-circle');

        this.createControlPanel();
        this.updateUI(this.timer.getElapsedSeconds(), 0);
    }

    private applyInitialPosition(el: HTMLElement) {
        let x: number;
        let y: number;

        if (this.settings.floatingPosition) {
            x = this.settings.floatingPosition.x;
            y = this.settings.floatingPosition.y;
        } else {
            // Default: Top-right corner of workspace, below ribbon header
            x = window.innerWidth - 65;
            y = 70;
        }

        const maxX = Math.max(10, window.innerWidth - 50);
        const maxY = Math.max(10, window.innerHeight - 50);
        x = Math.max(10, Math.min(x, maxX));
        y = Math.max(10, Math.min(y, maxY));

        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        if (x < 220) {
            el.addClass('deploy-right');
        } else {
            el.removeClass('deploy-right');
        }
    }

    private clampWidgetPosition(el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        const maxX = Math.max(10, window.innerWidth - rect.width - 10);
        const maxY = Math.max(10, window.innerHeight - rect.height - 10);
        const newX = Math.max(10, Math.min(rect.left, maxX));
        const newY = Math.max(10, Math.min(rect.top, maxY));

        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;

        if (newX < 220) {
            el.addClass('deploy-right');
        } else {
            el.removeClass('deploy-right');
        }
    }

    private initDraggable(el: HTMLElement) {
        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;
        let hasMoved = false;

        const startDrag = (clientX: number, clientY: number, target: Node): boolean => {
            if (this.controlPanelEl && this.controlPanelEl.contains(target)) {
                return false;
            }
            startX = clientX;
            startY = clientY;
            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            hasMoved = false;
            this.isDragging = false;
            return true;
        };

        const moveDrag = (clientX: number, clientY: number, preventDefault: () => void) => {
            const dx = clientX - startX;
            const dy = clientY - startY;

            if (!hasMoved && Math.hypot(dx, dy) > 6) {
                hasMoved = true;
                this.isDragging = true;
                el.addClass('is-dragging');
            }

            if (this.isDragging) {
                preventDefault();
                let newX = initialX + dx;
                let newY = initialY + dy;

                const maxX = Math.max(10, window.innerWidth - 45);
                const maxY = Math.max(10, window.innerHeight - 45);
                newX = Math.max(10, Math.min(newX, maxX));
                newY = Math.max(10, Math.min(newY, maxY));

                el.style.left = `${newX}px`;
                el.style.top = `${newY}px`;

                if (newX < 220) {
                    el.addClass('deploy-right');
                } else {
                    el.removeClass('deploy-right');
                }
            }
        };

        const endDrag = () => {
            if (this.isDragging) {
                el.removeClass('is-dragging');
                const finalRect = el.getBoundingClientRect();
                this.settings.floatingPosition = { x: Math.round(finalRect.left), y: Math.round(finalRect.top) };
                void this.saveSettings();

                setTimeout(() => {
                    this.isDragging = false;
                }, 100);
            } else {
                this.isDragging = false;
            }
        };

        // --- Mouse Events (Desktop) ---
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            if (!startDrag(e.clientX, e.clientY, e.target as Node)) return;

            const onMouseMove = (moveEvent: MouseEvent) => {
                moveDrag(moveEvent.clientX, moveEvent.clientY, () => moveEvent.preventDefault());
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                endDrag();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        // --- Touch Events (Android / iOS) ---
        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            if (!startDrag(touch.clientX, touch.clientY, e.target as Node)) return;

            const onTouchMove = (moveEvent: TouchEvent) => {
                if (moveEvent.touches.length !== 1) return;
                const t = moveEvent.touches[0];
                moveDrag(t.clientX, t.clientY, () => {
                    if (moveEvent.cancelable) {
                        moveEvent.preventDefault();
                    }
                });
            };

            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchEnd);
                endDrag();
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchEnd);
        };

        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('touchstart', onTouchStart, { passive: true });
    }

    private createControlPanel() {
        if (!this.containerEl) return;
        this.controlPanelEl = this.containerEl.createEl('div', { cls: 'minidoro-control-panel' });

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

        // Time display button (Click: Play/Pause | Long-press / Right-click: Reset)
        this.panelTimeEl = this.controlPanelEl.createEl('button', {
            cls: 'minidoro-panel-time',
            attr: { 'title': 'Clic: Iniciar/Pausar | Mantener pulsado (o clic derecho): Reiniciar' }
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
    }

    private showPanel = () => {
        if (this.hideTimeout !== null) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        this.controlPanelEl?.addClass('is-panel-visible');
    };

    private hidePanel = () => {
        if (!this.isPanelPinned && !this.isDragging) {
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

        this.pieCircleEl.removeClass('minidoro-running', 'minidoro-paused', 'minidoro-idle');

        if (state === StopwatchState.Running) {
            this.pieCircleEl.addClass('minidoro-running');
        } else if (state === StopwatchState.Paused) {
            this.pieCircleEl.addClass('minidoro-paused');
        } else {
            this.pieCircleEl.addClass('minidoro-idle');
        }

        const radius = this.pieCircleEl.r?.baseVal?.value || 8;
        const circumference = 2 * Math.PI * radius;

        this.pieCircleEl.style.setProperty('--progress', progress.toString());
        this.pieCircleEl.style.setProperty('--circumference', circumference.toString());

        this.panelTimeEl.setText(this.formatTime(elapsedSeconds));

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

        containerEl.createEl('h2', { text: 'Configuración de Minichrono' });

        new Setting(containerEl)
            .setName('Restablecer posición')
            .setDesc('Devuelve el widget flotante a su posición inicial en la esquina superior derecha.')
            .addButton(btn => btn
                .setButtonText('Restablecer posición')
                .onClick(() => {
                    this.plugin.resetWidgetPosition();
                }));

        new Setting(containerEl)
            .setName('Interacción')
            .setDesc('Puedes arrastrar el widget con el ratón a cualquier lugar de la ventana. Nunca se moverá con el scroll de tus notas.');
    }
}