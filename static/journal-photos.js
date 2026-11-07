/* View the original photo and choose the part shown in Saved Notes. */
const journalPhotos = (() => {
  let draft = { x: 50, y: 50, zoom: 1 };
  let activeDialog;

  function frame(image, position) {
    image.style.objectPosition = `${position.x}% ${position.y}%`;
    image.style.transformOrigin = `${position.x}% ${position.y}%`;
    image.style.transform = `scale(${position.zoom})`;
  }

  function show(file, id) {
    if (!file) return;
    if (
      file.size > 2 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      notice("Choose a JPG, PNG or WebP photo up to 2 MB.", true);
      return;
    }
    activeDialog?.close();
    const position = { ...(id ? farmJournal.preview(id) : draft) };
    const url = URL.createObjectURL(file);
    const dialog = el("dialog", undefined, "wj-photo-dialog");
    dialog.setAttribute("aria-labelledby", "wj-photo-title");
    const heading = el("h2", "Your field photo");
    heading.id = "wj-photo-title";
    const close = el("button", "Close", "secondary");
    close.type = "button";
    close.onclick = () => dialog.close();
    const header = el("div", undefined, "wj-photo-heading");
    header.append(heading, close);
    const original = el("img", undefined, "wj-photo-original");
    original.src = url;
    original.alt = "Full field photo";
    const editor = el("section", undefined, "wj-photo-editor");
    const caption = el("h3", "Choose your thumbnail");
    const hint = el(
      "p",
      "Move or zoom the preview. Your full photo stays the same.",
    );
    const preview = el("div", undefined, "wj-photo-frame");
    const thumbnail = el("img");
    thumbnail.src = url;
    thumbnail.alt = "Preview of the photo shown in Saved Notes";
    frame(thumbnail, position);
    preview.append(thumbnail);
    const controls = el("div", undefined, "wj-photo-controls");
    for (const [key, text, min, max, step] of [
      ["x", "Left / right", 0, 100, 1],
      ["y", "Up / down", 0, 100, 1],
      ["zoom", "Zoom", 1, 3, 0.05],
    ]) {
      const label = el("label", text);
      const slider = el("input");
      slider.type = "range";
      slider.min = min;
      slider.max = max;
      slider.step = step;
      slider.value = position[key];
      slider.oninput = () => {
        position[key] = Number(slider.value);
        frame(thumbnail, position);
      };
      label.append(slider);
      controls.append(label);
    }
    const apply = el("button", "Use this preview");
    apply.type = "button";
    apply.onclick = () => {
      try {
        if (id) {
          farmJournal.preview(id, position);
          renderJournal();
        } else draft = { ...position };
        dialog.close();
      } catch {
        hint.textContent =
          "The preview couldn’t be saved. Free some device storage and try again.";
      }
    };
    editor.append(caption, hint, preview, controls, apply);
    dialog.append(header, original, editor);
    dialog.addEventListener(
      "close",
      () => {
        URL.revokeObjectURL(url);
        dialog.remove();
        if (activeDialog === dialog) activeDialog = null;
      },
      { once: true },
    );
    document.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();
  }

  async function open(id) {
    try {
      const file = await farmJournal.photo(id);
      if (!file) {
        notice(
          "This photo is only available on the device where it was saved.",
          true,
        );
        return;
      }
      show(file, id);
    } catch {
      notice(
        "This device couldn’t open the saved photo. Please try again.",
        true,
      );
    }
  }

  return {
    open,
    choose: (file) => show(file),
    draftPreview: () => ({ ...draft }),
    reset: () => {
      draft = { x: 50, y: 50, zoom: 1 };
    },
    frame,
  };
})();
