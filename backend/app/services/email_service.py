import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_username = os.getenv("SMTP_USERNAME", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_username)

    def send_notification_email(self, to_email: str, todo_title: str, assigned_by: str) -> bool:
        if not self.smtp_username or not self.smtp_password:
            return False

        try:
            subject = f"New Todo Assigned: {todo_title}"
            body = f"""
Hello,

You have been assigned a new todo task:

Title: {todo_title}
Assigned by: {assigned_by}

Please check your dashboard for more details.

Best regards,
Todo App Team
            """.strip()

            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)

            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False
