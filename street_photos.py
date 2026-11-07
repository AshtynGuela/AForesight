"""Public KartaView photos near a farm. A road photo is not a farm survey."""

from datetime import date, datetime, timezone
from math import asin, cos, radians, sin, sqrt, isfinite
from urllib.parse import urlsplit
import requests

RADIUS_METRES = 500


def distance_metres(lat, lng, photo_lat, photo_lng):
    a = (
        sin(radians(photo_lat - lat) / 2) ** 2
        + cos(radians(lat))
        * cos(radians(photo_lat))
        * sin(radians(photo_lng - lng) / 2) ** 2
    )
    return 6371000 * 2 * asin(sqrt(min(1, a)))


def photo_url(value):
    if not isinstance(value, str):
        return None
    url = urlsplit(value)
    # Use processed CDN images, not the raw, potentially unblurred originals.
    if (
        url.scheme == "https"
        and url.hostname == "cdn.kartaview.org"
        and not url.username
        and not url.password
        and not url.port
    ):
        return value
    return None


def fetch_street_photo(latitude, longitude):
    response = requests.get(
        "https://api.kartaview.org/2.0/photo/",
        params={
            "lat": latitude,
            "lng": longitude,
            "radius": RADIUS_METRES,
            "zoomLevel": 16,
            "join": "sequence",
            "itemsPerPage": 100,
        },
        timeout=(5, 12),
    )
    response.raise_for_status()
    payload = response.json()
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("status"), dict)
        or payload["status"].get("apiCode") != 600
    ):
        raise ValueError("Street photos are unavailable.")
    result = payload.get("result")
    rows = result.get("data") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        raise ValueError("Street photos are unavailable.")
    candidates = []
    for row in rows:
        if (
            not isinstance(row, dict)
            or row.get("visibility") != "public"
            or row.get("status") != "active"
            or row.get("autoImgProcessingResult") != "BLURRED"
        ):
            continue
        try:
            lat, lng = float(row["lat"]), float(row["lng"])
            if (
                not isfinite(lat)
                or not isfinite(lng)
                or not -90 <= lat <= 90
                or not -180 <= lng <= 180
            ):
                continue
            distance = distance_metres(latitude, longitude, lat, lng)
            if distance > RADIUS_METRES:
                continue
            thumbnail = photo_url(row.get("imageThUrl")) or photo_url(
                row.get("imageLthUrl")
            )
            full = photo_url(row.get("imageProcUrl")) or thumbnail
            if not thumbnail:
                continue
            captured = date.fromisoformat(str(row.get("shotDate", ""))[:10]).isoformat()
        except (ValueError, TypeError, KeyError):
            continue
        candidates.append(
            {
                "image_url": thumbnail,
                "full_image_url": full,
                "latitude": lat,
                "longitude": lng,
                "distance_m": round(distance),
                "captured_on": captured,
                "source": "KartaView contributors",
                "source_url": "https://kartaview.org",
                "license": "CC BY-SA 4.0",
                "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            }
        )
    return {
        "photo": min(candidates, key=lambda item: item["distance_m"])
        if candidates
        else None,
        "latitude": latitude,
        "longitude": longitude,
        "radius_m": RADIUS_METRES,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }
