import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { ToastService } from "../../../core/services/toast.service";
import { API_BASE_URL } from "../../../api.global";
import { SharedModule } from "../../../shared/shared.module";
import { AuthService } from "../../services";

@Component({
    selector: 'app-verify-email',
    standalone: true,
    imports: [CommonModule, SharedModule, RouterLink],
    templateUrl: './verify-email.component.html',
    styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit {
    verifying = true;
    verified = false;
    error: string | null = null;
    isResending = false;
    userEmail: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private http: HttpClient,
        private toastService: ToastService,
        private authService: AuthService,
        private router: Router
    ) {}

    ngOnInit(): void {
        const token = this.route.snapshot.queryParamMap.get('token');
        this.userEmail = this.route.snapshot.queryParamMap.get('email'); // Optional: can be passed in URL

        if (!token) {
            this.verifying = false;
            this.error = "Invalid or missing verification token.";
            return;
        }

        this.verifyEmail(token);
    }

    verifyEmail(token: string): void {
        this.http.get(`${API_BASE_URL}/verify-email?token=${token}`).subscribe({
            next: () => {
                this.verifying = false;
                this.verified = true;
                this.toastService.success("Email verified successfully! You can now login.");
            },
            error: (err) => {
                this.verifying = false;
                this.error = err?.error?.detail || "Verification failed. The link might be expired or invalid.";
                this.toastService.error(this.error || "Verification failed");
            }
        });
    }

    resendLink(): void {
        if (!this.userEmail) {
            this.toastService.info("Please go back to the login page to request a new link.");
            return;
        }

        if (this.isResending) return;

        this.isResending = true;
        this.authService.resendVerificationEmail(this.userEmail).subscribe({
            next: (res) => {
                this.isResending = false;
                this.toastService.success(res.message || "New verification link sent!");
            },
            error: (err) => {
                this.isResending = false;
                this.toastService.error(err?.error?.detail || "Failed to resend link");
            }
        });
    }
}
