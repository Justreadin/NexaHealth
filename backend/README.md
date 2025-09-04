## API Documentation

### Authentication
| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/auth/signup` | POST | Register new user | `UserCreate` |
| `/auth/confirm-email` | POST | Confirm email address | `EmailConfirmation` |
| `/auth/check-confirmation` | GET | Check confirmation status | - |
| `/auth/resend-confirmation` | POST | Resend confirmation email | `ResendConfirmationRequest` |
| `/auth/login` | POST | User login | `Body_login_auth_login_post` |
| `/auth/google-login` | POST | Login via Google | `GoogleToken` |
| `/auth/request-password-reset` | POST | Initiate password reset | `PasswordResetRequest` |
| `/auth/reset-password` | POST | Complete password reset | `PasswordReset` |
| `/auth/me` | GET | Get current user info | - |

### Guest Sessions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/guest/session` | POST | Create guest session |
| `/guest/session` | GET | Retrieve guest session |
| `/guest/session` | DELETE | End guest session |

### Drug Safety
| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/verify-drug` | POST | Verify drug authenticity | `DrugVerificationRequest` |
| `/submit-report` | POST | Report counterfeit drugs | `Body_submit_report_submit_report_post` |
| `/get-flagged` | GET | List flagged pharmacies | - |
| `/get-flagged/{pharmacy}/reports` | GET | Get pharmacy reports | - |
| `/predict-risk` | POST | Predict drug risk | `SymptomInput` |

### Location Services
| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/get-nearby` | GET | Find nearby pharmacies | `Location` |

### AI Companion
| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/ai-companion/chat` | POST | Chat with health AI | `ChatRequest` |
| `/ai-companion/history` | GET | Get chat history | - |
| `/ai-companion/history` | DELETE | Clear chat history | - |

### Feedback
| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/feedback` | POST | Submit feedback | `FeedbackCreate` |
| `/feedbacks` | GET | View all feedback | - |

### Schemas
```typescript
interface UserCreate {
  email: string
  password: string
  first_name: string
  last_name: string
}

interface DrugVerificationRequest {
  drug_name: string
  batch_number: string
  pharmacy_id: string
}

interface ChatRequest {
  message: string
  language: 'en' | 'yo' | 'ig' | 'ha'
  session_id?: string
}

interface Location {
  lat: number
  lng: number
  radius_km: number
}
Usage Examples
User Registration
bash
curl -X POST 'https://api.nexahealth.ng/auth/signup' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "first_name": "John",
    "last_name": "Doe"
  }'
Drug Verification
bash
curl -X POST 'https://api.nexahealth.ng/verify-drug' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "drug_name": "Paracetamol",
    "batch_number": "XK-2025-AB",
    "pharmacy_id": "PHARM123"
  }'
AI Chat (Yoruba)
bash
curl -X POST 'https://api.nexahealth.ng/ai-companion/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Kini àmì ìrora malaria?",
    "language": "yo"
  }'
Rate Limits
Authentication: 10 requests/minute

API Companion: 30 requests/minute

Drug Verification: 5 requests/minute