const state = {
  items: [],
  dragId: null,
  routeBlobUrl: null,
  routeStale: false,
  dirty: false,
  auth: { authenticated: false, user: null, guest: false },
  activeRouteSessionId: null,
  savedRoutes: [],
  editingRouteId: null,
  editingRouteTitle: "",
  editingItemId: null,
  combineVideoUrl: "",
  combineVideoLoading: false,
  combineVideoStatus: ""
};

const HTTP_PARTIAL = 207;

const elements = {
  input:              document.getElementById("photo-input"),
  clearBtn:           document.getElementById("clear-btn"),
  authState:          document.getElementById("auth-state"),
  loginLink:          document.getElementById("login-link"),
  guestLoginBtn:      document.getElementById("guest-login-btn"),
  logoutBtn:          document.getElementById("logout-btn"),
  newSessionBtn:      document.getElementById("new-session-btn"),
  activeSession:      document.getElementById("active-session"),
  reloadRoutesBtn:    document.getElementById("reload-routes-btn"),
  savedRoutesEmpty:   document.getElementById("saved-routes-empty"),
  savedRoutesList:    document.getElementById("saved-routes-list"),
  routeBtn:           document.getElementById("route-btn"),
  combineControls:    document.getElementById("combine-controls"),
  combineVideoBtn:    document.getElementById("combine-video-btn"),
  combineTransitionSelect: document.getElementById("combine-transition-select"),
  combineTransitionDuration: document.getElementById("combine-transition-duration"),
  combineVideoState:  document.getElementById("combine-video-state"),
  combineVideoSection: document.getElementById("combined-video-section"),
  combineVideoLink:   document.getElementById("combined-video-link"),
  confirmBackdrop:    document.getElementById("confirm-dialog-backdrop"),
  confirmMessage:     document.getElementById("confirm-dialog-message"),
  confirmOk:          document.getElementById("confirm-dialog-ok"),
  confirmCancel:      document.getElementById("confirm-dialog-cancel"),
  saveChangesBtn:     document.getElementById("save-changes-btn"),
  photoList:          document.getElementById("photo-list"),
  photosEmpty:        document.getElementById("photos-empty"),
  status:             document.getElementById("status"),
  routePreview:       document.getElementById("route-preview"),
  routePreviewEmpty:  document.getElementById("route-preview-empty"),
  routeStaleBanner:   document.getElementById("route-stale-banner"),
  regenerateRouteBtn: document.getElementById("regenerate-route-btn"),
  routeDownload:      document.getElementById("download-route-link"),
  photoRowTemplate:   document.getElementById("photo-row-template"),
  // Edit photo overlay
  editPhotoOverlay:         document.getElementById("edit-photo-overlay"),
  editPhotoFilename:        document.getElementById("edit-photo-filename"),
  editPhotoThumb:           document.getElementById("edit-photo-thumb"),
  editPhotoMeta:            document.getElementById("edit-photo-meta"),
  editPersistState:         document.getElementById("edit-persist-state"),
  editNoteInput:            document.getElementById("edit-note-input"),
  editNoteState:            document.getElementById("edit-note-state"),
  editSaveNoteBtn:          document.getElementById("edit-save-note-btn"),
  editMapImg:               document.getElementById("edit-map-img"),
  editMapPlaceholder:       document.getElementById("edit-map-placeholder"),
  editSummaryInput:         document.getElementById("edit-summary-input"),
  editSummaryState:         document.getElementById("edit-summary-state"),
  editGenerateSummaryBtn:   document.getElementById("edit-generate-summary-btn"),
  editSaveSummaryBtn:       document.getElementById("edit-save-summary-btn"),
  editTranslateSummaryBtn:  document.getElementById("edit-translate-summary-btn"),
  editTranslateLangSelect:  document.getElementById("edit-translate-lang-select"),
  editGenerateVideoBtn:     document.getElementById("edit-generate-video-btn"),
  editVideoEffectSelect:    document.getElementById("edit-video-effect-select"),
  editVideoCaptionPositionSelect: document.getElementById("edit-video-caption-position-select"),
  editVideoCaptionStyleSelect: document.getElementById("edit-video-caption-style-select"),
  editVideoFontSizeInput:     document.getElementById("edit-video-font-size-input"),
  editVideoState:           document.getElementById("edit-video-state"),
  editVideoSection:         document.getElementById("edit-video-section"),
  editVideoLink:            document.getElementById("edit-video-link"),
  editSourceVideoLink:      document.getElementById("edit-source-video-link"),
  editSourceVideoInput:     document.getElementById("edit-source-video-input"),
  editSourceVideoName:      document.getElementById("edit-source-video-name"),
  editSourceVideoState:     document.getElementById("edit-source-video-state"),
  editCardStatus:           document.getElementById("edit-card-status"),
  editCloseBtn:             document.getElementById("edit-close-btn"),
  editMapBtn:               document.getElementById("edit-map-btn"),
  editInfoBtn:              document.getElementById("edit-info-btn"),
  editInfoContent:          document.getElementById("edit-info-content"),
  editInfoPlaceholder:      document.getElementById("edit-info-placeholder"),
  editPickLocationBtn:      document.getElementById("edit-pick-location-btn"),
  editLocationPicker:       document.getElementById("edit-location-picker"),
  editLocationMap:          document.getElementById("edit-location-map"),
  editLocationCoords:       document.getElementById("edit-location-coords"),
  editSaveLocationBtn:      document.getElementById("edit-save-location-btn"),
  editCancelLocationBtn:    document.getElementById("edit-cancel-location-btn"),
  editAnalysisContent:      document.getElementById("edit-analysis-content"),
  editAnalysisPlaceholder:  document.getElementById("edit-analysis-placeholder"),
  // Auth-gated panels
  welcomeScreen:            document.getElementById("welcome-screen"),
  editPanel:                document.getElementById("edit-panel")
};

//  UTILITIES 

const VIDEO_PLACEHOLDER_THUMB = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#1a1a2e"/><text x="40" y="52" font-size="32" text-anchor="middle" fill="white">🎬</text></svg>'
);

let leafletPickerMap = null;
let leafletPickerMarker = null;
let pickedLocation = null;

