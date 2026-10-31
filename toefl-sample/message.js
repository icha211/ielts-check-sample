import { subscribeMessaging, sendMessage, editMessage, deleteMessage, markConversationRead, updateMessagePreferences, requestConnection, acceptConnection, removeConnection } from "./js/messaging.js?v=20261031-social-profile";

(() => {
  let profiles = [];
  let byId = {};
  let threads = [];
  let contacts = {};
  let currentUid = null;
  let sending = false;
  let connectionBusy = false;
  let loading = true;
  let accountVersion = 0;
  let connectionError = null;
  const drafts = new Set();
  const composerDrafts = new Map();
  const readWrites = new Map();
  let renderedThread = null;
  let renderedMessages = "";
  let editing = null;
  let menuTarget = null;
  let deleteTarget = null;
  let deletingMessage = false;
  let requestedRecipient = new URLSearchParams(location.search).get("to");
  const formatTime = (timestamp) => timestamp
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp))
    : "Sending...";

  const messageDayKey = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  const formatMessageDay = (timestamp, now = Date.now()) => {
    const date = new Date(timestamp);
    const today = new Date(now);
    const calendarDay = (value) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    const daysAgo = (calendarDay(today) - calendarDay(date)) / 86400000;
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo > 1 && daysAgo < 7) {
      return new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
    }
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
  };
  const formatMessageClock = (timestamp) => new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit"
  }).format(new Date(timestamp));

  const layout = document.querySelector(".message-layout");
  const conversationPanel = document.getElementById("conversationPanel");
  const pinnedSection = document.getElementById("pinnedSection");
  const pinnedList = document.getElementById("pinnedList");
  const conversationList = document.getElementById("conversationList");
  const conversationSearch = document.getElementById("conversationSearch");
  const conversationHeading = document.getElementById("conversationHeading");
  const conversationEmpty = document.getElementById("conversationEmpty");
  const threadPerson = document.getElementById("threadPerson");
  const threadMessages = document.getElementById("threadMessages");
  const threadPanel = document.getElementById("threadPanel");
  const threadEmpty = document.getElementById("threadEmpty");
  const emptyTitle = document.getElementById("emptyTitle");
  const emptyDescription = document.getElementById("emptyDescription");
  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  const messageError = document.getElementById("messageError");
  const messageMenu = document.getElementById("messageMenu");
  const deleteMessageDialog = document.getElementById("deleteMessageDialog");
  const deleteMessageError = document.getElementById("deleteMessageError");
  const confirmMessageDelete = document.getElementById("confirmMessageDelete");
  const liveStatus = document.getElementById("liveStatus");
  const favoriteButton = document.getElementById("favoriteButton");
  const archiveButton = document.getElementById("archiveButton");
  const deleteButton = document.getElementById("deleteButton");
  const connectionPanel = document.getElementById("connectionPanel");
  const connectionCopy = document.getElementById("connectionCopy");
  const connectionPrimary = document.getElementById("connectionPrimary");
  const connectionSecondary = document.getElementById("connectionSecondary");
  const composeDialog = document.getElementById("composeDialog");
  const recipientSearch = document.getElementById("recipientSearch");
  const recipientList = document.getElementById("recipientList");
  const recipientEmpty = document.getElementById("recipientEmpty");
  const folders = ["inbox", "favorites", "archived", "sent", "deleted"];
  let currentFolder = "inbox";
  let selectedId = null;

  const personFor = (thread) => byId[thread.id] || { id: thread.id, name: "Learner", detail: "Profile not listed", avatar: "" };
  const latestMessage = (thread) => thread.messages.at(-1);
  const contactStatus = (id) => contacts[id]?.status || "none";
  const latestPreview = (thread) => {
    const message = latestMessage(thread);
    if (!message) {
      const status = contactStatus(thread.id);
      if (status === "incoming") return "Wants to message you";
      if (status === "outgoing") return "Message request sent";
      if (status === "connected") return "Request accepted. Say hello";
      return "Send a message request";
    }
    return `${message.from === "me" ? "You: " : ""}${message.deletedAt ? "Message deleted" : message.text}`;
  };
  const isVisibleInFolder = (thread, folder) => {
    if (folder === "deleted") return thread.deleted;
    if (thread.deleted) return false;
    if (folder === "archived") return thread.archived;
    if (thread.archived) return false;
    if (folder === "favorites") return thread.favorite;
    if (folder === "sent") return thread.messages.some((message) => message.from === "me");
    return true;
  };
  const folderCount = (folder) => threads.filter((thread) => isVisibleInFolder(thread, folder)).length;
  const folderLabel = (folder) => ({
    inbox: "Inbox",
    favorites: "Favorites",
    archived: "Archived",
    sent: "Sent",
    deleted: "Recently deleted"
  })[folder];
  const setStatus = (text) => { liveStatus.textContent = text; };
  const showError = (error) => {
    console.error("[Messages]", error);
    connectionError = error.message || "Messages could not sync. Check your connection and try again.";
    const status = document.getElementById("messagingStatus");
    status.textContent = connectionError;
    status.hidden = false;
    status.dataset.state = "error";
  };
  const makeAvatar = (person, className = "avatar") => {
    const fallback = () => {
      const initials = document.createElement("span");
      initials.className = `${className} avatar-initials`;
      initials.textContent = person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
      initials.setAttribute("aria-label", person.name);
      return initials;
    };
    if (!person.avatar) return fallback();
    const image = document.createElement("img");
    image.className = className;
    image.src = person.avatar;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => image.replaceWith(fallback()), { once: true });
    return image;
  };

  const photoViewer = document.getElementById("photoViewer");
  let photoViewerTrigger = null;
  photoViewer?.querySelector(".photo-viewer__close").addEventListener("click", () => photoViewer.close());
  photoViewer?.addEventListener("click", (event) => {
    if (!event.target.closest(".photo-viewer__media, .photo-viewer__close")) photoViewer.close();
  });
  photoViewer?.addEventListener("close", () => {
    const target = photoViewerTrigger?.isConnected ? photoViewerTrigger : threadPerson.querySelector(".thread-person-photo");
    target?.focus();
    photoViewerTrigger = null;
  });

  const openPhotoViewer = (person, trigger) => {
    if (!photoViewer || typeof photoViewer.showModal !== "function") return;
    const media = photoViewer.querySelector(".photo-viewer__media");
    media.replaceChildren();
    media.classList.remove("is-fallback");
    media.dataset.initials = person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    if (person.avatar) {
      const image = document.createElement("img");
      image.src = person.avatar;
      image.alt = `${person.name}'s profile photo`;
      image.addEventListener("error", () => {
        image.remove();
        media.classList.add("is-fallback");
      }, { once: true });
      media.append(image);
    } else {
      media.classList.add("is-fallback");
    }
    photoViewer.querySelector("#photoViewerName").textContent = person.name;
    photoViewer.querySelector("#photoViewerDetails").textContent = person.detail || "";
    photoViewerTrigger = trigger || null;
    photoViewer.showModal();
  };

  const renderCounts = () => {
    folders.forEach((folder) => {
      const count = document.querySelector(`[data-count="${folder}"]`);
      if (count) count.textContent = String(folderCount(folder));
    });
  };

  const makeConversationRow = (thread, pinned = false) => {
    const person = personFor(thread);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "conversation-row";
    row.setAttribute("role", "listitem");
    row.setAttribute("aria-current", String(thread.id === selectedId));
    row.setAttribute("aria-label", `${person.name}: ${latestPreview(thread)}`);
    row.append(makeAvatar(person));

    const copy = document.createElement("span");
    copy.className = "conversation-copy";
    const top = document.createElement("span");
    top.className = "conversation-topline";
    const name = document.createElement("span");
    name.className = "conversation-name";
    name.textContent = person.name;
    const time = document.createElement("span");
    time.className = "conversation-time";
    time.textContent = thread.time;
    top.append(name, time);
    const preview = document.createElement("span");
    preview.className = "conversation-preview";
    preview.textContent = latestPreview(thread);
    copy.append(top, preview);
    row.append(copy);

    if (contactStatus(thread.id) === "incoming" && !pinned) {
      const request = document.createElement("span");
      request.className = "unread-badge request-badge";
      request.textContent = "Request";
      row.append(request);
    } else if (thread.unread > 0 && !pinned) {
      const unread = document.createElement("span");
      unread.className = "unread-badge";
      unread.textContent = String(thread.unread);
      row.append(unread);
    }
    row.addEventListener("click", () => selectThread(thread.id));
    return row;
  };

  const renderConversations = () => {
    const query = conversationSearch.value.trim().toLocaleLowerCase();
    const visible = threads.filter((thread) => {
      if (!isVisibleInFolder(thread, currentFolder)) return false;
      const person = personFor(thread);
      return `${person.name} ${latestPreview(thread)}`.toLocaleLowerCase().includes(query);
    });
    const pinned = visible.filter((thread) => thread.pinned && currentFolder === "inbox");
    pinnedList.replaceChildren(...pinned.map((thread) => makeConversationRow(thread, true)));
    pinnedSection.hidden = currentFolder !== "inbox" || pinned.length === 0;
    conversationList.replaceChildren(...visible.map((thread) => makeConversationRow(thread)));
    conversationEmpty.hidden = visible.length > 0;
    conversationEmpty.textContent = query ? "No conversations match your search." : `No conversations in ${folderLabel(currentFolder).toLowerCase()} yet.`;
    conversationHeading.textContent = currentFolder === "inbox" ? "All messages" : folderLabel(currentFolder);
    renderCounts();
  };

  const renderThread = () => {
    const thread = threads.find((item) => item.id === selectedId);
    const hasThread = Boolean(thread);
    threadPanel.hidden = !hasThread;
    threadEmpty.hidden = hasThread;
    if (!thread) {
      renderedThread = null;
      renderedMessages = "";
      closeMessageMenu();
      threadPerson.replaceChildren();
      threadMessages.replaceChildren();
      connectionPanel.hidden = true;
      threadActionsHidden(true);
      emptyTitle.textContent = loading ? "Loading messages..." : !currentUid ? "Sign in to message learners"
        : currentFolder === "deleted" ? "Recently deleted is empty" : `No ${folderLabel(currentFolder).toLowerCase()} conversations`;
      emptyDescription.textContent = !currentUid ? "Use Sign In in the navigation to access your private conversations." : currentFolder === "deleted"
        ? "Conversations you delete will appear here."
        : "Choose another folder or start a new conversation.";
      return;
    }
    threadActionsHidden(false);
    favoriteButton.hidden = thread.deleted;
    archiveButton.hidden = thread.deleted;
    const person = personFor(thread);
    const avatar = makeAvatar(person, "");
    avatar.alt = "";
    const photoButton = document.createElement("button");
    photoButton.type = "button";
    photoButton.className = "thread-person-photo";
    photoButton.setAttribute("aria-haspopup", "dialog");
    photoButton.setAttribute("aria-label", `View ${person.name}'s profile photo`);
    photoButton.append(avatar);
    photoButton.addEventListener("click", () => openPhotoViewer(person, photoButton));
    threadPerson.replaceChildren(photoButton);
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = person.name;
    const presence = document.createElement("small");
    presence.textContent = thread.deleted ? "Recently deleted" : thread.archived ? "Archived conversation" : person.detail;
    details.append(name, presence);
    threadPerson.append(details);
    favoriteButton.classList.toggle("is-active", thread.favorite);
    favoriteButton.setAttribute("aria-label", thread.favorite ? "Remove from favorites" : "Add to favorites");
    favoriteButton.title = thread.favorite ? "Remove from favorites" : "Add to favorites";
    favoriteButton.querySelector("i").className = thread.favorite ? "ti ti-star-filled" : "ti ti-star";
    archiveButton.setAttribute("aria-label", thread.archived ? "Restore to inbox" : "Archive conversation");
    archiveButton.title = thread.archived ? "Restore to inbox" : "Archive conversation";
    archiveButton.querySelector("i").className = thread.archived ? "ti ti-inbox" : "ti ti-archive";
    deleteButton.setAttribute("aria-label", thread.deleted ? "Restore conversation" : "Move conversation to recently deleted");
    deleteButton.title = thread.deleted ? "Restore conversation" : "Move to recently deleted";
    deleteButton.querySelector("i").className = thread.deleted ? "ti ti-restore" : "ti ti-trash";
    renderMessages(thread);
    const status = contactStatus(thread.id);
    const connected = status === "connected";
    renderConnectionPanel(thread, person, status);
    messageForm.hidden = !connected || thread.deleted;
    messageInput.disabled = thread.deleted || sending || !currentUid || !connected;
    document.getElementById("sendButton").disabled = thread.deleted || sending || !currentUid || !connected;
    messageInput.placeholder = thread.deleted ? "Restore this conversation to reply" : "Write a message...";
    if (thread.messages.length === 0) {
      threadMessages.innerHTML = "";
      const placeholder = document.createElement("p");
      placeholder.className = "message-placeholder";
      const heading = document.createElement("strong");
      heading.textContent = connected ? `Say hello to ${person.name}` : `Connect with ${person.name}`;
      placeholder.append(heading, document.createTextNode(connected
        ? "You are connected. Send a message to get things going."
        : "Learners accept a message request before either of you can send messages."));
      threadMessages.append(placeholder);
    }
  };

  const renderConnectionPanel = (thread, person, status) => {
    const setButton = (button, label, action, hidden = false) => {
      button.textContent = label;
      button.dataset.action = action;
      button.hidden = hidden;
      button.disabled = connectionBusy || !currentUid;
    };
    if (status === "connected" || thread.deleted) {
      connectionPanel.hidden = true;
      return;
    }
    connectionPanel.hidden = false;
    connectionPanel.dataset.state = status;
    if (status === "incoming") {
      connectionCopy.textContent = `${person.name} wants to message you. Accept to start chatting.`;
      setButton(connectionPrimary, "Accept", "accept");
      setButton(connectionSecondary, "Decline", "remove");
    } else if (status === "outgoing") {
      connectionCopy.textContent = `Request sent. You can message ${person.name} after they accept.`;
      setButton(connectionPrimary, "", "", true);
      setButton(connectionSecondary, "Cancel request", "remove");
    } else if (!byId[thread.id]) {
      connectionCopy.textContent = "This learner is not currently listed, so a request cannot be sent.";
      setButton(connectionPrimary, "", "", true);
      setButton(connectionSecondary, "", "", true);
    } else {
      connectionCopy.textContent = `Send ${person.name} a message request. You can chat once they accept.`;
      setButton(connectionPrimary, "Send request", "request");
      setButton(connectionSecondary, "", "", true);
    }
  };

  const threadActionsHidden = (hidden) => {
    document.getElementById("threadActions").hidden = hidden;
  };

  const renderMessages = (thread) => {
    if (!thread.messages.length) {
      renderedThread = null;
      renderedMessages = "";
      closeMessageMenu();
      return;
    }
    const signature = JSON.stringify([thread.messages, thread.readAt, thread.deleted]);
    if (renderedThread === thread.id && renderedMessages === signature) return;
    const sameThread = renderedThread === thread.id;
    const atBottom = threadMessages.scrollHeight - threadMessages.scrollTop - threadMessages.clientHeight < 48;
    const oldScroll = threadMessages.scrollTop;
    const focusedEditor = document.activeElement?.classList.contains("message-edit-input");
    const selection = focusedEditor ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    renderedThread = thread.id;
    renderedMessages = signature;
    closeMessageMenu();
    threadMessages.replaceChildren();
    let previousDay = null;
    thread.messages.forEach((message) => {
      if (message.sentAt > 0) {
        const day = messageDayKey(message.sentAt);
        if (day !== previousDay) {
          const divider = document.createElement("time");
          divider.className = "day-divider";
          divider.dateTime = new Date(message.sentAt).toISOString();
          divider.dataset.timestamp = String(message.sentAt);
          divider.textContent = formatMessageDay(message.sentAt);
          divider.title = new Date(message.sentAt).toLocaleDateString(undefined, { dateStyle: "full" });
          threadMessages.append(divider);
          previousDay = day;
        }
      }
      const row = document.createElement("div");
      row.className = `message-row ${message.from === "me" ? "outgoing" : "incoming"}`;
      row.dataset.messageId = message.id;
      const bubble = document.createElement("p");
      bubble.className = "message-bubble";
      const text = document.createElement("span");
      text.className = "message-text";
      text.textContent = message.deletedAt ? "Message deleted" : message.text;
      if (message.deletedAt) bubble.classList.add("message-deleted");
      const meta = document.createElement("time");
      meta.className = "message-meta";
      meta.textContent = message.sentAt > 0 ? formatMessageClock(message.sentAt) : "Sending...";
      if (message.sentAt > 0) {
        meta.dateTime = new Date(message.sentAt).toISOString();
        meta.title = new Date(message.sentAt).toLocaleString();
      }
      if (message.editedAt && !message.deletedAt) meta.prepend("Edited · ");
      if (message.from === "me" && message.sentAt > 0) {
        const receipt = document.createElement("span");
        const read = thread.readAt >= message.sentAt;
        receipt.className = `message-receipt${read ? " is-read" : ""}`;
        receipt.setAttribute("role", "img");
        receipt.setAttribute("aria-label", read ? "Read" : "Sent, not yet read");
        receipt.title = read ? "Read" : "Sent, not yet read";
        receipt.innerHTML = '<svg viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 9 4 4L16 3m-6 10 3 3L23 6"/></svg>';
        meta.append(receipt);
      }
      bubble.append(text, meta);
      row.append(bubble);
      if (message.from === "me" && message.sentAt > 0 && !message.deletedAt && !thread.deleted) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "message-more";
        more.setAttribute("aria-label", "Message actions");
        more.setAttribute("aria-haspopup", "menu");
        more.setAttribute("aria-expanded", "false");
        more.innerHTML = '<i class="ti ti-dots" aria-hidden="true"></i>';
        more.addEventListener("click", () => {
          const rect = more.getBoundingClientRect();
          openMessageMenu(thread.id, message.id, more, rect.right, rect.bottom);
        });
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          openMessageMenu(thread.id, message.id, more, event.clientX, event.clientY);
        });
        row.append(more);
      }
      if (editing && editing.peerId === thread.id && editing.messageId === message.id) {
        if (message.deletedAt || thread.deleted) editing = null;
        else renderEditor(row, message);
      }
      threadMessages.append(row);
    });
    threadMessages.scrollTop = !sameThread || atBottom ? threadMessages.scrollHeight : oldScroll;
    if (selection) {
      const input = threadMessages.querySelector(".message-edit-input");
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(...selection);
    }
  };

  function closeMessageMenu(restoreFocus = false) {
    if (menuTarget) {
      menuTarget.trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) menuTarget.trigger.focus({ preventScroll: true });
    }
    messageMenu.hidden = true;
    menuTarget = null;
  }

  function openMessageMenu(peerId, messageId, trigger, x, y) {
    if (editing?.saving) {
      setStatus("Wait for your edit to finish saving.");
      return;
    }
    closeMessageMenu();
    menuTarget = { peerId, messageId, trigger };
    trigger.setAttribute("aria-expanded", "true");
    messageMenu.hidden = false;
    messageMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - messageMenu.offsetWidth - 8))}px`;
    messageMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - messageMenu.offsetHeight - 8))}px`;
    messageMenu.querySelector("button").focus({ preventScroll: true });
  }

  function renderEditor(row, message) {
    const form = document.createElement("form");
    form.className = "message-editor";
    const input = document.createElement("textarea");
    input.className = "message-edit-input";
    input.setAttribute("aria-label", "Edit message");
    input.maxLength = 2000;
    input.value = editing.text;
    input.disabled = editing.saving;
    input.addEventListener("input", () => { editing.text = input.value; });
    const actions = document.createElement("div");
    actions.className = "connection-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "connection-button secondary";
    cancel.textContent = "Cancel";
    cancel.disabled = editing.saving;
    cancel.addEventListener("click", cancelEdit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !editing.saving) { event.preventDefault(); cancelEdit(); }
    });
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "connection-button primary";
    save.textContent = editing.saving ? "Saving..." : "Save";
    save.disabled = editing.saving;
    const error = document.createElement("p");
    error.className = "form-error";
    error.setAttribute("role", "alert");
    error.textContent = editing.error || "";
    error.hidden = !editing.error;
    actions.append(cancel, save);
    form.append(input, actions, error);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const edit = editing;
      if (!edit || edit.saving) return;
      if (!input.value.trim()) {
        error.hidden = false;
        error.textContent = "Write a message before saving.";
        input.focus();
        return;
      }
      const version = accountVersion;
      edit.text = input.value;
      edit.saving = true;
      input.disabled = save.disabled = cancel.disabled = true;
      save.textContent = "Saving...";
      try {
        await editMessage(edit.peerId, message.id, edit.text);
        if (version !== accountVersion || editing !== edit) return;
        editing = null;
        renderedMessages = "";
        renderThread();
        setStatus("Message edited.");
        messageInput.focus({ preventScroll: true });
      } catch (failure) {
        if (version !== accountVersion || editing !== edit) return;
        console.error("[Messages] Edit failed:", failure);
        edit.error = "Changes were not confirmed. Your text is preserved; check your connection before retrying.";
        edit.saving = false;
        renderedMessages = "";
        renderThread();
      }
    });
    row.replaceChildren(form);
  }

  function cancelEdit() {
    editing = null;
    renderedMessages = "";
    renderThread();
    messageInput.focus({ preventScroll: true });
  }

  messageMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-message-action]")?.dataset.messageAction;
    if (!action || !menuTarget) return;
    const { peerId, messageId } = menuTarget;
    const message = threads.find((thread) => thread.id === peerId)?.messages.find((item) => item.id === messageId);
    closeMessageMenu();
    if (!message || message.deletedAt || message.from !== "me") return;
    if (action === "edit") {
      editing = { peerId, messageId, text: message.text, saving: false };
      renderedMessages = "";
      renderThread();
      threadMessages.querySelector(".message-edit-input")?.focus({ preventScroll: true });
    } else {
      deleteTarget = { peerId, messageId };
      deleteMessageError.hidden = true;
      deleteMessageDialog.showModal();
      document.getElementById("cancelMessageDelete").focus();
    }
  });
  messageMenu.addEventListener("keydown", (event) => {
    const buttons = [...messageMenu.querySelectorAll("button")];
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
    if (event.key === "Escape" || event.key === "Tab") closeMessageMenu(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!messageMenu.contains(event.target) && !event.target.closest(".message-more")) closeMessageMenu();
  });
  threadMessages.addEventListener("scroll", () => {
    closeMessageMenu();
    const active = threads.find((thread) => thread.id === selectedId);
    if (active) markRead(active);
  });
  window.addEventListener("resize", () => closeMessageMenu());
  document.getElementById("cancelMessageDelete").addEventListener("click", () => deleteMessageDialog.close());
  deleteMessageDialog.addEventListener("cancel", (event) => {
    if (deletingMessage) event.preventDefault();
  });
  confirmMessageDelete.addEventListener("click", async () => {
    if (!deleteTarget || deletingMessage) return;
    const target = deleteTarget;
    const version = accountVersion;
    deletingMessage = true;
    confirmMessageDelete.disabled = true;
    document.getElementById("cancelMessageDelete").disabled = true;
    deleteMessageError.hidden = true;
    try {
      await deleteMessage(target.peerId, target.messageId);
      if (version !== accountVersion) return;
      deleteMessageDialog.close();
      setStatus("Message deleted for everyone.");
    } catch (error) {
      if (version !== accountVersion) return;
      console.error("[Messages] Delete failed:", error);
      deleteMessageError.textContent = "Deletion was not confirmed. Check your connection before retrying.";
      deleteMessageError.hidden = false;
    } finally {
      if (version === accountVersion) {
        deletingMessage = false;
        confirmMessageDelete.disabled = false;
        document.getElementById("cancelMessageDelete").disabled = false;
      }
    }
  });

  const selectThread = (id) => {
    if (selectedId !== id) editing = null;
    if (selectedId && selectedId !== id) composerDrafts.set(selectedId, messageInput.value);
    if (selectedId !== id) messageInput.value = composerDrafts.get(id) || "";
    selectedId = id;
    const thread = threads.find((item) => item.id === id);
    layout.classList.add("show-thread");
    renderConversations();
    renderThread();
    if (thread) requestAnimationFrame(() => { if (selectedId === id) markRead(thread); });
    messageInput.focus({ preventScroll: true });
  };

  const chooseFolder = (folder, preferredId = null) => {
    editing = null;
    if (selectedId) composerDrafts.set(selectedId, messageInput.value);
    currentFolder = folder;
    selectedId = null;
    messageInput.value = "";
    layout.classList.remove("show-thread");
    document.querySelectorAll(".folder-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.folder === folder));
    });
    renderConversations();
    const preferred = threads.find((thread) => thread.id === preferredId && isVisibleInFolder(thread, folder));
    const first = preferred || threads.find((thread) => isVisibleInFolder(thread, folder));
    if (first) {
      selectThread(first.id);
      layout.classList.remove("show-thread");
    } else {
      renderThread();
    }
  };

  const openCompose = () => {
    if (!currentUid || loading) return;
    recipientSearch.value = "";
    renderRecipients();
    composeDialog.showModal();
    requestAnimationFrame(() => recipientSearch.focus());
  };

  const renderRecipients = () => {
    const query = recipientSearch.value.trim().toLocaleLowerCase();
    const people = profiles.filter((person) => `${person.name} ${person.detail}`.toLocaleLowerCase().includes(query));
    recipientList.replaceChildren(...people.map((person) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "recipient-option";
      option.setAttribute("role", "option");
      option.append(makeAvatar(person, ""));
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = person.name;
      const detail = document.createElement("small");
      const relation = { incoming: " / Wants to message you", outgoing: " / Request sent", connected: " / Connected" }[contactStatus(person.id)] || "";
      detail.textContent = `${person.detail}${relation}`;
      copy.append(name, detail);
      option.append(copy);
      option.addEventListener("click", () => startConversation(person.id));
      return option;
    }));
    recipientEmpty.hidden = people.length > 0;
    recipientEmpty.textContent = query ? "No learners match that search." : "No other learners are listed yet. They appear after signing in.";
  };

  const startConversation = (id) => {
    if (!currentUid || !byId[id]) return;
    drafts.add(id);
    let thread = threads.find((item) => item.id === id);
    if (!thread) {
      thread = { id, pinned: false, favorite: false, archived: false, deleted: false, unread: 0, time: "Now", messages: [] };
      threads.unshift(thread);
    }
    if (thread.archived || thread.deleted) {
      updateMessagePreferences(id, { archived: false, deleted: false }).catch(showError);
    }
    currentFolder = "inbox";
    document.querySelectorAll(".folder-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.folder === "inbox"));
    });
    composeDialog.close();
    conversationSearch.value = "";
    selectThread(id);
    setStatus(`Conversation with ${personFor(thread).name} opened.`);
  };

  const connectionActions = {
    request: [requestConnection, "Message request sent."],
    accept: [acceptConnection, "Request accepted. You can message each other now."],
    remove: [removeConnection, "Request removed."]
  };
  const runConnectionAction = async (event) => {
    const [action, message] = connectionActions[event.currentTarget.dataset.action] || [];
    const peerId = selectedId;
    if (!action || !peerId || connectionBusy || !currentUid) return;
    const version = accountVersion;
    connectionBusy = true;
    renderThread();
    try {
      await action(peerId);
      if (version !== accountVersion) return;
      setStatus(message);
    } catch (error) {
      if (version !== accountVersion) return;
      console.error("[Messages] Request update failed:", error);
      setStatus("That request could not be updated. It may have changed, please try again.");
    } finally {
      if (version === accountVersion) {
        connectionBusy = false;
        renderThread();
        if (selectedId === peerId && contactStatus(peerId) === "connected") messageInput.focus({ preventScroll: true });
      }
    }
  };
  connectionPrimary.addEventListener("click", runConnectionAction);
  connectionSecondary.addEventListener("click", runConnectionAction);

  document.querySelectorAll(".folder-tab").forEach((tab) => {
    tab.addEventListener("click", () => chooseFolder(tab.dataset.folder));
  });
  conversationSearch.addEventListener("input", renderConversations);
  document.getElementById("newMessageButton").addEventListener("click", openCompose);
  document.getElementById("emptyComposeButton").addEventListener("click", openCompose);
  document.getElementById("backToConversations").addEventListener("click", () => {
    closeMessageMenu();
    layout.classList.remove("show-thread");
    conversationSearch.focus();
  });
  recipientSearch.addEventListener("input", renderRecipients);
  const savePreference = async (thread, changes, folder) => {
    const version = accountVersion;
    try {
      await updateMessagePreferences(thread.id, changes);
      if (version !== accountVersion) return;
      if (folder) chooseFolder(folder, thread.id);
    } catch (error) {
      if (version === accountVersion) showError(error);
    }
  };
  favoriteButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    savePreference(thread, { favorite: !thread.favorite }, thread.favorite && currentFolder === "favorites" ? "inbox" : null);
  });
  archiveButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    savePreference(thread, { archived: !thread.archived }, thread.archived ? "inbox" : "archived");
  });
  deleteButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    savePreference(thread, { deleted: !thread.deleted, archived: false }, thread.deleted ? "inbox" : "deleted");
  });
  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const thread = threads.find((item) => item.id === selectedId);
    const text = messageInput.value.trim();
    if (!thread || thread.deleted || sending || !currentUid || contactStatus(thread.id) !== "connected") return;
    if (!text) {
      messageError.textContent = "Write a message before sending.";
      messageError.hidden = false;
      messageInput.focus();
      return;
    }
    messageError.hidden = true;
    const version = accountVersion;
    sending = true;
    document.getElementById("sendButton").disabled = true;
    messageInput.disabled = true;
    setStatus("Sending message...");
    try {
      await sendMessage(thread.id, text);
      if (version !== accountVersion) return;
      composerDrafts.delete(thread.id);
      if (selectedId === thread.id) {
        messageInput.value = "";
        messageInput.style.height = "auto";
      }
      setStatus("Message sent.");
    } catch (error) {
      if (version !== accountVersion) return;
      console.error("[Messages] Send failed:", error);
      messageError.textContent = "Message was not confirmed as sent. Your text is preserved. Check your connection before retrying.";
      messageError.hidden = false;
      setStatus("Message was not confirmed as sent.");
    } finally {
      if (version === accountVersion) {
        sending = false;
        renderThread();
        messageInput.focus();
      }
    }
  });
  messageInput.addEventListener("input", () => {
    messageError.hidden = true;
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
  });
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !composeDialog.open && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      conversationSearch.focus();
    }
  });

  function markRead(thread) {
    if (document.hidden || !document.hasFocus() || thread.deleted || threadPanel.hidden
      || (window.matchMedia("(max-width: 780px)").matches && !layout.classList.contains("show-thread"))
      || threadMessages.scrollHeight - threadMessages.scrollTop - threadMessages.clientHeight >= 48) return;
    const newest = Math.max(0, ...thread.messages.filter((message) => message.from === "them").map((message) => message.sentAt));
    if (!newest || thread.unread === 0 || (readWrites.get(thread.id) || 0) >= newest) return;
    readWrites.set(thread.id, newest);
    const version = accountVersion;
    markConversationRead(thread.id, newest).catch((error) => {
      if (version !== accountVersion) return;
      readWrites.delete(thread.id);
      showError(error);
    });
  }

  renderConversations();
  renderThread();
  subscribeMessaging((snapshot) => {
    if (currentUid !== snapshot.uid) {
      accountVersion += 1;
      connectionError = null;
      selectedId = null;
      drafts.clear();
      composerDrafts.clear();
      readWrites.clear();
      renderedThread = null;
      renderedMessages = "";
      editing = null;
      closeMessageMenu();
      deleteTarget = null;
      deletingMessage = false;
      deleteMessageDialog.close();
      confirmMessageDelete.disabled = false;
      document.getElementById("cancelMessageDelete").disabled = false;
      sending = false;
      connectionBusy = false;
      messageInput.value = "";
      messageError.hidden = true;
      setStatus("");
      composeDialog.close();
      layout.classList.remove("show-thread");
      currentFolder = "inbox";
      document.querySelectorAll(".folder-tab").forEach((tab) => {
        tab.setAttribute("aria-selected", String(tab.dataset.folder === "inbox"));
      });
    }
    currentUid = snapshot.uid;
    loading = snapshot.loading;
    profiles = Object.entries(snapshot.profiles)
      .filter(([id]) => id !== currentUid)
      .map(([id, profile]) => ({
        id, name: profile.displayName || "Learner", avatar: profile.photoURL || "",
        detail: `${Object.values(profile.presence || {}).some((online) => online === true) ? "Online" : "Offline"}${profile.nationality ? ` / ${profile.nationality}` : ""}${profile.level ? ` / ${profile.level}` : ""}`
      }));
    byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    contacts = Object.fromEntries(Object.entries(snapshot.contacts || {})
      .filter(([id, contact]) => id !== currentUid && ["incoming", "outgoing", "connected"].includes(contact?.status)));
    const ids = new Set([...Object.keys(snapshot.messages), ...Object.keys(contacts), ...drafts]);
    threads = [...ids].map((id) => {
      const preference = snapshot.preferences[id] || {};
      const messages = Object.entries(snapshot.messages[id] || {})
        .map(([messageId, message]) => ({
          id: messageId, text: message.text, sentAt: Number(message.sentAt) || 0,
          editedAt: Number(message.editedAt) || 0, deletedAt: Number(message.deletedAt) || 0,
          time: formatTime(message.sentAt),
          from: message.senderId === currentUid ? "me" : "them"
        }))
        .sort((left, right) => left.sentAt - right.sentAt || left.id.localeCompare(right.id));
      return {
        id, messages, readAt: Number(snapshot.receipts?.[id]?.readAt) || 0, pinned: false, favorite: preference.favorite === true,
        archived: preference.archived === true, deleted: preference.deleted === true,
        unread: messages.filter((message) => message.from === "them" && message.sentAt > (preference.readAt || 0)).length,
        time: messages.length ? formatTime(messages.at(-1).sentAt) : contacts[id]?.updatedAt ? formatTime(contacts[id].updatedAt) : "",
        sentAt: Math.max(messages.at(-1)?.sentAt || 0, Number(contacts[id]?.updatedAt) || 0)
      };
    }).sort((left, right) => right.sentAt - left.sentAt);
    const status = document.getElementById("messagingStatus");
    status.dataset.state = connectionError ? "error" : loading ? "loading" : "ready";
    status.textContent = connectionError || (loading ? "Loading your conversations..." : currentUid && !snapshot.connected
      ? "Connection lost. Messages will sync when you reconnect."
      : currentUid
      ? ""
      : "Sign in to access your messages.");
    status.hidden = !status.textContent;
    document.getElementById("newMessageButton").disabled = !currentUid || loading;
    document.getElementById("emptyComposeButton").disabled = !currentUid || loading;
    renderConversations();
    renderThread();
    if (composeDialog.open) renderRecipients();
    if (!loading && requestedRecipient && byId[requestedRecipient]) {
      const recipient = requestedRecipient;
      requestedRecipient = null;
      startConversation(recipient);
    }
    const active = threads.find((thread) => thread.id === selectedId);
    if (active && !document.hidden) markRead(active);
  }, showError);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshMessageDayLabels();
    const active = threads.find((thread) => thread.id === selectedId);
    if (active && !document.hidden) markRead(active);
  });
  window.addEventListener("focus", () => {
    const active = threads.find((thread) => thread.id === selectedId);
    if (active) markRead(active);
  });
  function refreshMessageDayLabels() {
    threadMessages.querySelectorAll(".day-divider[data-timestamp]").forEach((divider) => {
      const label = formatMessageDay(Number(divider.dataset.timestamp));
      if (divider.textContent !== label) divider.textContent = label;
    });
  }
  window.setInterval(refreshMessageDayLabels, 60000);
})();
