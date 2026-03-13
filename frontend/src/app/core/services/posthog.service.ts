import { DestroyRef, Injectable, NgZone } from "@angular/core";
import posthog from "posthog-js";
import { environment } from "../../../environments/environment";
import { Router } from "@angular/router";

@Injectable({ providedIn: "root" })
export class PosthogService {
  private _isInitialized = false;

  constructor(
    private ngZone: NgZone,
    private router: Router,
    private destroyRef: DestroyRef,
  ) {
    this.initPostHog();
  }

  private initPostHog() {
    if (this._isInitialized) return;

    if (environment.posthogKey) {
      this.ngZone.runOutsideAngular(() => {
        posthog.init(environment.posthogKey, {
          api_host: environment.posthogHost,
          // Following your snippet's defaults
          defaults: '2026-01-30',
          // Capture pageview manually to handle SPAs correctly
          capture_pageview: false, 
          // Set to true if you want to record user sessions
          session_recording: {
            maskAllInputs: true
          }
        });
        this._isInitialized = true;
      });
    } else {
      console.warn('PostHog key not found. Analytics will not be sent.');
    }
  }

  /**
   * Capture a custom event.
   */
  capture(eventName: string, properties?: any) {
    if (this._isInitialized) {
      this.ngZone.runOutsideAngular(() => {
        posthog.capture(eventName, properties);
      });
    }
  }

  /**
   * Track a page view manually.
   */
  capturePageView() {
    if (this._isInitialized) {
      this.ngZone.runOutsideAngular(() => {
        posthog.capture('$pageview');
      });
    }
  }

  /**
   * Identify a user to connect events to their profile.
   */
  identify(userId: string | number, properties?: any) {
    if (this._isInitialized) {
      this.ngZone.runOutsideAngular(() => {
        posthog.identify(String(userId), properties);
      });
    }
  }

  /**
   * Clear user identity on logout.
   */
  reset() {
    if (this._isInitialized) {
      this.ngZone.runOutsideAngular(() => {
        posthog.reset();
      });
    }
  }
}
