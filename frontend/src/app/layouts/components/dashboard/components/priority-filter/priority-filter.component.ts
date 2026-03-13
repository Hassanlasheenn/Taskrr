import { Component, Output, EventEmitter, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
    selector: 'app-priority-filter',
    templateUrl: './priority-filter.component.html',
    styleUrls: ['./priority-filter.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class PriorityFilterComponent {
    @Input() activePriority: string = 'all';
    @Output() priorityChange = new EventEmitter<string>();

    priorities = [
        { value: 'all', label: 'All Priorities' },
        { value: 'high', label: 'High Priority' },
        { value: 'medium', label: 'Medium Priority' },
        { value: 'low', label: 'Low Priority' }
    ];

    onPriorityChange(event: Event): void {
        const target = event.target as HTMLSelectElement;
        const priority = target.value;
        this.activePriority = priority;
        this.priorityChange.emit(priority);
    }
}
