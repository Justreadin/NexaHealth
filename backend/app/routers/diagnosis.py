# diagnosis.py
from fastapi import APIRouter
from app.core.ml import calculate_risk, verified_drugs
from app.models.diagnosis_model import SymptomInput, SuggestedDrug, DiagnosisResponse

router = APIRouter()

@router.post("/diagnose", response_model=DiagnosisResponse)
async def diagnose(request: SymptomInput):
    result = calculate_risk(request.symptoms)

    suggested_drugs = []

    for drug_name in result["recommended_drugs"]:
        match = next(
            (drug for drug in verified_drugs if drug["product_name"].lower() == drug_name.lower()),
            None
        )
        if match:
            use_case = f"Used for treatment involving: {', '.join(match.get('ingredients', []))}"
            suggested_drugs.append(SuggestedDrug(
                name=match.get("product_name", drug_name),
                dosage_form=match.get("dosage_form", "N/A"),
                use_case=use_case
            ))
        else:
            suggested_drugs.append(SuggestedDrug(
                name=drug_name,
                dosage_form="N/A",
                use_case="Not specified"
            ))

    return DiagnosisResponse(
        diagnosis_type="risk",
        result=result["risk_level"],
        score=result["risk_score"],
        matched_keywords=result["matched_keywords"],
        suggested_drugs=suggested_drugs
    )
