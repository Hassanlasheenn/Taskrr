import { Injectable } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";
import { DashboardSections } from "../../layouts/enums/dashboard-sections.enum";

@Injectable({
    providedIn: 'root',
})
export class NavigationService {
    private readonly _activeSection$ = new BehaviorSubject<DashboardSections>(DashboardSections.DASHBOARD);
    activeSection$ = this._activeSection$.asObservable();

    private readonly _toggleNavSidebar$ = new Subject<void>();
    toggleNavSidebar$ = this._toggleNavSidebar$.asObservable();

    private readonly _closeNavSidebar$ = new Subject<void>();
    closeNavSidebar$ = this._closeNavSidebar$.asObservable();

    setActiveSection(section: DashboardSections): void {
        this._activeSection$.next(section);
    }

    getActiveSection(): DashboardSections {
        return this._activeSection$.getValue();
    }

    toggleNavSidebar(): void {
        this._toggleNavSidebar$.next();
    }

    closeNavSidebar(): void {
        this._closeNavSidebar$.next();
    }
}