function createId() {
  return `pic-${Math.random().toString(36).slice(2, 10)}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "unknown date" : date.toLocaleString();
}

function shortDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileFingerprint(file) {
  if (!file) return "";
  return `${file.name}|${file.size}|${file.lastModified}`;
}

async function readPhotoTimestamp(file) {
  const fallback = Number(file.lastModified) || Date.now();
  try {
    if (!window.exifr || typeof window.exifr.parse !== "function") return fallback;
    const metadata = await window.exifr.parse(file, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
    const candidate = metadata?.DateTimeOriginal || metadata?.CreateDate || metadata?.ModifyDate;
    if (!candidate) return fallback;
    const ts = candidate instanceof Date ? candidate.getTime() : new Date(candidate).getTime();
    return Number.isFinite(ts) ? ts : fallback;
  } catch {
    return fallback;
  }
}

function buildSummaryHtml(text) {
  if (text.length <= 100) return `<p class="info-extract">${escapeHtml(text)}</p>`;
  const breakAt = text.lastIndexOf(" ", 100) > 40 ? text.lastIndexOf(" ", 100) : 100;
  const preview = text.slice(0, breakAt);
  const rest = text.slice(breakAt).trim();
  return `<details class="info-details"><summary class="info-preview">${escapeHtml(preview)}</summary><span class="info-rest"> ${escapeHtml(rest)}</span></details>`;
}

async function getItemImageBody(item) {
  if (item.file) return item.file;
  if (item.thumbUrl?.startsWith("blob:")) {
    const res = await fetch(item.thumbUrl);
    return res.ok ? res.blob() : null;
  }
  return null;
}

function buildInfoHtml(locationInfo, collapsed = false) {
  const wikiLink = locationInfo.wikiUrl
    ? `<a class="info-link" href="${escapeHtml(locationInfo.wikiUrl)}" target="_blank" rel="noreferrer">Open article</a>`
    : "";
  const fullText = locationInfo.wikiExtract || locationInfo.displayName || "No additional info.";

  let extractHtml;
  if (collapsed) {
    const sentences = fullText.match(/[^.!?]+[.!?]+(\s|$)?/g) || [fullText];
    const preview = sentences.slice(0, 2).join(" ").trim();
    const rest = sentences.slice(2).join(" ").trim();
    extractHtml = rest
      ? `<details class="info-details"><summary class="info-preview">${escapeHtml(preview)}</summary><span class="info-rest"> ${escapeHtml(rest)}</span></details>`
      : `<p class="info-extract">${escapeHtml(preview)}</p>`;
  } else {
    extractHtml = `<p class="info-extract">${escapeHtml(fullText)}</p>`;
  }

  return `
    <h4 class="info-title">${escapeHtml(locationInfo.wikiTitle || locationInfo.displayName || "Location")}</h4>
    <p class="info-meta">${escapeHtml(locationInfo.city || "Unknown city")}, ${escapeHtml(locationInfo.country || "Unknown country")}</p>
    <p class="info-meta">Lat ${Number(locationInfo.gps?.lat || 0).toFixed(6)}, Lng ${Number(locationInfo.gps?.lng || 0).toFixed(6)}</p>
    ${extractHtml}
    ${wikiLink}
  `;
}

//  STATUS 

function updateStatus(message) {
  elements.status.textContent = message;
}

//  ROUTE PREVIEW 

function clearRoutePreview() {
  if (state.routeBlobUrl && state.routeBlobUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.routeBlobUrl);
  }
  state.routeBlobUrl = null;
  state.routeStale = false;
  elements.routePreview.hidden = true;
  elements.routePreview.removeAttribute("src");
  elements.routePreviewEmpty.hidden = false;
  elements.routeDownload.classList.add("btn-disabled");
  elements.routeDownload.setAttribute("href", "#");
  elements.routeStaleBanner.hidden = true;
  elements.regenerateRouteBtn.hidden = true;
  // Reset combined video state when the route context changes
  state.combineVideoUrl    = "";
  state.combineVideoStatus = "";
  state.combineVideoLoading = false;
  elements.combineVideoSection.hidden = true;
  elements.combineVideoLink.hidden = true;
  elements.combineVideoState.textContent = "";
  elements.combineVideoState.className = "status-chip";
}

function markRouteStale() {
  if (!state.routeBlobUrl) { clearRoutePreview(); return; }
  state.routeStale = true;
  elements.routeStaleBanner.hidden = false;
  elements.regenerateRouteBtn.hidden = false;
}

//  UNSAVED CHANGES 

function updateSaveBtn() {
  const hasUnsavedNotes = state.items.some(i => i.persisted === true && i.serverImageId && !i.noteSaved);
  elements.saveChangesBtn.hidden = !hasUnsavedNotes;
  if (hasUnsavedNotes) {
    const noteCount = state.items.filter(i => i.persisted === true && i.serverImageId && !i.noteSaved).length;
    elements.saveChangesBtn.textContent = `\u{1F4BE} Save ${noteCount} note${noteCount !== 1 ? "s" : ""}`;
  }
}

async function saveChanges() {
  if (!state.auth.authenticated) { updateStatus("Sign in to save."); return; }
  if (!state.activeRouteSessionId) { updateStatus("No active route."); return; }
  const unsavedNoteItems = state.items.filter(i => i.persisted === true && i.serverImageId && !i.noteSaved);
  if (unsavedNoteItems.length === 0) { updateStatus("Nothing to save."); return; }
  elements.saveChangesBtn.disabled = true;
  updateStatus(`Saving ${unsavedNoteItems.length} note(s)…`);
  for (const item of unsavedNoteItems) {
    await saveNoteForItem(item.id);
  }
  elements.saveChangesBtn.disabled = false;
  updateSaveBtn();
}

function updateAuthUi() {
  if (!state.auth.authenticated) {
    elements.authState.textContent = "Not signed in";
    elements.loginLink.hidden = false;
    elements.guestLoginBtn.hidden = false;
    elements.logoutBtn.hidden = true;
    elements.newSessionBtn.hidden = true;
    elements.reloadRoutesBtn.hidden = true;
    elements.activeSession.textContent = "No active route";
    elements.savedRoutesList.innerHTML = "";
    elements.savedRoutesEmpty.hidden = false;
    elements.savedRoutesEmpty.textContent = "Sign in to load saved routes.";
    elements.welcomeScreen.hidden = false;
    elements.editPanel.hidden = true;
    return;
  }

  elements.welcomeScreen.hidden = true;
  elements.editPanel.hidden = false;

  const name = state.auth.user?.displayName || state.auth.user?.email || "user";
  elements.authState.textContent = state.auth.guest ? `Guest: ${name}` : name;
  elements.loginLink.hidden = true;
  elements.guestLoginBtn.hidden = true;
  elements.logoutBtn.hidden = false;
  elements.newSessionBtn.hidden = false;
  elements.reloadRoutesBtn.hidden = false;

  const activeRoute = state.savedRoutes.find(r => r.id === state.activeRouteSessionId);
  elements.activeSession.textContent = activeRoute
    ? activeRoute.title
    : "No active route";
  updateSaveBtn();
}

//  SAVED ROUTES (SIDEBAR) 

function beginInlineRename(routeId, currentTitle) {
  state.editingRouteId = routeId;
  state.editingRouteTitle = currentTitle || "";
  renderSavedRoutes();
}

function cancelInlineRename() {
  state.editingRouteId = null;
  state.editingRouteTitle = "";
  renderSavedRoutes();
}

async function saveInlineRename(routeId) {
  const nextTitle = state.editingRouteTitle.trim();
  if (nextTitle.length < 2 || nextTitle.length > 120) {
    updateStatus("Route name must be 2120 characters.");
    return;
  }
  try {
    const response = await fetch(`/api/user/routes/${routeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not rename route." }));
      updateStatus(payload.error || "Could not rename route.");
      return;
    }
    const payload = await response.json();
    const updatedTitle = payload.routeSession?.title || nextTitle;
    state.savedRoutes = state.savedRoutes.map(r =>
      r.id === routeId ? { ...r, title: updatedTitle } : r
    );
    state.editingRouteId = null;
    state.editingRouteTitle = "";
    updateAuthUi();
    renderSavedRoutes();
    updateStatus(`Route renamed to "${updatedTitle}".`);
  } catch {
    updateStatus("Network error while renaming route.");
  }
}

// Returns a Promise<boolean> — resolves true on confirm, false on cancel
function confirmDialog(message) {
  return new Promise(resolve => {
    elements.confirmMessage.textContent = message;
    elements.confirmBackdrop.hidden = false;

    const cleanup = (result) => {
      elements.confirmBackdrop.hidden = true;
      elements.confirmOk.removeEventListener("click", onOk);
      elements.confirmCancel.removeEventListener("click", onCancel);
      elements.confirmBackdrop.removeEventListener("click", onBackdrop);
      resolve(result);
    };

    const onOk       = () => cleanup(true);
    const onCancel   = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === elements.confirmBackdrop) cleanup(false); };

    elements.confirmOk.addEventListener("click", onOk);
    elements.confirmCancel.addEventListener("click", onCancel);
    elements.confirmBackdrop.addEventListener("click", onBackdrop);
  });
}

function renderSavedRoutes() {
  elements.savedRoutesList.innerHTML = "";

  if (!state.auth.authenticated) {
    elements.savedRoutesEmpty.hidden = false;
    elements.savedRoutesEmpty.textContent = "Sign in to load saved routes.";
    return;
  }

  if (state.savedRoutes.length === 0) {
    elements.savedRoutesEmpty.hidden = false;
    elements.savedRoutesEmpty.textContent = "No saved routes yet.";
    return;
  }

  elements.savedRoutesEmpty.hidden = true;

  state.savedRoutes.forEach(route => {
    const isEditing = state.editingRouteId === route.id;
    const isActive  = state.activeRouteSessionId === route.id;

    const item = document.createElement("div");
    item.className = `route-nav-item${isActive ? " active-route" : ""}`;

    const indicator = document.createElement("div");
    indicator.className = "route-nav-indicator";

    const body = document.createElement("div");
    body.className = "route-nav-body";

    if (isEditing) {
      const input = document.createElement("input");
      input.className = "route-nav-title-input";
      input.type = "text";
      input.maxLength = 120;
      input.value = state.editingRouteTitle;
      input.addEventListener("input", e => { state.editingRouteTitle = e.target.value; });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); void saveInlineRename(route.id); }
        if (e.key === "Escape") { e.preventDefault(); cancelInlineRename(); }
      });
      body.appendChild(input);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    } else {
      const title = document.createElement("p");
      title.className = "route-nav-title";
      title.textContent = route.title;
      body.appendChild(title);
    }

    const meta = document.createElement("p");
    meta.className = "route-nav-meta";
    meta.textContent = `${shortDate(route.createdAt)}  ${route._count?.images ?? 0} photo(s)`;
    body.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "route-nav-actions";

    if (isEditing) {
      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-secondary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => void saveInlineRename(route.id));

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", cancelInlineRename);

      actions.append(saveBtn, cancelBtn);
    } else {
      // Clicking anywhere on an inactive row loads the route
      if (!isActive) {
        item.addEventListener("click", e => {
          // Don't intercept button clicks inside actions
          if (!e.target.closest(".route-nav-actions")) restoreRoute(route.id);
        });
      }

      const renameBtn = document.createElement("button");
      renameBtn.className = "btn btn-ghost";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => beginInlineRename(route.id, route.title));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.style.color = "var(--red)";
      deleteBtn.addEventListener("click", async () => {
        const confirmed = await confirmDialog(`Delete route "${route.title}"? This cannot be undone.`);
        if (confirmed) deleteRoute(route.id);
      });

      actions.append(renameBtn, deleteBtn);
    }

    item.append(indicator, body, actions);
    elements.savedRoutesList.appendChild(item);
  });
}

