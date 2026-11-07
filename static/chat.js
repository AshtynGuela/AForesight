/* Chat uses the same backend services as the forms. Confirmed writes refresh the page state. */
let chatSession = read("agriforesight-chat-session", null);
if (!chatSession) {
  chatSession = crypto.randomUUID();
  save("agriforesight-chat-session", chatSession);
}
let chatBusy = false;
const chatModelLabel = el("label", "Assistant model", "chat-model-picker");
const chatModelSelect = el("select");
chatModelSelect.setAttribute("aria-label", "Assistant model");
chatModelSelect.append(new Option("Loading models…", ""));
chatModelSelect.disabled = true;
chatModelLabel.append(chatModelSelect);
$("#assistant .assistant-top").after(chatModelLabel);
chatModelSelect.onchange = () => {
  save("agriforesight-chat-model", chatModelSelect.value);
  $("#chat-mode").textContent =
    chatModelSelect.selectedOptions[0].text +
    " selected. Your conversation continues here.";
};
async function loadChatModels() {
  try {
    const result = await api("/api/chat/models");
    chatModelSelect.replaceChildren();
    result.models.forEach((model) => {
      const option = new Option(
        model.name + (model.available ? "" : " · unavailable"),
        model.id,
      );
      option.disabled = !model.available;
      chatModelSelect.append(option);
    });
    const available = result.models.filter((model) => model.available);
    const preferred = read("agriforesight-chat-model", result.default);
    chatModelSelect.value = available.some((model) => model.id === preferred)
      ? preferred
      : available[0]?.id || "";
    chatModelSelect.disabled = !available.length;
    if (!available.length) {
      chatModelSelect.append(new Option("Guided assistant", ""));
      chatModelSelect.value = "";
    }
  } catch {
    chatModelSelect.replaceChildren(new Option("Guided assistant", ""));
  } finally {
    setChatBusy(chatBusy);
  }
}
loadChatModels();
const chatEditableFields = new Set([
  "nitrogen_rating",
  "phosphorus_rating",
  "potassium_rating",
  "ph_medium",
  "name",
  "area",
  "terrain",
  "water",
  "crop",
  "previous_crop",
  "crop_stage",
  "planting_date",
  "ph",
  "previous_ph",
  "nitrogen",
  "phosphorus",
  "potassium",
  "sample_date",
  "soil_method",
  "ash",
]);
const chatPages = new Set([
  "farm",
  "forecasts",
  "planting",
  "climate",
  "journal",
  "overview",
  "learn",
]);

function setChatBusy(busy) {
  chatBusy = busy;
  const hasModel = Array.from(chatModelSelect.options).some(
    (option) => option.value && !option.disabled,
  );
  chatModelSelect.disabled = busy || !hasModel;
  $("#chat-send").disabled = busy;
  $("#chat-new").disabled = busy;
  document
    .querySelectorAll("[data-chat]")
    .forEach((button) => (button.disabled = busy));
}

function scrollChatToBottom() {
  const scroller = document.querySelector(".assistant-scroll");
  scroller.scrollTop = scroller.scrollHeight;
}

function chatBubble(text, who) {
  const bubble = el("article", text, "chat-bubble " + who);
  $("#chat-log").append(bubble);
  scrollChatToBottom();
  return bubble;
}

async function updateWeatherForChat(waiting) {
  try {
    await api("/api/forecast", {});
  } catch {
    try {
      await refresh();
    } catch {
      /* Keep the last displayed state offline. */
    }
    const saved = state?.forecast;
    const days = saved?.days || [];
    const savedDate = saved?.retrieved_at?.slice(0, 10);
    renderChatReply(waiting, {
      text: days.length
        ? "The weather update failed. Here is the previously saved forecast" +
          (savedDate ? " from " + savedDate : "") +
          ". Check the dates below before using it for upcoming work."
        : "The weather update failed, and there is no saved short-range forecast available here. You can still open Forecasts to check other saved weather data.",
      days,
      choices: ["Update weather"],
      open_page: "forecasts",
      mode: "Guided assistant",
    });
    return false;
  }
  await refresh();
  return true;
}

async function applyChatReply(reply) {
  if (chatPages.has(reply.navigate)) {
    tab(reply.navigate);
    setAssistantOpen(false);
  }
  if (!reply.changed) return;
  // Update only confirmed fields, preserving any other unfinished form edits.
  for (const [name, value] of Object.entries(reply.updated_fields || {})) {
    if (!chatEditableFields.has(name)) continue;
    const field = $("#farm-form").elements.namedItem(name);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = value;
    else field.value = value ?? "";
  }
  await refresh();
}

