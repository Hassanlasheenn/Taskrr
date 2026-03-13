import { Component, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AuthService } from "../../../auth/services/auth.service";
import { UserService } from "../../../core/services/user.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { IUserResponse } from "../../../auth/interfaces";
import { ProfileSections } from "../../enums/profile-sections.enum";
import { ProfileSideNavComponent } from "./components/profile-side-nav/profile-side-nav.component";
import { PersonalDataComponent } from "./components/personal-data/personal-data.component";
import { PosthogService } from "../../../core/services";
import { CanComponentDeactivate } from "../../../auth/guards/can-deactivate.guard";
import { Observable, map } from "rxjs";

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss'],
    standalone: true,
    imports: [
        CommonModule,
        ProfileSideNavComponent,
        PersonalDataComponent
    ],
})
export class ProfileComponent implements OnInit, CanComponentDeactivate {
    @ViewChild(PersonalDataComponent) personalDataComponent!: PersonalDataComponent;
    userData: IUserResponse | null = null;
    activeSection: ProfileSections = ProfileSections.PERSONAL_DATA;
    ProfileSections = ProfileSections;

    constructor(
        private readonly _authService: AuthService,
        private readonly _userService: UserService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _posthogService: PosthogService
    ) {}

    ngOnInit(): void {
        this.userData = this._authService.getCurrentUserData();
    }

    onSectionChange(section: ProfileSections): void {
        this.activeSection = section;
    }

    onPersonalDataSubmit(event: { form: any; photoRemoved: boolean; updateCallback: (user: IUserResponse) => void }): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        const formData = new FormData();
        formData.append('username', event.form.get('username')?.value);
        formData.append('email', event.form.get('email')?.value);
        
        const photoFile = event.form.get('photo')?.value;
        if (photoFile instanceof File) {
            formData.append('photo', photoFile);
        } else if (event.photoRemoved) {
            formData.append('delete_photo', 'true');
        }

        this._userService.updateUser(userId, formData).subscribe({
            next: (updatedUser: IUserResponse) => {
                this._authService.setCurrentUserData(updatedUser);
                this.userData = updatedUser;
                event.updateCallback(updatedUser);
                this._toastService.success('Profile updated successfully');
                this._posthogService.capture('profile_updated', {
                    user_id: userId,
                    username: updatedUser.username
                });
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to update profile');
            }
            });
            }

            canDeactivate(): boolean | Observable<boolean> {
            if (this.personalDataComponent?.hasChanges()) {
            return this._confirmationDialog.show({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your profile. Are you sure you want to leave?',
                confirmText: 'Leave',
                cancelText: 'Stay'
            }).pipe(map(result => result.confirmed));
            }
            return true;
            }
            }