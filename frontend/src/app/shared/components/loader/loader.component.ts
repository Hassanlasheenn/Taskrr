import { Component, OnInit, OnDestroy, PLATFORM_ID, inject, ChangeDetectorRef } from "@angular/core";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { Subject, takeUntil } from "rxjs";
import { LoaderService } from "../../../core/services/loader.service";

@Component({
    selector: 'app-loader',
    templateUrl: './loader.component.html',
    styleUrls: ['./loader.component.scss'],
    standalone: true,
    imports: [CommonModule],
})
export class LoaderComponent implements OnInit, OnDestroy {
    isLoading: boolean = false;
    private readonly _destroy$ = new Subject<void>();
    private readonly _platformId = inject(PLATFORM_ID);

    constructor(
        private readonly _loaderService: LoaderService,
        private readonly _cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this._loaderService.isLoading$
            .pipe(takeUntil(this._destroy$))
            .subscribe(loading => {
                this.isLoading = loading;
                if (isPlatformBrowser(this._platformId)) {
                    document.body.style.overflow = loading ? 'hidden' : '';
                }
                this._cdr.detectChanges();
            });
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
        if (isPlatformBrowser(this._platformId)) {
            document.body.style.overflow = '';
        }
    }
}
