/* Explainable planning checks. The ring shows data coverage, never a health percentage. */
const assessFarm = (() => {
  const refs = {
    soil: {
      title: "BSWM soil test kits",
      url: "https://www.bswm.da.gov.ph/wp-content/uploads/RST-Brochure.pdf",
    },
    water: {
      title: "FAO: crop water needs",
      url: "https://www.fao.org/4/x0490e/x0490e00.htm",
    },
    weather: {
      title: "PAGASA agricultural weather",
      url: "https://www.pagasa.dost.gov.ph/ten-day-regional-agri-weather",
    },
  };
  const phGuides = {
    rice: [
      5.5,
      7,
      "https://nfhl.naerls.gov.ng/index.php?action=faq&artlang=en&cat=35&highlight=rice&id=19",
      "NAERLS rice guidance",
    ],
    corn: [
      6,
      7,
      "https://www.kau.in/ml/book/maize-zea-mays",
      "Kerala Agricultural University: maize",
    ],
    mungbean: [
      6.5,
      7.5,
      "https://www.celkau.in/Crops/pulses/greengram/climate.php",
      "Kerala Agricultural University: mungbean",
    ],
    "sweet potato": [
      5.6,
      6.6,
      "https://cipotato.org/wp-content/uploads/2014/11/006194.pdf",
      "CIP sweetpotato guidance",
    ],
  };
  const numeric = (v, low, high) => Number.isFinite(v) && v >= low && v <= high;
  const samePoint = (a, b) =>
    a && a.latitude === b.latitude && a.longitude === b.longitude;
  const ageHours = (stamp, now) => (now - Date.parse(stamp)) / 3600000;
  const fresh = (stamp, hours, now) => {
    const age = ageHours(stamp, now);
    return Number.isFinite(age) && age >= 0 && age <= hours;
  };
  const check = (
    id,
    label,
    status,
    title,
    detail,
    action,
    available,
    source,
  ) => ({ id, label, status, title, detail, action, available, source });

  return (state, now = Date.now()) => {
    const farm = state.farm;
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    const guide = phGuides[farm.crop];
    const sampleDay = farm.sample_date;
    const sampleAge = (Date.parse(today) - Date.parse(sampleDay)) / 86400000;
    const samplePointOkay =
      !farm.soil_sample_point || samePoint(farm.soil_sample_point, farm);
    const soilRecent =
      Number.isFinite(sampleAge) &&
      sampleAge >= 0 &&
      sampleAge <= 180 &&
      ["lab", "field kit", "sensor"].includes(farm.soil_method) &&
      samplePointOkay;
    const notes = [];
    let soilStatus = "unknown",
      soilAvailable = false;
    let soilTitle = "Add a recent soil test",
      soilAction = "Add the sample date, method and results from your field.";
    if (soilRecent) {
      const phReady =
        numeric(farm.ph, 0, 14) && farm.ph_medium === "water" && guide;
      const nutrients = ["nitrogen", "phosphorus", "potassium"];
      const rated = nutrients.filter((key) =>
        ["low", "medium", "high"].includes(farm[key + "_rating"]),
      );
      if (phReady) {
        const outside = farm.ph < guide[0] || farm.ph > guide[1];
        notes.push(
          `pH ${farm.ph}; general ${farm.crop} reference ${guide[0]}–${guide[1]} (water-based test).`,
        );
        if (outside) soilStatus = "attention";
      } else
        notes.push(
          "pH comparison needs a water-based test result and a supported crop.",
        );
      for (const key of nutrients) {
        const rating = farm[key + "_rating"];
        if (rated.includes(key))
          notes.push(
            `${key[0].toUpperCase() + key.slice(1)}: ${rating} on the report.`,
          );
        else if (numeric(farm[key], 0, 100000))
          notes.push(
            `${key[0].toUpperCase() + key.slice(1)} recorded; ask the lab to interpret it for this crop.`,
          );
      }
      const low = rated.filter((key) => farm[key + "_rating"] === "low");
      const high = rated.some((key) => farm[key + "_rating"] === "high");
      if (low.length) soilStatus = "attention";
      soilAvailable = Boolean(phReady && rated.length === 3);
      if (soilStatus === "attention") {
        soilTitle = "Review the soil results";
        soilAction =
          "Discuss the flagged pH or low nutrients with your soil laboratory before applying amendments.";
      } else if (soilAvailable && !high) {
        soilStatus = "okay";
        soilTitle = "No soil flag in these results";
        soilAction =
          "Follow the crop-specific recommendation on your soil report.";
      } else {
        soilStatus = "unknown";
        soilTitle = high
          ? "Review the high nutrient result"
          : "Soil check is incomplete";
        soilAction =
          "Ask the lab whether these results meet the needs of your saved crop.";
      }
      notes.push(`Sample ${sampleDay}; ${farm.soil_method}.`);
    } else {
      notes.push(
        !samplePointOkay
          ? "These results belong to a different saved coordinate."
          : sampleAge > 180
            ? "The sample is over 180 days old; review or retest before relying on it."
            : "A dated soil result with its measurement method is needed.",
      );
    }
    const soil = check(
      "soil",
      "Soil",
      soilStatus,
      soilTitle,
      notes.join(" "),
      soilAction,
      soilAvailable,
      refs.soil,
    );
    if (guide) soil.guide = { title: guide[3], url: guide[2] };

    const forecast = state.forecast;
    const rows =
      forecast &&
      samePoint(forecast, farm) &&
      !forecast.demo &&
      fresh(forecast.retrieved_at || forecast.issued_at, 48, now)
        ? (forecast.days || [])
            .filter(
              (d) =>
                d.date >= today &&
                d.date <=
                  new Date(now + 8 * 3600000 + 6 * 86400000)
                    .toISOString()
                    .slice(0, 10),
            )
            .sort((a, b) => a.date.localeCompare(b.date))
        : [];
    const days = [...new Map(rows.map((row) => [row.date, row])).values()];
    const rain = days.filter((d) => numeric(d.rain, 0, 3000));
    let dry = 0,
      longest = 0,
      previous;
    for (const d of rain) {
      if (previous && Date.parse(d.date) - Date.parse(previous) !== 86400000)
        dry = 0;
      dry = d.rain < 1 ? dry + 1 : 0;
      longest = Math.max(longest, dry);
      previous = d.date;
    }
    const complete = rain.length === 7 && rain[0]?.date === today;
    const current = state.current_conditions;
    const validCurrent =
      samePoint(current, farm) &&
      fresh(current.valid_at, 6, now) &&
      !current.demo;
    const moisture =
      validCurrent && numeric(current.soil_moisture, 0, 1)
        ? `${(current.soil_moisture * 100).toFixed(1)}% vol. in the top 0–1 cm. This does not tell us whether the roots need water.`
        : "No recent surface-moisture estimate for this point.";
    const et0Complete = complete && rain.every((d) => numeric(d.et0, 0, 30));
    const referenceGap = et0Complete
      ? rain.reduce((sum, d) => sum + d.rain - d.et0, 0)
      : null;
    const waterFlag =
      longest >= 3 ||
      (farm.water === "rainfed" && referenceGap !== null && referenceGap < 0);
    const water = check(
      "water",
      "Water",
      waterFlag ? "attention" : complete ? "okay" : "unknown",
      waterFlag
        ? "Check your water supply"
        : complete
          ? "No dry-spell flag"
          : "Check field moisture",
      `${moisture} ${rain.length ? `${rain.length} forecast days checked; longest dry spell ${longest} day(s).` : "Load the short-range forecast for this farm."} ${referenceGap !== null ? `Rain minus reference ET₀: ${referenceGap.toFixed(1)} mm over these days (not a watering amount). ` : ""}Water source: ${farm.water}; crop ${farm.crop}, stage ${farm.crop_stage || "unknown"}.`,
      waterFlag
        ? farm.water === "irrigated"
          ? "Confirm irrigation delivery and check moisture near the roots."
          : "Check moisture near the roots and confirm a water source before the dry days."
        : "Check moisture near the roots before changing your watering plan.",
      complete,
      refs.water,
    );
    const hot =
      days.some((d) => numeric(d.high, -60, 65) && d.high >= 35) ||
      (validCurrent &&
        numeric(current.temperature, -60, 65) &&
        current.temperature >= 35);
    const wet = rain.some((d) => d.rain >= 50);
    const weatherAvailable =
      days.length === 7 &&
      days.every((d) => numeric(d.rain, 0, 3000) && numeric(d.high, -60, 65)) &&
      days[0].date === today;
    const weather = check(
      "weather",
      "Weather",
      hot || wet ? "attention" : weatherAvailable ? "okay" : "unknown",
      hot
        ? "Plan around the heat"
        : wet
          ? "Prepare for heavy rain"
          : weatherAvailable
            ? "No weather flag"
            : "More weather data needed",
      `${hot ? "A current or forecast high reaches 35 °C. " : ""}${wet ? "A forecast day reaches 50 mm of rain. " : ""}${days.length ? `${days[0].date} to ${days.at(-1).date}; ${forecast.source}.` : "A current, complete seven-day forecast is needed."}`,
      hot
        ? "Check crop stress and do strenuous field work during cooler hours."
        : wet
          ? "Check drains and outlets before the forecast rain."
          : "Check the forecast again before weather-sensitive work.",
      weatherAvailable,
      refs.weather,
    );
    const checks = [soil, water, weather];
    const flagged = checks.find((item) => item.status === "attention");
    const ready = checks.filter((item) => item.available).length;
    const okay = checks.every((item) => item.status === "okay");
    return {
      checks,
      ready,
      status: flagged ? "attention" : okay ? "okay" : "unknown",
      title: flagged
        ? "Needs attention"
        : okay
          ? "Looks okay based on available data"
          : "Not enough data",
      action: (
        flagged ||
        checks.find((item) => item.status === "unknown") ||
        soil
      ).action,
      note: "A planning check, not a yield prediction or a diagnosis. Missing data stays unknown.",
    };
  };
})();
