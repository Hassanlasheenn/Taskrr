import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './layouts/components/header/header.component';
import { LoaderComponent } from './shared/components/loader/loader.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { ConfirmationDialogComponent } from './shared/components/confirmation-dialog/confirmation-dialog.component';
import { SessionExpiryDialogComponent } from './shared/components/session-expiry-dialog/session-expiry-dialog.component';
import { PosthogService, NavigationService } from './core/services';
import { SeoService } from './core/services/seo.service';
import { AuthService } from './auth/services';
import { DashboardSideNavComponent } from './layouts/components/dashboard/components/dashboard-side-nav/dashboard-side-nav.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { DashboardSections } from './layouts/enums/dashboard-sections.enum';
import { LayoutPaths } from './layouts/enums/layout-paths.enum';
import { filter, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet, 
    HeaderComponent, 
    LoaderComponent, 
    ToastComponent, 
    ConfirmationDialogComponent,
    SessionExpiryDialogComponent,
    DashboardSideNavComponent,
    SidebarComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly _posthogService = inject(PosthogService);
  private readonly _router = inject(Router);
  private readonly _seoService = inject(SeoService);
  private readonly _authService = inject(AuthService);
  private readonly _navService = inject(NavigationService);
  private readonly _destroy$ = new Subject<void>();

  isLoggedIn = false;
  isNavSidebarOpen = false;
  activeSection = DashboardSections.DASHBOARD;
  readonly DashboardSections = DashboardSections;

  ngOnInit(): void {
    this._seoService.init();
    this._seoService.setStructuredData({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'Taskrr',
      'url': 'https://taskrr.app',
      'description': 'Manage your tasks efficiently with Taskrr. The ultimate task management tool for individuals and teams.',
      'potentialAction': {
        '@type': 'SearchAction',
        'target': 'https://taskrr.app/search?q={search_term_string}',
        'query-input': 'required name=search_term_string'
      }
    });

    this._authService.isLoggedIn$
      .pipe(takeUntil(this._destroy$))
      .subscribe(loggedIn => this.isLoggedIn = loggedIn);

    this._navService.activeSection$
      .pipe(takeUntil(this._destroy$))
      .subscribe(section => this.activeSection = section);

    this._navService.toggleNavSidebar$
      .pipe(takeUntil(this._destroy$))
      .subscribe(() => this.isNavSidebarOpen = !this.isNavSidebarOpen);

    this._navService.closeNavSidebar$
      .pipe(takeUntil(this._destroy$))
      .subscribe(() => this.isNavSidebarOpen = false);

    this._router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this._destroy$)
    ).subscribe((event: any) => {
      this._posthogService.capturePageView();
      this.updateActiveSection(event.urlAfterRedirects);
    });
  }

  private updateActiveSection(url: string): void {
    if (url.includes(LayoutPaths.CALENDAR)) {
      this._navService.setActiveSection(DashboardSections.CALENDAR);
    } else if (url.includes(LayoutPaths.COMPLETED)) {
      this._navService.setActiveSection(DashboardSections.COMPLETED);
    } else if (url.includes(LayoutPaths.ADMIN_PANEL) || url.includes(LayoutPaths.ADMIN)) {
      this._navService.setActiveSection(DashboardSections.ADMIN_PANEL);
    } else {
      this._navService.setActiveSection(DashboardSections.DASHBOARD);
    }
  }

  onSectionChange(section: DashboardSections): void {
    this._navService.setActiveSection(section);
    this.isNavSidebarOpen = false;

    let path = '';
    switch(section) {
        case DashboardSections.CALENDAR: path = LayoutPaths.CALENDAR; break;
        case DashboardSections.COMPLETED: path = LayoutPaths.COMPLETED; break;
        case DashboardSections.ADMIN_PANEL: path = LayoutPaths.ADMIN_PANEL; break;
        case DashboardSections.USER_MANAGEMENT: path = LayoutPaths.ADMIN; break;
        default: path = LayoutPaths.DASHBOARD; break;
    }
    this._router.navigate([path]);
  }

  onNavSidebarClose(): void {
    this.isNavSidebarOpen = false;
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }
}
