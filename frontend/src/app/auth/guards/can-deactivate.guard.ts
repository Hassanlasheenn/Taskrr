import { CanDeactivateFn } from "@angular/router";
import { Observable } from "rxjs";

/**
 * Implement this interface on route components that need to confirm navigation
 * when the user has unsaved changes (e.g. forms, editable views).
 */
export interface CanComponentDeactivate {
    canDeactivate(): boolean | Observable<boolean> | Promise<boolean>;
}

export const canDeactivateGuard: CanDeactivateFn<CanComponentDeactivate> = (component) => {
    return component?.canDeactivate ? component.canDeactivate() : true;
};