async function sendChat(message, confirmationId = null) {
  if (chatBusy) return;
  setChatBusy(true);
  chatBubble(message, "user");
  const waiting = chatBubble("One moment…", "assistant");
  try {
    if (message === "Update weather") {
      if (!(await updateWeatherForChat(waiting))) return;
      message = "Check weather";
    }
    const reply = await api("/api/chat", {
      message,
      session: chatSession,
      confirmation_id: confirmationId,
      model: chatModelSelect.value || undefined,
    });
    renderChatReply(waiting, reply);
    await applyChatReply(reply);
    scrollChatToBottom();
  } catch (error) {
    waiting.textContent =
      "Couldn’t finish that: " +
      error.message +
      " Your message is still below so you can try again.";
    $("#chat-message").value = message;
  } finally {
    setChatBusy(false);
  }
}
$("#chat-form").onsubmit = (e) => {
  e.preventDefault();
  const message = $("#chat-message").value.trim();
  if (!message || chatBusy) return;
  $("#chat-message").value = "";
  sendChat(message);
};
document
  .querySelectorAll("[data-chat]")
  .forEach((b) => (b.onclick = () => sendChat(b.dataset.chat)));

function setAssistantOpen(open) {
  if (open && document.fullscreenElement?.classList.contains("mf-map-area")) {
    document
      .exitFullscreen()
      .then(() => setAssistantOpen(true))
      .catch(() => {
        notice("Close the full-screen map to open the assistant.", true);
      });
    return;
  }
  $("#assistant").hidden = !open;
  $("#chat-toggle").setAttribute("aria-expanded", String(open));
  if (open) {
    $("#chat-message").focus({ preventScroll: true });
  } else {
    $("#chat-toggle").focus({ preventScroll: true });
  }
}
$("#chat-toggle").onclick = () => setAssistantOpen($("#assistant").hidden);
$("#chat-close").onclick = () => setAssistantOpen(false);
$("#assistant").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    setAssistantOpen(false);
  }
});

function renderChatReply(waiting, r) {
  waiting.textContent = r.text;
  $("#chat-mode").textContent =
    r.mode === "AI-assisted"
      ? "Chat uses recent messages and basic farm details with " +
        r.provider +
        "."
      : "Guided mode · try the buttons or a short phrase.";
  if (r.days)
    waiting.append(
      makeTable(
        ["Day", "Rain (mm)", "Average °C"],
        r.days.map((d) => [d.date, num(d.rain), num(d.temp)]),
      ),
    );
  if (r.sources) {
    const details = el("details");
    details.append(el("summary", "Where this comes from"));
    for (const source of r.sources) {
      const p = el("p"),
        link = el("a", source.title);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      p.append(link);
      details.append(p);
    }
    waiting.append(details);
  }
  const choices = el("div", undefined, "chat-choices");
  for (const choice of r.choices || []) {
    const b = el("button", choice, "secondary");
    b.type = "button";
    b.onclick = () => sendChat(choice, r.confirmation_id);
    choices.append(b);
  }
  if (r.open_page) {
    const b = el("button", "Open full details", "secondary");
    b.onclick = () => tab(r.open_page);
    choices.append(b);
  }
  waiting.append(choices);
  if (r.target_field) {
    const b = el("button", "Show the farm field", "secondary");
    b.onclick = () => {
      tab("farm");
      const field = $("#farm-form").elements.namedItem(r.target_field);
      if (!field) return;
      setAssistantOpen(false);
      const details = field.closest("details");
      if (details) details.open = true;
      requestAnimationFrame(() => {
        field.classList.add("assistant-target");
        field.scrollIntoView({ block: "center", behavior: "smooth" });
        field.focus({ preventScroll: true });
        setTimeout(() => field.classList.remove("assistant-target"), 4000);
      });
    };
    choices.append(b);
  }
}

async function restoreChat() {
  setChatBusy(true);
  try {
    const response = await api(
      "/api/chat/history?session=" + encodeURIComponent(chatSession),
    );
    if (response.messages.length) {
      $("#chat-log").replaceChildren();
      response.messages.forEach((entry, index) => {
        const bubble = chatBubble(entry.text, entry.role);
        if (entry.role === "assistant") {
          renderChatReply(bubble, entry);
          if (index !== response.messages.length - 1)
            bubble
              .querySelectorAll("button")
              .forEach((b) => (b.disabled = true));
        }
      });
    }
  } catch (e) {
    $("#chat-mode").textContent =
      "Couldn’t load earlier messages. You can still send a message.";
  } finally {
    setChatBusy(false);
  }
}
$("#chat-new").onclick = async () => {
  if (chatBusy) return;
  setChatBusy(true);
  try {
    await api("/api/chat/reset", { session: chatSession });
    $("#chat-log").replaceChildren();
    $("#chat-message").value = "";
    chatBubble("What’s happening on your farm today?", "assistant");
    $("#chat-message").focus();
  } catch (e) {
    chatBubble("Couldn’t start a new chat. Please try again.", "assistant");
  } finally {
    setChatBusy(false);
  }
};
restoreChat();
