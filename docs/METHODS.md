# How the numbers work

This page keeps the calculation details in one place. For everyday steps, start with [Using the app](USER_GUIDE.md).

## Chronological forecasting

For a calendar array of length n, validation origins are n−113 through n−64 in seven-day steps. Holdout origins are n−57 through n−8. Each origin predicts leads 1–7, so their target periods do not overlap. Every origin fits all eligible prior examples through itself, never targets after it. Missing pairs remain NaN; 14-day feature windows must be complete.

The 12 features are lagged/rolling temperature and rain summaries, annual sine/cosine for the target date and lead/7. Numeric inputs are standardized using training data only. Ridge penalty is 20; the intercept is unpenalized. The candidate predicts raw temperature and rainfall, with rain floored at zero. Baseline predicts the mean of the last 14 days. Selection uses validation MAE and requires a 2% improvement. This selection remains fixed while holdout performance is reported, even if a different model later scores better.

After selection, fitting uses all eligible history. Eight weekly test origins yield up to 56 forecast/reference pairs per variable. Rain MAPE only includes reference rain ≥1 mm; MAE/RMSE include all valid pairs. Celsius MAPE is omitted. Ranges use the same-lead 90th percentile absolute test error with at least five examples; they are descriptive, not calibrated probability intervals. The small test period cannot establish performance across seasons, typhoons or locations.

## Date and location matching

Internal forecasts start after the latest complete trailing window. Stale inputs remain tied to their real dates. Open-Meteo mean temperature is requested directly; max/min midpoint is not substituted. Tables join exact dates and coordinates. Sample locations stay separate from the saved farm. Missing comparisons remain blank.

Forecast issues are archived with their generation/retrieval time. Later paired evaluation requires both kinds issued on the same Philippine day strictly before the target, and later reference values. The latest saved issue per kind/issue-day/target is used, with paired-record and unique-target counts shown. Different issue days can share a target. Provider disagreement is never scored as error without references.

NASA POWER is a gridded reference, not independent field ground truth. Its local solar day and Manila civil day differ. Uploaded records are user supplied and unverified. Independent station validation remains necessary before micro-climate accuracy claims.

## Daily water conservation

Root-zone TAW = 1000(θFC−θWP)Zr; RAW = p·TAW. Effective rain and net irrigation reduce depletion; surplus drains. Ks is 1 until RAW, then bounded (TAW−depletion)/(TAW−RAW). Actual ET is bounded by Ks·Kc·ET₀ and remaining available water. Final depletion adds extraction. Flags mark depletion beyond the chosen threshold.

Paddy water is limited by user-set bund capacity. Rain/net irrigation enter; overflow exits; ET demand is withdrawn up to storage; assumed seepage is withdrawn from what remains. An empty pond does not prove root drought. This is not an AWD subsurface-water model.

Each represented ledger conserves its water numerically. Within-day rainfall timing/intensity, groundwater, lateral flow and crop growth are omitted. Baseline has no extra irrigation; changed plans apply rain/demand adjustments and one irrigation event. Volume = gross mm × saved area ha × 10 m³/(ha·mm). Kc, efficiency, capture, initial water and soil values are assumptions. Missing ET₀ uses the disclosed fallback, not fabricated climate measurements.

## Agricultural evidence

[FAO 56](https://www.fao.org/4/x0490e/x0490e0e.htm) supplies the water-availability framework. [DA-PhilRice](https://www.philrice.gov.ph/water-saving-practices-advised-as-el-nino-threat-looms/) supports rice-stage water priorities and reviewed water-saving methods. [PAGASA](https://www.pagasa.dost.gov.ph/ten-day-regional-agri-weather) provides operational weather context, and [BSWM](https://www.bswm.da.gov.ph/process/laboratory-services/) explains laboratory analysis as the basis of nutrient recommendations.

The app's three days below 1 mm/day and 20 mm/day review triggers are screening choices, not thresholds supplied by those institutions or official warnings. Sources support the general checks, not those chosen cutoffs. Weather advice ignores forecasts older than 48 hours. No fertilizer dose, yield, survival or causal journal inference is produced.


## Crop suggestions

The current crop is treated as the crop being rotated out of. The saved previous crop adds one earlier crop. The app compares rice, corn, mungbean and sweet potato. These are rule-based options, not a trained crop-selection model.

The ranking adds or subtracts points as follows:

| Condition | Effect |
| --- | --- |
| Repeat current crop | −3 |
| Change crop family | +2 |
| Repeat saved previous crop | −1 |
| Mungbean after rice or corn | +2 |
| Good drainage for a non-rice crop | +2 |
| Poor drainage for a non-rice crop | Block direct calendar selection |
| Lowland, irrigated rice | +3 |
| Rainfed rice | −2 |
| Mungbean with a forecast day of at least 20 mm | −2 |
| Rainfed field with less than 7 mm across a complete seven-day forecast | −2 |

Blocked options sort last; other options sort by score, then crop name for ties. These weights are prototype choices. They are not percentages or locally validated yield estimates. Unknown drainage does not block an option, but leaves a visible concern.

Weather checks use unique dates from today through day six, with usable rainfall and a retrieval time no older than 48 hours. Synthetic forecasts are excluded. A dry-week check requires all seven days. A wetter-day check can trigger from one available day. This crop-ranking dry rule differs from the three-consecutive-dry-days rule in general suggested actions.

Soil pH, ash exposure and coastal terrain add review notes, not score changes. NPK, earlier pH and soil-test age do not affect ranking. The current crop stage changes the timing message. Historical weather, the 30-day outlook and journal text are not used by this ranking function.

The draft calendar uses the date and duration entered by the user. It adds preparation at 14 days before planting, an establishment check seven days after, and an estimated harvest at planting plus duration. It does not optimize a planting date or model crop development.

Supporting references include the [DA mungbean guide](https://hvcdp.da.gov.ph/wp-content/uploads/2022/05/Mungbean-Production-Guide.pdf), [UPLB cropping-calendar guidance](https://amtec.uplb.edu.ph/wp-content/uploads/2019/07/PAES602-IrrigationWaterRequirements.pdf) and the PhilRice material linked above. These support the general checks, not every ranking weight.

## The separate 30-day outlook

`fetch_month_outlook()` requests daily mean temperature and precipitation from Open-Meteo’s seasonal endpoint using `ecmwf_ec46_ensemble_mean`. The screen summarizes the returned days in groups of seven and leaves incomplete rainfall totals unreported.

This feed represents a broad area at about 36 km resolution and is not bias-corrected for the farm. It is separate from the app’s seven-day regression and short-range Open-Meteo forecast. It currently does not feed the water simulator or crop ranking. The live feed still needs an end-to-end check. See the [provider documentation](https://open-meteo.com/en/docs/seasonal-forecast-api).

## Historical date limits

Shared analysis windows and rolling replay accept up to 366 days ending before today. Historical simulations use the selected window and require complete daily records. Downloads for a shared period also request 730 days before its start for training. CSV import and raw-history download have separate limits documented in the README and development guide.
