(() => {
  "use strict";
  const records = new Map((window.MUSEUM_DATA?.records || []).map(record => [record.id, record]));
  if (!records.size || window.MuseumBasket) return;
  const storageKey = "butterfly-museum-specimen-basket-v1";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const label = record => record.name || record.latin || record.binomial || record.id;
  const safeHref = (mode, record, requestedHref) => {
    const validMode = ["gallery", "plaque", "study", "book"].includes(mode) ? mode : "gallery";
    const params = new URLSearchParams();
    params.set("id", record.id);
    let requestedPhoto = "";
    try { requestedPhoto = new URLSearchParams(String(requestedHref || "").split("?")[1] || "").get("photo") || ""; } catch { /* Ignore malformed caller routes. */ }
    const photo = Number(record.photoIndex ?? (requestedPhoto ? Number(requestedPhoto) - 1 : NaN));
    if (Number.isInteger(photo) && photo >= 0 && record.photos?.[photo]) params.set("photo", String(photo + 1));
    if (validMode === "gallery" || validMode === "plaque") {
      const hall = new URLSearchParams(String(requestedHref || "").split("?")[1] || "").get("hall");
      if (["cabinet", "optical", "journal", "conservatory"].includes(hall)) params.set("hall", hall);
    }
    return `#${validMode}?${params.toString()}`;
  };
  const normalize = item => {
    if (!item || !records.has(item.id) || typeof item.href !== "string") return null;
    const [rawMode, query = ""] = item.href.replace(/^#/, "").split("?");
    const mode = ["gallery", "plaque", "study", "book"].includes(rawMode) ? rawMode : "gallery";
    const params = new URLSearchParams(query);
    if (params.get("id") !== item.id) return null;
    return {id: item.id, href: safeHref(mode, records.get(item.id), item.href)};
  };
  const load = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value) ? value.map(normalize).filter(Boolean) : [];
    } catch { return []; }
  };
  let saved = load();
  let context;
  const root = document.createElement("div");
  root.dataset.specimenBasket = "";
  root.innerHTML = `<dialog class="specimen-basket-dialog" id="specimen-basket-dialog" aria-labelledby="basket-title"><section class="basket-sheet"><header><div><h2 id="basket-title">我的收藏篮</h2></div><button type="button" class="basket-close" aria-label="关闭收藏篮">×</button></header><p class="basket-count" aria-live="polite"></p><ul class="basket-list"></ul><p class="basket-empty" hidden>篮子还是空的。逛展厅、百科或近观时，可以把喜欢的标本收进来。</p></section></dialog>`;
  document.body.append(root);
  const dialog = root.querySelector("dialog");
  const opener = document.createElement("button");
  opener.className = "basket-open";
  opener.type = "button";
  opener.setAttribute("aria-haspopup", "dialog");
  opener.setAttribute("aria-controls", dialog.id);
  document.querySelector("nav.switch").append(opener);
  opener.addEventListener("click", () => { updateList(); dialog.showModal(); });
  const updateList = () => {
    opener.textContent = saved.length ? `收藏篮 · ${saved.length}` : "收藏篮";
    root.querySelector(".basket-count").textContent = `${saved.length} 件标本 · 保存在此浏览器`;
    const list = root.querySelector(".basket-list");
    root.querySelector(".basket-empty").hidden = saved.length > 0;
    list.innerHTML = saved.map(item => {
      const record = records.get(item.id);
      const photo = record.photos?.find(p => p.hasImage && typeof p.src === "string" && /^media\/[A-Za-z0-9_./-]+$/.test(p.src));
      return `<li><a class="basket-specimen" href="${esc(item.href)}"><span class="basket-thumb">${photo ? `<img src="${esc(photo.src)}" alt="">` : ""}</span><span class="basket-name">${esc(label(record))}${record.latin && record.name ? `<i>${esc(record.latin)}</i>` : ""}</span><span class="basket-return">返回标本 ↗</span></a><button class="basket-remove" type="button" data-remove="${esc(record.id)}" aria-label="从收藏篮移除${esc(label(record))}">移除</button></li>`;
    }).join("");
  };
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* The in-memory basket remains available when storage is blocked. */ }
    updateList(); renderCandidates();
  };
  function renderCandidates() {
    if (!context) return;
    const {mode, record, href} = context;
    const main = document.querySelector("#museum");
    const anchors = mode === "gallery" ? [...main.querySelectorAll("[data-plaque]")].filter(el => el.offsetWidth) :
      [main.querySelector(mode === "book" ? ".record-actions" : mode === "plaque" ? ".placard[open] a" : ".return")].filter(Boolean);
    for (const anchor of anchors) {
      const id = anchor.dataset.plaque || record.id;
      const specimen = records.get(id);
      if (!specimen) continue;
      let button = anchor.nextElementSibling;
      if (!button?.matches(".basket-add")) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "basket-add";
        anchor.after(button);
      }
      const present = saved.some(item => item.id === id);
      button.dataset.add = id;
      button.textContent = present ? "✓ 已收藏" : "＋ 收藏标本";
      button.setAttribute("aria-label", (present ? "已收藏" : "收藏") + label(specimen));
      button.disabled = present;
      button.onclick = () => {
        const link = anchor.closest("[data-exhibit]")?.querySelector(".frame-link")?.getAttribute("href");
        if (saved.some(item => item.id === id)) return;
        saved.push({id, href:safeHref(mode === "plaque" ? "gallery" : mode, specimen, link || href)});
        persist();
      };
    }
  }
  window.MuseumBasket = { sync(current) { context = current; renderCandidates(); updateList(); } };
  root.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove]");
    if (remove) { saved = saved.filter(item => item.id !== remove.dataset.remove); persist(); return; }

    if (event.target.closest(".basket-close")) dialog.close();
    if (event.target.closest(".basket-specimen")) dialog.close();
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) { saved = load(); updateList(); renderCandidates(); }
  });
  updateList();
})();
