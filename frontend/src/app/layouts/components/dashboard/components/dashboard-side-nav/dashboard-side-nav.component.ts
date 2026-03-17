import { Component, Input, Output, EventEmitter, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DashboardSections } from "../../../../enums/dashboard-sections.enum";
import { AuthService } from "../../../../../auth/services";
import { trackById } from "../../../../../shared/helpers/trackByFn.helper";

interface NavItem {
    section: DashboardSections;
    icon: string;
    label: string;
}

@Component({
    selector: 'app-dashboard-side-nav',
    templateUrl: './dashboard-side-nav.component.html',
    styleUrls: ['./dashboard-side-nav.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class DashboardSideNavComponent implements OnInit {
    @Input() activeSection: DashboardSections = DashboardSections.DASHBOARD;
    @Output() sectionChange = new EventEmitter<DashboardSections>();

    DashboardSections = DashboardSections;
    isAdmin: boolean = false;
    trackById = trackById;

    navItems: NavItem[] = [
        { section: DashboardSections.DASHBOARD, icon: 'bi-clipboard-check', label: 'Dashboard' },
        { section: DashboardSections.CALENDAR, icon: 'bi-calendar3', label: 'Calendar' },
        { section: DashboardSections.MY_ASSIGNED, icon: 'bi-person-check', label: 'My Todos' },
        { section: DashboardSections.COMPLETED, icon: 'bi-check-circle', label: 'Completed' }
    ];

    constructor(private readonly _authService: AuthService) {}

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        if (this.isAdmin) {
            this.navItems.push({
                section: DashboardSections.ADMIN_PANEL,
                icon: 'bi-shield-check',
                label: 'Admin Panel'
            });
            this.navItems.push({
                section: DashboardSections.USER_MANAGEMENT,
                icon: 'bi-people',
                label: 'User Management'
            });
        }
    }

    onSectionClick(section: DashboardSections): void {
        this.sectionChange.emit(section);
    }
}