//  PHOTO LIST (replaces renderCards) 

function renderPhotoList() {
  elements.photoList.innerHTML = "";

  if (state.items.length === 0) {
    elements.photosEmpty.hidden = false;
    updateSaveBtn();
    refreshCombineVideoState();
    return;
  }
  elements.photosEmpty.hidden = true;

  state.items.forEach(item => {
    const fragment = elements.photoRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".photo-row");

    // Thumb
    const thumb = fragment.querySelector(".thumb");
    thumb.src = item.thumbUrl || "";

    // Meta
    const nameEl       = fragment.querySelector(".name");
    const sizeEl       = fragment.querySelector(".size");
    const persistEl    = fragment.querySelector(".persist-state");
    const cardStatusEl = fragment.querySelector(".card-status");

    const fileName = item.file?.name || item.originalFilename || "restored-image";
    const fileSize = item.file?.size || item.byteSize || 0;
    nameEl.textContent = fileName;
    sizeEl.textContent = `${formatSize(fileSize)}  ${formatDate(item.timestamp)}`;

    persistEl.classList.remove("ok", "warn");
    if (item.persisted === true) {
      persistEl.textContent = "Saved on server";
      persistEl.classList.add("ok");
    } else if (item.persisted === false) {
      persistEl.textContent = "Not persisted";
      persistEl.classList.add("warn");
    } else {
      persistEl.textContent = "Local only";
    }

    cardStatusEl.textContent = item.message || "";
    cardStatusEl.classList.remove("ok", "warn");
    if (item.messageType === "ok") cardStatusEl.classList.add("ok");
    if (item.messageType === "warn") cardStatusEl.classList.add("warn");

    // Note column
    const noteInput   = fragment.querySelector(".note-input");
    const noteSaveBtn = fragment.querySelector(".note-save-btn");
    const noteState   = fragment.querySelector(".note-state");

    noteInput.value = item.userNote || "";
    noteInput.addEventListener("input", e => {
      item.userNote = e.target.value;
      item.noteSaved = false;
      item.noteStatus = item.serverImageId ? "Unsaved changes" : "Will save after upload";
      noteState.textContent = item.noteStatus;
      noteState.className = "note-state status-chip warn";
      updateSaveBtn();
    });

    noteSaveBtn.disabled = !(state.auth.authenticated && state.activeRouteSessionId && item.serverImageId);
    noteSaveBtn.addEventListener("click", () => saveNoteForItem(item.id));

    noteState.textContent = item.noteStatus || (item.noteSaved ? "Saved" : "");
    noteState.className = `note-state status-chip${item.noteSaved ? " ok" : item.noteStatus ? " warn" : ""}`;

    // Map column
    const mapImg             = fragment.querySelector(".map-img");
    const mapPlaceholderSmall = fragment.querySelector(".map-placeholder-small");
    const mapBtn             = fragment.querySelector(".map-btn");
    const infoBtn            = fragment.querySelector(".info-btn");

    if (item.mapUrl) {
      mapImg.src = item.mapUrl;
      mapImg.hidden = false;
      mapPlaceholderSmall.hidden = true;
    } else {
      mapImg.hidden = true;
      mapPlaceholderSmall.hidden = false;
    }

    mapBtn.disabled = false;
    infoBtn.disabled = false;
    mapBtn.addEventListener("click", () => generateMapForItem(item.id));
    infoBtn.addEventListener("click", () => generateInfoForItem(item.id));

    // Info column
    const infoContent     = fragment.querySelector(".col-info .info-content");
    const infoPlaceholder = fragment.querySelector(".col-info .info-placeholder");

    if (item.locationInfo) {
      infoContent.innerHTML = buildInfoHtml(item.locationInfo, true);
      infoContent.hidden = false;
      infoPlaceholder.hidden = true;
    } else {
      infoContent.hidden = true;
      infoPlaceholder.hidden = false;
    }

    // Summary column
    const summaryState = fragment.querySelector(".summary-state");
    const summaryText  = fragment.querySelector(".summary-text");
    const summaryBtn   = fragment.querySelector(".summary-btn");

    const canGenerateSummary = state.auth.authenticated && state.activeRouteSessionId && item.serverImageId && item.userNote?.trim();
    summaryBtn.disabled = !canGenerateSummary;
    summaryBtn.title = canGenerateSummary ? "" : (item.serverImageId ? "Add a note first to generate an AI summary" : "Upload image first");

    const videoRowLink = fragment.querySelector(".video-row-link");
    if (item.videoUrl) {
      videoRowLink.href = item.videoUrl;
      videoRowLink.hidden = false;
    } else {
      videoRowLink.hidden = true;
    }
    summaryBtn.addEventListener("click", () => generateSummaryForItem(item.id));

    if (item.aiSummary) {
      summaryText.innerHTML = buildSummaryHtml(item.aiSummary);
      summaryText.hidden = false;
    } else {
      summaryText.hidden = true;
    }

    if (item.summaryLoading) {
      summaryState.textContent = "Generating...";
      summaryState.className = "summary-state status-chip loading";
    } else {
      summaryState.textContent = item.summaryStatus || "";
      summaryState.className = `summary-state status-chip${item.summaryStatus ? " warn" : ""}`;
    }

    // Action buttons
    const editBtn   = fragment.querySelector(".edit-btn");
    const removeBtn = fragment.querySelector(".remove-btn");

    editBtn.addEventListener("click", () => openEditPhoto(item.id));
    removeBtn.addEventListener("click", () => removeItem(item.id));

    // Drag-and-drop
    row.dataset.id = item.id;
    row.addEventListener("dragstart", () => {
      state.dragId = item.id;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      state.dragId = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", e => e.preventDefault());
    row.addEventListener("drop", e => {
      e.preventDefault();
      reorderItems(state.dragId, item.id);
    });

    elements.photoList.appendChild(fragment);
  });
  updateSaveBtn();
  refreshCombineVideoState();
}

//  EDIT PHOTO OVERLAY ─

function openEditPhoto(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  state.editingItemId = itemId;

  const fileName = item.file?.name || item.originalFilename || "photo";
  elements.editPhotoFilename.textContent = fileName;

  // Thumbnail
  elements.editPhotoThumb.src = item.thumbUrl || "";

  // Source video play link (only for video items that are uploaded)
  if (item.isVideo && item.serverImageId && state.activeRouteSessionId) {
    elements.editSourceVideoLink.href =
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/source-video`;
    elements.editSourceVideoLink.hidden = false;
  } else {
    elements.editSourceVideoLink.href = "#";
    elements.editSourceVideoLink.hidden = true;
  }

  // Meta
  const fileSize = item.file?.size || item.byteSize || 0;
  elements.editPhotoMeta.textContent =
    `${formatSize(fileSize)}  ${item.file?.type || item.mimeType || ""}  ${formatDate(item.timestamp)}`;

  // Persist state
  elements.editPersistState.className = "detail-persist";
  if (item.persisted === true) {
    elements.editPersistState.textContent = "Saved on server";
    elements.editPersistState.classList.add("ok");
  } else if (item.persisted === false) {
    elements.editPersistState.textContent = "Not persisted";
    elements.editPersistState.classList.add("warn");
  } else {
    elements.editPersistState.textContent = "Local only";
  }

  // Map
  if (item.mapUrl) {
    elements.editMapImg.src = item.mapUrl;
    elements.editMapImg.hidden = false;
    elements.editMapPlaceholder.hidden = true;
  } else {
    elements.editMapImg.hidden = true;
    elements.editMapPlaceholder.hidden = false;
  }

  // Note
  elements.editNoteInput.value = item.userNote || "";
  refreshEditNoteState(item);

  // Summary
  elements.editSummaryInput.value = item.aiSummary || "";
  refreshEditSummaryState(item);

  // Video
  refreshEditVideoState(item);
  refreshEditSourceVideoState(item);

  // Location info
  if (item.locationInfo) {
    elements.editInfoContent.innerHTML = buildInfoHtml(item.locationInfo);
    elements.editInfoContent.hidden = false;
    elements.editInfoPlaceholder.hidden = true;
  } else {
    elements.editInfoContent.hidden = true;
    elements.editInfoPlaceholder.hidden = false;
  }

  // Image analysis (read-only)
  if (item.imageAnalysis) {
    elements.editAnalysisContent.textContent = item.imageAnalysis;
    elements.editAnalysisContent.hidden = false;
    elements.editAnalysisPlaceholder.hidden = true;
  } else {
    elements.editAnalysisContent.hidden = true;
    elements.editAnalysisPlaceholder.hidden = false;
  }

  // Map/info action buttons — always enabled; getItemImageBody() handles restored items
  elements.editMapBtn.disabled = false;
  elements.editInfoBtn.disabled = false;

  // Card status
  elements.editCardStatus.textContent = item.message || "";
  elements.editCardStatus.className = `detail-card-status${item.messageType === "ok" ? " ok" : item.messageType === "warn" ? " warn" : ""}`;

  elements.editPhotoOverlay.hidden = false;
  location.hash = `edit/${itemId}`;
  document.body.style.overflow = "hidden";
}

function closeEditPhoto() {
  state.editingItemId = null;
  elements.editPhotoOverlay.hidden = true;
  document.body.style.overflow = "";
  history.replaceState(null, "", location.pathname + location.search);
}

function refreshEditNoteState(item) {
  elements.editNoteState.textContent = item.noteStatus || (item.noteSaved ? "Saved" : "");
  elements.editNoteState.className = `status-chip${item.noteSaved ? " ok" : item.noteStatus ? " warn" : ""}`;
  elements.editSaveNoteBtn.disabled =
    !(state.auth.authenticated && state.activeRouteSessionId && item.serverImageId);
}

function refreshEditSummaryState(item) {
  const currentValue = elements.editSummaryInput.value;
  const hasUnsavedChanges = currentValue !== item.aiSummary;
  const hasContent = currentValue.trim().length > 0;

  if (item.summaryLoading) {
    elements.editSummaryState.textContent = "Generating...";
    elements.editSummaryState.className = "status-chip loading";
  } else if (item.translateLoading) {
    elements.editSummaryState.textContent = "Translating...";
    elements.editSummaryState.className = "status-chip loading";
  } else if (hasUnsavedChanges && (hasContent || item.aiSummary)) {
    elements.editSummaryState.textContent = "Unsaved changes";
    elements.editSummaryState.className = "status-chip warn";
  } else {
    elements.editSummaryState.textContent = item.summaryStatus || (item.aiSummary ? "Saved" : "");
    elements.editSummaryState.className = `status-chip${item.aiSummary && !item.summaryGenerated ? " ok" : item.summaryStatus ? " warn" : ""}`;
  }

  const canAct = state.auth.authenticated && state.activeRouteSessionId && item.serverImageId;
  const hasNote = elements.editNoteInput.value.trim().length > 0;
  const busy = item.summaryLoading || item.translateLoading;
  const canGenerate = canAct && hasNote && !busy;
  elements.editGenerateSummaryBtn.disabled = !canGenerate;
  elements.editGenerateSummaryBtn.title = canGenerate ? "" : (!canAct ? "Upload image first" : "Add a note to generate an AI summary");
  elements.editSaveSummaryBtn.hidden = !hasContent && !item.aiSummary;
  elements.editSaveSummaryBtn.disabled = !canAct || busy;
  const canTranslate = canAct && hasContent && !busy;
  elements.editTranslateSummaryBtn.disabled = !canTranslate;
  elements.editTranslateSummaryBtn.title = canTranslate ? "" : (!canAct ? "Upload image first" : "Add or generate a summary first to translate");
}

function refreshEditVideoState(item) {
  if (item.videoLoading) {
    elements.editVideoState.textContent = "Generating video…";
    elements.editVideoState.className = "status-chip loading";
  } else if (item.videoFromVideoLoading) {
    elements.editVideoState.textContent = "Processing video…";
    elements.editVideoState.className = "status-chip loading";
  } else {
    elements.editVideoState.textContent = item.videoStatus || (item.videoUrl ? "Ready" : "");
    elements.editVideoState.className = `status-chip${item.videoUrl && !item.videoStatus ? " ok" : item.videoStatus === "Ready" ? " ok" : item.videoStatus ? " warn" : ""}`;
  }
  const canAct = state.auth.authenticated && state.activeRouteSessionId && item.serverImageId;
  const hasSummary = !!(item.aiSummary?.trim());
  const busy = item.videoLoading || item.videoFromVideoLoading;
  const canGenerate = canAct && hasSummary && !busy;
  const isVideoItem = !!item.isVideo;

  // Panel is always visible (holds the generate controls)
  elements.editVideoSection.hidden = false;

  // All options apply to both image and video items
  elements.editVideoEffectSelect.disabled = busy;
  elements.editVideoCaptionPositionSelect.disabled = busy;
  elements.editVideoCaptionStyleSelect.disabled = busy;
  elements.editVideoFontSizeInput.disabled = busy;

  elements.editGenerateVideoBtn.disabled = !canGenerate;
  elements.editGenerateVideoBtn.title = canGenerate ? "" : (!canAct ? "Upload first" : "Generate an AI summary first");

  // Video link only shown when a URL is available
  if (item.videoUrl) {
    elements.editVideoLink.href = item.videoUrl;
    elements.editVideoLink.hidden = false;
  } else {
    elements.editVideoLink.hidden = true;
  }
}

function refreshEditSourceVideoState(item) {
  if (item.sourceVideoUploading) {
    elements.editSourceVideoState.textContent = "Uploading…";
    elements.editSourceVideoState.className = "status-chip loading";
    elements.editSourceVideoName.textContent = item.sourceVideoFilename || "";
  } else if (item.hasSourceVideo) {
    elements.editSourceVideoState.textContent = "Uploaded";
    elements.editSourceVideoState.className = "status-chip ok";
    elements.editSourceVideoName.textContent = item.sourceVideoFilename || "video file";
  } else {
    elements.editSourceVideoState.textContent = "";
    elements.editSourceVideoState.className = "status-chip";
    elements.editSourceVideoName.textContent = "";
  }

  // Show play link for video items once uploaded
  const canPlay = item.isVideo && item.hasSourceVideo && item.serverImageId && state.activeRouteSessionId;
  if (canPlay) {
    elements.editSourceVideoLink.href =
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/source-video`;
    elements.editSourceVideoLink.hidden = false;
  } else {
    elements.editSourceVideoLink.hidden = true;
  }

  const canAct = state.auth.authenticated && state.activeRouteSessionId && item.serverImageId;
  const hasSummary = !!(item.aiSummary?.trim());
  const busy = item.videoLoading || item.videoFromVideoLoading || item.sourceVideoUploading;
  const canGenerateFromVideo = canAct && item.hasSourceVideo && hasSummary && !busy;
  elements.editSourceVideoInput.disabled = busy;
}

async function uploadSourceVideoForItem(itemId, file) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;
  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.videoStatus = "Sign in and upload image first";
    refreshEditSourceVideoState(item);
    return;
  }
  item.sourceVideoFilename = file.name;
  item.sourceVideoUploading = true;
  refreshEditSourceVideoState(item);
  try {
    const formData = new FormData();
    formData.append("video", file, file.name);
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/source-video`,
      { method: "POST", body: formData }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Upload failed" }));
      item.sourceVideoUploading = false;
      elements.editSourceVideoState.textContent = payload.error || "Upload failed";
      elements.editSourceVideoState.className = "status-chip warn";
      refreshEditSourceVideoState(item);
      return;
    }
    item.hasSourceVideo = true;
    item.sourceVideoUploading = false;
    // Apply video thumbnail if the server generated one
    const payload = await response.json().catch(() => ({}));
    if (payload.thumbnailUrl) {
      const blobUrl = await fetchAssetAsBlobUrl(payload.thumbnailUrl);
      if (blobUrl) {
        if (item.thumbUrl?.startsWith("blob:")) URL.revokeObjectURL(item.thumbUrl);
        item.thumbUrl = blobUrl;
        elements.editPhotoThumb.src = blobUrl;
        renderPhotoList();
      }
    }
    refreshEditSourceVideoState(item);
  } catch {
    item.sourceVideoUploading = false;
    elements.editSourceVideoState.textContent = "Network error";
    elements.editSourceVideoState.className = "status-chip warn";
    refreshEditSourceVideoState(item);
  }
}

async function generateVideoFromVideoForItem(itemId, effect = "none", captionPosition = "bottom", captionStyle = "word-by-word", fontSize = null) {
  const item = state.items.find(e => e.id === itemId);
  if (!item || !state.activeRouteSessionId || !item.serverImageId) return;
  item.videoFromVideoLoading = true;
  item.videoStatus = "";
  refreshEditVideoState(item);
  refreshEditSourceVideoState(item);
  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/video-from-video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effect, captionPosition, captionStyle, ...(fontSize ? { fontSize } : {}) })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      item.videoFromVideoLoading = false;
      item.videoStatus = payload.error || "Failed";
      refreshEditVideoState(item);
      refreshEditSourceVideoState(item);
      return;
    }
    item.videoFromVideoLoading = false;
    item.videoUrl = payload.image?.videoUrl || "";
    item.videoStatus = item.videoUrl ? "Ready" : "";
    refreshEditVideoState(item);
    refreshEditSourceVideoState(item);
    refreshCombineVideoState();
  } catch {
    item.videoFromVideoLoading = false;
    item.videoStatus = "Network error";
    refreshEditVideoState(item);
    refreshEditSourceVideoState(item);
  }
}

function refreshCombineVideoState() {
  const canAct = state.auth.authenticated && !!state.activeRouteSessionId;
  const videosReady = state.items.filter(i => i.videoUrl?.trim()).length;
  const canCombine = canAct && videosReady >= 2 && !state.combineVideoLoading;

  elements.combineControls.hidden = !canAct;
  elements.combineVideoBtn.disabled = !canCombine;
  elements.combineVideoBtn.title = canCombine
    ? `Combine ${videosReady} video(s) into one`
    : videosReady < 2
      ? `At least 2 photos need a generated video (${videosReady} ready)`
      : "";

  // Disable duration input when no transition is selected
  const transition = elements.combineTransitionSelect.value;
  elements.combineTransitionDuration.disabled = !canCombine || transition === "none";
  elements.combineTransitionSelect.disabled = !canCombine;

  // Status chip is always visible (outside the hidden section)
  if (state.combineVideoLoading) {
    elements.combineVideoState.textContent = "Combining…";
    elements.combineVideoState.className = "status-chip loading";
  } else {
    elements.combineVideoState.textContent = state.combineVideoStatus;
    elements.combineVideoState.className = `status-chip${state.combineVideoStatus === "Ready" ? " ok" : state.combineVideoStatus ? " warn" : ""}`;
  }

  // Section only shows when a URL is available
  elements.combineVideoSection.hidden = !state.combineVideoUrl;
  if (state.combineVideoUrl) {
    elements.combineVideoLink.href = state.combineVideoUrl;
    elements.combineVideoLink.hidden = false;
  } else {
    elements.combineVideoLink.hidden = true;
  }
}

// Edit photo overlay  button wiring (done once)
elements.editCloseBtn.addEventListener("click", () => {
  // Flush note/summary edits back to state before closing
  const item = state.items.find(i => i.id === state.editingItemId);
  if (item) {
    const newNote = elements.editNoteInput.value;
    if (newNote !== item.userNote) {
      item.noteSaved = false;
      item.noteStatus = item.serverImageId ? "Unsaved changes" : "Will save after upload";
    }
    item.userNote = newNote;
    item.aiSummary = elements.editSummaryInput.value;
  }
  destroyLocationPicker();
  closeEditPhoto();
  renderPhotoList();
});

elements.editSaveNoteBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  item.userNote = elements.editNoteInput.value;
  await saveNoteForItem(item.id);
  refreshEditNoteState(item);
  renderPhotoList();
});

elements.editNoteInput.addEventListener("input", () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (item) refreshEditSummaryState(item);
});

elements.editSummaryInput.addEventListener("input", () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (item) refreshEditSummaryState(item);
});

elements.editGenerateSummaryBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  await generateSummaryForItem(item.id);
  elements.editSummaryInput.value = item.aiSummary || "";
  refreshEditSummaryState(item);
  refreshEditVideoState(item);
  elements.editCardStatus.textContent = item.message || "";
  elements.editCardStatus.className = `detail-card-status${item.messageType === "ok" ? " ok" : item.messageType === "warn" ? " warn" : ""}`;
  renderPhotoList();
});

elements.editSaveSummaryBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  item.aiSummary = elements.editSummaryInput.value;
  await saveSummaryForItem(item.id);
  refreshEditSummaryState(item);
  refreshEditVideoState(item);
  renderPhotoList();
});

elements.editTranslateSummaryBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  const language = elements.editTranslateLangSelect.value;
  await translateSummaryForItem(item.id, language);
  refreshEditSummaryState(item);
});

elements.editGenerateVideoBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  const effect = elements.editVideoEffectSelect.value || "none";
  const captionPosition = elements.editVideoCaptionPositionSelect.value || "bottom";
  const captionStyle = elements.editVideoCaptionStyleSelect.value || "word-by-word";
  const fontSize = parseInt(elements.editVideoFontSizeInput.value, 10) || null;
  await generateVideoForItem(item.id, effect, captionPosition, captionStyle, fontSize);
});

elements.editSourceVideoInput.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  await uploadSourceVideoForItem(item.id, file);
  e.target.value = "";
});

elements.editMapBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  await generateMapForItem(item.id);
  if (item.mapUrl) {
    elements.editMapImg.src = item.mapUrl;
    elements.editMapImg.hidden = false;
    elements.editMapPlaceholder.hidden = true;
  }
  elements.editCardStatus.textContent = item.message || "";
  elements.editCardStatus.className = `detail-card-status${item.messageType === "ok" ? " ok" : item.messageType === "warn" ? " warn" : ""}`;
  renderPhotoList();
});

elements.editInfoBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item) return;
  await generateInfoForItem(item.id);
  if (item.locationInfo) {
    elements.editInfoContent.innerHTML = buildInfoHtml(item.locationInfo);
    elements.editInfoContent.hidden = false;
    elements.editInfoPlaceholder.hidden = true;
  }
  elements.editCardStatus.textContent = item.message || "";
  elements.editCardStatus.className = `detail-card-status${item.messageType === "ok" ? " ok" : item.messageType === "warn" ? " warn" : ""}`;
  renderPhotoList();
});

// Handle browser back / hash changes
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#edit/") && state.editingItemId) {
    const item = state.items.find(i => i.id === state.editingItemId);
    if (item) {
      const newNote = elements.editNoteInput.value;
      if (newNote !== item.userNote) {
        item.noteSaved = false;
        item.noteStatus = item.serverImageId ? "Unsaved changes" : "Will save after upload";
      }
      item.userNote  = newNote;
      item.aiSummary = elements.editSummaryInput.value;
    }
    destroyLocationPicker();
    closeEditPhoto();
    renderPhotoList();
  }
});

//  PER-ITEM ACTIONS 

async function markItemsByUploadResult(payload, localFiles) {
  // Build a map: filename → [{image, assets}] (queue for duplicates)
  const uploadedQueueByName = new Map();
  (payload.uploadedImages || []).forEach(entry => {
    const fileName = entry.image?.originalFilename;
    if (!fileName) return;
    if (!uploadedQueueByName.has(fileName)) uploadedQueueByName.set(fileName, []);
    uploadedQueueByName.get(fileName).push(entry);
  });

  const failedMap = new Map((payload.failedImages || []).map(x => [x.filename, x.reason]));

  for (const file of localFiles) {
    const item = state.items.find(e => e.localFingerprint === fileFingerprint(file));
    if (!item) continue;
    const queue = uploadedQueueByName.get(file.name);
    if (queue && queue.length > 0) {
      const entry = queue.shift();
      const img = entry.image;
      const assets = entry.assets || [];

      item.persisted     = true;
      item.serverImageId = img.id;
      item.userNote      = img.userNote || item.userNote || "";
      item.noteSaved     = true;
      item.noteStatus    = img.userNote ? "Saved" : "No note";
      item.message       = "Stored on server.";
      item.messageType   = "ok";

      if (img.isVideoItem) {
        item.isVideo = true;
        item.hasSourceVideo = true;
        item.sourceVideoFilename = item.originalFilename;
        item.sourceVideoStatus = "Uploaded";
      }

      // Apply GPS map and location info from upload response
      const hasGps = Boolean(img.gpsLat && img.gpsLng);
      item.hasGps = hasGps;
      if (hasGps) {
        const mapAsset = assets.find(a => a.assetType === "IMAGE_MAP");
        if (mapAsset?.url) {
          if (item.mapUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mapUrl);
          item.mapUrl = await fetchAssetAsBlobUrl(mapAsset.url).catch(() => null);
        }
        item.locationInfo = img.locationInfoJson ? JSON.parse(img.locationInfoJson) : null;
      }

      // Apply image analysis result from upload response
      item.imageAnalysis = img.imageAnalysis || null;

      // Apply AI-generated caption from upload response
      if (img.aiSummary) {
        item.aiSummary = img.aiSummary;
      }

      continue;
    }
    const reason = failedMap.get(file.name);
    if (reason) {
      item.persisted   = false;
      item.noteSaved   = false;
      item.noteStatus  = "Not saved";
      item.message     = `Upload failed: ${reason}`;
      item.messageType = "warn";
    }
  }
}

async function saveNoteForItem(itemId) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.noteSaved  = false;
    item.noteStatus = "Sign in and upload first";
    renderPhotoList();
    return;
  }

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/note`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userNote: item.userNote || "" })
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not save note" }));
      item.noteSaved  = false;
      item.noteStatus = payload.error || "Could not save note";
      renderPhotoList();
      return;
    }
    const payload = await response.json();
    item.userNote   = payload.image?.userNote || "";
    item.noteSaved  = true;
    item.noteStatus = "Saved";
    renderPhotoList();
  } catch {
    item.noteSaved  = false;
    item.noteStatus = "Network error";
    renderPhotoList();
  }
}

