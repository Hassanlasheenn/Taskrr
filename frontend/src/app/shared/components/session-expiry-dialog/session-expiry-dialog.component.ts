import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { SessionExpiryDialogService } from '../../../core/services/session-expiry-dialog.service';

@Component({
    selector: 'app-session-expiry-dialog',
    templateUrl: './session-expiry-dialog.component.html',
    styleUrls: ['./session-expiry-dialog.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class SessionExpiryDialogComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    isVisible = false;

    constructor(private readonly _dialogService: SessionExpiryDialogService) {}

    ngOnInit(): void {
        this._dialogService.isVisible$
            .pipe(takeUntil(this._destroy$))
            .subscribe(visible => this.isVisible = visible);
    }

    onContinue(): void {
        this._dialogService.choose('refresh');
    }

    onLogout(): void {
        this._dialogService.choose('logout');
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
