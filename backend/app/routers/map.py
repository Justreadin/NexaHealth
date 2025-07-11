from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from app.core.db import reports_collection  # assumed Firestore collection reference
from datetime import datetime
from rapidfuzz import fuzz

router = APIRouter()

# Simple in-memory cache
cache = {
    "flagged_data": None,
    "timestamp": None,
    "ttl_seconds": 60  # Cache time-to-live
}

def fetch_flagged_data():
    try:
        docs = reports_collection.stream()
        reports = []
        for doc in docs:
            data = doc.to_dict()
            if data:
                reports.append(data)

        # Aggregate by pharmacy (case-insensitive key)
        pharmacy_reports = {}
        for r in reports:
            pharmacy = r.get("pharmacy_name", "").strip().lower()
            if not pharmacy:
                continue
            if pharmacy not in pharmacy_reports:
                pharmacy_reports[pharmacy] = {
                    "pharmacy": r.get("pharmacy_name", "").strip(),
                    "state": r.get("state"),
                    "lga": r.get("lga"),
                    "street_address": r.get("street_address"),
                    "report_count": 0,
                    "drugs": set()
                }
            pharmacy_reports[pharmacy]["report_count"] += 1
            drug = r.get("drug_name")
            if drug:
                pharmacy_reports[pharmacy]["drugs"].add(drug)

        # Only flag if 3 or more reports
        flagged = [
            {
                "pharmacy": v["pharmacy"],
                "state": v["state"],
                "lga": v["lga"],
                "street_address": v["street_address"],
                "report_count": v["report_count"],
                "drugs": list(v["drugs"])
            }
            for v in pharmacy_reports.values() if v["report_count"] >= 3
        ]

        # Summary data
        summary = {
            "total_flagged_pharmacies": len(flagged),
            "total_reports": len(reports),
            "top_drugs": []
        }

        drug_counts = {}
        for r in reports:
            drug = r.get("drug_name")
            if drug:
                drug_counts[drug.lower()] = drug_counts.get(drug.lower(), 0) + 1

        sorted_drugs = sorted(drug_counts.items(), key=lambda x: x[1], reverse=True)
        summary["top_drugs"] = [{"drug_name": d[0], "count": d[1]} for d in sorted_drugs[:5]]

        return flagged, summary, reports  # return raw reports

    except Exception as e:
        cache["flagged_data"] = None
        cache["timestamp"] = None
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get-flagged")
async def get_flagged_pharmacies(
    pharmacy: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    lga: Optional[str] = Query(None),
    drug: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    sort_by: str = Query("report_count", regex="^(report_count|pharmacy)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$")
):
    now = datetime.utcnow()
    if cache["flagged_data"] and cache["timestamp"] and (now - cache["timestamp"]).total_seconds() < cache["ttl_seconds"]:
        flagged, summary, all_reports = cache["flagged_data"]
    else:
        flagged, summary, all_reports = fetch_flagged_data()
        cache["flagged_data"] = (flagged, summary, all_reports)
        cache["timestamp"] = now

    # Fuzzy matching helper
    def fuzzy_match(query: str, target: str, threshold=70):
        return fuzz.partial_ratio(query.lower(), target.lower()) >= threshold

    # Filter flagged pharmacies
    def matches_filter(item):
        if pharmacy and not fuzzy_match(pharmacy, item["pharmacy"]):
            return False
        if state and not fuzzy_match(state, item.get("state") or ""):
            return False
        if lga and not fuzzy_match(lga, item.get("lga") or ""):
            return False
        if drug and not any(fuzzy_match(drug, d) for d in item.get("drugs", [])):
            return False
        return True

    filtered = list(filter(matches_filter, flagged))

    # Sorting
    reverse = (sort_order == "desc")
    filtered.sort(key=lambda x: x[sort_by].lower() if sort_by == "pharmacy" else x[sort_by], reverse=reverse)

    # Pagination
    start = (page - 1) * limit
    end = start + limit
    paginated = filtered[start:end]

    return {
        "flagged_pharmacies": paginated,
        "all_reports": all_reports,  # 🔥 included here
        "summary": summary,
        "page": page,
        "limit": limit,
        "total_filtered": len(filtered)
    }


@router.get("/get-flagged/{pharmacy}/reports")
async def get_pharmacy_reports(pharmacy: str):
    try:
        # Get all reports from cache or database
        _, _, all_reports = cache["flagged_data"] or fetch_flagged_data()

        # Filter reports for this specific pharmacy (case-insensitive)
        pharmacy_lower = pharmacy.lower()
        pharmacy_reports = [
            r for r in all_reports
            if r.get("pharmacy_name", "").lower() == pharmacy_lower
        ]

        return {
            "pharmacy": pharmacy,
            "reports": pharmacy_reports,
            "count": len(pharmacy_reports)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))