async function generateSummaryForItem(itemId) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.summaryStatus = "Sign in and upload first";
    renderPhotoList();
    return;
  }

  if (!item.userNote?.trim()) {
    item.summaryStatus = "Add a note first";
    renderPhotoList();
    return;
  }

  item.summaryStatus  = "Generating...";
  item.summaryLoading = true;
  renderPhotoList();

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/summary`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not generate summary" }));
      item.summaryStatus  = payload.error || "Could not generate summary";
      item.summaryLoading = false;
      renderPhotoList();
      return;
    }
    const payload = await response.json();
    item.aiSummary       = payload.image?.aiSummary || "";
    item.summaryGenerated = true;
    item.summaryStatus   = "Generated";
    item.summaryLoading  = false;
    renderPhotoList();
  } catch {
    item.summaryStatus  = "Network error";
    item.summaryLoading = false;
    renderPhotoList();
  }
}

async function generateVideoForItem(itemId, effect = "none", captionPosition = "bottom", captionStyle = "word-by-word", fontSize = null) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;

  // Video items have no source image — route directly to video-from-video
  if (item.isVideo) {
    await generateVideoFromVideoForItem(itemId, effect, captionPosition, captionStyle, fontSize);
    return;
  }

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.videoStatus = "Sign in and upload first";
    refreshEditVideoState(item);
    return;
  }

  if (!item.aiSummary?.trim()) {
    item.videoStatus = "Generate an AI summary first";
    refreshEditVideoState(item);
    return;
  }

  item.videoStatus  = "";
  item.videoLoading = true;
  refreshEditVideoState(item);

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effect, captionPosition, captionStyle, ...(fontSize ? { fontSize } : {}) })
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not generate video" }));
      item.videoStatus  = payload.error || "Could not generate video";
      item.videoLoading = false;
      refreshEditVideoState(item);
      return;
    }
    const payload = await response.json();
    item.videoUrl     = payload.image?.videoUrl || "";
    item.videoStatus  = item.videoUrl ? "Ready" : "No URL returned";
    item.videoLoading = false;
    refreshEditVideoState(item);
    renderPhotoList();
  } catch {
    item.videoStatus  = "Network error";
    item.videoLoading = false;
    refreshEditVideoState(item);
  }
}

async function saveSummaryForItem(itemId) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.summaryStatus = "Sign in and upload first";
    renderPhotoList();
    return;
  }

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/summary`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiSummary: item.aiSummary || "" })
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not save summary" }));
      item.summaryStatus = payload.error || "Could not save summary";
      renderPhotoList();
      return;
    }
    const payload = await response.json();
    item.aiSummary        = payload.image?.aiSummary || "";
    item.summaryGenerated = false;
    item.summaryStatus    = "Saved";
    renderPhotoList();
  } catch {
    item.summaryStatus = "Network error";
    renderPhotoList();
  }
}

