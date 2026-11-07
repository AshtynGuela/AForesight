"""Validate chat edits using the same rules as the farm form."""

import json
from engine import validate_profile

EDITABLE = {
    "name": "Farm name",
    "area": "Area (hectares)",
    "terrain": "Field setting",
    "water": "Water source",
    "crop": "Crop",
    "previous_crop": "Previous crop",
    "crop_stage": "Crop stage",
    "planting_date": "Planting date",
    "ph": "Soil pH",
    "previous_ph": "Previous pH",
    "nitrogen": "Nitrogen (mg/kg)",
    "phosphorus": "Phosphorus (mg/kg)",
    "potassium": "Potassium (mg/kg)",
    "sample_date": "Soil sample date",
    "soil_method": "Soil measurement method",
    "ash": "Ash observed",
    "nitrogen_rating": "Reported nitrogen category",
    "phosphorus_rating": "Reported phosphorus category",
    "potassium_rating": "Reported potassium category",
    "ph_medium": "pH test medium",
}


def prepare_edits(value, farm, draft=None):
    try:
        changes = json.loads(value)
    except (ValueError, TypeError):
        raise ValueError(
            "Tell me the field and its new value, for example: change the area to 2 hectares."
        ) from None
    if not isinstance(changes, dict) or not changes:
        raise ValueError("Which farm detail would you like to change?")
    if set(changes) - set(EDITABLE):
        raise ValueError(
            "Location changes need the map in My farm & soil. Other farm details can be changed here."
        )
    edits = {**(draft or {}), **changes}
    checked = validate_profile({**farm, **edits})
    return {field: checked[field] for field in edits}


def describe_edits(edits):
    lines = []
    for field, value in edits.items():
        shown = (
            "Not recorded"
            if value is None or value == ""
            else ("Yes" if value is True else "No" if value is False else str(value))
        )
        lines.append(EDITABLE[field] + ": " + shown)
    return "\n".join(lines)
