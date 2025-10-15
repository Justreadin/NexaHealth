# app/services/pharmacy_email_service.py
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv
import logging
from typing import Optional, Dict, Any
import jwt
import uuid
from datetime import datetime, timedelta
from app.core.db import users_collection, get_server_timestamp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class PharmacyEmailService:
    def __init__(self):
        self.sender_email = os.getenv("PHARMACY_SENDER_EMAIL")
        self.sender_password = os.getenv("PHARMACY_EMAIL_PASSWORD")
        self.confirmation_url = os.getenv("CONFIRMATION_URL", "http://localhost:5500/pharmacy/confirm-email")
        self.jwt_secret = os.getenv("JWT_SECRET_KEY")
        self.debug_mode = os.getenv("EMAIL_DEBUG", "false").lower() == "true"
        
        if not all([self.sender_email, self.sender_password, self.jwt_secret]):
            logger.warning("Pharmacy email credentials not fully configured")

    def generate_confirmation_token(self, pharmacy_id: str, email: str) -> str:
        """Generate JWT token for email confirmation"""
        payload = {
            "pharmacy_id": pharmacy_id,
            "email": email,
            "exp": datetime.utcnow() + timedelta(hours=24),
            "iat": datetime.utcnow(),
            "jti": str(uuid.uuid4()),
            "type": "email_confirmation"
        }
        return jwt.encode(payload, self.jwt_secret, algorithm="HS256")

    def verify_confirmation_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT confirmation token"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
            if payload.get("type") != "email_confirmation":
                return None
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Email confirmation token expired")
            return None
        except jwt.InvalidTokenError:
            logger.warning("Invalid email confirmation token")
            return None

    async def send_pharmacy_confirmation_email(self, pharmacy_id: str, email: str, pharmacy_name: str) -> bool:
        """Send email confirmation for pharmacy registration :cite[1]:cite[4]"""
        try:
            # Generate confirmation token
            token = self.generate_confirmation_token(pharmacy_id, email)
            confirmation_link = f"{self.confirmation_url}?token={token}"

            if self.debug_mode:
                logger.info(f"DEBUG MODE: Confirmation link - {confirmation_link}")
                return True

            # Create email message
            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth Pharmacy <{self.sender_email}>"
            msg['To'] = email
            msg['Subject'] = "Verify Your Pharmacy Account - NexaHealth"

            # Email body with professional styling
            body = self._generate_pharmacy_confirmation_email_body(pharmacy_name, confirmation_link)
            msg.attach(MIMEText(body, 'html'))

            return await self._send_email(msg, email)

        except Exception as e:
            logger.error(f"Error sending pharmacy confirmation email: {str(e)}")
            return False

    async def send_pharmacy_welcome_email(self, email: str, pharmacy_name: str) -> bool:
        """Send welcome email after successful verification :cite[4]:cite[8]"""
        try:
            if self.debug_mode:
                logger.info(f"DEBUG MODE: Welcome email would be sent to {email}")
                return True

            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth Pharmacy <{self.sender_email}>"
            msg['To'] = email
            msg['Subject'] = "Welcome to NexaHealth - Your Pharmacy is Now Verified!"

            body = self._generate_pharmacy_welcome_email_body(pharmacy_name)
            msg.attach(MIMEText(body, 'html'))

            return await self._send_email(msg, email)

        except Exception as e:
            logger.error(f"Error sending pharmacy welcome email: {str(e)}")
            return False

    async def send_pharmacy_status_update_email(self, email: str, pharmacy_name: str, status: str, reason: str = "") -> bool:
        """Send status update email (verified, rejected, etc.)"""
        try:
            if self.debug_mode:
                logger.info(f"DEBUG MODE: Status update email would be sent to {email}")
                return True

            msg = MIMEMultipart()
            msg['From'] = f"NexaHealth Pharmacy <{self.sender_email}>"
            msg['To'] = email
            
            subject = f"Pharmacy Account {status.capitalize()} - NexaHealth"
            msg['Subject'] = subject

            body = self._generate_status_update_email_body(pharmacy_name, status, reason)
            msg.attach(MIMEText(body, 'html'))

            return await self._send_email(msg, email)

        except Exception as e:
            logger.error(f"Error sending status update email: {str(e)}")
            return False

    def _generate_pharmacy_confirmation_email_body(self, pharmacy_name: str, confirmation_link: str) -> str:
        """Generate HTML email template for pharmacy confirmation :cite[1]:cite[7]"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Inter', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ 
                    background: linear-gradient(135deg, #1E40AF 0%, #003F88 100%); 
                    padding: 30px; 
                    text-align: center; 
                    border-radius: 10px 10px 0 0; 
                    color: white;
                }}
                .content {{ 
                    background: #f8fafc; 
                    padding: 30px; 
                    border-radius: 0 0 10px 10px;
                    border: 1px solid #e2e8f0;
                }}
                .button {{ 
                    display: inline-block; 
                    padding: 14px 28px; 
                    background: linear-gradient(135deg, #1E40AF 0%, #003F88 100%); 
                    color: white !important; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: 600; 
                    margin: 20px 0;
                    text-align: center;
                }}
                .footer {{ 
                    text-align: center; 
                    margin-top: 30px; 
                    color: #64748b; 
                    font-size: 14px; 
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                }}
                .verification-code {{
                    background: #f1f5f9;
                    padding: 15px;
                    border-radius: 6px;
                    margin: 20px 0;
                    text-align: center;
                    font-family: monospace;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>NexaHealth Pharmacy</h1>
                    <p>Africa's Network of Trusted Pharmacies</p>
                </div>
                <div class="content">
                    <h2>Verify Your Pharmacy Email</h2>
                    <p>Hello <strong>{pharmacy_name}</strong>,</p>
                    <p>Thank you for registering your pharmacy with NexaHealth! To complete your registration and start using our trusted pharmacy network, please verify your email address.</p>
                    
                    <div style="text-align: center;">
                        <a href="{confirmation_link}" class="button">
                            Verify Email Address
                        </a>
                    </div>

                    <p>Or copy and paste this link into your browser:</p>
                    <div class="verification-code">
                        {confirmation_link}
                    </div>

                    <p>This verification link will expire in 24 hours for security reasons.</p>
                    
                    <p><strong>What's next?</strong></p>
                    <ul>
                        <li>Complete your pharmacy profile</li>
                        <li>Get verified by our team</li>
                        <li>Start verifying drugs and building trust</li>
                        <li>Connect with health-conscious consumers</li>
                    </ul>

                    <p>If you didn't create a NexaHealth pharmacy account, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© 2025 NexaHealth. All rights reserved.</p>
                    <p>Building trust in healthcare across Africa</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _generate_pharmacy_welcome_email_body(self, pharmacy_name: str) -> str:
        """Generate welcome email after verification"""
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Inter', sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ 
                    background: linear-gradient(135deg, #10B981 0%, #059669 100%); 
                    padding: 30px; 
                    text-align: center; 
                    border-radius: 10px 10px 0 0; 
                    color: white;
                }}
                .content {{ 
                    background: #f0fdf4; 
                    padding: 30px; 
                    border-radius: 0 0 10px 10px;
                    border: 1px solid #bbf7d0;
                }}
                .feature {{
                    background: white;
                    padding: 15px;
                    margin: 10px 0;
                    border-radius: 6px;
                    border-left: 4px solid #10B981;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to NexaHealth!</h1>
                    <p>Your pharmacy is now part of Africa's trusted network</p>
                </div>
                <div class="content">
                    <h2>Congratulations, {pharmacy_name}! 🎊</h2>
                    <p>Your pharmacy has been successfully verified and is now part of the NexaHealth trusted network.</p>
                    
                    <div class="feature">
                        <h3>🚀 Get Started</h3>
                        <p>Complete your pharmacy profile to increase your trust score and visibility.</p>
                    </div>

                    <div class="feature">
                        <h3>🛡️ Verify Drugs</h3>
                        <p>Start using our drug verification system to build trust with consumers.</p>
                    </div>

                    <div class="feature">
                        <h3>📊 Track Performance</h3>
                        <p>Monitor your pharmacy's performance and trust metrics in your dashboard.</p>
                    </div>

                    <div class="feature">
                        <h3>👥 Connect with Consumers</h3>
                        <p>Get discovered by health-conscious consumers looking for trusted pharmacies.</p>
                    </div>

                    <p><strong>Next Steps:</strong></p>
                    <ol>
                        <li>Complete your pharmacy profile (add address, license details, etc.)</li>
                        <li>Start verifying medications using our system</li>
                        <li>Monitor your trust score and ratings</li>
                        <li>Join our pharmacy community for updates</li>
                    </ol>

                    <p>If you have any questions, don't hesitate to contact our support team.</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _generate_status_update_email_body(self, pharmacy_name: str, status: str, reason: str) -> str:
        """Generate status update email body"""
        status_colors = {
            "verified": "#10B981",
            "rejected": "#EF4444",
            "pending": "#F59E0B"
        }
        
        status_messages = {
            "verified": "Your pharmacy has been verified!",
            "rejected": "Your pharmacy application requires attention",
            "pending": "Your pharmacy application is under review"
        }

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Inter', sans-serif; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ 
                    background: linear-gradient(135deg, {status_colors.get(status, '#1E40AF')} 0%, #003F88 100%); 
                    padding: 30px; 
                    text-align: center; 
                    color: white;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>{status_messages.get(status, 'Status Update')}</h1>
                </div>
                <div class="content">
                    <h2>Hello {pharmacy_name},</h2>
                    <p>Your pharmacy account status has been updated to: <strong>{status.upper()}</strong></p>
                    {f'<p><strong>Reason:</strong> {reason}</p>' if reason else ''}
                    <p>Please log in to your dashboard for more details.</p>
                </div>
            </div>
        </body>
        </html>
        """

    async def _send_email(self, msg: MIMEMultipart, recipient: str) -> bool:
        """Send email using SMTP with multiple fallback methods :cite[1]:cite[10]"""
        methods = [
            self._send_via_smtp_ssl,
            self._send_via_starttls,
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

    async def _send_via_smtp_ssl(self, msg: MIMEMultipart, recipient: str) -> bool:
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

    async def _send_via_starttls(self, msg: MIMEMultipart, recipient: str) -> bool:
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


pharmacy_email_service = PharmacyEmailService()