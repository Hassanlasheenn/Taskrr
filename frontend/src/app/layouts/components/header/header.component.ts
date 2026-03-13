import { Component, HostListener, OnInit, OnDestroy } from "@angular/core";
import { Router, NavigationEnd, RouterLink } from "@angular/router";
import { NgIf } from "@angular/common";
import { filter, Subject, takeUntil } from "rxjs";
import { AuthService } from "../../../auth/services";
import { NavigationService } from "../../../core/services/navigation.service";
import { ThemeService, ThemeMode } from "../../../core/services/theme.service";
import { LayoutPaths } from "../../enums";
import { ThemeToggleComponent } from "../../../shared/components/theme-toggle/theme-toggle.component";
import { NotificationsComponent } from "../../../shared/components";

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    standalone: true,
    styleUrls: ['./header.component.scss'],
    imports: [NgIf, RouterLink, ThemeToggleComponent, NotificationsComponent]
})
export class HeaderComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    isDropdownOpen = false;
    isAuthenticated = false;
    isAdmin = false;
    userEmail: string = '';
    userPhoto: string | null = null;
    showMobileMenu: boolean = false;
    currentTheme: ThemeMode = 'light';
    LayoutPaths = LayoutPaths;

    constructor(
        private readonly _authService: AuthService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        private readonly _themeService: ThemeService
    ) {}

    ngOnInit(): void {
        this.checkAuthentication();
        this.updateMobileMenuVisibility();
        
        this._themeService.theme$
            .pipe(takeUntil(this._destroy$))
            .subscribe(theme => {
                this.currentTheme = theme;
            });

        this._router.events
            .pipe(
                filter(event => event instanceof NavigationEnd),
                takeUntil(this._destroy$)
            )
            .subscribe(() => {
                this.checkAuthentication();
                this.updateMobileMenuVisibility();
            });
    }

    private updateMobileMenuVisibility(): void {
        const url = this._router.url;
        // Check if on dashboard or root path
        this.showMobileMenu = this.isAuthenticated && (url === '/' || url.includes(LayoutPaths.DASHBOARD));
    }

    toggleMobileMenu(): void {
        this._navService.toggleNavSidebar();
    }

    toggleTheme(): void {
        this._themeService.toggleTheme();
    }

    get isDarkMode(): boolean {
        return this.currentTheme === 'dark';
    }

    private checkAuthentication(): void {
        this.isAuthenticated = this._authService.isAuthenticated();
        this.isAdmin = this._authService.isAdmin();
        
        if (this.isAuthenticated) {
            const userData = this._authService.getCurrentUserData();
            this.userEmail = userData?.email || '';
            this.userPhoto = userData?.photo || null;
        } else {
            this.userEmail = '';
            this.userPhoto = null;
            this.isAdmin = false;
        }
    }

    toggleDropdown(): void {
        this.isDropdownOpen = !this.isDropdownOpen;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        
        if (target.closest('.dropdown') || !document.body.contains(target)) {
            return;
        }
        
        this.isDropdownOpen = false;
    }

    onProfile(): void {
        this.isDropdownOpen = false;
        this._router.navigate([LayoutPaths.PROFILE]);
    }

    onLogout(): void {
        this.isDropdownOpen = false;
        this.isAuthenticated = false;
        this.userEmail = '';
        this._authService.logout().subscribe({
            next: () => {
                this._router.navigate(['/login']);
            },
            error: () => {
                this._router.navigate(['/login']);
            }
        });
    }

    getPhotoUrl(): string {
        return this.userPhoto || '';
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
