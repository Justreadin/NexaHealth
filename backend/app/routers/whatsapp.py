# app/routers/whatsapp.py
from fastapi import APIRouter, Form, Request
from fastapi.responses import PlainTextResponse
from twilio.twiml.messaging_response import MessagingResponse
import httpx

router = APIRouter()

@router.post("/whatsapp", response_class=PlainTextResponse)
async def whatsapp_reply(
    request: Request,
    Body: str = Form(...)
):
    incoming_msg = Body.strip().lower()
    resp = MessagingResponse()
    msg = resp.message()

    if incoming_msg.startswith("verify"):
        query = incoming_msg.replace("verify", "").strip()
        if not query:
            msg.body("❗Please type a drug name after `verify`, like:\n`verify panadol`")
        else:
            try:
                async with httpx.AsyncClient() as client:
                    payload = {"product_name": query}
                    res = await client.post(
                        "https://nexahealth.onrender.com/api/test_verify/drug",
                        json=payload
                    )
                    data = res.json()

                if res.status_code != 200:
                    msg.body("❌ Failed to verify drug. Try again.")
                elif data["status"] == "verified":
                    msg.body(
                        f"✅ *{data['product_name']}* is VERIFIED\n"
                        f"NAFDAC: {data['nafdac_reg_no'] or 'N/A'}\n"
                        f"Manufacturer: {data['manufacturer'] or 'N/A'}\n"
                        f"Form: {data['dosage_form']}, Strength: {data['strength']}\n"
                        f"{data['message']}"
                    )
                elif data["status"] == "conflict_warning":
                    msg.body(f"⚠️ Conflicting info for *{data['product_name']}*.\n{data['message']}")
                elif data["status"] == "unknown":
                    msg.body("❌ No match found in NAFDAC records.")
                elif data["status"] == "high_similarity":
                    suggestions = "\n".join([f"- {s['product_name']}" for s in data["possible_matches"]])
                    msg.body(f"❓ No exact match. Possible options:\n{suggestions}")
                else:
                    msg.body(f"⚠️ Could not verify. Status: {data['status']}")
            except Exception as e:
                msg.body("🚫 Something went wrong. Please try again.")
    
    elif incoming_msg.startswith("report"):
        msg.body("📢 To report, please send:\n`report drug_name issue`\nWe'll follow up.")
    
    elif incoming_msg.startswith("pil"):
        drug_name = incoming_msg.replace("pil", "").strip()
        msg.body(f"📘 View PIL for *{drug_name.title()}*:\nhttps://nexahealth.vercel.app/pil/{drug_name.lower()}")
    
    else:
        msg.body(
            "👋🏽 *Welcome to NexaHealth — Your AI Drug Safety Companion!*\n\n"
            "I can help you:\n"
            "🔍 *Verify a drug*: check if it’s NAFDAC-approved\n"
            "🧾 *Read drug leaflets (PILs)*: know how to use your medicine\n"
            "🚨 *Report suspicious drugs*: help protect others\n\n"
            "👉🏽 Type any of these to get started:\n"
            "• `verify amoxicillin`\n"
            "• `pil flagyl`\n"
            "• `report coartem fake`\n\n"
            "🩺 Built for Nigerians. Powered by AI. Backed by verified data.\n"
            "💡 Try it now!"
        )

    return str(resp)
