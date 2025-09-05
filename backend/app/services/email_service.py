# app/services/email_service.py
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv
import logging
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class EmailService:
    def __init__(self):
        self.sender_email = os.getenv("GMAIL_USER")
        self.sender_password = os.getenv("GMAIL_APP_PASSWORD")
        self.confirmation_url = os.getenv("CONFIRMATION_URL", "http://localhost:5500/confirm-email")
        self.reset_password_url = os.getenv("RESET_PASSWORD_URL", "http://localhost:5500/reset-password")
        self.debug_mode = os.getenv("EMAIL_DEBUG", "false").lower() == "true"
        
        if not all([self.sender_email, self.sender_password]):
            logger.warning("Email credentials not fully configured in environment variables")

    async def send_confirmation_email(self, email: str, name: str, code: str) -> bool:
        """Send email confirmation with 6-digit code"""
        try:
            # Validate inputs
            if not all([email, name, code]) or len(code) != 6:
                logger.error("Invalid parameters for email confirmation")
                return False

            # Create the confirmation link
            confirmation_link = f"{self.confirmation_url}?code={code}&email={email}"
            
            if self.debug_mode:
                logger.info(f"DEBUG MODE: Confirmation link - {confirmation_link}")
                return True

            # Create email message
            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth <{self.sender_email}>"
            msg['To'] = email
            msg['Subject'] = "Your NexaHealth Verification Code"
            
            # Email body with formatted 6-digit code
            body = self._generate_confirmation_email_body(name, code, confirmation_link)
            msg.attach(MIMEText(body, 'html'))
            
            return await self._send_email(msg, email)
            
        except Exception as e:
            logger.error(f"Error sending confirmation email: {str(e)}", exc_info=True)
            return False

    async def send_password_reset_email(self, email: str, reset_link: str) -> bool:
        """Send password reset email with reset link"""
        try:
            # Validate inputs
            if not email or not reset_link:
                logger.error("Invalid parameters for password reset email")
                return False
            
            if self.debug_mode:
                logger.info(f"DEBUG MODE: Password reset link for {email}: {reset_link}")
                return True

            # Create email message
            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth <{self.sender_email}>"
            msg['To'] = email
            msg['Subject'] = "Reset Your NexaHealth Password"
            
            # Email body with reset link
            body = self._generate_password_reset_email_body(reset_link)
            msg.attach(MIMEText(body, 'html'))
            
            return await self._send_email(msg, email)
            
        except Exception as e:
            logger.error(f"Error sending password reset email: {str(e)}", exc_info=True)
            return False

    def _generate_confirmation_email_body(self, name: str, code: str, confirmation_link: str) -> str:
        """Generate HTML email template with formatted 6-digit code"""
        formatted_code = f"{code[:3]} {code[3:]}"  # Adds space for better readability
        return f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Poppins', sans-serif; line-height: 1.6; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ text-align: center; margin-bottom: 20px; }}
                .logo {{ color: #2563eb; font-family: 'Playfair Display', serif; font-weight: 700; }}
                .button {{
                    display: inline-block; padding: 12px 24px; background-color: #2563eb;
                    color: white !important; text-decoration: none; border-radius: 6px;
                    font-weight: 500; margin: 20px 0;
                }}
                .code-container {{
                    background: #f8fafc;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                    margin: 20px 0;
                }}
                .code {{
                    font-family: monospace; 
                    font-size: 32px;
                    letter-spacing: 5px;
                    color: #1e293b;
                    font-weight: bold;
                }}
                .note {{
                    color: #64748b;
                    font-size: 14px;
                    margin-top: 10px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 class="logo">NexaHealth</h1>
                </div>
                
                <p>Hello {name},</p>
                <p>Thank you for signing up with NexaHealth! Here's your verification code:</p>
                
                <div class="code-container">
                    <div class="code">{formatted_code}</div>
                    <p class="note">This code will expire in 24 hours</p>
                </div>
                
                <p style="text-align: center;">
                    <a href="{confirmation_link}" class="button">
                        Verify Email Address
                    </a>
                </p>
                
                <p>If you didn't request this email, please ignore it.</p>
            </div>
        </body>
        </html>
        """

    def _generate_password_reset_email_body(self, reset_link: str) -> str:
        """Generate HTML email template for password reset"""
        return f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Poppins', sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ 
                    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); 
                    padding: 20px; 
                    text-align: center; 
                    border-radius: 8px 8px 0 0; 
                }}
                .header h1 {{ color: white; margin: 0; font-family: 'Playfair Display', serif; }}
                .content {{ 
                    background: #f8fafc; 
                    padding: 30px; 
                    border-radius: 0 0 8px 8px;
                    border: 1px solid #e2e8f0;
                }}
                .button {{ 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background: #2563eb; 
                    color: white !important; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 500; 
                    margin: 20px 0;
                }}
                .footer {{ 
                    text-align: center; 
                    margin-top: 20px; 
                    color: #64748b; 
                    font-size: 14px; 
                }}
                .warning {{
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 12px;
                    margin: 15px 0;
                    border-radius: 4px;
                }}
                .warning-icon {{
                    color: #d97706;
                    margin-right: 8px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>NexaHealth</h1>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>You requested to reset your password for your NexaHealth account.</p>
                    <p>Click the button below to set a new password:</p>
                    
                    <p style="text-align: center;">
                        <a href="{reset_link}" class="button">Reset Password</a>
                    </p>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #2563eb; font-size: 14px;">
                        {reset_link}
                    </p>
                    
                    <div class="warning">
                        <p><span class="warning-icon">⚠️</span> This link will expire in 1 hour for security reasons.</p>
                    </div>
                    
                    <p>If you didn't request this password reset, please ignore this email. Your account remains secure.</p>
                </div>
                <div class="footer">
                    <p>© 2025 NexaHealth. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

    async def _send_email(self, msg: MIMEMultipart, recipient: str) -> bool:
        """Try multiple methods to send email with fallback options"""
        methods = [
            self._send_via_gmail_smtp,
            self._send_via_gmail_tls,
        ]
        
        for method in methods:
            try:
                if await method(msg, recipient):
                    return True
            except Exception as e:
                logger.warning(f"Email sending method failed: {method.__name__}. Error: {str(e)}")
                continue
                
        logger.error("All email sending methods failed")
        return False

    async def _send_via_gmail_smtp(self, msg: MIMEText, recipient: str) -> bool:
        """Send using SMTP_SSL (port 465)"""
        context = ssl.create_default_context()
        try:
            with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=context, timeout=10) as server:
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
                logger.info(f"Email sent to {recipient} via SMTP_SSL")
                return True
        except Exception as e:
            logger.error(f"SMTP_SSL failed: {str(e)}")
            raise

    async def _send_via_gmail_tls(self, msg: MIMEText, recipient: str) -> bool:
        """Send using STARTTLS (port 587)"""
        context = ssl.create_default_context()
        try:
            with smtplib.SMTP('smtp.gmail.com', 587, timeout=10) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
                logger.info(f"Email sent to {recipient} via STARTTLS")
                return True
        except Exception as e:
            logger.error(f"STARTTLS failed: {str(e)}")
            raise

    def get_confirmation_link(self, email: str, token: str) -> str:
        """Get the confirmation link for debugging"""
        return f"{self.confirmation_url}?token={token}&email={email}"


email_service = EmailService()