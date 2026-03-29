import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-progress-bar',
    templateUrl: './progress-bar.component.html',
    styleUrls: ['./progress-bar.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class ProgressBarComponent implements OnChanges {
    @Input() estimate: string = '';
    @Input() logged: string = '';
    @Input() size: 'sm' | 'md' = 'md';

    fillPercent: number = 0;
    colorClass: string = 'pb--ok';
    label: string = '';

    ngOnChanges(_: SimpleChanges): void {
        this._compute();
    }

    private _parseToMinutes(val: string): number {
        if (!val?.trim()) return 0;
        let mins = 0;
        const w = val.match(/(\d+(?:\.\d+)?)w/i);
        const d = val.match(/(\d+(?:\.\d+)?)d/i);
        const h = val.match(/(\d+(?:\.\d+)?)h/i);
        const m = val.match(/(\d+(?:\.\d+)?)m(?!s)/i);
        if (w) mins += parseFloat(w[1]) * 5 * 8 * 60;
        if (d) mins += parseFloat(d[1]) * 8 * 60;
        if (h) mins += parseFloat(h[1]) * 60;
        if (m) mins += parseFloat(m[1]);
        return mins;
    }

    private _compute(): void {
        const estimateMins = this._parseToMinutes(this.estimate);
        const loggedMins   = this._parseToMinutes(this.logged);

        if (estimateMins === 0) {
            this.fillPercent = 0;
            this.label = this.logged ? `${this.logged} logged` : '';
            this.colorClass = 'pb--ok';
            return;
        }

        const rawPct = (loggedMins / estimateMins) * 100;
        this.fillPercent = Math.min(rawPct, 100);
        this.label = `${this.logged || '0m'} / ${this.estimate}`;

        if (rawPct > 100)     this.colorClass = 'pb--over';
        else if (rawPct >= 80) this.colorClass = 'pb--warn';
        else                   this.colorClass = 'pb--ok';
    }
}
