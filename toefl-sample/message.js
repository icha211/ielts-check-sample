(() => {
  const profiles = [
    { id: "mina", name: "Mina Prabowo", detail: "Preparing for the TOEFL ITP", avatar: "https://picsum.photos/seed/toefl-mina/96/96" },
    { id: "dimas", name: "Dimas Santoso", detail: "English study group member", avatar: "https://picsum.photos/seed/toefl-dimas/96/96" },
    { id: "nadia", name: "Nadia Putri", detail: "Practicing for a scholarship interview", avatar: "https://picsum.photos/seed/toefl-nadia/96/96" },
    { id: "arif", name: "Arif Wicaksono", detail: "Working on listening practice", avatar: "https://picsum.photos/seed/toefl-arif/96/96" },
    { id: "sinta", name: "Sinta Rahmawati", detail: "TOEFL ITP learner", avatar: "https://picsum.photos/seed/toefl-sinta/96/96" },
    { id: "kevin", name: "Kevin Hartono", detail: "English study group member", avatar: "https://picsum.photos/seed/toefl-kevin/96/96" },
    { id: "laila", name: "Laila Nurdin", detail: "Preparing for the TOEFL ITP", avatar: "https://picsum.photos/seed/toefl-laila/96/96" }
  ];
  const byId = Object.fromEntries(profiles.map((person) => [person.id, person]));
  const threads = [
    {
      id: "mina", pinned: true, favorite: false, archived: false, deleted: false, unread: 2, time: "10m ago",
      messages: [
        { from: "them", text: "Hi! Are you joining the listening practice later today?", time: "9:18" },
        { from: "me", text: "Yes, I will be there. I am reviewing the lecture questions now.", time: "9:21" },
        { from: "them", text: "Great. I found a useful way to keep track of the speaker's examples.", time: "9:24" }
      ]
    },
    {
      id: "dimas", pinned: true, favorite: true, archived: false, deleted: false, unread: 1, time: "2h ago",
      messages: [
        { from: "them", text: "Would you like to compare notes after the practice test?", time: "Yesterday" },
        { from: "me", text: "Sure. I want to go over the structure section together.", time: "Yesterday" }
      ]
    },
    {
      id: "nadia", pinned: false, favorite: false, archived: false, deleted: false, unread: 0, time: "12m ago",
      messages: [
        { from: "them", text: "I keep mixing up the transition words in the reading section.", time: "8:42" },
        { from: "me", text: "Try grouping them by purpose. It helped me spot contrast and cause more quickly.", time: "8:51" }
      ]
    },
    {
      id: "arif", pinned: false, favorite: false, archived: false, deleted: false, unread: 0, time: "1h ago",
      messages: [
        { from: "them", text: "Do you have any tips for taking notes during the longer audio questions?", time: "Yesterday" },
        { from: "me", text: "I write down the main idea first, then only add details that support it.", time: "Yesterday" }
      ]
    },
    {
      id: "sinta", pinned: false, favorite: false, archived: false, deleted: false, unread: 3, time: "1h ago",
      messages: [
        { from: "them", text: "Thanks for sharing those vocabulary exercises. They were helpful.", time: "Yesterday" },
        { from: "me", text: "You're welcome. Let me know which ones you want to practice next.", time: "Yesterday" }
      ]
    },
    {
      id: "kevin", pinned: false, favorite: false, archived: false, deleted: false, unread: 0, time: "3h ago",
      messages: [
        { from: "them", text: "Are you free to study together this weekend?", time: "Monday" },
        { from: "me", text: "Saturday afternoon works for me.", time: "Monday" }
      ]
    }
  ];

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
  let selectedId = "mina";

  const personFor = (thread) => byId[thread.id];
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
  const makeAvatar = (person, className = "avatar") => {
    const image = document.createElement("img");
    image.className = className;
    image.src = person.avatar;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
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
      threadActionsHidden(true);
      emptyTitle.textContent = currentFolder === "deleted" ? "Recently deleted is empty" : `No ${folderLabel(currentFolder).toLowerCase()} conversations`;
      emptyDescription.textContent = currentFolder === "deleted"
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
    messageInput.disabled = thread.deleted;
    document.getElementById("sendButton").disabled = thread.deleted;
    messageInput.placeholder = thread.deleted ? "Restore this conversation to reply" : "Write a message...";
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
    divider.textContent = "Today";
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
    selectedId = id;
    const thread = threads.find((item) => item.id === id);
    if (thread) thread.unread = 0;
    layout.classList.add("show-thread");
    renderConversations();
    renderThread();
    messageInput.focus({ preventScroll: true });
  };

  const chooseFolder = (folder, preferredId = null) => {
    currentFolder = folder;
    selectedId = null;
    layout.classList.remove("show-thread");
    document.querySelectorAll(".folder-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.folder === folder));
    });
    renderConversations();
    const preferred = threads.find((thread) => thread.id === preferredId && isVisibleInFolder(thread, folder));
    const first = preferred || threads.find((thread) => isVisibleInFolder(thread, folder));
    if (first) {
      selectedId = first.id;
      renderConversations();
      renderThread();
    } else {
      renderThread();
    }
  };

  const openCompose = () => {
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
  };

  const startConversation = (id) => {
    let thread = threads.find((item) => item.id === id);
    if (!thread) {
      thread = { id, pinned: false, favorite: false, archived: false, deleted: false, unread: 0, time: "Now", messages: [] };
      threads.unshift(thread);
    }
    thread.archived = false;
    thread.deleted = false;
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
  favoriteButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    thread.favorite = !thread.favorite;
    if (!thread.favorite && currentFolder === "favorites") {
      chooseFolder("inbox", thread.id);
      setStatus("Removed from favorites. Conversation returned to the inbox.");
      return;
    }
    renderConversations();
    renderThread();
    setStatus(thread.favorite ? "Added to favorites." : "Removed from favorites.");
  });
  archiveButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    thread.archived = !thread.archived;
    if (thread.archived) currentFolder = "archived";
    else currentFolder = "inbox";
    chooseFolder(currentFolder, thread.id);
    setStatus(thread.archived ? "Conversation archived." : "Conversation restored to the inbox.");
  });
  deleteButton.addEventListener("click", () => {
    const thread = threads.find((item) => item.id === selectedId);
    if (!thread) return;
    thread.deleted = !thread.deleted;
    if (thread.deleted) currentFolder = "deleted";
    else {
      thread.archived = false;
      currentFolder = "inbox";
    }
    chooseFolder(currentFolder, thread.id);
    setStatus(thread.deleted ? "Conversation moved to recently deleted." : "Conversation restored to the inbox.");
  });
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const thread = threads.find((item) => item.id === selectedId);
    const text = messageInput.value.trim();
    if (!thread || thread.deleted) return;
    if (!text) {
      messageError.textContent = "Write a message before sending.";
      messageError.hidden = false;
      messageInput.focus();
      return;
    }
    messageError.hidden = true;
    const now = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    thread.messages.push({ from: "me", text, time: now });
    thread.time = "Now";
    messageInput.value = "";
    messageInput.style.height = "auto";
    renderConversations();
    renderMessages(thread);
    messageInput.focus();
    setStatus("Message sent.");
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

  renderConversations();
  renderThread();
})();
