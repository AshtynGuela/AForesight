# Using AgriForesight

## Save the farm first

Enter your coordinates in **My farm & soil**, find the location, and check the town shown. GPS is useful when you are actually at the farm. The map uses boundaries from 2020, so newer administrative changes may be missing.

Add your area, current crop, previous crop, growth stage and water access. These affect the advice. Soil readings are optional; enter actual test results with their date and method.

The app keeps one farm profile. Saving a different crop overwrites that profile; it does not create a separate crop season.

## Check the weather

**Next 7 days** shows the saved short-range forecast. Tap **Update weather** to request fresh data. Downloads are cached for three hours. Weather-sensitive advice ignores forecasts older than 48 hours.

**Load 30-day outlook** uses a separate ECMWF EC46 ensemble-mean feed. The screen groups it into weeks and offers daily estimates below. This is a broad area outlook, with much less certainty about a particular day at your farm. It is cached for six hours. If an update fails and an older issue exists, the app labels the saved issue.

The 30-day outlook does not feed crop ranking or the water simulator yet. The app’s own regression model still predicts seven days.

## Compare crops

Save the latest farm details, then open **Crop plans**. Answer the drainage question and ask for options.

The app compares rice, corn, mungbean and sweet potato. It uses your current crop as the crop you will rotate out of. The previous-crop field adds one earlier step of history. Check each option’s reasons and concerns, not just its position in the list.

Poor drainage prevents direct selection of upland crops into the draft calendar. Unknown drainage leaves their suitability unresolved. Soil pH, ash exposure and coastal location add checks; they do not calculate nutrient needs or prove a crop is suitable.

After choosing a crop, open the calendar. Enter a tentative planting date and the expected duration for your variety. The default duration is only an example. Calendar entries include preparation, planting, an establishment check and an estimated harvest date. Plans are returned to the screen; there is no saved-plan library yet.

## Try a water plan

Choose saved forecast weather, a built app forecast, or past weather. Adjust rain, enter total litres for the whole farm, and choose the watering day.

Start with zero added water if you only want to compare rainfall changes. Both plans share the same starting soil and water settings. Open those settings with a technician if you do not have measurements.

Read the days needing a field check and the first check date. For rice, an empty modelled pond does not mean the roots are dry. The result does not predict yield or crop survival. Only one extra watering event is represented.

## Look back over a year

Open **Choose past dates**, pick up to 366 days ending before today, and select a source. A download also gets earlier history for forecast testing. Dates without readings stay missing; they are not counted as dry days.

Historical simulations need a complete, continuous period of at least seven days. A selected year can be reviewed, but missing days must be resolved before a full-year simulation runs. Historical advice uses your saved crop stage, not a reconstructed stage from those dates.

For CSV imports, use `date,temp,rain`: YYYY-MM-DD, average temperature in °C, and daily rainfall in mm. Imports accept 14–1,826 rows within a five-year span. Use records for the saved farm location. Importing replaces the active weather records.

## Keep notes

Write what you tried and what happened. Offline entries wait on the device until they can sync. Keep the same browser address and do not clear storage before syncing. Notes are deliberately left out of forecasts and crop suggestions.

## If something looks wrong

- **Old screen:** refresh after restarting the app. A cached screen may appear while the server is unavailable.
- **Old forecast dates:** update provider weather or load newer history before building the app forecast. Old inputs really do produce old forecast dates.
- **Same forecast value every day:** the selected 14-day-average baseline repeats its value. That is expected; the past-date replay moves the input window each day.
- **Missing weather:** try the other historical source or import suitable records. Do not fill gaps with zero rain unless zero was actually measured.
- **No new crop suggestion:** save the farm edits, then run suggestions again. Updating the profile does not automatically rerun an existing result.
- **Cannot reach the app:** keep the terminal running and open http://127.0.0.1:5000. A phone’s own localhost address will not reach the computer.
