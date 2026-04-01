 import { Injectable, Renderer2, RendererFactory2, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { BehaviorSubject, Observable } from "rxjs";

export type ThemeMode = 'light' | 'dark';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly STORAGE_KEY = 'app-theme';
    private readonly _platformId = inject(PLATFORM_ID);
    private readonly _theme$ = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
    private readonly _renderer: Renderer2;

    constructor(rendererFactory: RendererFactory2) {
        this._renderer = rendererFactory.createRenderer(null, null);
        this.applyTheme(this._theme$.value);
    }

    get theme$(): Observable<ThemeMode> {
        return this._theme$.asObservable();
    }

    get currentTheme(): ThemeMode {
        return this._theme$.value;
    }

    get isDarkMode(): boolean {
        return this._theme$.value === 'dark';
    }

    toggleTheme(): void {
        const newTheme: ThemeMode = this._theme$.value === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme: ThemeMode): void {
        this._theme$.next(theme);
        this.applyTheme(theme);
        this.saveTheme(theme);
    }

    private getInitialTheme(): ThemeMode {
        if (isPlatformBrowser(this._platformId)) {
            // Priority 1: Saved preference
            const savedTheme = localStorage.getItem(this.STORAGE_KEY) as ThemeMode;
            if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
                return savedTheme;
            }

            // Priority 2: Check current body class (set by locking script)
            if (document.body.classList.contains('dark-theme')) return 'dark';
            if (document.body.classList.contains('light-theme')) return 'light';

            // Priority 3: System preference
            if (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        }

        return 'light'; // Default to light if everything else fails
    }

    private applyTheme(theme: ThemeMode): void {
        if (!isPlatformBrowser(this._platformId)) return;
        
        const body = document.body;
        
        // Add no-transitions class to prevent layout jumps/flashes
        this._renderer.addClass(body, 'no-transitions');
        
        if (theme === 'dark') {
            this._renderer.addClass(body, 'dark-theme');
            this._renderer.removeClass(body, 'light-theme');
        } else {
            this._renderer.addClass(body, 'light-theme');
            this._renderer.removeClass(body, 'dark-theme');
        }

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1a2e' : '#f5f5f5');
        }

        // Remove no-transitions class after a short delay to allow theme change to settle
        setTimeout(() => {
            this._renderer.removeClass(body, 'no-transitions');
        }, 10);
    }

    private saveTheme(theme: ThemeMode): void {
        if (isPlatformBrowser(this._platformId)) {
            localStorage.setItem(this.STORAGE_KEY, theme);
        }
    }
}
