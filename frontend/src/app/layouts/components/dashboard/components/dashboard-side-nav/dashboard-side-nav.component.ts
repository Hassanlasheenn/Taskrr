import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DashboardSections } from "../../../../enums/dashboard-sections.enum";

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
export class DashboardSideNavComponent {
    @Input() activeSection: DashboardSections = DashboardSections.DASHBOARD;
    @Output() sectionChange = new EventEmitter<DashboardSections>();

    DashboardSections = DashboardSections;

    navItems: NavItem[] = [
        { section: DashboardSections.DASHBOARD, icon: 'bi-speedometer2', label: 'Dashboard' },
        { section: DashboardSections.CALENDAR, icon: 'bi-calendar3', label: 'Calendar' },
        { section: DashboardSections.COMPLETED, icon: 'bi-check-circle', label: 'Completed' }
    ];

    onSectionClick(section: DashboardSections): void {
        this.sectionChange.emit(section);
    }
}

