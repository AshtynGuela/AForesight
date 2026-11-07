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
  const previewButton = el(
    "button",
    "Choose photo preview",
    "wj-preview-button secondary",
  );
  previewButton.type = "button";
  previewButton.hidden = true;
  previewButton.onclick = () => journalPhotos.choose(photo.files[0]);
  form.append(previewButton);
  const noteLabel = form.elements.note.closest("label");
  const details = el("details", undefined, "wj-note-details");
  details.append(el("summary", "More detail (optional)"), noteLabel);
  upload.before(details);
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
  saveButton.classList.add("wj-save-note");
  form.append(saveButton);
  const clear = el("button", undefined, "secondary");
  clear.type = "button";
  clear.append(img("refresh.svg"), el("span", "Clear Form"));
  clear.onclick = () => {
    form.reset();
    details.open = false;
    form.elements.date.value = isoDay();
    form.elements.crop.value = state?.farm.crop || "rice";
    upload.querySelector("span").textContent = "Upload Photo";
    previewButton.hidden = true;
    journalPhotos.reset();
    localStorage.removeItem("agriforesight-journal-draft-v1");
  };
  const exportButton = $("#export");
  exportButton.textContent = "Export as JSON";
  exportButton.prepend(img("export.svg"));
  quick.append(clear, exportButton);
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
  journal.append(form, saved, quick);
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
    journalPhotos.reset();
    previewButton.hidden = !photo.files.length;
    upload.querySelector("span").textContent =
      photo.files[0]?.name || "Upload Photo";
  };
  form.addEventListener("journal-saved", () => {
    upload.querySelector("span").textContent = "Upload Photo";
    previewButton.hidden = true;
    journalPhotos.reset();
  });
  registerPageView("journal", () => {
    renderJournal();
    if (!form.elements.field.value && state)
      field.placeholder = state.farm.name;
  });
})();

function openJournalNote(note) {
  const source = $("#journal-form").elements;
  const dialog = el("dialog", undefined, "wj-photo-dialog wj-note-dialog");
  const title = el("h2", "Field note");
  title.id = "wj-note-title";
  title.tabIndex = -1;
  title.autofocus = true;
  dialog.setAttribute("aria-labelledby", title.id);
  const body = el("div", undefined, "wj-note-content");
  const actions = el("div", undefined, "wj-note-actions");
  const message = el("p", undefined, "wj-note-message");
  message.setAttribute("role", "status");
  const photo = note.photo_id
    ? el("img", undefined, "wj-photo-original")
    : null;
  let photoUrl;
  if (photo) {
    photo.alt = "Photo attached to this field note";
    photo.hidden = true;
    photo.onload = () => {
      photo.hidden = false;
    };
  }

  function button(label, action, style = "secondary") {
    const control = el("button", label, style);
    control.type = "button";
    control.onclick = action;
    return control;
  }

  function saveChange(operation, changes = {}) {
    const mutation_id = crypto.randomUUID();
    try {
      queueJournalChange({ ...changes, id: note.id, operation, mutation_id });
    } catch {
      message.textContent =
        "Couldn’t save this change on your device. Free some space and try again.";
      return;
    }
    dialog.close();
    renderJournal();
    const noteButtons = [
      ...document.querySelectorAll("#journal-list .wj-note-open"),
    ];
    const focusTarget =
      noteButtons.find((control) => control.dataset.noteId === note.id) ||
      noteButtons[0] ||
      $("#journal .wj-save-note");
    focusTarget?.focus();
    notice(
      operation === "delete"
        ? "Note deleted."
        : "Changes saved on this device.",
    );
    if (navigator.onLine) sync();
  }

  function view() {
    title.textContent = "Field note";
    message.textContent = "";
    const facts = el("dl", undefined, "wj-note-facts");
    const crop =
      [...source.crop.options].find((option) => option.value === note.crop)
        ?.textContent || note.crop;
    const outcome =
      [...source.outcome.options].find(
        (option) => option.value === note.outcome,
      )?.textContent || note.outcome;
    for (const [label, value] of [
      ["Date", note.date],
      ["Crop", crop],
      ["Field / Plot", note.field || note.farm_context?.name || "Not recorded"],
      ["Result", outcome],
      [
        "Harvest",
        note.yield_kg == null || note.yield_kg === ""
          ? "Not recorded"
          : `${note.yield_kg} kg`,
      ],
    ])
      facts.append(el("dt", label), el("dd", value));
    body.replaceChildren(
      facts,
      el("h3", "What did you try?"),
      el("p", journalAction(note), "wj-note-text"),
      el("h3", "Field notes"),
      el("p", note.note || "No extra details saved.", "wj-note-text"),
    );
    if (photo) body.prepend(photo);
    actions.replaceChildren(
      button("Close", () => dialog.close()),
      button("Edit note", edit, ""),
      button("Delete note", confirmDelete, "wj-note-delete"),
    );
    if (dialog.open) {
      dialog.scrollTop = 0;
      title.focus({ preventScroll: true });
    }
  }

  function edit() {
    title.textContent = "Edit note";
    const form = el("form", undefined, "wj-note-edit");
    const saveButton = el("button", "Save changes");
    saveButton.type = "submit";
    for (const name of [
      "date",
      "crop",
      "field",
      "technique",
      "outcome",
      "yield_kg",
      "note",
    ]) {
      const label = source[name].closest("label").cloneNode(true);
      const control = label.querySelector("input, select, textarea");
      control.removeAttribute("id");
      control.value =
        name === "technique" ? journalAction(note) : (note[name] ?? "");
      if (name === "date") control.max = isoDay();
      form.append(label);
    }
    form.append(saveButton);
    form.onsubmit = (event) => {
      event.preventDefault();
      const changes = Object.fromEntries(new FormData(form));
      if (!changes.technique.trim()) {
        message.textContent = "Enter what you tried before saving.";
        form.elements.technique.focus();
        return;
      }
      const { farm_context, recorded_at, photo_id } = note;
      const context =
        farm_context &&
        Object.fromEntries(
          [
            "name",
            "municipality",
            "latitude",
            "longitude",
            "crop_stage",
            "planting_date",
          ].map((key) => [key, farm_context[key]]),
        );
      saveChange("edit", {
        ...changes,
        farm_context: context,
        recorded_at,
        photo_id,
      });
    };
    body.replaceChildren(form);
    actions.replaceChildren(button("Cancel", view));
    form.elements.technique.focus();
  }

  function confirmDelete() {
    title.textContent = "Delete this note?";
    body.replaceChildren(
      el(
        "p",
        "This removes the note from Saved Notes and syncs the deletion when you’re online.",
      ),
    );
    actions.replaceChildren(
      button("Keep note", view),
      button("Delete note", () => saveChange("delete"), "wj-note-delete"),
    );
    actions.firstElementChild.focus();
  }

  view();
  dialog.append(title, body, message, actions);
  dialog.addEventListener(
    "close",
    () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  if (photo) {
    farmJournal
      .photo(note.photo_id)
      .then((file) => {
        if (!file || !dialog.open) return;
        photoUrl = URL.createObjectURL(file);
        photo.src = photoUrl;
      })
      .catch(() => {
        /* Keep the note readable if the local photo is unavailable. */
      });
  }
}