async function translateSummaryForItem(itemId, language) {
  const item = state.items.find(e => e.id === itemId);
  if (!item) return;

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    item.summaryStatus = "Sign in and upload first";
    refreshEditSummaryState(item);
    return;
  }

  const textToTranslate = elements.editSummaryInput.value.trim();
  if (!textToTranslate) {
    item.summaryStatus = "Add or generate a summary first";
    refreshEditSummaryState(item);
    return;
  }

  item.translateLoading = true;
  item.summaryStatus = "";
  refreshEditSummaryState(item);

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/translate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate, language })
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not translate" }));
      item.summaryStatus   = payload.error || "Could not translate";
      item.translateLoading = false;
      refreshEditSummaryState(item);
      return;
    }
    const payload = await response.json();
    elements.editSummaryInput.value = payload.translation || textToTranslate;
    item.summaryStatus    = "Translated — save to persist";
    item.translateLoading = false;
    refreshEditSummaryState(item);
  } catch {
    item.summaryStatus    = "Network error";
    item.translateLoading = false;
    refreshEditSummaryState(item);
  }
}

async function combineVideos() {
  if (!state.auth.authenticated || !state.activeRouteSessionId) {
    state.combineVideoStatus = "Sign in first";
    refreshCombineVideoState();
    return;
  }

  const videoCount = state.items.filter(i => i.videoUrl?.trim()).length;
  if (videoCount < 2) {
    state.combineVideoStatus = `Need at least 2 videos (${videoCount} ready)`;
    refreshCombineVideoState();
    return;
  }

  const transition = elements.combineTransitionSelect.value;
  const transitionDuration = parseFloat(elements.combineTransitionDuration.value) || 0.5;

  state.combineVideoLoading = true;
  state.combineVideoStatus = "";
  refreshCombineVideoState();

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/combine-video`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition, transitionDuration })
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not combine videos" }));
      state.combineVideoStatus  = payload.error || "Could not combine videos";
      state.combineVideoLoading = false;
      refreshCombineVideoState();
      return;
    }
    const payload = await response.json();
    state.combineVideoUrl     = payload.combinedVideoUrl || "";
    state.combineVideoStatus  = state.combineVideoUrl ? "Ready" : "No URL returned";
    state.combineVideoLoading = false;
    refreshCombineVideoState();
  } catch {
    state.combineVideoStatus  = "Network error";
    state.combineVideoLoading = false;
    refreshCombineVideoState();
  }
}

//  AUTH / SESSION ─

async function refreshAuth() {
  try {
    const response = await fetch("/auth/me");
    const payload  = await response.json();
    state.auth.authenticated = Boolean(payload.authenticated);
    state.auth.user  = payload.user || null;
    state.auth.guest = Boolean(payload.guest);
  } catch {
    state.auth.authenticated = false;
    state.auth.user  = null;
    state.auth.guest = false;
  }
  updateAuthUi();
}

async function loadSavedRoutes() {
  if (!state.auth.authenticated) return;
  try {
    const response = await fetch("/api/user/routes");
    if (!response.ok) { updateStatus("Failed to load saved routes."); return; }
    const payload = await response.json();
    state.savedRoutes = payload.routeSessions || [];
    renderSavedRoutes();
  } catch {
    updateStatus("Network error loading saved routes.");
  }
}

async function startRouteSession() {
  if (!state.auth.authenticated) { updateStatus("Please sign in first."); return; }
  try {
    const titleInput = window.prompt("Route display name:", "My Route");
    const title = typeof titleInput === "string" && titleInput.trim().length > 0
      ? titleInput.trim() : undefined;
    const response = await fetch("/api/user/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(title ? { title } : {})
    });
    if (!response.ok) { updateStatus("Could not create route session."); return; }
    const payload = await response.json();
    state.activeRouteSessionId = payload.routeSession.id;
    updateAuthUi();
    updateStatus(`Route session "${payload.routeSession.title}" created.`);
    await loadSavedRoutes();
  } catch {
    updateStatus("Network error creating route session.");
  }
}

async function ensureActiveRoute() {
  if (!state.auth.authenticated) {
    updateStatus("Sign in to upload photos.");
    return false;
  }
  if (state.activeRouteSessionId) return true;
  updateStatus("Creating a new route…");
  try {
    const title = `Route ${new Date().toLocaleDateString("en-GB")}`;
    const response = await fetch("/api/user/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    if (!response.ok) { updateStatus("Could not create route session."); return false; }
    const payload = await response.json();
    state.activeRouteSessionId = payload.routeSession.id;
    updateAuthUi();
    await loadSavedRoutes();
    return true;
  } catch {
    updateStatus("Network error creating route.");
    return false;
  }
}

async function persistFilesToActiveSession(localFiles) {
  if (!state.auth.authenticated || !state.activeRouteSessionId || localFiles.length === 0) return;

  const localNotes = localFiles.map(file => {
    const item = state.items.find(e => e.localFingerprint === fileFingerprint(file));
    return item?.userNote || "";
  });

  const formData = new FormData();
  localFiles.forEach(f => formData.append("images", f, f.name));
  formData.append("noteByIndex", JSON.stringify(localNotes));

  try {
    const response = await fetch(`/api/user/routes/${state.activeRouteSessionId}/images`, {
      method: "POST",
      body: formData
    });
    const payload = await response.json().catch(() => ({ error: "Upload failed" }));
    if (!response.ok && response.status !== HTTP_PARTIAL) {
      updateStatus(payload.error || "Could not persist uploaded images.");
      localFiles.forEach(file => {
        const item = state.items.find(e => e.localFingerprint === fileFingerprint(file));
        if (item) { item.persisted = false; item.message = payload.error || "Upload failed."; item.messageType = "warn"; }
      });
      renderPhotoList();
      return;
    }
    await markItemsByUploadResult(payload, localFiles);
    renderPhotoList();
    if (response.status === HTTP_PARTIAL || (payload.failed || 0) > 0) {
      updateStatus(`Partial upload: ${payload.added || 0} stored, ${payload.failed || 0} failed.`);
    } else {
      updateStatus("Files persisted to active route session.");
    }
    await loadSavedRoutes();
  } catch {
    updateStatus("Network error persisting images.");
    localFiles.forEach(file => {
      const item = state.items.find(e => e.localFingerprint === fileFingerprint(file));
      if (item) { item.persisted = false; item.message = "Network error."; item.messageType = "warn"; }
    });
    renderPhotoList();
  }
}

async function fetchAssetAsBlobUrl(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function restoreRoute(routeId) {
  try {
    const response = await fetch(`/api/user/routes/${routeId}`);
    if (!response.ok) { updateStatus("Could not restore route."); return; }
    const payload = await response.json();
    const routeSession = payload.routeSession;
    state.activeRouteSessionId = routeSession.id;

    state.items.forEach(item => {
      if (item.thumbUrl?.startsWith("blob:")) URL.revokeObjectURL(item.thumbUrl);
      if (item.mapUrl?.startsWith("blob:"))  URL.revokeObjectURL(item.mapUrl);
    });

    const restoredItems = [];
    for (const image of routeSession.images) {
      const original  = image.assets.find(a => a.assetType === "ORIGINAL_IMAGE");
      const map       = image.assets.find(a => a.assetType === "IMAGE_MAP");
      const vidThumb  = image.assets.find(a => a.assetType === "VIDEO_THUMBNAIL");
      const isVideo   = !original && image.hasSourceVideo;
      const thumbUrl  = original?.url
        ? await fetchAssetAsBlobUrl(original.url)
        : (vidThumb?.url ? await fetchAssetAsBlobUrl(vidThumb.url) : (isVideo ? VIDEO_PLACEHOLDER_THUMB : ""));
      const mapUrl    = map?.url ? await fetchAssetAsBlobUrl(map.url) : null;
      restoredItems.push({
        id: image.id, serverImageId: image.id, file: null, localFingerprint: null,
        originalFilename: image.originalFilename, byteSize: original?.byteSize || 0,
        mimeType: image.mimeType, thumbUrl, timestamp: image.capturedAt || image.createdAt,
        isVideo,
        mapUrl, locationInfo: image.locationInfoJson ? JSON.parse(image.locationInfoJson) : null,
        imageAnalysis: image.imageAnalysis || null,
        userNote: image.userNote || "", noteSaved: true,
        noteStatus: image.userNote ? "Saved" : "No note",
        aiSummary: image.aiSummary || "", summaryGenerated: false,
        summaryStatus: image.aiSummary ? "Saved" : "", summaryLoading: false, translateLoading: false,
        videoUrl: image.videoUrl || "", videoLoading: false,
        videoStatus: image.videoUrl ? "Ready" : "",
        videoFromVideoLoading: false,
        hasSourceVideo: image.hasSourceVideo || false,
        sourceVideoFilename: isVideo ? image.originalFilename : "",
        sourceVideoUploading: false,
        sourceVideoStatus: image.hasSourceVideo ? "Uploaded" : "",
        persisted: true, hasGps: Boolean(image.gpsLat && image.gpsLng),
        message: "Restored from saved route.", messageType: "ok"
      });
    }
    state.items = restoredItems;
    state.dirty = false;
    const routeMapAsset = routeSession.routeMapAssets?.[0];
    clearRoutePreview();
    if (routeSession.combinedVideoUrl) {
      state.combineVideoUrl = routeSession.combinedVideoUrl;
      state.combineVideoStatus = "Ready";
    }
    if (routeMapAsset?.url) {
      const routeBlobUrl = await fetchAssetAsBlobUrl(routeMapAsset.url);
      if (routeBlobUrl) {
        state.routeBlobUrl = routeBlobUrl;
        elements.routePreview.src = routeBlobUrl;
        elements.routePreview.hidden = false;
        elements.routePreviewEmpty.hidden = true;
        elements.routeDownload.href = routeBlobUrl;
        elements.routeDownload.classList.remove("btn-disabled");
      }
    }

    updateAuthUi();
    renderSavedRoutes();
    renderPhotoList();
    updateStatus("Route restored.");
  } catch {
    updateStatus("Network error restoring route.");
  }
}

async function deleteRoute(routeId) {
  try {
    const response = await fetch(`/api/user/routes/${routeId}`, { method: "DELETE" });
    if (!response.ok) { updateStatus("Could not delete route."); return; }
    if (state.activeRouteSessionId === routeId) {
      state.activeRouteSessionId = null;
      clearRoutePreview();
    }
    await loadSavedRoutes();
    updateAuthUi();
    updateStatus("Route deleted.");
  } catch {
    updateStatus("Network error deleting route.");
  }
}

//  MAP / INFO GENERATION 

async function generateInfoForItem(id) {
  const item = state.items.find(e => e.id === id);
  if (!item) return;
  item.message = "Loading location info..."; item.messageType = ""; renderPhotoList();
  try {
    const body = await getItemImageBody(item);
    if (!body) {
      item.message = "No image data available."; item.messageType = "warn"; renderPhotoList(); return;
    }
    const response = await fetch("/api/getinfo", {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Location lookup failed." }));
      item.locationInfo = null; item.message = `No location info: ${data.error || "Failed."}`; item.messageType = "warn";
    } else {
      item.locationInfo = await response.json();
      item.message = "Location info loaded."; item.messageType = "ok";
    }
    renderPhotoList();
  } catch {
    item.message = "Network error loading location info."; item.messageType = "warn"; renderPhotoList();
  }
}

async function generateMapForItem(id) {
  const item = state.items.find(e => e.id === id);
  if (!item) return;
  item.message = "Generating map..."; item.messageType = ""; renderPhotoList();
  try {
    const body = await getItemImageBody(item);
    if (!body) {
      item.message = "No image data available."; item.messageType = "warn"; renderPhotoList(); return;
    }
    const response = await fetch("/api/getmap?width=460&height=280", {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Map generation failed." }));
      item.message = `No map: ${data.error || "Failed."}`; item.messageType = "warn"; item.hasGps = false;
    } else {
      if (item.mapUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mapUrl);
      const blob = await response.blob();
      item.mapUrl = URL.createObjectURL(blob); item.hasGps = true;
      item.message = "Map generated."; item.messageType = "ok";
    }
    renderPhotoList();
  } catch {
    item.message = "Network error generating map."; item.messageType = "warn"; renderPhotoList();
  }
}

//  ROUTE GENERATION 

async function generateOrderedRoute() {
  if (state.items.length < 2) { updateStatus("Need at least two photos to generate a route."); return; }
  updateStatus("Generating route map..."); clearRoutePreview();

  if (state.auth.authenticated && state.activeRouteSessionId) {
    try {
      const response = await fetch(
        `/api/user/routes/${state.activeRouteSessionId}/generate?width=1400&height=780`,
        { method: "POST" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Route generation failed." }));
        updateStatus(payload.error || "Route generation failed."); return;
      }
      const payload = await response.json();
      const routeUrl = payload.routeAsset?.url;
      if (!routeUrl) { updateStatus("No route asset returned."); return; }
      const routeBlob = await fetchAssetAsBlobUrl(routeUrl);
      if (!routeBlob) { updateStatus("Could not download route asset."); return; }
      state.routeBlobUrl = routeBlob;
      elements.routePreview.src = routeBlob;
      elements.routePreview.hidden = false;
      elements.routePreviewEmpty.hidden = true;
      elements.routeDownload.href = routeBlob;
      elements.routeDownload.classList.remove("btn-disabled");
      updateStatus("Route map generated from saved session.");
      await loadSavedRoutes();
    } catch {
      updateStatus("Network error generating route map.");
    }
    return;
  }

  const localFiles = state.items.filter(i => i.file).map(i => i.file);
  const formData = new FormData();
  localFiles.forEach(f => formData.append("images", f, f.name));
  try {
    const response = await fetch("/api/getroute-set?width=1400&height=780", { method: "POST", body: formData });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Route generation failed." }));
      updateStatus(data.error || "Route generation failed."); return;
    }
    const routeBlob = await response.blob();
    state.routeBlobUrl = URL.createObjectURL(routeBlob);
    elements.routePreview.src = state.routeBlobUrl;
    elements.routePreview.hidden = false;
    elements.routePreviewEmpty.hidden = true;
    elements.routeDownload.href = state.routeBlobUrl;
    elements.routeDownload.classList.remove("btn-disabled");
    updateStatus(`Route map generated with ${response.headers.get("X-Route-Points") || "n"} point(s).`);
  } catch {
    updateStatus("Network error generating route map.");
  }
}

//  ITEM MANAGEMENT 

async function removeItem(id) {
  const index = state.items.findIndex(i => i.id === id);
  if (index < 0) return;
  const item = state.items[index];

  const label = item.originalFilename || item.file?.name || "this image";
  if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

  if (item.serverImageId && state.auth.authenticated && state.activeRouteSessionId) {
    try {
      const response = await fetch(
        `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Could not delete image." }));
        updateStatus(payload.error || "Could not delete image from server.");
        return;
      }
    } catch {
      updateStatus("Network error deleting image.");
      return;
    }
  }

  state.items.splice(index, 1);
  if (item.thumbUrl?.startsWith("blob:")) URL.revokeObjectURL(item.thumbUrl);
  if (item.mapUrl?.startsWith("blob:"))  URL.revokeObjectURL(item.mapUrl);
  markRouteStale();
  renderPhotoList();
  updateStatus(state.items.length > 0 ? `${state.items.length} photo(s) loaded.` : "No photos loaded.");
}

