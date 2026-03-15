import os
import smtplib
import logging
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

# Configure logging
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_username)
        self.timeout = 10  # 10 seconds timeout for SMTP operations
        
        # Application Brand Colors
        self.primary_gradient_start = "#a78bfa"
        self.primary_gradient_end = "#8b5cf6"
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
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:4200")
            verify_link = f"{frontend_url}/verify-email?token={token}"

            subject = "Verify your Taskrr account"
            
            # HTML Template with correct heading role and font stack
            html_content = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <style type="text/css">
                    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;600;700&display=swap');
                    
                    body {{ 
                        font-family: 'Poppins', Helvetica, Arial, sans-serif !important; 
                        margin: 0; 
                        padding: 0; 
                        background-color: {self.bg_light}; 
                    }}
                    .container {{ 
                        max-width: 600px; 
                        margin: 20px auto; 
                        background-color: #ffffff; 
                        border-radius: 16px; 
                        overflow: hidden; 
                        box-shadow: 0 10px 30px rgba(139, 92, 246, 0.1); 
                        border: 1px solid rgba(139, 92, 246, 0.1); 
                    }}
                    .header {{ 
                        background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); 
                        padding: 40px 30px; 
                        text-align: center; 
                        color: #ffffff; 
                    }}
                    .logo {{ 
                        margin: 0; 
                        font-family: 'Caveat', 'Montserrat', cursive !important; 
                        font-size: 52px; 
                        font-weight: 400; 
                        letter-spacing: 0.05em; 
                        line-height: 1; 
                        color: #ffffff !important;
                        display: block;
                    }}
                    .content {{ 
                        padding: 45px 40px; 
                        text-align: center; 
                        color: {self.text_primary}; 
                        line-height: 1.7; 
                    }}
                    .content h2 {{ 
                        color: {self.text_primary}; 
                        margin-bottom: 24px; 
                        font-weight: 700; 
                        font-size: 24px; 
                    }}
                    .content p {{ 
                        font-size: 16px; 
                        color: {self.text_secondary}; 
                    }}
                    .button-wrapper {{ 
                        margin: 35px 0; 
                    }}
                    .button {{ 
                        background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); 
                        color: #ffffff !important; 
                        padding: 16px 36px; 
                        text-decoration: none; 
                        border-radius: 12px; 
                        font-weight: 600; 
                        font-size: 16px; 
                        display: inline-block; 
                        box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3); 
                    }}
                    .footer {{ 
                        background-color: #fcfaff; 
                        padding: 25px; 
                        text-align: center; 
                        color: #94a3b8; 
                        font-size: 13px; 
                        border-top: 1px solid rgba(139, 92, 246, 0.05); 
                    }}
                    .link-alt {{ 
                        color: {self.primary_gradient_end}; 
                        text-decoration: none; 
                        word-break: break-all; 
                        font-size: 12px; 
                        opacity: 0.8; 
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="logo" style="margin: 0; font-family: 'Caveat', 'Montserrat', cursive !important; font-size: 52px; font-weight: 400; letter-spacing: 0.05em; line-height: 1; color: #ffffff !important;">Taskrr</h1>
                    </div>
                    <div class="content">
                        <h2 style="font-family: 'Poppins', sans-serif !important;">Welcome to the team!</h2>
                        <p style="font-family: 'Poppins', sans-serif !important;">Thank you for joining Taskrr. We're excited to help you organize your life and boost your productivity. To get started, please verify your email address by clicking the button below:</p>
                        <div class="button-wrapper">
                            <a href="{verify_link}" class="button" style="font-family: 'Poppins', sans-serif !important;">Verify My Account</a>
                        </div>
                        <p style="font-size: 14px; color: #94a3b8; margin-top: 30px; font-family: 'Poppins', sans-serif !important;">If the button doesn't work, copy and paste this link into your browser:</p>
                        <a href="{verify_link}" class="link-alt" style="font-family: 'Poppins', sans-serif !important;">{verify_link}</a>
                    </div>
                    <div class="footer">
                        <p style="font-family: 'Poppins', sans-serif !important;">© 2026 Taskrr Application. All rights reserved.</p>
                        <p style="font-family: 'Poppins', sans-serif !important;">If you did not create an account, please ignore this email.</p>
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
            text_fallback = f"Hello, please verify your Taskrr account by visiting: {verify_link}"
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
                <style type="text/css">
                    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;600;700&display=swap');
                    
                    body {{ 
                        font-family: 'Poppins', Helvetica, Arial, sans-serif !important; 
                        margin: 0; 
                        padding: 0; 
                        background-color: {self.bg_light}; 
                    }}
                    .container {{ 
                        max-width: 600px; 
                        margin: 20px auto; 
                        background-color: #ffffff; 
                        border-radius: 16px; 
                        overflow: hidden; 
                        box-shadow: 0 10px 30px rgba(0,0,0,0.05); 
                    }}
                    .header {{ 
                        background: linear-gradient(135deg, {self.primary_gradient_start} 0%, {self.primary_gradient_end} 100%); 
                        padding: 30px; 
                        text-align: center; 
                        color: #ffffff; 
                    }}
                    .logo {{ 
                        margin: 0; 
                        font-family: 'Caveat', 'Montserrat', cursive !important; 
                        font-size: 42px; 
                        font-weight: 400; 
                        letter-spacing: 0.05em; 
                        color: #ffffff !important;
                        display: block;
                    }}
                    .content {{ 
                        padding: 35px; 
                        color: {self.text_primary}; 
                        line-height: 1.6; 
                    }}
                    .task-card {{ 
                        background-color: #fcfaff; 
                        border-left: 5px solid {self.primary_gradient_end}; 
                        padding: 20px; 
                        margin: 25px 0; 
                        border-radius: 8px; 
                        font-weight: 600; 
                        font-size: 18px; 
                        color: {self.text_primary}; 
                    }}
                    .footer {{ 
                        background-color: #fcfaff; 
                        padding: 20px; 
                        text-align: center; 
                        color: #94a3b8; 
                        font-size: 12px; 
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="logo" style="margin: 0; font-family: 'Caveat', 'Montserrat', cursive !important; font-size: 42px; font-weight: 400; letter-spacing: 0.05em; color: #ffffff !important;">Taskrr</h1>
                    </div>
                    <div class="content">
                        <h3 style="font-weight: 700; color: {self.text_primary}; font-family: 'Poppins', sans-serif !important;">New Task Notification</h3>
                        <p style="font-family: 'Poppins', sans-serif !important;">Hello,</p>
                        <p style="font-family: 'Poppins', sans-serif !important;">You have been assigned a new task by <strong>{assigned_by}</strong>:</p>
                        <div class="task-card" style="font-family: 'Poppins', sans-serif !important;">
                            {todo_title}
                        </div>
                        <p style="font-family: 'Poppins', sans-serif !important;">Please check your dashboard to start working on it.</p>
                    </div>
                    <div class="footer">
                        <p style="font-family: 'Poppins', sans-serif !important;">© 2026 Taskrr Application. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
            """

            msg = MIMEMultipart("alternative")
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
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
