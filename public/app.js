const state = {
  conversations: [],
  files: [],
  activeConversationId: null,
  busy: false
};

const elements = {
  conversationList: document.querySelector("#conversation-list"),
  messages: document.querySelector("#messages"),
  welcome: document.querySelector("#welcome"),
  input: document.querySelector("#message-input"),
  send: document.querySelector("#send-message"),
  setupNotice: document.querySelector("#setup-notice"),
  modelStatus: document.querySelector("#model-status"),
  modelDot: document.querySelector("#model-dot"),
  filePicker: document.querySelector("#file-picker"),
  fileList: document.querySelector("#file-list"),
  fileCount: document.querySelector("#file-count"),
  fileSearch: document.querySelector("#file-search"),
  searchResults: document.querySelector("#search-results"),
  settings: document.querySelector("#settings-dialog"),
  instructions: document.querySelector("#instructions"),
  settingsStatus: document.querySelector("#settings-status"),
  toast: document.querySelector("#toast"),
  pageTitle: document.querySelector("#page-title")
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.remove("visible"), 3000);
}

function renderConversations() {
  elements.conversationList.replaceChildren();
  for (const conversation of state.conversations) {
    const button = document.createElement("button");
    button.className = `conversation-item${conversation.id === state.activeConversationId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = '<span class="conversation-icon">◷</span>';
    const title = document.createElement("span");
    title.textContent = conversation.title;
    button.append(title);
    button.addEventListener("click", () => openConversation(conversation.id));
    elements.conversationList.append(button);
  }
}

function renderMessages(messages) {
  elements.messages.replaceChildren();
  elements.welcome.hidden = messages.length > 0;
  for (const message of messages) addMessage(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function addMessage(message, extra = {}) {
  const article = document.createElement("article");
  article.className = `message ${message.role}${extra.error ? " error" : ""}`;
  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.textContent = message.role === "assistant" ? "✳" : "●";
  const body = document.createElement("div");
  body.className = "message-body";
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = message.role === "assistant" ? "Assistant" : "You";
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = message.content;
  body.append(label, content);
  if (extra.sources && extra.sources.length) {
    const sources = document.createElement("div");
    sources.className = "message-sources";
    sources.textContent = `From your library: ${extra.sources.map((source) => source.name).join(", ")}`;
    body.append(sources);
  }
  article.append(avatar, body);
  elements.messages.append(article);
  elements.welcome.hidden = true;
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return article;
}

function renderFiles() {
  elements.fileCount.textContent = String(state.files.length);
  elements.fileList.replaceChildren();
  if (!state.files.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "Your library is empty. Add a note or document to get started.";
    elements.fileList.append(empty);
    return;
  }
  for (const file of state.files) {
    const row = document.createElement("div");
    row.className = "file-item";
    const type = document.createElement("span");
    type.className = "file-type";
    type.textContent = file.name.split(".").pop().slice(0, 4).toUpperCase();
    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("strong");
    name.textContent = file.name;
    name.title = file.name;
    const size = document.createElement("span");
    size.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`;
    info.append(name, size);
    const remove = document.createElement("button");
    remove.className = "remove-file";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.addEventListener("click", () => removeFile(file.id));
    row.append(type, info, remove);
    elements.fileList.append(row);
  }
}

async function loadState() {
  const data = await api("/api/state");
  state.conversations = data.conversations;
  state.files = data.files;
  elements.instructions.value = data.instructions;
  renderConversations();
  renderFiles();
  elements.setupNotice.hidden = data.modelConfigured;
  elements.modelDot.classList.add("ready");
  elements.modelStatus.textContent = data.modelConfigured ? `Connected · ${data.model}` : "Local workspace · model optional";
}

async function refreshConversationList() {
  const data = await api("/api/state");
  state.conversations = data.conversations;
  renderConversations();
}

async function newConversation() {
  const conversation = await api("/api/conversations", { method: "POST", body: "{}" });
  state.activeConversationId = conversation.id;
  renderMessages([]);
  elements.pageTitle.textContent = "A little space to think.";
  await refreshConversationList();
  elements.input.focus();
}

async function openConversation(id) {
  const conversation = await api(`/api/conversations/${id}`);
  state.activeConversationId = id;
  renderMessages(conversation.messages);
  const sidebarItem = state.conversations.find((item) => item.id === id);
  elements.pageTitle.textContent = sidebarItem ? sidebarItem.title : "Your conversation";
  renderConversations();
}

async function sendMessage(text = elements.input.value.trim()) {
  if (state.busy || !text.trim()) return;
  try {
    if (!state.activeConversationId) await newConversation();
    const content = text.trim();
    elements.input.value = "";
    elements.input.style.height = "auto";
    addMessage({ role: "user", content });
    state.busy = true;
    elements.send.disabled = true;
    const typing = addMessage({ role: "assistant", content: "Thinking…" });
    typing.querySelector(".message-content").classList.add("typing");
    try {
      const result = await api(`/api/conversations/${state.activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
      typing.remove();
      addMessage(result.message, { sources: result.sources });
      await refreshConversationList();
    } catch (error) {
      typing.remove();
      addMessage({ role: "assistant", content: error.message }, { error: true });
      await refreshConversationList();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.busy = false;
    elements.send.disabled = false;
    elements.input.focus();
  }
}

async function uploadFiles(files) {
  for (const file of files) {
    if (file.size > 1_000_000) {
      showToast(`${file.name} is larger than 1 MB.`);
      continue;
    }
    try {
      const content = await file.text();
      await api("/api/files", {
        method: "POST",
        body: JSON.stringify({ name: file.name, content })
      });
      showToast(`${file.name} added to your library.`);
    } catch (error) {
      showToast(error.message);
    }
  }
  elements.filePicker.value = "";
  await loadState();
}

async function removeFile(id) {
  try {
    await api(`/api/files/${id}`, { method: "DELETE" });
    await loadState();
  } catch (error) {
    showToast(error.message);
  }
}

async function searchLibrary(query) {
  if (!query.trim()) {
    elements.searchResults.replaceChildren();
    return;
  }
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(query)}`);
    elements.searchResults.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No matching passages yet.";
      elements.searchResults.append(empty);
      return;
    }
    for (const result of results) {
      const item = document.createElement("article");
      item.className = "search-result";
      const name = document.createElement("strong");
      name.textContent = result.name;
      const snippet = document.createElement("p");
      snippet.textContent = result.snippet;
      item.append(name, snippet);
      elements.searchResults.append(item);
    }
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#new-chat").addEventListener("click", () => newConversation().catch((error) => showToast(error.message)));
document.querySelector("#open-settings").addEventListener("click", () => elements.settings.showModal());
document.querySelector("#mobile-settings").addEventListener("click", () => elements.settings.showModal());
elements.send.addEventListener("click", () => sendMessage());
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
elements.input.addEventListener("input", () => {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 140)}px`;
});
document.querySelectorAll(".suggestions button").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});
elements.filePicker.addEventListener("change", (event) => uploadFiles([...event.target.files]));
elements.fileSearch.addEventListener("input", () => {
  clearTimeout(searchLibrary.timeout);
  searchLibrary.timeout = setTimeout(() => searchLibrary(elements.fileSearch.value), 180);
});
document.querySelector("#save-settings").addEventListener("click", async () => {
  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ instructions: elements.instructions.value })
    });
    elements.settingsStatus.textContent = "Instructions saved.";
    showToast("Your assistant instructions are saved.");
  } catch (error) {
    elements.settingsStatus.textContent = error.message;
  }
});

loadState().catch((error) => showToast(error.message));
