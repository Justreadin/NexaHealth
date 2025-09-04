import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)

mock_reports = [
    {
        "pharmacy_name": "HopeMed Ikeja",
        "state": "Lagos",
        "lga": "Ikeja",
        "street_address": "123 Hope St",
        "drug_name": "Coartem"
    },
    {
        "pharmacy_name": "HopeMed Ikeja",
        "state": "Lagos",
        "lga": "Ikeja",
        "street_address": "123 Hope St",
        "drug_name": "Coartem"
    },
    {
        "pharmacy_name": "HopeMed Ikeja",
        "state": "Lagos",
        "lga": "Ikeja",
        "street_address": "123 Hope St",
        "drug_name": "Coartem"
    },
    {
        "pharmacy_name": "HealthPlus",
        "state": "Lagos",
        "lga": "Yaba",
        "street_address": "45 Yaba Rd",
        "drug_name": "Paracetamol"
    },
    {
        "pharmacy_name": "HealthPlus",
        "state": "Lagos",
        "lga": "Yaba",
        "street_address": "45 Yaba Rd",
        "drug_name": "Paracetamol"
    },
]

class MockDoc:
    def __init__(self, data):
        self._data = data
    def to_dict(self):
        return self._data

def mock_stream():
    for r in mock_reports:
        yield MockDoc(r)

def mock_stream_for_pharmacy(pharmacy_name):
    for r in mock_reports:
        if r["pharmacy_name"] == pharmacy_name:
            yield MockDoc(r)

@patch("app.core.db.reports_collection.stream", side_effect=mock_stream)
def test_get_flagged_basic(mock_stream_func):
    response = client.get("/get-flagged")
    assert response.status_code == 200
    data = response.json()
    flagged = data["flagged_pharmacies"]
    summary = data["summary"]

    # Only HopeMed Ikeja is flagged (3 reports)
    assert any(p["pharmacy"] == "HopeMed Ikeja" for p in flagged)
    assert all(p["report_count"] >= 3 for p in flagged)
    assert summary["total_flagged_pharmacies"] == len(flagged)
    assert summary["total_reports"] == len(mock_reports)

@patch("app.core.db.reports_collection.stream", side_effect=mock_stream)
def test_get_flagged_filter_pharmacy(mock_stream_func):
    response = client.get("/get-flagged", params={"pharmacy": "hope"})
    assert response.status_code == 200
    data = response.json()
    flagged = data["flagged_pharmacies"]
    # Should only return HopeMed Ikeja pharmacy (case insensitive)
    assert len(flagged) == 1
    assert flagged[0]["pharmacy"] == "HopeMed Ikeja"

@patch("app.core.db.reports_collection.where")
def test_get_reports_for_pharmacy(mock_where):
    pharmacy_name = "HopeMed Ikeja"
    mock_where.return_value.stream = lambda: mock_stream_for_pharmacy(pharmacy_name)

    response = client.get(f"/get-flagged/{pharmacy_name}/reports")
    assert response.status_code == 200
    data = response.json()
    assert data["pharmacy"] == pharmacy_name
    assert data["report_count"] == 3
    assert isinstance(data["reports"], list)
    assert all(r["pharmacy_name"] == pharmacy_name for r in data["reports"])

@patch("app.core.db.reports_collection.where")
def test_get_reports_for_pharmacy_not_found(mock_where):
    unknown_pharmacy = "UnknownPharma"
    mock_where.return_value.stream = lambda: iter([])

    response = client.get(f"/get-flagged/{unknown_pharmacy}/reports")
    assert response.status_code == 404
    data = response.json()
    assert data["detail"] == "No reports found for this pharmacy"
