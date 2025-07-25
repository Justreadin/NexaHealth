from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from app.models.auth_model import UserInDB
from app.core.auth import get_current_active_user
from app.core.db import db, users_collection
from datetime import datetime
import random
import string

router = APIRouter(
    prefix="/referrals",
    tags=["Referrals"],
    responses={404: {"description": "Not found"}}
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def generate_referral_code(length=6):
    """Generate a random referral code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

@router.get("/")
async def get_referral_info(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get user's referral information"""
    try:
        # Get or create referral code
        user_ref = users_collection.document(current_user.id)
        user_data = user_ref.get().to_dict()
        
        if not user_data.get('referral_code'):
            # Generate new referral code if none exists
            referral_code = generate_referral_code()
            user_ref.update({
                'referral_code': referral_code,
                'referrals': [],
                'referral_count': 0,
                'referral_updated': datetime.utcnow()
            })
        else:
            referral_code = user_data['referral_code']
        
        # Count successful referrals (where referred users have verified email)
        referral_count = user_data.get('referral_count', 0)
        
        return {
            "referralCode": referral_code,
            "referralLink": f"https://yourdomain.com?ref={referral_code}",
            "referralCount": referral_count,
            "referralGoal": 3,
            "reachedGoal": referral_count >= 3
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))