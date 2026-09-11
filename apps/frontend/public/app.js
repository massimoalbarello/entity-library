"use strict";
const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  photo: "M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M15 7h.01",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  camera: "M3 6h4l2-3h6l2 3h4v15H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  key: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M14 10h7v4 M18 10v3",
  settings:
    "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  plus: "M12 5v14 M5 12h14",
  leaf: "M4 20C1 7 10 2 21 3c0 12-6 20-17 17z M4 20L16 8",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.photo}"/></svg>`;
const brand = `<div class="brand"><span class="brand-mark">${icon("leaf")}</span>Entity Library</div>`;
let signedIn = false,
  modelReady = false,
  photos = [],
  query = "",
  timer,
  searchAbort,
  generation = 0,
  busy = false,
  allLoaded = false,
  currentView = "photos";
function toast(message) {
  let box = $("#toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.hidden = false;
  box.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.remove(), 5000);
}
async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { "X-Requested-With": "EntityLibrary", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
async function login() {
  signedIn = false;
  clearTimeout(timer);
  const owner = await api("/api/owner");
  $("#app").innerHTML =
    `<div class="login"><section class="login-story">${brand}<div><div class="eyebrow">Your photos, found again</div><h1>A place for everything you’ve seen.</h1><p>Save a photo. Find it later with a few words — a banana, your coffee cup, a day at the beach.</p><div class="login-drawing"><div class="mini-card">${icon("leaf")}</div><div class="mini-card">${icon("camera")}</div><div class="mini-card">${icon("photo")}</div></div></div><div class="sub">A private photo library, with search built in.</div></section><section class="login-form"><div class="eyebrow">Entity Library</div><h2>${owner.ownerRegistered ? "Welcome back." : "Make room for your photos."}</h2><p class="sub">${owner.ownerRegistered ? "Use your passkey to open your library." : "Create a passkey to make this library yours. No password to remember."}</p><button id="login" class="primary">${icon("key")}${owner.ownerRegistered ? "Sign in with passkey" : "Create your passkey"}</button><p id="login-error" class="sub" role="alert"></p><p class="login-note">Photos and search stay on your own instance.</p></section></div>`;
  $("#login").onclick = async () => {
    const button = $("#login");
    button.disabled = true;
    try {
      const result = owner.ownerRegistered
        ? await EntityAuth.signIn.passkey()
        : await EntityAuth.passkey.addPasskey({
            createSession: true,
            name: "Primary passkey",
          });
      if (result.error)
        throw Error(result.error.message || "Passkey setup failed");
      const session = await EntityAuth.getSession();
      if (!session.data) throw Error("Sign in to continue.");
      shell();
    } catch (e) {
      $("#login-error").textContent = e.message;
      button.disabled = false;
    }
  };
}
async function signOut() {
  await EntityAuth.signOut();
  signedIn = false;
  modelReady = false;
  photos = [];
  query = "";
  generation++;
  searchAbort?.abort();
  clearTimeout(timer);
  EntityCamera.close();
  document.querySelectorAll("dialog").forEach((d) => d.remove());
  await login();
}
function shell() {
  signedIn = true;
  currentView = "photos";
  $("#app").innerHTML =
    `<a class="skip" href="#main">Skip to photos</a><div class="shell"><aside class="sidebar">${brand}<nav aria-label="Main navigation"><a class="nav-item active" href="#photos" id="nav-photos">${icon("photo")}<span class="nav-word">All photos</span><span id="photo-count">0</span></a><a class="nav-item" href="#settings" id="nav-settings" aria-label="Settings">${icon("settings")}<span class="nav-word">Settings</span><span></span></a></nav><div class="sidebar-foot">Your own little collection.<br><button class="quiet" id="signout">Sign out</button></div></aside><main id="main" class="main"></main></div>`;
  $("#signout").onclick = () => signOut().catch((e) => toast(e.message));
  $("#nav-photos").onclick = (e) => {
    e.preventDefault();
    showPhotos();
  };
  $("#nav-settings").onclick = (e) => {
    e.preventDefault();
    settings();
  };
  showPhotos();
  poll();
}
function showPhotos() {
  currentView = "photos";
  $(".nav-item.active")?.classList.remove("active");
  $("#nav-photos").classList.add("active");
  $("#main").innerHTML =
    `<header class="page-head"><div><div class="eyebrow">Your collection</div><h1>All photos</h1><p class="sub">Remember the thing. Find the photo.</p></div><div class="actions"><button id="camera" class="camera-button" aria-label="Take a photo">${icon("camera")}<span>Camera</span></button><button id="add" class="primary">${icon("plus")}Add photos</button><input type="file" id="files" accept="image/jpeg,image/png" multiple hidden></div></header><div id="model-notice" role="status"></div><form class="search" role="search">${icon("search")}<input id="query" aria-label="Search photos" placeholder="Try “banana”, “a red car”, or “a sunny beach”…" maxlength="240" value="${esc(query)}"><button type="button" class="quiet clear" id="clear" aria-label="Clear search">×</button><button type="submit" class="primary">Search</button></form><div class="examples">Try a search <button class="chip" data-query="banana">banana</button><button class="chip" data-query="cat">cat</button><button class="chip" data-query="coffee cup">coffee cup</button><button class="chip" data-query="beach">beach</button></div><div class="results-head"><span id="results-title">All photos</span><span id="results-count"></span></div><div id="grid" class="grid"></div><div id="empty"></div><button id="more" class="load-more" hidden>Load more</button>`;
  $("#add").onclick = () => $("#files").click();
  $("#files").onchange = (e) => {
    upload([...e.target.files]);
    e.target.value = "";
  };
  $("#camera").onclick = () =>
    EntityCamera.open({ onPhoto: (file) => upload([file]), onError: toast });
  $("form.search").onsubmit = (e) => {
    e.preventDefault();
    runSearch($("#query").value);
  };
  $("#clear").onclick = () => runSearch("");
  document
    .querySelectorAll("[data-query]")
    .forEach((b) => (b.onclick = () => runSearch(b.dataset.query)));
  $("#more").onclick = loadMore;
  const main = $("#main");
  main.ondragover = (e) => {
    e.preventDefault();
    main.classList.add("drop-active");
  };
  main.ondragleave = () => main.classList.remove("drop-active");
  main.ondrop = (e) => {
    e.preventDefault();
    main.classList.remove("drop-active");
    upload([...e.dataTransfer.files]);
  };
  renderPhotos();
  if (modelReady) runSearch(query);
}
function renderPhotos() {
  if (!signedIn || currentView !== "photos") return;
  $("#results-title").textContent = query
    ? `Results for “${query}”`
    : "All photos";
  $("#results-count").textContent =
    `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;
  $("#grid").innerHTML = photos
    .map(
      (p) =>
        `<button class="photo-card" data-id="${p.id}"><div class="picture">${p.status === "ready" ? `<img src="/assets/photos/${p.id}" loading="lazy" alt="${esc(p.filename)}">` : `<div class="photo-state ${p.status === "error" ? "error" : ""}">${p.status === "error" ? "Could not read photo" : "Preparing photo…"}</div>`}</div><div class="caption"><div class="filename">${esc(p.filename)}</div><div class="photo-tags">${esc(p.description?.caption || (p.description?.status === "error" ? "Description needs attention" : p.status === "ready" ? "Writing a description…" : p.status))}</div></div></button>`,
    )
    .join("");
  $("#grid")
    .querySelectorAll("[data-id]")
    .forEach((b) => (b.onclick = () => detail(b.dataset.id)));
  $("#empty").innerHTML = photos.length
    ? ""
    : `<div class="empty"><div class="empty-icon">${icon(query ? "search" : "photo")}</div><h2>${query ? "Nothing here just yet." : "Start with a photo."}</h2><p class="sub">${query ? "Try fewer words or describe the colors, objects, or setting." : "Upload a few photos or take one with your camera. Then find the things inside with a simple search."}</p>${query ? "" : '<button class="primary" id="empty-add">Add your first photos</button>'}</div>`;
  $("#empty-add")?.addEventListener("click", () => $("#files").click());
  $("#more").hidden = Boolean(query) || allLoaded || photos.length === 0;
}
async function runSearch(value) {
  query = value.trim();
  if ($("#query")) $("#query").value = query;
  searchAbort?.abort();
  searchAbort = new AbortController();
  const version = ++generation;
  if (!modelReady) {
    toast("The search model is preparing. Please try shortly.");
    return;
  }
  try {
    $("#results-title").textContent = "Searching…";
    let data;
    do {
      data = await api(
        query ? `/api/search?q=${encodeURIComponent(query)}` : "/api/photos",
        { signal: searchAbort.signal },
      );
      if (version !== generation || !signedIn) return;
      if (data.pending)
        await new Promise((resolve) => setTimeout(resolve, 500));
      if (version !== generation || !signedIn) return;
    } while (data.pending);
    if (version !== generation || !signedIn) return;
    photos = data.photos;
    allLoaded = photos.length < 60;
    renderPhotos();
  } catch (e) {
    if (e.name !== "AbortError") toast(e.message);
  }
}
async function loadMore() {
  try {
    const data = await api(`/api/photos?before=${photos.at(-1).id}`);
    photos.push(...data.photos);
    allLoaded = data.photos.length < 60;
    renderPhotos();
  } catch (e) {
    toast(e.message);
  }
}
async function upload(files) {
  if (!modelReady) {
    toast("The search model is preparing. Please try shortly.");
    return;
  }
  if (busy) {
    toast("Your photos are still uploading.");
    return;
  }
  busy = true;
  let added = 0;
  try {
    for (const file of files) {
      if (!signedIn) break;
      if (!["image/jpeg", "image/png"].includes(file.type)) {
        toast(`${file.name}: choose a JPEG or PNG.`);
        continue;
      }
      if (file.size > 12 * 1024 * 1024) {
        toast(`${file.name}: choose a photo smaller than 12 MiB.`);
        continue;
      }
      await api(`/api/photos?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      added++;
    }
    if (added) {
      toast(
        `${added} ${added === 1 ? "photo" : "photos"} added. Search will be ready shortly.`,
      );
      if (currentView !== "photos") showPhotos();
      await runSearch("");
    }
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
async function poll() {
  if (!signedIn) return;
  try {
    const status = await api("/api/status");
    if (!signedIn) return;
    const wasReady = modelReady;
    modelReady = status.model.phase === "ready";
    $("#photo-count").textContent = status.photos;
    const notice = $("#model-notice");
    if (notice) {
      if (!modelReady) {
        const failed = status.model.phase === "failed";
        const percent = Math.round(
          (100 * (status.model.downloaded || 0)) / (status.model.total || 1),
        );
        notice.innerHTML = `<div class="notice ${failed ? "error" : ""}">${failed ? esc(status.model.error) : status.model.phase === "downloading" ? `Preparing search — downloading the model (${percent}%). This happens once.` : "Preparing the search model…"}${failed ? '<div class="actions"><button id="retry-model">Try again</button></div>' : ""}</div>`;
        $("#retry-model")?.addEventListener("click", async () => {
          try {
            await api("/api/model/retry", { method: "POST" });
          } catch (e) {
            toast(e.message);
          }
        });
      } else
        notice.innerHTML = status.queued
          ? `<div class="notice">Preparing ${status.queued} ${status.queued === 1 ? "photo" : "photos"} for search…</div>`
          : status.descriptions?.queued
            ? `<div class="notice">Writing descriptions for ${status.descriptions.queued} photos. You can keep browsing while they are prepared.</div>`
            : status.descriptions?.failed
              ? `<div class="notice">${status.descriptions.failed} descriptions need attention. Open a photo to retry or write one.</div>`
              : "";
    }
    if (
      modelReady &&
      currentView === "photos" &&
      !query &&
      (!wasReady || photos.length <= 60)
    ) {
      const data = await api("/api/photos");
      if (signedIn && !query) {
        photos = data.photos;
        allLoaded = photos.length < 60;
        renderPhotos();
      }
    }
  } catch (e) {
    if (signedIn) toast(e.message);
  } finally {
    if (signedIn) timer = setTimeout(poll, 2500);
  }
}
function modal(html) {
  const d = document.createElement("dialog");
  d.innerHTML = `<button class="quiet close" aria-label="Close">×</button>${html}`;
  document.body.append(d);
  $(".close", d).onclick = () => d.close();
  d.onclose = () => d.remove();
  d.showModal();
  return d;
}
async function detail(id) {
  try {
    const p = await api(`/api/photos/${id}`);
    const d = modal(
      `<h2>${esc(p.filename)}</h2>${p.status === "ready" ? `<div class="photo-view"><img src="/assets/photos/${p.id}" alt="${esc(p.filename)}"></div><div class="detail-tags"><p class="sub">${p.description?.manual ? "Your description" : "Automatic description · review and correct if needed"}</p><form id="description-form"><label for="scene-caption">Description</label><textarea id="scene-caption" rows="3" maxlength="2401" required placeholder="A small white dog lies on green grass beside white flowers.">${esc(p.description?.caption || "")}</textarea><div class="actions"><button class="primary" type="submit">Save description</button>${p.description?.status === "error" && !p.description?.manual ? '<button type="button" id="retry-description">Retry automatic description</button>' : ""}</div><p class="sub" role="status">${esc(p.description?.error || (!p.description?.caption ? "An automatic description is being prepared. You can write one now." : ""))}</p></form></div>` : `<p class="notice ${p.status === "error" ? "error" : ""}">${esc(p.error || "This photo is being prepared for search.")}</p>`}<div class="dialog-footer"><button class="danger" id="delete-photo">Delete photo</button><div class="actions">${p.status === "error" ? '<button id="retry-photo">Try again</button>' : ""}<a class="button" download="${esc(p.filename)}" href="/assets/originals/${p.id}">Download original</a></div></div>`,
    );
    $("#description-form", d)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api(`/api/photos/${id}/description`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: $("#scene-caption", d).value.trim(),
          }),
        });
        d.close();
        await runSearch(query);
        toast("Description saved.");
      } catch (e) {
        toast(e.message);
      }
    });
    $("#retry-description", d)?.addEventListener("click", async () => {
      try {
        await api(`/api/photos/${id}/description/retry`, { method: "POST" });
        d.close();
        toast("Description queued.");
      } catch (e) {
        toast(e.message);
      }
    });
    d.querySelectorAll("[data-tag]").forEach(
      (b) =>
        (b.onclick = () => {
          d.close();
          runSearch(b.dataset.tag);
        }),
    );
    $("#retry-photo", d)?.addEventListener("click", async () => {
      try {
        await api(`/api/photos/${id}/retry`, { method: "POST" });
        d.close();
        runSearch(query);
      } catch (e) {
        toast(e.message);
      }
    });
    $("#delete-photo", d).onclick = () => {
      const confirm = modal(
        '<h2>Delete this photo?</h2><p>The original photo and its search data will be removed from this library.</p><div class="actions"><button id="cancel-delete">Keep photo</button><button id="confirm-delete" class="danger">Delete photo</button></div>',
      );
      $("#cancel-delete", confirm).onclick = () => confirm.close();
      $("#confirm-delete", confirm).onclick = async () => {
        try {
          await api(`/api/photos/${id}`, { method: "DELETE" });
          confirm.close();
          d.close();
          runSearch(query);
          toast("Photo deleted.");
        } catch (e) {
          toast(e.message);
        }
      };
    };
  } catch (e) {
    toast(e.message);
  }
}
function settings() {
  currentView = "settings";
  EntityCamera.close();
  $(".nav-item.active")?.classList.remove("active");
  $("#nav-settings").classList.add("active");
  $("#main").innerHTML =
    `<header class="page-head"><div><div class="eyebrow">Your library</div><h1>Settings</h1></div></header><section class="settings-section"><h2>Keep access to your photos.</h2><p class="sub">Add a backup passkey on another device or security key. Your passkeys are the keys to this library.</p><div class="actions"><button id="backup" class="primary">${icon("key")}Add a backup passkey</button><button id="settings-signout">Sign out</button></div></section>`;
  $("#backup").onclick = async () => {
    try {
      const r = await EntityAuth.passkey.addPasskey({ name: "Backup passkey" });
      if (r.error) throw Error(r.error.message);
      toast("Backup passkey added.");
    } catch (e) {
      toast(e.message);
    }
  };
  $("#settings-signout").onclick = () =>
    signOut().catch((e) => toast(e.message));
}
(async () => {
  try {
    const session = await EntityAuth.getSession();
    if (session.data) shell();
    else await login();
  } catch (e) {
    $("#app").textContent = e.message;
  }
})();
