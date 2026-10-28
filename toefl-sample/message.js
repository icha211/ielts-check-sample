import { subscribeMessaging, sendMessage, updateMessagePreferences } from "./js/messaging.js";

(() => {
  let profiles = [];
  let byId = {};
  let threads = [];
  let currentUid = null;
  let sending = false;
  let loading = true;
  let accountVersion = 0;
  let connectionError = null;
  const drafts = new Set();
  const composerDrafts = new Map();
  const readWrites = new Map();
  let requestedRecipient = new URLSearchParams(location.search).get("to");
  const formatTime = (timestamp) => timestamp
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp))
    : "Sending...";

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
  const liveStatus = document.getElementById("liveStatus");
  const favoriteButton = document.getElementById("favoriteButton");
  const archiveButton = document.getElementById("archiveButton");
  const deleteButton = document.getElementById("deleteButton");
  const composeDialog = document.getElementById("composeDialog");
  const recipientSearch = document.getElementById("recipientSearch");
  const recipientList = document.getElementById("recipientList");
  const recipientEmpty = document.getElementById("recipientEmpty");
  const folders = ["inbox", "favorites", "archived", "sent", "deleted"];
  let currentFolder = "inbox";
  let selectedId = null;

  const personFor = (thread) => byId[thread.id] || { id: thread.id, name: "Learner", detail: "Profile not listed", avatar: "" };
  const latestMessage = (thread) => thread.messages.at(-1);
  const latestPreview = (thread) => {
    const message = latestMessage(thread);
    if (!message) return "Start a conversation";
    return `${message.from === "me" ? "You: " : ""}${message.text}`;
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

    if (thread.unread > 0 && !pinned) {
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
      threadPerson.replaceChildren();
      threadMessages.replaceChildren();
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
    avatar.alt = person.name;
    threadPerson.replaceChildren(avatar);
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
    messageInput.disabled = thread.deleted || sending || !currentUid || !byId[thread.id];
    document.getElementById("sendButton").disabled = thread.deleted || sending || !currentUid || !byId[thread.id];
    messageInput.placeholder = thread.deleted ? "Restore this conversation to reply"
      : !byId[thread.id] ? "This learner is not currently listed" : "Write a message...";
    if (thread.messages.length === 0) {
      threadMessages.innerHTML = "";
      const placeholder = document.createElement("p");
      placeholder.className = "message-placeholder";
      const heading = document.createElement("strong");
      heading.textContent = `Say hello to ${person.name}`;
      placeholder.append(heading, document.createTextNode("Your conversation starts here. Send a message to get things going."));
      threadMessages.append(placeholder);
    }
  };

  const threadActionsHidden = (hidden) => {
    document.getElementById("threadActions").hidden = hidden;
  };

  const renderMessages = (thread) => {
    if (!thread.messages.length) return;
    threadMessages.replaceChildren();
    const divider = document.createElement("div");
    divider.className = "day-divider";
    divider.textContent = "Conversation";
    threadMessages.append(divider);
    thread.messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = `message-row ${message.from === "me" ? "outgoing" : "incoming"}`;
      const bubble = document.createElement("p");
      bubble.className = "message-bubble";
      bubble.textContent = message.text;
      const meta = document.createElement("span");
      meta.className = "message-meta";
      meta.textContent = message.time;
      row.append(bubble, meta);
      threadMessages.append(row);
    });
    threadMessages.scrollTop = threadMessages.scrollHeight;
  };

  const selectThread = (id) => {
    if (selectedId && selectedId !== id) composerDrafts.set(selectedId, messageInput.value);
    if (selectedId !== id) messageInput.value = composerDrafts.get(id) || "";
    selectedId = id;
    const thread = threads.find((item) => item.id === id);
    if (thread) markRead(thread);
    layout.classList.add("show-thread");
    renderConversations();
    renderThread();
    messageInput.focus({ preventScroll: true });
  };

  const chooseFolder = (folder, preferredId = null) => {
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
      detail.textContent = person.detail;
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

  document.querySelectorAll(".folder-tab").forEach((tab) => {
    tab.addEventListener("click", () => chooseFolder(tab.dataset.folder));
  });
  conversationSearch.addEventListener("input", renderConversations);
  document.getElementById("newMessageButton").addEventListener("click", openCompose);
  document.getElementById("emptyComposeButton").addEventListener("click", openCompose);
  document.getElementById("backToConversations").addEventListener("click", () => {
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
    if (!thread || thread.deleted || sending || !currentUid) return;
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
    if (event.key === "Enter" && !event.shiftKey) {
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
    const newest = Math.max(0, ...thread.messages.filter((message) => message.from === "them").map((message) => message.sentAt));
    if (!newest || thread.unread === 0 || (readWrites.get(thread.id) || 0) >= newest) return;
    readWrites.set(thread.id, newest);
    const version = accountVersion;
    updateMessagePreferences(thread.id, { readAt: newest }).catch((error) => {
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
      sending = false;
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
    const ids = new Set([...Object.keys(snapshot.messages), ...drafts]);
    threads = [...ids].map((id) => {
      const preference = snapshot.preferences[id] || {};
      const messages = Object.entries(snapshot.messages[id] || {})
        .map(([messageId, message]) => ({
          id: messageId, text: message.text, sentAt: Number(message.sentAt) || 0,
          time: formatTime(message.sentAt),
          from: message.senderId === currentUid ? "me" : "them"
        }))
        .sort((left, right) => left.sentAt - right.sentAt || left.id.localeCompare(right.id));
      return {
        id, messages, pinned: false, favorite: preference.favorite === true,
        archived: preference.archived === true, deleted: preference.deleted === true,
        unread: messages.filter((message) => message.from === "them" && message.sentAt > (preference.readAt || 0)).length,
        time: messages.length ? formatTime(messages.at(-1).sentAt) : "",
        sentAt: messages.at(-1)?.sentAt || 0
      };
    }).sort((left, right) => right.sentAt - left.sentAt);
    const status = document.getElementById("messagingStatus");
    status.dataset.state = connectionError ? "error" : loading ? "loading" : "ready";
    status.textContent = connectionError || (loading ? "Loading your conversations..." : currentUid && !snapshot.connected
      ? "Connection lost. Messages will sync when you reconnect."
      : currentUid
      ? "Messages update live. Only you and the recipient can read your conversation."
      : "Sign in to access your messages.");
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
    const active = threads.find((thread) => thread.id === selectedId);
    if (active && !document.hidden) markRead(active);
  });
})();
