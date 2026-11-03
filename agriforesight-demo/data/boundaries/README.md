# Philippine administrative boundary snapshot

Downloaded through the [geoBoundaries API](https://www.geoboundaries.org/api.html).

Original sources: National Mapping and Resource Information Authority (NAMRIA), Philippines Statistics Authority (PSA), OCHA Philippines. Distributed by geoBoundaries (William & Mary geoLab and contributors).

These PHL files are licensed under **Creative Commons Attribution 3.0 Intergovernmental Organisations (CC BY 3.0 IGO)**, as recorded in the upstream metadata. [License](https://creativecommons.org/licenses/by/3.0/igo/). Preserve attribution when redistributing. See `metadata.json` for source URLs, exact release identifiers, download links and retrieval timestamps.

- ADM1: regions (17 in this snapshot).
- ADM2: provinces or equivalent administrative units (87).
- ADM3: municipalities/cities and some Manila districts (1,647).

The source represents **2020**, with build/update dates in metadata. It does not encode all subsequent administrative reorganizations. This is not the current official PSGC register. Geometry is the provider's simplified version, stored in compact JSON without additional geometric transformations.

The application tests the user's point against these boundaries. It does not geocode the closest road or town, and does not send coordinates to an external geocoder. Boundary simplification, missing islands, separate layer tolerances and coastal edges can produce no match or missing parent fields. The app does not snap rejected points to a different location. A match is approximate administrative context, not legal jurisdiction, land ownership, farm boundaries, area or a cadastral survey.

To refresh: run `.\.venv\Scripts\python.exe scripts/download_boundaries.py` from the project root, inspect updated metadata and tests, then restart Flask. All three datasets and metadata must remain together.
