import { Routes } from '@angular/router';
import { AuthContainerComponent } from './auth/components';
import { DashboardComponent, ProfileComponent, AdminComponent } from './layouts/components';
import { authGuard, adminGuard } from './auth/guards';
import { canDeactivateGuard } from './auth/guards/can-deactivate.guard';
import { NotFoundComponent } from './shared/components';
import { AuthPaths } from './auth/enums';
import { LayoutPaths } from './layouts/enums';

export const routes: Routes = [
    { path: AuthPaths.LOGIN, component: AuthContainerComponent },
    { 
        path: AuthPaths.FORGOT_PASSWORD, 
        loadComponent: () => import('./auth/components/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) 
    },
    { 
        path: AuthPaths.RESET_PASSWORD, 
        loadComponent: () => import('./auth/components/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) 
    },
    { 
        path: AuthPaths.VERIFY_EMAIL, 
        loadComponent: () => import('./auth/components/verify-email/verify-email.component').then(m => m.VerifyEmailComponent) 
    },
    { path: 'home', redirectTo: '', pathMatch: 'full' },
    
    // Dashboard Sections
    { path: LayoutPaths.DASHBOARD, component: DashboardComponent, canActivate: [authGuard], canDeactivate: [canDeactivateGuard], pathMatch: 'full' },
    { path: LayoutPaths.COMPLETED, component: DashboardComponent, canActivate: [authGuard], canDeactivate: [canDeactivateGuard] },
    { path: LayoutPaths.CALENDAR, component: DashboardComponent, canActivate: [authGuard], canDeactivate: [canDeactivateGuard] },
    { path: LayoutPaths.ADMIN_PANEL, component: DashboardComponent, canActivate: [authGuard, adminGuard], canDeactivate: [canDeactivateGuard] },
    {
        path: `${LayoutPaths.TODO_VIEW}/:id`,
        loadComponent: () => import('./layouts/components/todo-view/todo-view.component').then((m) => m.TodoViewComponent),
        canActivate: [authGuard],
        canDeactivate: [canDeactivateGuard],
    },
    { path: LayoutPaths.PROFILE, component: ProfileComponent, canActivate: [authGuard], canDeactivate: [canDeactivateGuard] },
    { path: LayoutPaths.ADMIN, component: DashboardComponent, canActivate: [authGuard, adminGuard] },
    { path: `${LayoutPaths.USER_DETAILS}/:id`, loadComponent: () => import('./layouts/components/user-details/user-details.component').then(m => m.UserDetailsComponent), canActivate: [authGuard, adminGuard] },
    { path: AuthPaths.NOT_FOUND, component: NotFoundComponent },
    { path: '**', redirectTo: AuthPaths.NOT_FOUND },
];
