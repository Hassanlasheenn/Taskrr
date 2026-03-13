import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../services";
import { LayoutPaths } from "../../layouts/enums/layout-paths.enum";

export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
        router.navigate(['/login']);
        return false;
    }

    // Get fresh user data to check role
    const userData = authService.getCurrentUserData();
    
    // If user data doesn't have role, try to fetch it
    if (!userData || !userData.role) {
        // User data will be fetched automatically by AuthService
        // For now, redirect to dashboard and let the component handle the error
        router.navigate([LayoutPaths.DASHBOARD]);
        return false;
    }

    // Check if user is admin
    if (userData.role === 'admin') {
        return true;
    } else {
        router.navigate([LayoutPaths.DASHBOARD]);
        return false;
    }
};
