/* My Farm layout. Existing form controls keep their names, validation and save handlers. */
(() => {
  const page = $("#farm");
  const form = $("#farm-form");
  const fields = form.elements;
  const image = (name, alt = "") => {
    const img = el("img");
    img.src = "/static/myfarm-assets/" + name;
    img.alt = alt;
    return img;
  };
  const button = (text, action, className = "") => {
    const control = el("button", text, className);
    control.type = "button";
    control.onclick = action;
    return control;
  };
  page
    .querySelectorAll(":scope > .eyebrow,:scope > h1,:scope > .lead")
    .forEach((node) => node.remove());
  form.classList.add("mf-panel");
  const heading = el("div", undefined, "mf-heading");
  heading.append(
    el("h1", "Hi, Farmer!"),
    el("p", "Your saved farm and soil readings, all in one place."),
  );
  const readings = el("div", undefined, "mf-readings");
  const soilGrid = el("div", undefined, "mf-soil-grid");
  for (const [name, label, unit] of [
    ["ph", "Current pH", "pH"],
    ["nitrogen", "Nitrogen", "mg/kg"],
    ["potassium", "Potassium", "mg/kg"],
    ["phosphorus", "Phosphorus", "mg/kg"],
  ]) {
    const tile = el("label", undefined, "mf-soil-tile");
    tile.append(el("span", label), fields.namedItem(name), el("small", unit));
    soilGrid.append(tile);
  }
  const locator = el("div", undefined, "mf-locator");
  const preview = button(
    "",
    () => {
      if (streetPhoto) {
        photoLoading.hidden = false;
        largePhoto.hidden = true;
        largePhotoError.hidden = true;
        // The larger file is fetched only when someone asks to see it.
        largePhoto.src = streetPhoto.full_image_url;
        photoDialog.showModal();
      } else {
        more.open = false;
        requestAnimationFrame(centerMap);
      }
    },
    "mf-map-preview",
  );
  const streetImage = el("img", undefined, "mf-street-image");
  streetImage.alt = "";
  streetImage.hidden = true;
  streetImage.referrerPolicy = "no-referrer";
  const photoPlaceholder = image("locate.svg");
  photoPlaceholder.className = "mf-photo-placeholder";
  const previewCaption = el("span", undefined, "mf-photo-caption");
  const previewTitle = el("strong", "Street photo");
  const previewStatus = el("small", "Checking nearby coverage…");
  previewCaption.append(previewTitle, previewStatus);
  preview.append(streetImage, photoPlaceholder, previewCaption);
  const photoCredit = el("p", undefined, "mf-photo-credit");
  photoCredit.hidden = true;
  const creditLink = (label, url) => {
    const link = el("a", label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  };
  photoCredit.append(
    creditLink("KartaView", "https://kartaview.org"),
    document.createTextNode(" · "),
    creditLink("CC BY-SA", "https://creativecommons.org/licenses/by-sa/4.0/"),
  );
  const photoRetry = button(
    "Try photo again",
    () => loadStreetPhoto(true),
    "mf-photo-retry",
  );
  photoRetry.hidden = true;
  const photoDialog = el("dialog", undefined, "mf-photo-dialog");
  photoDialog.setAttribute("aria-label", "Nearby street photo");
  const photoDialogHeader = el("div", undefined, "mf-photo-dialog-heading");
  photoDialogHeader.append(
    el("h2", "Nearby street photo"),
    button("Close", () => photoDialog.close(), "secondary"),
  );
  const largePhoto = el("img");
  largePhoto.alt = "Street-level view near the saved farm point";
  largePhoto.referrerPolicy = "no-referrer";
  const photoDetails = el("p");
  const photoLoading = el("p", "Loading photo…");
  const largePhotoError = el(
    "p",
    "The larger photo could not load. You can still use the map.",
  );
  largePhotoError.hidden = true;
  largePhoto.onload = () => {
    largePhoto.hidden = false;
    photoLoading.hidden = true;
  };
  largePhoto.onerror = () => {
    largePhoto.hidden = true;
    largePhotoError.hidden = false;
    photoLoading.hidden = true;
  };
  photoDialog.append(
    photoDialogHeader,
    photoLoading,
    largePhoto,
    largePhotoError,
    photoDetails,
    el(
      "p",
      "This shows a nearby road, and may not show your field. Photos can be several years old.",
      "mf-photo-note",
    ),
    creditLink(
      "Photo: KartaView contributors · CC BY-SA 4.0",
      "https://kartaview.org",
    ),
    button(
      "Show farm on map",
      () => {
        photoDialog.close();
        more.open = false;
        requestAnimationFrame(centerMap);
      },
      "secondary",
    ),
  );
  document.body.append(photoDialog);
  const locate = button(
    "",
    () => fields.latitude.value && centerMap(),
    "mf-locate",
  );
  locate.append(image("locate.svg"), el("span", "Locate"));
  const input = button(
    "",
    () => {
      coordinateEditor.hidden = !coordinateEditor.hidden;
      if (!coordinateEditor.hidden) more.open = false;
      manualLatitude.value = state.farm.latitude;
      manualLongitude.value = state.farm.longitude;
      if (!coordinateEditor.hidden)
        manualLatitude.focus({ preventScroll: true });
    },
    "mf-locate",
  );
  input.append(image("input.svg"), el("span", "Input"));
  const locateActions = el("div", undefined, "mf-locate-actions");
  locateActions.append(locate, input);
  locator.append(preview, photoCredit, photoRetry, locateActions);
  readings.append(soilGrid, locator);

  const farmCard = el("div", undefined, "mf-farm-card");
  const farmHeading = el("div", undefined, "mf-card-heading");
  const nameLabel = el("label", "Farm name", "mf-name");
  nameLabel.append(fields.name);
  farmHeading.append(
    nameLabel,
    button(
      "Edit details",
      () => setFarmEditing(!farmCard.classList.contains("mf-editing")),
      "mf-more-button",
    ),
  );
  farmCard.append(farmHeading);
  const town = el("p", undefined, "mf-town");
  farmCard.append(town);
  const municipalityLabel = fields.municipality.closest("label");
  municipalityLabel.className = "mf-town-edit";
  municipalityLabel.hidden = true;
  farmCard.append(municipalityLabel);
  const farmGrid = el("div", undefined, "mf-farm-grid");
  for (const [name, label] of [
    ["area", "Total area (hectares)"],
    ["terrain", "Field setting"],
    ["water", "Water source"],
    ["crop", "Current crop"],
  ]) {
    const wrapper = el("label", label);
    wrapper.append(fields.namedItem(name));
    farmGrid.append(wrapper);
  }
  farmCard.append(farmGrid);
  const editHint = el(
    "p",
    "Edit these fields here, then choose Save my farm below.",
    "mf-edit-hint",
  );
  editHint.hidden = true;
  farmCard.append(editHint);
  function setFarmEditing(editing) {
    farmCard.classList.toggle("mf-editing", editing);
    editHint.hidden = !editing;
    municipalityLabel.hidden = !editing;
    farmHeading.querySelector("button").textContent = editing
      ? "Close editing"
      : "Edit details";
    if (editing) {
      fields.name.focus({ preventScroll: true });
      fields.name.select();
    }
  }

  const performance = el("section", undefined, "mf-performance");
  performance.append(
    el("h2", "Farm Performance"),
    el("small", "Your farm condition check"),
  );
  const empty = el("div", undefined, "mf-performance-empty");
  const conditionRing = el("span", "—", "mf-empty-ring mf-condition-ring");
  conditionRing.setAttribute("role", "img");
  const performanceTitle = el("strong", "Not enough data");
  const performanceAction = el(
    "p",
    "Add farm readings to get a condition check.",
  );
  const coverageLabel = el("small", "Checks with usable data");
  empty.append(
    conditionRing,
    coverageLabel,
    performanceTitle,
    performanceAction,
  );
  const conditionChecks = el("div", undefined, "mf-condition-checks");
  const assessmentDraft = el(
    "p",
    "This check uses saved farm details. Save your edits to update it.",
    "mf-assessment-draft",
  );
  assessmentDraft.hidden = true;
  const conditionExplanation = el(
    "details",
    undefined,
    "mf-assessment-explanation",
  );
  conditionExplanation.append(el("summary", "Why this check?"));
  const explanationBody = el("div");
  conditionExplanation.append(explanationBody);
  performance.append(
    empty,
    assessmentDraft,
    conditionChecks,
    conditionExplanation,
    button("Open field journal", () => tab("journal"), "secondary"),
  );

  const weatherCard = el(
    "section",
    undefined,
    "mf-performance mf-weather-records",
  );
  weatherCard.append(el("h2", "Saved weather"));
  const weatherValues = el("p");
  const weatherSource = el("p", undefined, "source");
  weatherCard.append(weatherValues, weatherSource);
  const sampleButton = button(
    "Load sourced Legazpi weather",
    async () => {
      await run(sampleButton, async () => {
        if (farmDirty) throw new Error("Save your farm details first.");
        await api("/api/climate", { mode: "sample", dataset: "legazpi" });
        await refresh();
        notice(
          "NASA POWER history loaded for the Legazpi example coordinates.",
        );
      });
    },
    "secondary",
  );
  weatherCard.append(sampleButton);
  const more = el("details", undefined, "mf-more");
  more.append(el("summary", "More Details (Close this to view the map)"));
  const detailsIntro = el(
    "p",
    "Add what you know. You can leave optional readings blank.",
    "mf-details-intro",
  );
  more.append(detailsIntro);
  const detailGroup = (heading, keys) => {
    const group = el("section", undefined, "mf-detail-group");
    group.append(el("h2", heading));
    const grid = el("div", undefined, "mf-detail-grid");
    keys.forEach((key) => grid.append(fields.namedItem(key).closest("label")));
    group.append(grid);
    more.append(group);
  };
  detailGroup("Crop details", ["previous_crop", "crop_stage", "planting_date"]);
  detailGroup("Soil sample", [
    "sample_date",
    "soil_method",
    "previous_ph",
    "ash",
  ]);
  const reportGroup = el("section", undefined, "mf-detail-group");
  reportGroup.append(
    el("h2", "What does the soil report say?"),
    el(
      "p",
      "Copy the lab or test-kit categories. Leave them unknown if your report only gives numbers.",
    ),
  );
  const reportGrid = el("div", undefined, "mf-detail-grid");
  for (const [key, label] of [
    ["nitrogen_rating", "Nitrogen category"],
    ["phosphorus_rating", "Phosphorus category"],
    ["potassium_rating", "Potassium category"],
    ["ph_medium", "pH test medium"],
  ]) {
    const wrapper = el("label", label),
      select = el("select");
    select.name = key;
    const options =
      key === "ph_medium"
        ? [
            ["unknown", "Not sure"],
            ["water", "Water-based test"],
            ["cacl2", "Calcium chloride (CaCl₂)"],
          ]
        : [
            ["unknown", "Not reported"],
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ];
    for (const [value, text] of options) select.append(new Option(text, value));
    wrapper.append(select);
    reportGrid.append(wrapper);
  }
  reportGroup.append(reportGrid);
  more.append(reportGroup);
  const coordinateEditor = el("section", undefined, "mf-coordinate-editor");
  coordinateEditor.hidden = true;
  coordinateEditor.append(el("h2", "Enter coordinates"));
  const coordinateGrid = el("div", undefined, "mf-detail-grid");
  const manualLatitude = el("input");
  const manualLongitude = el("input");
  for (const [control, label, min, max] of [
    [manualLatitude, "Latitude", 4, 22],
    [manualLongitude, "Longitude", 116, 127],
  ]) {
    control.type = "number";
    control.min = min;
    control.max = max;
    control.step = "any";
    const wrapper = el("label", label);
    wrapper.append(control);
    coordinateGrid.append(wrapper);
  }
  const checkPoint = button(
    "Preview location",
    () => stagePoint(manualLatitude.value, manualLongitude.value),
    "secondary",
  );
  const useGps = button("Use my GPS", null, "secondary");
  const coordinateActions = el("div", undefined, "mf-point-actions");
  coordinateActions.append(
    checkPoint,
    useGps,
    button("Close", () => (coordinateEditor.hidden = true), "secondary"),
  );
  coordinateEditor.append(coordinateGrid, coordinateActions);
  const saveBar = form.querySelector(".save-bar");
  form.replaceChildren(
    fields.latitude,
    fields.longitude,
    heading,
    readings,
    coordinateEditor,
    farmCard,
    performance,
    weatherCard,
    more,
    saveBar,
  );
  saveBar.querySelector("span").textContent =
    "Save to update your farm profile.";
  form.addEventListener(
    "invalid",
    (event) => {
      if (more.contains(event.target)) more.open = true;
      if (farmCard.contains(event.target)) setFarmEditing(true);
    },
    true,
  );
  const draftStatus = el("p", "Saved farm details", "mf-draft-status");
  draftStatus.setAttribute("aria-live", "polite");
  saveBar.prepend(draftStatus);

  const mapArea = el("section", undefined, "mf-map-area");
  mapArea.setAttribute("aria-label", "Farm location map");
  const mapHost = el("div");
  mapHost.id = "mf-live-map";
  mapHost.setAttribute(
    "aria-label",
    "Interactive map of the saved farm coordinates",
  );
  const mapHint = el(
    "p",
    "Map tiles need an internet connection.",
    "mf-map-hint",
  );
  const mapTop = el("div", undefined, "mf-map-top");
  mapTop.append(button("Farm · center map", () => centerMap(), "mf-map-pill"));
  const fullscreen = button(
    "Expand map",
    () => {
      if (document.fullscreenElement === mapArea) document.exitFullscreen?.();
      else
        mapArea.requestFullscreen?.().catch(() => {
          mapHint.textContent = "Full screen is unavailable in this browser.";
        });
    },
    "mf-map-pill",
  );
  mapTop.append(fullscreen);
  const statusCard = el("div", undefined, "mf-status-card");
  const savedName = el("h2");
  const savedPlace = el("p");
  const savedCoords = el("p", undefined, "mf-status-coordinates");
  const dates = el("dl", undefined, "mf-status-dates");
  const planted = el("dd");
  dates.append(
    el("dt", "Planting date"),
    planted,
    el("dt", "Harvest date"),
    el("dd", "Not recorded"),
  );
  const sensors = el("div", undefined, "mf-sensors");
  sensors.append(el("h3", "Sensor log"), el("small", "Model estimates"));
  const conditionValues = el("dl", undefined, "mf-condition-values");
  const conditionTime = el("p", undefined, "mf-condition-time");
  const conditionNote = el(
    "p",
    "Soil moisture is the modeled water volume in the top 0–1 cm of soil.",
    "mf-condition-note",
  );
  const conditionSource = el("a", "Open-Meteo");
  conditionSource.href = "https://open-meteo.com/en/docs";
  conditionSource.target = "_blank";
  conditionSource.rel = "noreferrer";
  const conditionUpdate = button(
    "Update estimates",
    () => loadConditions(),
    "mf-conditions-update",
  );
  sensors.append(
    conditionValues,
    conditionTime,
    conditionNote,
    conditionSource,
    conditionUpdate,
  );

  statusCard.append(
    savedName,
    savedPlace,
    savedCoords,
    dates,
    el("h3", "Crop health"),
    el("p", "No health measurement recorded."),
    sensors,
  );
  const pick = button(
    "Choose a point on the map",
    () => {
      selecting = !selecting;
      pick.textContent = selecting
        ? "Cancel point selection"
        : "Choose a point on the map";
      mapHint.textContent = selecting
        ? "Tap the map to fill the coordinates. Check the location, then save your farm."
        : "Showing the saved farm point.";
    },
    "mf-map-pick",
  );
  const pointConfirmation = el("div", undefined, "mf-point-confirm");
  pointConfirmation.hidden = true;
  pointConfirmation.setAttribute("aria-live", "polite");
  const pointMessage = el("p");
  const savePointButton = button(
    "Save new coordinates",
    () => savePoint(),
    "mf-point-save",
  );
  const cancelPointButton = button("Cancel", () => cancelPoint(), "secondary");
  const pointActions = el("div", undefined, "mf-point-actions");
  pointActions.append(savePointButton, cancelPointButton);
  pointConfirmation.append(pointMessage, pointActions);
  const mapFooter = el("div", undefined, "mf-map-footer");
  const mapActions = el("div", undefined, "mf-map-actions");
  mapActions.id = "mf-map-actions";
  mapActions.append(pick);
  mapFooter.append(pointConfirmation, mapActions, mapHint);
  mapArea.append(mapHost, mapTop, statusCard, mapFooter);
  page.append(mapArea);
  const logo = el("div", undefined, "mf-brand");
  const compactLogo = image("farm-mark.png", "AgriForesight");
  compactLogo.className = "mf-logo-compact";
  const expandedLogo = image("farm-logo.png", "AgriForesight");
  expandedLogo.className = "mf-logo-expanded";
  logo.append(compactLogo, expandedLogo);
  document.querySelector("aside").prepend(logo);
  const support = button("", () => setAssistantOpen(true), "mf-support");
  support.setAttribute("aria-label", "Ask the farm assistant");
  support.append(
    image("support.svg"),
    el("span", "Ask for help", "ov-nav-caption"),
  );
  document.querySelector("aside").append(support);
  document.querySelectorAll("nav [data-tab]").forEach((control) => {
    const label =
      control.querySelector(".ov-nav-caption")?.textContent ||
      control.textContent.trim();
    control.title = label;
    control.setAttribute("aria-label", label);
  });

  let map,
    marker,
    currentPointKey,
    selecting = false;
  let conditionsPointKey,
    conditionsLoading = false,
    conditionsLastAttempt = 0,
    conditionsWarning = "";
  let pendingPoint = null,
    selectionVersion = 0,
    savingPoint = false;
  let streetPhoto = null,
    photoPointKey = null,
    photoRequest = 0;
  function photoFallback(message, retry = false) {
    streetPhoto = null;
    streetImage.hidden = true;
    streetImage.removeAttribute("src");
    preview.classList.remove("mf-has-photo");
    photoPlaceholder.hidden = false;
    previewTitle.textContent = "Street photo";
    previewStatus.textContent = message;
    preview.setAttribute(
      "aria-label",
      message + " Show the saved farm on the map.",
    );
    photoCredit.hidden = true;
    photoRetry.hidden = !retry;
  }
  async function loadStreetPhoto(retry = false) {
    if (!state) return;
    const point = state.farm.latitude + ":" + state.farm.longitude;
    if (!retry && photoPointKey === point) return;
    photoPointKey = point;
    const version = ++photoRequest;
    if (photoDialog.open) photoDialog.close();
    photoFallback("Checking nearby coverage…");
    photoRetry.disabled = true;
    try {
      const result = await api("/api/location-photo", {});
      if (
        version !== photoRequest ||
        point !== state.farm.latitude + ":" + state.farm.longitude
      )
        return;
      if (!result.photo) {
        photoFallback(
          result.unavailable
            ? "Photos could not load. Tap for map."
            : "No street photo within 500 m. Tap for map.",
          !!result.unavailable,
        );
        return;
      }
      const photo = result.photo;
      streetImage.onload = () => {
        if (version !== photoRequest) return;
        streetPhoto = photo;
        streetImage.hidden = false;
        preview.classList.add("mf-has-photo");
        photoPlaceholder.hidden = true;
        previewTitle.textContent = "Nearby street photo";
        previewStatus.textContent =
          photo.distance_m +
          " m away · " +
          photo.captured_on.slice(0, 4) +
          " · Tap to view";
        preview.setAttribute(
          "aria-label",
          "View nearby street photo, " +
            photo.distance_m +
            " metres from your farm, taken " +
            photo.captured_on,
        );
        photoCredit.hidden = false;
        photoDetails.textContent =
          photo.distance_m +
          " m from your saved point · Taken " +
          photo.captured_on;
      };
      streetImage.onerror = () => {
        if (version === photoRequest)
          photoFallback("Photo could not load. Tap for map.", true);
      };
      streetImage.src = photo.image_url;
    } catch (error) {
      if (version === photoRequest)
        photoFallback("Photos need a connection. Tap for map.", true);
    } finally {
      if (version === photoRequest) photoRetry.disabled = false;
    }
  }
  function resetPointPreview() {
    selecting = false;
    pick.textContent = "Choose a point on the map";
    pick.disabled = false;
    checkPoint.disabled = false;
    useGps.disabled = false;
    cancelPointButton.disabled = false;
    pointConfirmation.hidden = true;
    sensors.hidden = false;
    if (map && state) {
      marker.setLatLng([state.farm.latitude, state.farm.longitude]);
      marker.setStyle({ color: "#fff" });
      marker.setTooltipContent(el("span", "Saved farm point"));
    }
    renderMyFarm();
  }
  function cancelPoint() {
    if (savingPoint) return;
    selectionVersion++;
    pendingPoint = null;
    resetPointPreview();
    mapHint.textContent = "Showing the saved farm point.";
  }
  async function stagePoint(latitude, longitude) {
    if (savingPoint) return;
    const lat = Number(latitude),
      lng = Number(longitude);
    if (
      latitude === "" ||
      longitude === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 4 ||
      lat > 22 ||
      lng < 116 ||
      lng > 127
    ) {
      notice("Enter valid coordinates inside the Philippines.", true);
      return;
    }
    const version = ++selectionVersion;
    pendingPoint = { latitude: lat, longitude: lng, location: null };
    selecting = false;
    pick.textContent = "Choose another point";
    pointConfirmation.hidden = false;
    savePointButton.disabled = true;
    pointMessage.textContent =
      "Checking " + lat.toFixed(6) + ", " + lng.toFixed(6) + "…";
    sensors.hidden = true;
    if (map) {
      marker.setLatLng([lat, lng]);
      marker.setStyle({ color: "#e5ad3c" });
      marker.setTooltipContent(el("span", "Unsaved location preview"));
      map.panTo([lat, lng]);
    }
    try {
      const result = await api("/api/location", {
        latitude: lat,
        longitude: lng,
      });
      if (version !== selectionVersion) return;
      pendingPoint.location = result.location;
      const place = [result.location.municipality, result.location.province]
        .filter(Boolean)
        .join(", ");
      pointMessage.textContent =
        place + " · " + lat.toFixed(6) + ", " + lng.toFixed(6);
      savedPlace.textContent = place + " (preview)";
      savedCoords.textContent =
        lat.toFixed(6) + " N · " + lng.toFixed(6) + " E";
      savePointButton.disabled = false;
      mapHint.textContent = "Preview only. Save these coordinates or cancel.";
    } catch (error) {
      if (version === selectionVersion) {
        pointMessage.textContent = error.message;
        mapHint.textContent = "Choose another point or cancel.";
      }
    }
  }
  async function savePoint() {
    if (savingPoint || !pendingPoint?.location) return;
    savingPoint = true;
    for (const control of [
      savePointButton,
      cancelPointButton,
      pick,
      checkPoint,
      useGps,
    ])
      control.disabled = true;
    try {
      const result = await api("/api/profile/location", {
        latitude: pendingPoint.latitude,
        longitude: pendingPoint.longitude,
      });
      for (const key of ["latitude", "longitude", "municipality"])
        fields.namedItem(key).value = result.farm[key];
      selectionVersion++;
      pendingPoint = null;
      coordinateEditor.hidden = true;
      state.farm = result.farm;
      resetPointPreview();
      try {
        await refresh();
      } catch (error) {
        notice(
          "Coordinates saved. Refresh the weather when the connection returns.",
        );
        return;
      }
      notice("New farm coordinates saved.");
    } catch (error) {
      pointMessage.textContent = error.message;
    } finally {
      savingPoint = false;
      for (const control of [cancelPointButton, pick, checkPoint, useGps])
        control.disabled = false;
      savePointButton.disabled = !pendingPoint?.location;
    }
  }
  useGps.onclick = () => {
    if (!navigator.geolocation)
      return notice("GPS is unavailable. Enter coordinates instead.", true);
    useGps.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        useGps.disabled = false;
        stagePoint(position.coords.latitude, position.coords.longitude);
      },
      () => {
        useGps.disabled = false;
        notice(
          "Could not get your GPS position. Enter coordinates instead.",
          true,
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  function showConditions(conditions, warning = "") {
    renderFarmAssessment();
    conditionValues.replaceChildren();
    for (const [name, label, unit] of [
      ["temperature", "Temperature", "°C"],
      ["humidity", "Humidity", "%"],
      ["soil_moisture", "Soil moisture", "% vol."],
    ]) {
      const value = conditions?.[name];
      const shown = Number.isFinite(value)
        ? num(name === "soil_moisture" ? value * 100 : value) + " " + unit
        : "Unavailable";
      conditionValues.append(el("dt", label), el("dd", shown));
    }
    if (!conditions) {
      conditionTime.textContent = warning || "No estimates loaded yet.";
      conditionNote.textContent =
        "These are weather-model estimates, not readings from a sensor on your farm.";
      conditionSource.hidden = true;
      return;
    }
    conditionSource.hidden = false;
    conditionSource.textContent = conditions.source || "Open-Meteo";
    conditionSource.href =
      conditions.source_url || "https://open-meteo.com/en/docs";
    conditionNote.textContent =
      conditions.note ||
      "Soil moisture is the modeled water volume in the top 0–1 cm of soil.";
    const stamp = new Date(conditions.valid_at);
    const age = Date.now() - stamp.getTime();
    const time = Number.isFinite(stamp.getTime())
      ? stamp.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
      : "Unknown time";
    conditionTime.textContent =
      (warning ? warning + " " : "") +
      (age > 7200000 ? "Older estimates · " : "") +
      time +
      " · Philippine time";
  }
  async function loadConditions() {
    if (conditionsLoading || !state) return;
    conditionsLoading = true;
    conditionsLastAttempt = Date.now();
    conditionUpdate.disabled = true;
    conditionUpdate.textContent = "Loading estimates…";
    const point = state.farm.latitude + ":" + state.farm.longitude;
    const saved = samePoint(state.current_conditions, state.farm)
      ? state.current_conditions
      : null;
    showConditions(saved, "Checking the weather services…");
    try {
      const result = await farmConditions.load({ ...state.farm }, () =>
        api("/api/conditions", {}),
      );
      if (point !== state.farm.latitude + ":" + state.farm.longitude) return;
      state.current_conditions = result.conditions;
      conditionsWarning = result.warning || "";
      state.current_conditions_status = conditionsWarning
        ? { message: conditionsWarning }
        : null;
      showConditions(result.conditions, conditionsWarning);
      try {
        save(CACHE, state);
      } catch {
        /* The loaded estimates remain visible if browser storage is full. */
      }
    } catch (error) {
      if (point === state.farm.latitude + ":" + state.farm.longitude) {
        conditionsWarning =
          error.status === 404
            ? "This server needs the latest app update before it can load estimates. Redeploy the latest code on Render."
            : error.message;
        state.current_conditions_status = { message: conditionsWarning };
        showConditions(saved, conditionsWarning);
      }
    } finally {
      conditionsLoading = false;
      conditionUpdate.disabled = false;
      conditionUpdate.textContent = "Update estimates";
      if (
        document.body.dataset.page === "farm" &&
        point !== state.farm.latitude + ":" + state.farm.longitude
      )
        loadConditions();
    }
  }
  more.addEventListener("toggle", () => {
    page.classList.toggle("mf-details-open", more.open);
    syncAssistantLauncher();
    if (!more.open)
      requestAnimationFrame(() => {
        ensureMap();
        map?.invalidateSize();
      });
  });

  // Reserve the visible banner/notice space above the map, including on Render.
  let mapViewportFrame;
  function fitMapViewport() {
    cancelAnimationFrame(mapViewportFrame);
    mapViewportFrame = requestAnimationFrame(() => {
      if (document.body.dataset.page !== "farm" || more.open) return;
      syncAssistantLauncher();
      const top =
        window.innerWidth > 950
          ? Math.max(0, mapArea.getBoundingClientRect().top)
          : 0;
      mapArea.style.setProperty("--mf-top-space", top + "px");
    });
  }
  const bannerObserver = new ResizeObserver(fitMapViewport);
  for (const node of [$("#demo-banner"), $("#notice")])
    if (node) bannerObserver.observe(node);
  window.addEventListener("resize", fitMapViewport);
  window.addEventListener("scroll", fitMapViewport, { passive: true });

  function ensureMap() {
    if (map || more.open || document.body.dataset.page !== "farm" || !state)
      return;
    if (!window.L) {
      mapHint.textContent =
        "Map controls could not load. Your coordinates can still be entered under More details.";
      return;
    }
    map = L.map(mapHost, {
      zoomControl: false,
      maxBounds: [
        [3, 115],
        [23, 128],
      ],
      minZoom: 5,
      maxZoom: 19,
    });
    const satellite = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community",
        maxZoom: 19,
      },
    );
    const street = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    );
    satellite.addTo(map);
    L.control
      .layers({ Satellite: satellite, "Street map": street }, null, {
        position: "topleft",
      })
      .addTo(map);
    L.control.zoom({ position: "topleft" }).addTo(map);
    for (const layer of [satellite, street]) {
      layer.on(
        "tileerror",
        () =>
          (mapHint.textContent =
            "Some map tiles could not load. Try Street map or check your connection."),
      );
    }
    marker = L.circleMarker([state.farm.latitude, state.farm.longitude], {
      radius: 12,
      color: "#fff",
      weight: 4,
      fillColor: "#1f9fff",
      fillOpacity: 1,
    }).addTo(map);
    marker.bindTooltip(el("span", "Saved farm point"));
    map.on("click", (event) => {
      if (!selecting) return;
      stagePoint(event.latlng.lat, event.latlng.lng);
    });
    new ResizeObserver(() => map.invalidateSize()).observe(mapHost);
    centerMap();
  }
  function centerMap() {
    ensureMap();
    if (map && state)
      map.setView([state.farm.latitude, state.farm.longitude], 17);
  }
  function renderFarmAssessment() {
    if (!state) return;
    assessmentDraft.hidden = !farmDirty;
    const result = assessFarm(state);
    const colors = {
      okay: "#527b49",
      attention: "#b77627",
      unknown: "#d7e4cf",
    };
    const segments = result.checks.map(
      (item, index) =>
        `${colors[item.status]} ${index * 120}deg ${index * 120 + 115}deg, #f4f4f4 ${index * 120 + 115}deg ${(index + 1) * 120}deg`,
    );
    conditionRing.style.background = `conic-gradient(${segments.join(",")})`;
    conditionRing.textContent = result.ready + "/3";
    conditionRing.setAttribute(
      "aria-label",
      result.ready +
        " of 3 checks have usable data. " +
        result.title +
        ". This is not a health score.",
    );
    coverageLabel.textContent = result.ready + " of 3 checks have usable data";
    performanceTitle.textContent = result.title;
    performanceAction.textContent = result.action;
    performance.dataset.status = result.status;
    conditionChecks.replaceChildren();
    explanationBody.replaceChildren(
      el("p", result.note),
      el("p", "The ring counts available checks, not how healthy the farm is."),
    );
    for (const item of result.checks) {
      const row = el("div", undefined, "mf-condition-check");
      row.dataset.status = item.status;
      row.append(el("strong", item.label), el("span", item.title));
      conditionChecks.append(row);
      const section = el("section");
      section.append(
        el("strong", item.label),
        el("p", item.detail),
        creditLink(item.source.title, item.source.url),
      );
      if (item.guide)
        section.append(creditLink(item.guide.title, item.guide.url));
      explanationBody.append(section);
    }
    explanationBody.append(
      el(
        "p",
        "Prototype review settings: soil samples up to 180 days old; forecasts up to 48 hours old; current estimates up to 6 hours old. Flags use ≥35 °C, ≥50 mm/day, or 3 consecutive forecast days below 1 mm, or rain below reference ET₀ on rainfed farms. These are screening rules, not official warnings or fertilizer rates.",
      ),
    );
  }
  function renderMyFarm() {
    if (!state) return;
    syncAssistantLauncher();
    fitMapViewport();
    const farm = state.farm;
    savedName.textContent = farm.name;
    if (!pendingPoint) savedPlace.textContent = farm.municipality;
    if (!pendingPoint)
      savedCoords.textContent =
        Number(farm.latitude).toFixed(5) +
        " N · " +
        Number(farm.longitude).toFixed(5) +
        " E";
    planted.textContent = farm.planting_date || "Not recorded";
    town.textContent = farm.municipality;
    const days = visibleHistory();
    const temperatures = days.filter((day) => Number.isFinite(day.temp));
    const rain = days.filter((day) => Number.isFinite(day.rain));
    const mean = (rows, key) =>
      rows.length
        ? num(rows.reduce((sum, row) => sum + row[key], 0) / rows.length)
        : "—";
    weatherValues.textContent =
      mean(temperatures, "temp") +
      " °C average temperature · " +
      mean(rain, "rain") +
      " mm/day average rainfall";
    weatherSource.textContent =
      (state.climate.demo ? "Sample values" : state.climate.source) +
      (days.length
        ? " · " + days[0].date + " to " + days.at(-1).date
        : " · No readings for the selected dates");
    sampleButton.hidden =
      Number(farm.latitude) !== 13.1391 || Number(farm.longitude) !== 123.7438;

    draftStatus.textContent = farmDirty
      ? "Changes waiting to be saved"
      : "Saved farm details";
    if (!farmDirty && farmCard.classList.contains("mf-editing"))
      setFarmEditing(false);
    const pointKey = farm.latitude + ":" + farm.longitude;
    if (conditionsPointKey !== pointKey) {
      conditionsPointKey = pointKey;
      conditionsLastAttempt = 0;
      conditionsWarning = "";
    }
    if (photoPointKey !== pointKey) {
      // Clear the old place immediately, including while another page is open.
      photoRequest++;
      photoFallback("Street photo available when covered.");
      if (photoDialog.open) photoDialog.close();
      if (document.body.dataset.page === "farm") loadStreetPhoto();
    }
    const conditions = state.current_conditions;
    const matches =
      conditions &&
      conditions.latitude === farm.latitude &&
      conditions.longitude === farm.longitude;
    showConditions(
      matches ? conditions : null,
      conditionsLoading
        ? "Checking the weather services…"
        : state.current_conditions_status?.message || conditionsWarning,
    );
    if (
      document.body.dataset.page === "farm" &&
      !conditionsLoading &&
      Date.now() - conditionsLastAttempt > 60000
    ) {
      if (
        !matches ||
        !Number.isFinite(conditions.soil_moisture) ||
        Date.now() - Date.parse(conditions.retrieved_at) > 1800000
      )
        loadConditions();
    }

    ensureMap();
    if (map && !pendingPoint && currentPointKey !== pointKey) {
      currentPointKey = pointKey;
      marker.setLatLng([farm.latitude, farm.longitude]);
      centerMap();
    }
  }
  form.addEventListener("input", (event) => {
    if (event.target.name) {
      draftStatus.textContent = "Changes waiting to be saved";
      renderFarmAssessment();
    }
  });
  registerPageView("farm", renderMyFarm);
})();
