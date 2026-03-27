import { Directive, EventEmitter, HostListener, Input, OnDestroy, Output, ElementRef, Renderer2, inject } from '@angular/core';
import { Subject, Subscription, combineLatest } from 'rxjs';
import { throttleTime, map } from 'rxjs/operators';
import { LoaderService } from '../../core/services/loader.service';

@Directive({
  selector: '[appClickThrottle]',
  standalone: true
})
export class ClickThrottleDirective implements OnDestroy {
  @Input() throttleTime = 500;
  @Input() showSpinner = true;
  @Output() throttledClick = new EventEmitter<MouseEvent>();

  private clicks = new Subject<MouseEvent>();
  private subscription: Subscription;
  private loaderSubscription: Subscription;
  
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);
  private loaderService = inject(LoaderService);

  private originalContent: string = '';
  private isLoading = false;

  constructor() {
    this.subscription = this.clicks
      .pipe(throttleTime(this.throttleTime))
      .subscribe(event => {
        if (!this.isLoading) {
          this.throttledClick.emit(event);
        }
      });

    // Automatically manage disabled state based on global loader
    this.loaderSubscription = this.loaderService.isLoading$.subscribe(loading => {
      this.isLoading = loading;
      this.updateState();
    });
  }

  @HostListener('click', ['$event'])
  clickEvent(event: MouseEvent): void {
    if (this.isLoading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.clicks.next(event);
  }

  private updateState(): void {
    const nativeElement = this.el.nativeElement;
    
    if (this.isLoading) {
      this.renderer.setAttribute(nativeElement, 'disabled', 'true');
      this.renderer.addClass(nativeElement, 'btn-loading');
      
      if (this.showSpinner && !nativeElement.querySelector('.spinner-border')) {
        this.originalContent = nativeElement.innerHTML;
        const spinner = this.renderer.createElement('span');
        this.renderer.addClass(spinner, 'spinner-border');
        this.renderer.addClass(spinner, 'spinner-border-sm');
        this.renderer.addClass(spinner, 'me-2');
        this.renderer.setAttribute(spinner, 'role', 'status');
        
        // Only prepend if it's not already there
        this.renderer.insertBefore(nativeElement, spinner, nativeElement.firstChild);
      }
    } else {
      this.renderer.removeAttribute(nativeElement, 'disabled');
      this.renderer.removeClass(nativeElement, 'btn-loading');
      
      const spinner = nativeElement.querySelector('.spinner-border');
      if (spinner) {
        this.renderer.removeChild(nativeElement, spinner);
      }
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.loaderSubscription.unsubscribe();
  }
}
