import os
import requests

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY", "your-huggingface-api-key")
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2"

API_URL = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
HEADERS = {
    "Authorization": f"Bearer {HF_API_KEY}",
    "Content-Type": "application/json"
}


def get_ai_response(message: str) -> str:
    system_prompt = (
        "You are Nexa AI Health Companion, a friendly and culturally-aware health assistant for Africans. "
        "You give helpful advice about symptoms, mental health, and wellness. "
        "You understand languages like Yoruba, Pidgin, Hausa, and Swahili. You are not a doctor, but you help users feel informed and cared for."
    )

    data = {
        "inputs": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]
    }

    response = requests.post(API_URL, headers=HEADERS, json=data)

    if response.status_code != 200:
        raise Exception(f"HuggingFace API error: {response.status_code} - {response.text}")

    output = response.json()

    try:
        return output["generated_text"] or output[0]["generated_text"]
    except:
        raise Exception(f"Unexpected response: {output}")
