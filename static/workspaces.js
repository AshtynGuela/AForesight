/* Reuse the existing forms and handlers inside the Figma Crop Plans / Journal panels. */
(() => {
  $("#demo")?.remove();
  $("#history-file")?.closest(".panel").setAttribute("hidden", "");
  $("#weather-record-form")?.closest(".panel").setAttribute("hidden", "");
  $("#model-dataset")
    .querySelectorAll("option")
    .forEach((o) => {
      if (o.value !== "current") o.remove();
    });
  const durationHelp = $("#crop-plan-form").querySelector("p");
  durationHelp.textContent =
    "Use the duration on your seed label or ask your local technician.";
  const cropPage = $("#planting");
  cropPage.classList.add("workspace-panel");
  const drainage = $("#suggest-drainage");
  const cropCard = drainage.closest(".panel");
  cropCard.classList.add("cp-choice");
  cropCard.querySelector("p").textContent =
    "Uses your saved farm and current crop.";
  cropCard.querySelector("label").classList.add("cp-drainage");
  $("#crop-plan-form").elements.duration.value = "";
  $("#crop-plan-form").elements.duration.placeholder = "From your seed label";
  cropPage.querySelector("h1").textContent = "Crop Plans";
  const cropTools = cropPage.querySelector("details");
  cropTools.classList.add("cp-calendar");
  $("#crop-plan-form").addEventListener("input", () => {
    save(
      "agriforesight-crop-draft-v1",
      Object.fromEntries(new FormData($("#crop-plan-form"))),
    );
  });
  const draft = read("agriforesight-crop-draft-v1", {});
  for (const [key, value] of Object.entries(draft))
    if ($("#crop-plan-form").elements[key])
      $("#crop-plan-form").elements[key].value = value;
  const savedPlan = read("agriforesight-crop-plan-v1", null);
  cropTools.hidden = !savedPlan && !Object.keys(draft).length;
  if (savedPlan)
    $("#crop-plan-result").replaceChildren(
      el("h2", savedPlan.previous_crop + " → " + savedPlan.crop),
      el("p", savedPlan.note),
      makeTable(
        ["When", "What to do"],
        savedPlan.calendar.map((d) => [d.date, d.task]),
      ),
    );

  const journal = $("#journal");
  journal.classList.add("workspace-panel");
  const form = $("#journal-form");
  const grid = form.querySelector(".form-grid");
  const photo = el("input");
  photo.type = "file";
  photo.accept = "image/jpeg,image/png,image/webp";
  photo.id = "journal-photo";
  const upload = el("label", undefined, "wj-upload");
  upload.htmlFor = photo.id;
  upload.append(el("strong", "+"), el("span", "Upload Photo"), photo);
  form.querySelector('[name="technique"]').placeholder = "What did you try?";
  form.elements.note.required = false;
  const fieldLabel = el("label", "Field / Plot");
  const field = el("input");
  field.name = "field";
  field.maxLength = 120;
  field.placeholder = "Your field name";
  fieldLabel.append(field);
  grid.append(fieldLabel);
  form.append(upload);
  const noteLabel = form.elements.note.closest("label");
  const details = el("details", undefined, "wj-note-details");
  details.append(el("summary", "More detail (optional)"), noteLabel);
  form.append(details);
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.textContent = "Save Note";
  const quick = el("section", undefined, "wj-quick");
  const img = (name) => {
    const i = el("img");
    i.src = "/static/journal-assets/" + name;
    i.alt = "";
    return i;
  };
  const quickTitle = el("h2");
  quickTitle.append(img("quick.svg"), el("span", "QUICK ACTIONS"));
  quick.append(quickTitle);
  saveButton.prepend(img("save.svg"));
  saveButton.setAttribute("form", form.id);
  const clear = el("button", undefined, "secondary");
  clear.type = "button";
  clear.append(img("refresh.svg"), el("span", "Clear Form"));
  clear.onclick = () => {
    form.reset();
    form.elements.date.value = isoDay();
    form.elements.crop.value = state?.farm.crop || "rice";
    upload.querySelector("span").textContent = "Upload Photo";
    localStorage.removeItem("agriforesight-journal-draft-v1");
  };
  const exportButton = $("#export");
  exportButton.textContent = "Export as JSON";
  exportButton.prepend(img("export.svg"));
  quick.append(saveButton, clear, exportButton);
  form.elements.note.setAttribute("form", form.id);
  journal.querySelector("h1").textContent = "Field Journal";
  journal.querySelector(".eyebrow").hidden = true;
  journal.querySelector(".lead").hidden = true;
  const saved = el("section", undefined, "wj-saved");
  const savedHeading = el("div", undefined, "wj-saved-heading");
  const savedCaption = el("div", undefined, "wj-saved-caption");
  savedCaption.append(el("h2", "Saved Notes"), $("#queue-status"));
  savedHeading.append(img("bookmark.svg"), savedCaption);
  saved.append(savedHeading, $("#journal-list"));
  const sync = $("#sync");
  sync.textContent = "Sync when online";
  saved.append(sync);
  journal.querySelector(".section-heading").remove();
  journal.append(form, saved, quick, details);
  const journalDraft = read("agriforesight-journal-draft-v1", {});
  for (const [key, value] of Object.entries(journalDraft))
    if (form.elements[key] && key !== "photo") form.elements[key].value = value;
  form.addEventListener("input", () => {
    save(
      "agriforesight-journal-draft-v1",
      Object.fromEntries(new FormData(form)),
    );
  });
  photo.onchange = () => {
    upload.querySelector("span").textContent =
      photo.files[0]?.name || "Upload Photo";
  };
  registerPageView("journal", () => {
    renderJournal();
    if (!form.elements.field.value && state)
      field.placeholder = state.farm.name;
  });
})();
