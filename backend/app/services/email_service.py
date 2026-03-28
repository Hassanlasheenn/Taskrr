import smtplib
import logging
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from .. import config
from .link_service import link_service

# Configure logging
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # Load settings from centralized config
        self.smtp_server = config.SMTP_SERVER
        self.smtp_port = config.SMTP_PORT
        self.smtp_username = config.SMTP_USERNAME
        self.smtp_password = config.SMTP_PASSWORD
        self.smtp_use_tls = config.SMTP_USE_TLS
        self.from_email = config.FROM_EMAIL
        self.timeout = 15  # Increased timeout for production stability
        
        # Application Brand Colors
        self.primary_gradient_start = config.primary_gradient_start if hasattr(config, 'primary_gradient_start') else "#a78bfa"
        self.primary_gradient_end = config.primary_gradient_end if hasattr(config, 'primary_gradient_end') else "#8b5cf6"
        self.text_primary = "#1e1b4b"
        self.text_secondary = "#3730a3"
        self.bg_light = "#f4f2ff"
        
        # Exact Logo Font from Header SCSS
        self.logo_font_family = "'Caveat', 'Montserrat', cursive"
        self.body_font_family = "'Poppins', sans-serif"

    async def send_verification_email(self, to_email: str, token: str) -> bool:
        """Asynchronously send a branded verification email with matching logo font."""
        return await asyncio.to_thread(self._send_verification_email_sync, to_email, token)

    def _send_verification_email_sync(self, to_email: str, token: str) -> bool:
        """Synchronous internal method for sending styled HTML email."""
        if not self.smtp_username or not self.smtp_password:
            logger.error(f"❌ SMTP credentials not configured. Verification token for {to_email}: {token}")
            return False

        try:
            verify_link = link_service.get_verification_link(token, to_email)

            subject = "Action Required: Verify your Taskrr account"
            
            # HTML Template with inline styles and system fonts for maximum compatibility
            html_content = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>{subject}</title>
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: {self.bg_light}; color: {self.text_primary};">
                <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.1);">
                    <div style="background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; font-family: 'Georgia', serif; font-size: 48px; font-weight: bold; letter-spacing: 0.05em; color: #ffffff !important;">Taskrr</h1>
                    </div>
                    <div style="padding: 40px; text-align: center; line-height: 1.6;">
                        <h2 style="color: {self.text_primary}; margin-bottom: 20px; font-size: 24px;">Welcome to Taskrr!</h2>
                        <p style="font-size: 16px; color: #4b5563; margin-bottom: 30px;">Thank you for signing up. To complete your registration and start organizing your tasks, please verify your email address by clicking the button below:</p>
                        
                        <div style="margin: 35px 0;">
                            <a href="{verify_link}" style="background-color: {self.primary_gradient_end}; background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); color: #ffffff !important; padding: 16px 36px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);">Verify My Account</a>
                        </div>
                        
                        <p style="font-size: 14px; color: #94a3b8; margin-top: 30px;">If the button above doesn't work, copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; font-size: 12px;"><a href="{verify_link}" style="color: {self.primary_gradient_end}; text-decoration: none;">{verify_link}</a></p>
                    </div>
                    <div style="background-color: #f9fafb; padding: 25px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #f3f4f6;">
                        <p style="margin: 0 0 10px 0;">© 2026 Taskrr Application. All rights reserved.</p>
                        <p style="margin: 0 0 10px 0;">Taskrr HQ • 123 Productivity Way • Digital City, Web 10101</p>
                        <p style="margin: 0;">If you did not create an account, you can safely ignore this email.</p>
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg['From'] = f"Taskrr <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            msg['Auto-Submitted'] = "auto-generated"
            msg['X-Auto-Response-Suppress'] = "All"
            
            text_fallback = (
                f"Welcome to Taskrr!\n\n"
                f"Thank you for signing up. Please verify your email address to complete your registration:\n\n"
                f"{verify_link}\n\n"
                f"If you did not create an account, please ignore this email.\n\n"
                f"© 2026 Taskrr Application"
            )
            msg.attach(MIMEText(text_fallback, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=self.timeout) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)

            logger.info(f"✅ Branded verification email successfully sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to send branded verification email to {to_email}: {str(e)}")
            return False

    def send_notification_email(self, to_email: str, todo_title: str, assigned_by: str) -> bool:
        """Send a branded notification email for task assignment."""
        if not self.smtp_username or not self.smtp_password:
            return False

        try:
            subject = f"New Task Assigned: {todo_title}"
            
            html_content = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: {self.bg_light}; color: {self.text_primary};">
                <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-family: 'Georgia', serif; font-size: 42px; font-weight: bold; color: #ffffff !important;">Taskrr</h1>
                    </div>
                    <div style="padding: 35px; color: {self.text_primary}; line-height: 1.6;">
                        <h3 style="font-weight: 700; color: {self.text_primary};">New Task Notification</h3>
                        <p>Hello,</p>
                        <p>You have been assigned a new task by <strong>{assigned_by}</strong>:</p>
                        <div style="background-color: #f9fafb; border-left: 5px solid {self.primary_gradient_end}; padding: 20px; margin: 25px 0; border-radius: 8px; font-weight: 600; font-size: 18px; color: {self.text_primary};">
                            {todo_title}
                        </div>
                        <p>Please check your dashboard to start working on it.</p>
                    </div>
                    <div style="background-color: #f9fafb; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                        <p>© 2026 Taskrr Application. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg['From'] = f"Taskrr <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            msg['Auto-Submitted'] = "auto-generated"
            
            text_fallback = f"Hello, you have a new task: {todo_title} (Assigned by: {assigned_by})"
            msg.attach(MIMEText(text_fallback, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=self.timeout) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)

            return True
        except Exception as e:
            logger.error(f"Error sending notification email: {e}")
            return False

    async def send_password_reset_email(self, to_email: str, token: str) -> bool:
        """Asynchronously send a branded password reset email."""
        return await asyncio.to_thread(self._send_password_reset_email_sync, to_email, token)

    def _send_password_reset_email_sync(self, to_email: str, token: str) -> bool:
        if not self.smtp_username or not self.smtp_password:
            return False

        try:
            reset_link = link_service.get_password_reset_link(token)
            subject = "Password Reset Request - Taskrr"
            
            html_content = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: {self.bg_light}; color: {self.text_primary};">
                <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-family: "Georgia", serif; font-size: 42px; font-weight: bold; color: #ffffff !important;">Taskrr</h1>
                    </div>
                    <div style="padding: 35px; color: {self.text_primary}; line-height: 1.6; text-align: center;">
                        <h3 style="font-weight: 700; color: {self.text_primary};">Password Reset Request</h3>
                        <p>We received a request to reset the password for your Taskrr account.</p>
                        <p>Click the button below to set a new password. This link will expire in 1 hour.</p>
                        <div style="margin: 30px 0;">
                            <a href="{reset_link}" style="background-color: {self.primary_gradient_end}; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 600; display: inline-block;">Reset Password</a>
                        </div>
                        <p style="font-size: 13px; color: #94a3b8;">If you didn"t request this, you can safely ignore this email.</p>
                    </div>
                    <div style="background-color: #f9fafb; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                        <p>© 2026 Taskrr Application. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg["From"] = f"Taskrr <{self.from_email}>"
            msg["To"] = to_email
            msg["Subject"] = subject
            
            text_fallback = f"Please use the following link to reset your password: {reset_link}"
            msg.attach(MIMEText(text_fallback, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=self.timeout) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)

            return True
        except Exception as e:
            logger.error(f"Error sending password reset email: {e}")
            return False
