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

        # Rest of your email sending logic...

            # Create email message
            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth <{self.sender_email}>"
            msg['To'] = email
            msg['Subject'] = "Your NexaHealth Verification Code"
            
            # Email body with formatted 6-digit code
            body = self._generate_email_body(name, code, confirmation_link)
            msg.attach(MIMEText(body, 'html'))
            
            return await self._send_email(msg, email)
            
        except Exception as e:
            logger.error(f"Error sending confirmation email: {str(e)}", exc_info=True)
            return False

    def _generate_email_body(self, name: str, code: str, confirmation_link: str) -> str:
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

    async def _send_via_gmail_smtp(self, msg: MIMEMultipart, recipient: str) -> bool:
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

    async def _send_via_gmail_tls(self, msg: MIMEMultipart, recipient: str) -> bool:
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