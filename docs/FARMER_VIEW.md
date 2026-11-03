> Earlier implementation notes. For current behaviour, start with the [README](../README.md).

# Farmer view changes

Forecasts now open with daily farm weather, a next-seven-days / past-dates switch, and practical field checks. Past records are labelled as practice examples. Saved weather older than 48 hours carries an update reminder. Missing past days are disclosed. Optional model comparisons, scores and technical assumptions remain under an advanced disclosure.

The water planner asks about rainfall changes, total litres for the saved farm, and a watering date. The default compares unchanged rain and demand against no added water. Both plans use the same assumed field conditions. One millimetre across one hectare is 10,000 litres. Conversion uses the saved farm area; total volume is calculated before rounding daily display values. This is one watering event, not a repeated schedule. A date must be reselected if it falls outside a newly selected weather window.

Results lead with days needing a field check, water added and the first check date. An empty modelled rice pond does not prove that roots are dry. No crop yield, survival or flood prediction is made. Soil and initial water settings still need field confirmation.

Advice includes crop stage, young-plant checks, flowering, harvest preparation, rice bund leaks, upland drainage and water availability. Weather review triggers remain app screening rules, with thresholds and scope explained under Why this advice. The first four checks are visible; further checks expand below them. Advice remains deterministic and source-linked. Journal text remains stored for later processing, and is not used for advice or forecasts.

Read `advice.py` to follow the rules, `simulation.py` for the water calculation, and `static/app.js` for litres conversion and the simpler screens. To add a rule, identify the farm input or weather condition, write one field action, then include its reason, timing and a primary reference. Test the condition and its opposite so an irrelevant action cannot appear.

Sources include PhilRice water-saving guidance, rice field preparation and its rice growing manual; BSWM laboratory services; PAGASA regional agricultural weather; FAO 56; and TNAU maize water management. TNAU supports general water sensitivity only; its local stage-day schedules and doses are not applied to Philippine farms.

Restart the local Flask app and refresh the page after updating. The offline shell cache version has been updated.
