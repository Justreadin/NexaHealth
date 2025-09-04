import pandas as pd

# Define a full keyword-risk-drug mapping based on common symptoms and known medications
data = [
    {"symptom_keyword": "headache", "risk_weight": 10, "common_drugs": "Paracetamol, Ibuprofen"},
    {"symptom_keyword": "fever", "risk_weight": 20, "common_drugs": "Paracetamol, Artemether"},
    {"symptom_keyword": "dizziness", "risk_weight": 15, "common_drugs": "Meclizine, Tramadol"},
    {"symptom_keyword": "chest pain", "risk_weight": 35, "common_drugs": "Tramadol, Carvedilol"},
    {"symptom_keyword": "cough", "risk_weight": 10, "common_drugs": "Levofloxacin, Cough Syrup"},
    {"symptom_keyword": "vomiting", "risk_weight": 15, "common_drugs": "Metoclopramide"},
    {"symptom_keyword": "weakness", "risk_weight": 10, "common_drugs": "Vitamin B Complex"},
    {"symptom_keyword": "high blood pressure", "risk_weight": 40, "common_drugs": "Carvedilol, Telmisartan"},
    {"symptom_keyword": "malaria", "risk_weight": 30, "common_drugs": "Artemether, Lumefantrine"},
    {"symptom_keyword": "diarrhea", "risk_weight": 15, "common_drugs": "Loperamide"},
    {"symptom_keyword": "sore throat", "risk_weight": 10, "common_drugs": "Levofloxacin, Strepsils"},
    {"symptom_keyword": "nausea", "risk_weight": 15, "common_drugs": "Metoclopramide"},
    {"symptom_keyword": "insomnia", "risk_weight": 10, "common_drugs": "Melatonin, Diazepam"},
    {"symptom_keyword": "fatigue", "risk_weight": 10, "common_drugs": "Vitamin B Complex, Iron Supplement"},
    {"symptom_keyword": "blurred vision", "risk_weight": 25, "common_drugs": "Consult ophthalmologist"},
    {"symptom_keyword": "shortness of breath", "risk_weight": 40, "common_drugs": "Salbutamol, Oxygen therapy"},
    {"symptom_keyword": "back pain", "risk_weight": 20, "common_drugs": "Ibuprofen, Tramadol"},
    {"symptom_keyword": "loss of appetite", "risk_weight": 15, "common_drugs": "Vitamin B Complex"},
    {"symptom_keyword": "joint pain", "risk_weight": 25, "common_drugs": "Ibuprofen, Diclofenac"},
    {"symptom_keyword": "cold", "risk_weight": 10, "common_drugs": "Paracetamol, Antihistamines"}
]

# Create a DataFrame
df = pd.DataFrame(data)

# Save to CSV
csv_path = "/app/data/keyword_risk_map.csv"
df.to_csv(csv_path, index=False)

csv_path
