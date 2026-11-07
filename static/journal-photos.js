/* View the original photo and choose the part shown in Saved Notes. */
const journalPhotos = (() => {
  let draft = { x: 50, y: 50, zoom: 1 };
  let activeDialog;

  function frame(image, position) {
    image.style.objectPosition = `${position.x}% ${position.y}%`;
    image.style.transformOrigin = `${position.x}% ${position.y}%`;
    image.style.transform = `scale(${position.zoom})`;
  }

  function cropPreview(image, position) {
    const preview = el("div", undefined, "wj-photo-frame");
    preview.tabIndex = 0;
    preview.setAttribute("role", "group");
    preview.setAttribute(
      "aria-label",
      "Photo crop. Use arrow keys to move and plus or minus to zoom.",
    );
    image.draggable = false;
    preview.append(image);
    frame(image, position);

    // Match the thumbnail's object-fit: cover geometry at any screen size.
    function move(from, to, zoom = position.zoom) {
      if (!image.naturalWidth) return;
      const rect = preview.getBoundingClientRect();
      const cover = Math.max(
        rect.width / image.naturalWidth,
        rect.height / image.naturalHeight,
      );
      const scale = zoom / position.zoom;
      for (const [axis, size, origin, naturalSize] of [
        ["x", rect.width, rect.left, image.naturalWidth],
        ["y", rect.height, rect.top, image.naturalHeight],
      ]) {
        const covered = naturalSize * cover;
        const overflow = covered * zoom - size;
        if (overflow < 0.001) continue;
        const offset =
          ((covered * position.zoom - size) * position[axis]) / 100;
        const anchored =
          (offset + from[axis] - origin) * scale - (to[axis] - origin);
        position[axis] = Math.max(
          0,
          Math.min(100, (anchored / overflow) * 100),
        );
      }
      position.zoom = zoom;
      frame(image, position);
    }

    const clampZoom = (zoom) => Math.max(1, Math.min(3, zoom));
    const pointers = new Map();
    const gesture = () => {
      const [a, b = a] = pointers.values();
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };
    preview.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      preview.setPointerCapture(e.pointerId);
      preview.focus({ preventScroll: true });
    });
    preview.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const before = gesture();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = gesture();
      const zoom =
        before.distance > 0
          ? clampZoom((position.zoom * after.distance) / before.distance)
          : position.zoom;
      move(before, after, zoom);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      preview.addEventListener(event, (e) => pointers.delete(e.pointerId));

    preview.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const point = { x: e.clientX, y: e.clientY };
        const unit =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? preview.clientHeight : 1;
        move(
          point,
          point,
          clampZoom(position.zoom * Math.exp((-e.deltaY * unit) / 400)),
        );
      },
      { passive: false },
    );
    preview.addEventListener("keydown", (e) => {
      const directions = {
        ArrowLeft: [-12, 0],
        ArrowRight: [12, 0],
        ArrowUp: [0, -12],
        ArrowDown: [0, 12],
      };
      const direction = directions[e.key];
      const zoomStep =
        e.key === "+" || e.key === "=" ? 0.15 : e.key === "-" ? -0.15 : 0;
      if (!direction && !zoomStep) return;
      e.preventDefault();
      const rect = preview.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const [dx, dy] = direction || [0, 0];
      move(
        center,
        { x: center.x + dx, y: center.y + dy },
        clampZoom(position.zoom + zoomStep),
      );
    });
    return preview;
  }

  function show(file, id, savedThumbnail) {
    if (!file) return;
    if (
      file.size > 2 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      notice("Choose a JPG, PNG or WebP photo up to 2 MB.", true);
      return;
    }
    activeDialog?.close();
    const url = URL.createObjectURL(file);
    const dialog = el("dialog", undefined, "wj-photo-dialog");
    dialog.setAttribute("aria-labelledby", "wj-photo-title");
    const heading = el("h2", "Your field photo");
    heading.id = "wj-photo-title";
    const header = el("div", undefined, "wj-photo-heading");
    const cancel = el("button", "Close", "secondary");
    cancel.type = "button";
    header.append(heading, cancel);
    const content = el("div");
    dialog.append(header, content);

    function viewPhoto() {
      dialog.classList.remove("wj-crop-dialog");
      heading.textContent = "Your field photo";
      cancel.textContent = "Close";
      cancel.onclick = () => dialog.close();
      const original = el("img", undefined, "wj-photo-original");
      original.src = url;
      original.alt = "Full field photo";
      const edit = el("button", "Edit preview", "secondary");
      edit.type = "button";
      edit.onclick = editPreview;
      content.replaceChildren(original, edit);
    }

    function editPreview() {
      dialog.classList.add("wj-crop-dialog");
      heading.textContent = "Adjust preview";
      cancel.textContent = "Cancel";
      cancel.onclick = id ? viewPhoto : () => dialog.close();
      const position = { ...(id ? farmJournal.preview(id) : draft) };
      const image = el("img");
      image.src = url;
      image.alt = "Saved Notes thumbnail preview";
      const preview = cropPreview(image, position);
      const hint = el(
        "p",
        "Drag to move. Pinch or scroll to zoom.",
        "wj-crop-hint",
      );
      hint.setAttribute("role", "status");
      const done = el("button", "Done", "wj-crop-done");
      done.type = "button";
      done.onclick = () => {
        try {
          if (id) {
            farmJournal.preview(id, position);
            if (savedThumbnail?.isConnected) frame(savedThumbnail, position);
            else renderJournal();
          } else draft = position;
          dialog.close();
        } catch {
          hint.textContent =
            "Couldn’t save the preview. Check your device storage and try again.";
        }
      };
      content.replaceChildren(preview, hint, done);
      if (dialog.open) preview.focus({ preventScroll: true });
    }

    if (id) viewPhoto();
    else editPreview();
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

  async function open(id, savedThumbnail) {
    try {
      const file = await farmJournal.photo(id);
      if (!file) {
        notice(
          "This photo is only available on the device where it was saved.",
          true,
        );
        return;
      }
      show(file, id, savedThumbnail);
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
