import { Plugin } from 'obsidian';

export enum StopwatchState {
    Idle,
    Running,
    Paused
}

export interface StopwatchSettings {
    showInStatusBar: boolean;
    floatingPosition: { x: number; y: number } | null;
}

export const DEFAULT_SETTINGS: StopwatchSettings = {
    showInStatusBar: false,
    floatingPosition: null
};

export class StopwatchTimer {
    private state: StopwatchState = StopwatchState.Idle;
    private elapsedSeconds: number = 0;
    private startTime: number | null = null;
    private accumulatedMs: number = 0;
    private intervalId: number | null = null;
    private onTick: (elapsedSeconds: number, progress: number) => void;
    private onStateChange: (state: StopwatchState) => void;
    private settings: StopwatchSettings;
    private plugin: Plugin;

    constructor(
        plugin: Plugin,
        settings: StopwatchSettings,
        onTick: (elapsedSeconds: number, progress: number) => void,
        onStateChange: (state: StopwatchState) => void
    ) {
        this.plugin = plugin;
        this.settings = settings;
        this.onTick = onTick;
        this.onStateChange = onStateChange;
    }

    public updateSettings(settings: StopwatchSettings) {
        this.settings = settings;
    }

    start() {
        if (this.state === StopwatchState.Running) return;

        this.state = StopwatchState.Running;
        this.startTime = Date.now();

        if (this.intervalId) {
            window.clearInterval(this.intervalId);
        }

        this.intervalId = this.plugin.registerInterval(window.setInterval(() => {
            if (!this.startTime) return;

            const now = Date.now();
            const totalMs = this.accumulatedMs + (now - this.startTime);
            this.elapsedSeconds = Math.floor(totalMs / 1000);

            // Circular progress: fills 0 -> 1 every 60 seconds
            const secondsInCurrentMinute = this.elapsedSeconds % 60;
            const progress = (secondsInCurrentMinute === 0 && this.elapsedSeconds > 0)
                ? 1
                : secondsInCurrentMinute / 60;

            this.onTick(this.elapsedSeconds, progress);
        }, 250));

        this.onStateChange(this.state);
        this.emitCurrentTick();
    }

    pause() {
        if (this.state === StopwatchState.Running && this.startTime !== null) {
            if (this.intervalId) {
                window.clearInterval(this.intervalId);
                this.intervalId = null;
            }
            this.accumulatedMs += Date.now() - this.startTime;
            this.startTime = null;
            this.state = StopwatchState.Paused;
            this.onStateChange(this.state);
            this.emitCurrentTick();
        }
    }

    resume() {
        if (this.state === StopwatchState.Paused) {
            this.start();
        }
    }

    reset() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.state = StopwatchState.Idle;
        this.elapsedSeconds = 0;
        this.accumulatedMs = 0;
        this.startTime = null;
        this.onStateChange(this.state);
        this.onTick(0, 0);
    }

    private emitCurrentTick() {
        const secondsInCurrentMinute = this.elapsedSeconds % 60;
        const progress = this.elapsedSeconds === 0 ? 0 : (secondsInCurrentMinute === 0 ? 1 : secondsInCurrentMinute / 60);
        this.onTick(this.elapsedSeconds, progress);
    }

    getState(): StopwatchState {
        return this.state;
    }

    getElapsedSeconds(): number {
        return this.elapsedSeconds;
    }

    isRunning(): boolean {
        return this.state === StopwatchState.Running;
    }
}
