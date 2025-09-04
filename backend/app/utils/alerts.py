from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def create_alert_for_ae(report_data: dict):
    """
    Notify nearby users of a severe/life-threatening adverse event.
    This function should integrate with your notification system (Firebase, OneSignal, etc.)
    """
    alert = {
        "type": "AE_ALERT",
        "drug_name": report_data["drug_name"],
        "batch_number": report_data.get("batch_number"),
        "severity": report_data["severity"],
        "location": {
            "state": report_data["state"],
            "lga": report_data["lga"]
        },
        "timestamp": datetime.utcnow().isoformat(),
        "message": f"⚠️ Severe reaction reported for {report_data['drug_name']} in {report_data['lga']}, {report_data['state']}"
    }

    logger.info(f"[ALERT SYSTEM] Sending alert: {alert}")
    # 🚀 TODO: Connect to FCM or push system here
    return alert