async function reorderItems(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const fromIndex = state.items.findIndex(i => i.id === fromId);
  const toIndex   = state.items.findIndex(i => i.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = state.items.splice(fromIndex, 1);
  state.items.splice(toIndex, 0, moved);
  markRouteStale();
  renderPhotoList();

  if (!state.auth.authenticated || !state.activeRouteSessionId) {
    updateStatus("Order updated (local only — sign in to persist).");
    return;
  }

  const orderedIds = state.items
    .filter(i => i.serverImageId)
    .map(i => i.serverImageId);

  if (orderedIds.length === 0) {
    updateStatus("Order updated.");
    return;
  }

  try {
    const response = await fetch(`/api/user/routes/${state.activeRouteSessionId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: orderedIds })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not save order." }));
      updateStatus(payload.error || "Could not save new order.");
      return;
    }
    updateStatus("Order saved.");
  } catch {
    updateStatus("Network error saving order.");
  }
}

function clearAll() {
  state.items.forEach(item => {
    if (item.thumbUrl?.startsWith("blob:")) URL.revokeObjectURL(item.thumbUrl);
    if (item.mapUrl?.startsWith("blob:"))  URL.revokeObjectURL(item.mapUrl);
  });
  state.items = [];
  state.dirty = false;
  elements.input.value = "";
  clearRoutePreview();
  renderPhotoList();
  updateStatus("No photos loaded.");
}

async function addFiles(files) {
  const additions = [];
  for (const file of files) {
    const isVideo = file.type.startsWith("video/");
    const thumbUrl = isVideo ? VIDEO_PLACEHOLDER_THUMB : URL.createObjectURL(file);
    const timestamp = isVideo ? (file.lastModified || Date.now()) : await readPhotoTimestamp(file);
    additions.push({
      id: createId(), serverImageId: null, file,
      localFingerprint: fileFingerprint(file),
      originalFilename: file.name, byteSize: file.size,
      mimeType: file.type || "unknown", thumbUrl, timestamp,
      isVideo,
      mapUrl: null, locationInfo: null, imageAnalysis: null,
      userNote: "", noteSaved: false, noteStatus: "",
      aiSummary: "", summaryGenerated: false, summaryStatus: "", summaryLoading: false, translateLoading: false,
      videoUrl: "", videoLoading: false, videoStatus: "",
      videoFromVideoLoading: false,
      hasSourceVideo: false, sourceVideoFilename: "", sourceVideoUploading: false, sourceVideoStatus: "",
      persisted: state.auth.authenticated && state.activeRouteSessionId ? null : false,
      hasGps: null, message: "", messageType: ""
    });
  }
  state.items.push(...additions);
  state.items.sort((a, b) => a.timestamp - b.timestamp);
  markRouteStale();
  renderPhotoList();
  updateStatus(`${state.items.length} photo(s) loaded — uploading…`);
  if (await ensureActiveRoute()) {
    await persistFilesToActiveSession(files);
  }
}

//  EVENT LISTENERS 

elements.input.addEventListener("change", async e => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  updateStatus("Reading photo timestamps...");
  await addFiles(files);
});

elements.routeBtn.addEventListener("click", generateOrderedRoute);
elements.regenerateRouteBtn.addEventListener("click", generateOrderedRoute);
elements.combineVideoBtn.addEventListener("click", combineVideos);
elements.combineTransitionSelect.addEventListener("change", refreshCombineVideoState);
elements.saveChangesBtn.addEventListener("click", saveChanges);
elements.clearBtn.addEventListener("click", clearAll);
elements.newSessionBtn.addEventListener("click", startRouteSession);
elements.reloadRoutesBtn.addEventListener("click", loadSavedRoutes);

elements.logoutBtn.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  state.auth = { authenticated: false, user: null, guest: false };
  state.activeRouteSessionId = null;
  state.savedRoutes = [];
  updateAuthUi();
  renderSavedRoutes();
  updateStatus("Signed out.");
});

elements.guestLoginBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("/auth/guest", { method: "POST" });
    if (!response.ok) { updateStatus("Could not start guest session."); return; }
    await refreshAuth();
    await loadSavedRoutes();
    updateStatus("Guest session started.");
  } catch {
    updateStatus("Network error starting guest session.");
  }
});

//  LOCATION PICKER 

function initLocationPicker(initialLat, initialLng) {
  if (leafletPickerMap) {
    leafletPickerMap.remove();
    leafletPickerMap = null;
    leafletPickerMarker = null;
  }
  pickedLocation = null;
  elements.editSaveLocationBtn.disabled = true;
  elements.editLocationCoords.textContent = "No location selected";

  const hasInitial = Number.isFinite(initialLat) && Number.isFinite(initialLng);
  const centerLat = hasInitial ? initialLat : 20;
  const centerLng = hasInitial ? initialLng : 0;
  const zoom = hasInitial ? 13 : 2;

  leafletPickerMap = L.map("edit-location-map").setView([centerLat, centerLng], zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "\u00a9 OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(leafletPickerMap);

  if (hasInitial) {
    leafletPickerMarker = L.marker([initialLat, initialLng]).addTo(leafletPickerMap);
    pickedLocation = { lat: initialLat, lng: initialLng };
    elements.editLocationCoords.textContent = `Lat ${initialLat.toFixed(6)}, Lng ${initialLng.toFixed(6)}`;
    elements.editSaveLocationBtn.disabled = false;
  }

  leafletPickerMap.on("click", e => {
    const { lat, lng } = e.latlng;
    pickedLocation = { lat, lng };
    elements.editLocationCoords.textContent = `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`;
    elements.editSaveLocationBtn.disabled = false;
    if (leafletPickerMarker) {
      leafletPickerMarker.setLatLng([lat, lng]);
    } else {
      leafletPickerMarker = L.marker([lat, lng]).addTo(leafletPickerMap);
    }
  });
}

function destroyLocationPicker() {
  if (leafletPickerMap) {
    leafletPickerMap.remove();
    leafletPickerMap = null;
    leafletPickerMarker = null;
  }
  pickedLocation = null;
  elements.editLocationPicker.hidden = true;
  elements.editSaveLocationBtn.disabled = true;
  elements.editLocationCoords.textContent = "No location selected";
}

elements.editPickLocationBtn.addEventListener("click", () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  const initialLat = item?.locationInfo?.gps?.lat ?? null;
  const initialLng = item?.locationInfo?.gps?.lng ?? null;
  elements.editLocationPicker.hidden = false;
  // Allow the browser to render the container before Leaflet measures it
  requestAnimationFrame(() => initLocationPicker(initialLat, initialLng));
});

elements.editCancelLocationBtn.addEventListener("click", destroyLocationPicker);

elements.editSaveLocationBtn.addEventListener("click", async () => {
  const item = state.items.find(i => i.id === state.editingItemId);
  if (!item || !pickedLocation) return;

  if (!state.auth.authenticated || !state.activeRouteSessionId || !item.serverImageId) {
    elements.editCardStatus.textContent = "Upload the image to a route session first.";
    elements.editCardStatus.className = "detail-card-status warn";
    return;
  }

  const { lat, lng } = pickedLocation;
  elements.editSaveLocationBtn.disabled = true;
  elements.editCardStatus.textContent = "Saving location\u2026";
  elements.editCardStatus.className = "detail-card-status";

  try {
    const response = await fetch(
      `/api/user/routes/${state.activeRouteSessionId}/images/${item.serverImageId}/location`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng })
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not save location." }));
      elements.editCardStatus.textContent = payload.error || "Could not save location.";
      elements.editCardStatus.className = "detail-card-status warn";
      elements.editSaveLocationBtn.disabled = false;
      return;
    }

    const payload = await response.json();
    item.hasGps = true;
    item.locationInfo = payload.locationInfo;

    if (payload.mapAsset?.url) {
      const newMapBlobUrl = await fetchAssetAsBlobUrl(payload.mapAsset.url);
      if (newMapBlobUrl) {
        if (item.mapUrl?.startsWith("blob:")) URL.revokeObjectURL(item.mapUrl);
        item.mapUrl = newMapBlobUrl;
        elements.editMapImg.src = newMapBlobUrl;
        elements.editMapImg.hidden = false;
        elements.editMapPlaceholder.hidden = true;
      }
    }

    if (item.locationInfo) {
      elements.editInfoContent.innerHTML = buildInfoHtml(item.locationInfo);
      elements.editInfoContent.hidden = false;
      elements.editInfoPlaceholder.hidden = true;
    }

    elements.editCardStatus.textContent = "Location saved.";
    elements.editCardStatus.className = "detail-card-status ok";
    destroyLocationPicker();
    renderPhotoList();
  } catch {
    elements.editCardStatus.textContent = "Network error saving location.";
    elements.editCardStatus.className = "detail-card-status warn";
    elements.editSaveLocationBtn.disabled = false;
  }
});

//  INIT 

renderPhotoList();
refreshAuth().then(loadSavedRoutes);

// Restore edit overlay if page is reopened with a hash
if (location.hash.startsWith("#edit/")) {
  const itemId = location.hash.slice(6);
  const item = state.items.find(i => i.id === itemId);
  if (item) openEditPhoto(itemId);
}