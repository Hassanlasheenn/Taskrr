import { Routes } from '@angular/router';
import { AuthContainerComponent } from './auth/components';
import { DashboardComponent, ProfileComponent, AdminComponent } from './layouts/components';
import { authGuard, adminGuard } from './auth/guards';
import { canDeactivateGuard } from './auth/guards/can-deactivate.guard';
import { NotFoundComponent } from './shared/components';
import { AuthPaths } from './auth/enums';
import { LayoutPaths } from './layouts/enums';

export const routes: Routes = [
    { path: '', component: AuthContainerComponent },
    { path: AuthPaths.LOGIN, redirectTo: '', pathMatch: 'full' },
    { path: LayoutPaths.DASHBOARD, component: DashboardComponent, canActivate: [authGuard] },
    {
        path: `${LayoutPaths.TODO_VIEW}/:id`,
        loadComponent: () => import('./layouts/components/todo-view/todo-view.component').then((m) => m.TodoViewComponent),
        canActivate: [authGuard],
        canDeactivate: [canDeactivateGuard],
    },
    { path: LayoutPaths.PROFILE, component: ProfileComponent, canActivate: [authGuard] },
    { path: LayoutPaths.ADMIN, component: AdminComponent, canActivate: [authGuard, adminGuard] },
    { path: AuthPaths.NOT_FOUND, component: NotFoundComponent },
    { path: '**', redirectTo: AuthPaths.NOT_FOUND },
];
