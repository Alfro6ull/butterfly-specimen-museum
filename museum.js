(() => {
  "use strict";

  const main = document.querySelector("#museum");
  const galleryLink = document.querySelector("#gallery-link");
  const bookLink = document.querySelector("#book-link");
  const data = window.MUSEUM_DATA;

  if (!data?.records?.length || !data.galleryOrder?.length) {
    main.innerHTML = '<p class="unavailable">无法载入标本目录。请确认网站文件已经完整解压。</p>';
    return;
  }

  const records = new Map(data.records.map(record => [record.id, record]));
  const gallery = data.galleryOrder.filter(id => records.has(id));
  const positions = new Map(gallery.map((id, index) => [id, index]));
  const mobileGallery = gallery.length > 1 ? [gallery[1], gallery[0], ...gallery.slice(2)] : gallery;
  const mobilePositions = new Map(mobileGallery.map((id, index) => [id, index]));
  const directory = [...gallery.map(id => records.get(id)), ...data.records.filter(record => !positions.has(record.id))];
  const narrow = window.matchMedia("(max-width: 700px)");
  const selections = new Map();
  const picks = new Map();
  const initial = gallery[1] || gallery[0];
  let wallId = initial;
  let route;
  let search = "";
  let mobileDirectoryOpen = false;
  let renderVersion = 0;
  let initialRender = true;
  let highlightedId = "";
  const hallStorage = "butterfly-museum-hall";
  const halls = new Map([["cabinet", "复古展厅"], ["optical", "暗光展厅"], ["journal", "自然手账"]]);
  const validHall = value => halls.has(value);
  let hall = "optical";
  let wallKey = "";
  let closingPlacard = false;
  try {
    const stored = localStorage.getItem(hallStorage);
    const savedHall = stored === "notebook" ? "journal" : stored;
    if (validHall(savedHall)) hall = savedHall;
  } catch { /* The hall stays available if browser storage is disabled. */ }
  document.body.dataset.hall = hall;

  const isWall = mode => mode === "gallery" || mode === "plaque";
  const singleExhibit = () => narrow.matches || hall !== "cabinet";

  const escape = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const name = record => record.name || record.latin || record.binomial || record.id;
  const latin = record => record.latin || record.binomial || "";
  const nameCounts = new Map();
  directory.forEach(record => {
    const label = name(record);
    nameCounts.set(label, (nameCounts.get(label) || 0) + 1);
  });
  const safeURL = value => /^https?:\/\//i.test(String(value ?? "")) ? escape(value) : "";
  const photoSource = value => typeof value === "string" && /^media\//.test(value) ? escape(value) : "";
  const external = (url, label) => {
    const href = safeURL(url);
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : "";
  };
  function sourceLink(url, fallbackLabel) {
    if (!safeURL(url)) return "";
    const host = new URL(url).hostname;
    if (host === "commons.wikimedia.org") return external(url, "摄影者发布页");
    if (host === "gbif.org" || host.endsWith(".gbif.org")) return external(url, "馆藏发布记录（GBIF）");
    return external(url, fallbackLabel);
  }

  const svg = path => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
  const leftArrow = svg("m15 5-7 7 7 7");
  const rightArrow = svg("m9 5 7 7-7 7");
  const closeIcon = svg("m6 6 12 12M18 6 6 18");
  const searchIcon = svg("m16 16 4 4m-3-9a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z");

  function fragment(mode, id = "", photoIndex = null, returnId = "") {
    const args = new URLSearchParams();
    if (id) args.set("id", id);
    if (photoIndex !== null) args.set("photo", String(photoIndex + 1));
    if (returnId && returnId !== id) args.set("wall", returnId);
    args.set("hall", hall);
    return `#${mode}${args.size ? "?" + args : ""}`;
  }

  function parseRoute() {
    const [key, query] = location.hash.slice(1).split("?");
    const args = new URLSearchParams(query);
    const requestedHall = args.get("hall") === "notebook" ? "journal" : args.get("hall");
    if (validHall(requestedHall) && hall !== requestedHall) applyHall(requestedHall);
    const mode = ["gallery", "plaque", "study", "book"].includes(key) ? key : "gallery";
    const requestedRecord = records.get(args.get("id"));
    const fallback = records.get(wallId);
    const record = requestedRecord && (mode === "book" || positions.has(requestedRecord.id))
      ? requestedRecord : fallback;
    const returnId = args.get("wall");
    if (positions.has(returnId)) wallId = returnId;
    if (positions.has(record.id)) wallId = record.id;

    const requestedPhoto = Number(args.get("photo")) - 1;
    const remembered = selectedPhoto(record);
    const validRequestedPhoto = Boolean(record.photos[requestedPhoto]);
    const photoIndex = validRequestedPhoto ? requestedPhoto : remembered;
    if (mode !== "gallery" || validRequestedPhoto) selections.set(record.id, photoIndex);
    return { mode, record, photoIndex };
  }

  function selectedPhoto(record) {
    return selections.get(record.id) ?? Math.max(0, record.photos.findIndex(photo => photo.hasImage));
  }

  function galleryFragment(id = wallId) {
    return fragment("gallery", id, selections.get(id) ?? null);
  }

  function navigate(href) {
    if (location.hash === href) return;
    location.hash = href;
  }

  function updateModeLinks() {
    galleryLink.href = galleryFragment();
    const bookRecord = route.record;
    bookLink.href = fragment("book", bookRecord.id, route.mode === "study" || route.mode === "plaque" ? route.photoIndex : null, wallId);
    const light = route.mode === "book";
    document.body.classList.toggle("light", light);
    const inJournal = hall === "journal" && !light;
    document.body.classList.toggle("journal-open", inJournal);
    for (const [link, current] of [[galleryLink, !light], [bookLink, light]]) {
      link.classList.toggle("on", current);
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    galleryLink.addEventListener("click", returnFromStudy);
    bookLink.addEventListener("click", keepCurrentBook);
  }

  function returnFromStudy(event) {
    if (route.mode === "study" && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(galleryFragment());
    }
  }

  function keepCurrentBook(event) {
    if (route.mode === "book" && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) event.preventDefault();
  }

  const paperMask = photo => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(photo?.wallMask || "") ? photo.wallMask : "";
  const paperMaskNote = "展墙用轮廓遮罩隐藏底纸，近观可见完整照片。";

  function imageMarkup(photo, record, useWall = false) {
    const src = useWall ? photoSource(photo?.wallSrc || photo?.src) : photoSource(photo?.src);
    if (!src) return "";
    const alt = `${name(record)} · ${viewName(photo, record.photos.indexOf(photo), record.photos.length)}`;
    const mask = useWall ? paperMask(photo) : "";
    const maskAttributes = mask ? ` class="paper-masked" style="--paper-mask:url(${mask})"` : "";
    return `<img src="${src}" alt="${escape(alt)}" draggable="false"${maskAttributes}>`;
  }

  const ornamentSource = "https://www.nga.gov/artworks/3304-leaf-ornament";

  function wallPhotoCredit(photo, record) {
    return `<div class="photo-credit">
      <p class="credit-by">${[photo.creator ? `${photo.creator} 摄影` : "", record.museum || record.institution].filter(Boolean).map(escape).join(" · ")}</p>
      <div class="credit-links">
        ${external(photo.source || photo.evidence, "图片出处")}
        ${external(photo.licenseURL, photo.license || "查看许可") || escape(photo.license)}
      </div>
    </div>`;
  }

  function framed(content) {
    return `<div class="frame"><div class="mat"><div class="mount">${content}</div></div></div>`;
  }

  function exhibit(id, center) {
    const record = records.get(id);
    const photoIndex = selectedPhoto(record);
    const photo = record.photos[photoIndex].hasImage
      ? record.photos[photoIndex] : record.photos.find(image => image.hasImage);
    const label = escape(name(record));
    return `<article class="group ${center ? "main" : "side"}${paperMask(photo) ? " has-mask" : ""}" data-exhibit="${escape(id)}"${highlightedId === id ? ' aria-current="true"' : ""}>
      <a class="frame-link" href="${escape(fragment("study", id, photoIndex))}" aria-label="近观${label}">
        ${framed(`<div class="photo"><span class="trim">${imageMarkup(photo, record, true)}</span></div>`)}
        ${record.accession ? `<span class="optical-ref" aria-hidden="true">${escape(record.accession)}</span>` : ""}
        ${photo.view ? `<span class="optical-view" aria-hidden="true">${escape(photo.view)}</span>` : ""}
      </a>
      <button class="plaque" type="button" data-plaque="${escape(id)}" aria-haspopup="dialog" aria-controls="specimen-placard" aria-label="查看${label}展签">
        <span class="plaque-text"><strong>${label}</strong>
        ${record.name && latin(record) ? `<i>${escape(latin(record))}</i>` : ""}</span>
        ${rightArrow.replace("<svg ", '<svg class="plaque-arrow" ')}
      </button>
      ${wallPhotoCredit(photo, record)}
    </article>`;
  }

  function hallTools() {
    return `<div class="room-tools" role="group" aria-label="展厅样式">${[...halls].map(([id, label]) =>
      `<button type="button" data-hall="${id}" aria-pressed="${hall === id}">${label}</button>`).join("")}</div>`;
  }

  function wallNavigation(page, total, single) {
    const number = n => String(n).padStart(2, "0");
    return `<nav class="walk" aria-label="${single ? "标本导航" : "展墙导航"}">
      <button class="arrow" type="button" data-step="-1" aria-label="${single ? "上一件标本" : "上一面展墙"}" ${page === 1 ? "disabled" : ""}>${leftArrow}</button>
      <div class="page" aria-label="第 ${page} 页，共 ${total} 页" aria-live="polite"><strong>${number(page)}</strong><span>/</span><span>${number(total)}</span></div>
      <button class="arrow" type="button" data-step="1" aria-label="${single ? "下一件标本" : "下一面展墙"}" ${page === total ? "disabled" : ""}>${rightArrow}</button>
    </nav>`;
  }

  function journalPage(page, total, navigationHTML) {
    const record = records.get(wallId);
    const photoIndex = selectedPhoto(record);
    const photo = record.photos[photoIndex];
    const profiles = window.FIELD_PROFILES;
    const profile = profiles[record.binomial];
    const featured = Object.values(profiles).flatMap(profile => {
      const example = directory.find(item => positions.has(item.id) && item.binomial === profile.binomial);
      return example ? [{title: profile.commonName, id: example.id, href: galleryFragment(example.id)}] : [];
    });
    return window.renderFieldJournal({
      record, photo, photoIndex, page, total, profile, title: record.name || profile?.commonName || name(record),
      imageHTML: imageMarkup(photo, record, true), creditHTML: wallPhotoCredit(photo, record),
      toolsHTML: hallTools(), navigationHTML, viewsHTML: views(record, photoIndex),
      studyHref: fragment("study", record.id, photoIndex), bookHref: fragment("book", record.id, photoIndex),
      swatches: (window.FIELD_SWATCHES[photo.key] || []).map(hex => ({hex})), featured, escape, external
    });
  }

  function wall() {
    const single = singleExhibit();
    const step = single ? 1 : 3;
    const index = (single ? mobilePositions : positions).get(wallId);
    const pageIndex = Math.floor(index / step);
    const pages = Math.ceil(gallery.length / step);
    const wallStart = Math.floor(positions.get(wallId) / 3) * 3;
    const items = gallery.slice(wallStart, wallStart + 3);
    const newKey = JSON.stringify([hall, single, pageIndex, highlightedId,
      ...items.map(id => [id, selectedPhoto(records.get(id))]), single ? wallId : ""]);
    if (main.classList.contains("wall") && newKey === wallKey) return;
    const previousDialog = main.querySelector("dialog.placard[open]");
    previousDialog?.close();
    wallKey = newKey;
    const journal = hall === "journal";
    const navigation = wallNavigation(pageIndex + 1, pages, single);
    main.className = journal ? "wall journal-wall" : "wall";
    const contents = journal ? journalPage(pageIndex + 1, pages, navigation) : `<div class="roomhead">
        <div class="room-title"><h1 tabindex="-1">常设展厅</h1><div class="count">${gallery.length} 件标本</div></div>
        ${hallTools()}
      </div>
      <div class="exhibits gallery-wide" ${single ? "hidden" : ""}>${items.map((id, position) => exhibit(id, position === 1 || items.length === 1)).join("")}</div>
      <div class="exhibits gallery-single" ${single ? "" : "hidden"}>${exhibit(wallId, true)}</div>
      ${navigation}
      <p class="wall-hint">点画框取色 · 点展签看资料</p>
      ${hall === "cabinet" ? `<footer><p class="frame-credit" aria-label="画框纹样出处">${external(ornamentSource, "框饰出处 · 美国国家美术馆")}</p></footer>` : ""}`;
    main.innerHTML = contents + '<dialog class="placard" id="specimen-placard" aria-labelledby="placard-title"></dialog>';
    main.querySelectorAll("[data-copy-hex]").forEach(button => {
      button.addEventListener("click", () => copyHex(button.dataset.copyHex));
    });
    main.querySelectorAll("[data-step]").forEach(button => {
      button.addEventListener("click", () => moveWall(Number(button.dataset.step)));
    });
    main.querySelectorAll("[data-plaque]").forEach(button => {
      button.addEventListener("click", () => openPlacard(button.dataset.plaque));
    });
    main.querySelectorAll("button[data-hall]").forEach(button => {
      button.addEventListener("click", () => setHall(button.dataset.hall));
    });
    const dialog = main.querySelector(".placard");
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      closePlacard();
    });
    let pressedBackdrop = false;
    dialog.addEventListener("pointerdown", event => { pressedBackdrop = event.target === dialog; });
    dialog.addEventListener("click", event => {
      if (pressedBackdrop && event.target === dialog) closePlacard();
      pressedBackdrop = false;
    });
  }

  function applyHall(nextHall) {
    hall = nextHall;
    document.body.dataset.hall = hall;
  }

  function setHall(nextHall) {
    if (nextHall === hall || route.mode !== "gallery") return;
    applyHall(nextHall);
    try { localStorage.setItem(hallStorage, hall); } catch { /* The choice remains active for this visit. */ }
    highlightedId = wallId;
    history.replaceState(history.state, "", galleryFragment());
    render(false);
    main.querySelector(`[data-hall="${hall}"]`)?.focus({preventScroll: true});
  }

  function moveWall(direction) {
    if (route.mode !== "gallery") return;
    const single = singleExhibit();
    const index = (single ? mobilePositions : positions).get(wallId);
    const step = single ? 1 : 3;
    const nextPage = Math.floor(index / step) + direction;
    if (nextPage < 0 || nextPage * step >= gallery.length) return;
    const nextIndex = Math.min(nextPage * step + (step === 3 ? 1 : 0), gallery.length - 1);
    highlightedId = "";
    navigate(galleryFragment((single ? mobileGallery : gallery)[nextIndex]));
  }

  function openPlacard(id) {
    if (route.mode !== "gallery") return;
    history.replaceState(history.state, "", galleryFragment(id));
    history.pushState({museumPlacard: true}, "", fragment("plaque", id, selectedPhoto(records.get(id))));
    render();
  }

  function closePlacard() {
    if (route.mode !== "plaque" || closingPlacard) return;
    if (history.state?.museumPlacard) {
      closingPlacard = true;
      history.back();
    } else {
      history.replaceState(null, "", galleryFragment());
      render();
    }
  }

  function exhibitControl(id, selector) {
    if (hall === "journal") return main.querySelector("[data-exhibit]")?.querySelector(selector);
    const pane = singleExhibit() ? ".gallery-single" : ".gallery-wide";
    const exhibit = [...main.querySelectorAll(`${pane} [data-exhibit]`)].find(item => item.dataset.exhibit === id);
    return exhibit?.querySelector(selector);
  }

  function placard() {
    const dialog = main.querySelector("dialog.placard");
    const {record, photoIndex} = route;
    const photo = record.photos[photoIndex];
    const frame = exhibitControl(record.id, ".frame-link");
    const rightmost = frame?.closest(".group")?.matches(":last-child:not(:first-child)");
    dialog.dataset.side = !singleExhibit() && rightmost ? "left" : "right";
    const contentKey = `${record.id}/${photoIndex}`;
    if (dialog.open && dialog.dataset.contentKey === contentKey) return;
    dialog.dataset.contentKey = contentKey;
    dialog.innerHTML = `<article class="placard-sheet">
      <header class="placard-top"><span>标本展签</span><button class="placard-close" type="button" aria-label="关闭展签" autofocus>${closeIcon}</button></header>
      <div class="placard-identity">
        <div><h2 id="placard-title">${escape(name(record))}</h2>
          ${record.name && latin(record) ? `<p class="placard-latin">${escape(latin(record))}</p>` : ""}</div>
        ${photo?.hasImage ? `<div class="placard-portrait" aria-hidden="true"><span class="trim">${imageMarkup(photo, record, true)}</span></div>` : ""}
      </div>
      ${record.observation ? `<p class="placard-note">${escape(record.observation)}</p>` : ""}
      <table class="placard-facts"><tbody>${facts(record)}</tbody></table>
      ${photo ? `<div class="placard-credit">
        <p>${escape(viewName(photo, photoIndex, record.photos.length))} · ${photoByline(photo, record)}</p>
        ${photo.conditions ? `<p>${escape(photo.conditions)}</p>` : ""}
        ${paperMask(photo) ? `<p>${paperMaskNote}</p>` : ""}
        <div>
          ${external(photo.originalURL, "查看原图")}
          ${sourceLink(photo.source || photo.evidence, "图片出处")}
          ${external(photo.licenseURL, "查看许可")}
        </div>
      </div>` : ""}
      ${hall === "cabinet" ? `<details class="ornament-credit">
        <summary>画框纹样与授权</summary>
        <p>Martin Schongauer《Leaf Ornament》（约 1480–1490 年），美国国家美术馆 Rosenwald Collection，馆藏号 1943.3.92。馆方以 CC0 开放这幅公有领域版画。本馆截取并镜像排列局部叶纹，制作金色框饰。</p>
        <p>${external(ornamentSource, "查看美国国家美术馆记录")} · ${external("https://www.nga.gov/terms-and-notices", "馆方图像使用政策")}</p>
      </details>` : ""}
      <nav class="placard-actions" aria-label="标本浏览">
        <a href="${escape(fragment("study", record.id, photoIndex))}">近观取色</a>
        <a href="${escape(fragment("book", record.id, photoIndex))}">打开百科</a>
      </nav>
    </article>`;
    dialog.querySelector(".placard-close").addEventListener("click", closePlacard);
    if (!dialog.open) dialog.showModal();
  }

  function viewName(photo, index, total) {
    return photo?.view || photo?.title || (total === 1 ? "标本照片" : `照片 ${index + 1}`);
  }

  function views(record, photoIndex) {
    if (record.photos.length < 2) return "";
    const names = record.photos.map((photo, index) => viewName(photo, index, record.photos.length));
    return `<div class="viewtabs" role="group" aria-label="照片视图">${names.map((label, index) => {
      const text = names.filter(item => item === label).length > 1 ? `${label} · ${index + 1}` : label;
      return `<button type="button" data-view="${index}" aria-pressed="${photoIndex === index}">${escape(text)}</button>`;
    }).join("")}</div>`;
  }

  function photoAttribution(photo, record) {
    if (photo.credit) return photo.credit;
    const credited = [...new Set([photo.creator, photo.holder].filter(Boolean))].join(" / ");
    return credited || record.institution || record.museum || "";
  }

  function photoByline(photo, record) {
    return [photoAttribution(photo, record), photo.license].filter(Boolean).map(escape).join(" · ");
  }

  function chip(hex, label = "", index = 0, kind = "palette") {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return "";
    return `<button type="button" class="chip" data-${kind}="${index}" aria-label="${escape([label, hex, "复制色值"].filter(Boolean).join("，"))}" title="${escape(label || hex)}"><b style="background:${hex}" aria-hidden="true"></b><span>${escape(hex)}</span></button>`;
  }

  function study() {
    const { record, photoIndex } = route;
    const photo = record.photos[photoIndex];
    const available = Boolean(photo?.hasImage && photo.src);
    const frame = available
      ? framed(`<button class="sample" type="button" aria-label="在标本全图取色" aria-describedby="sample-hint">${imageMarkup(photo, record)}<span class="sample-marker" aria-hidden="true" hidden></span></button>`)
      : '<p class="restricted">此视图的图片请到原始出处查看。</p>';
    const palette = record.palette || [];

    main.className = "study";
    main.innerHTML = `<div>
      <a class="return" href="${escape(galleryFragment())}">← ${hall === "journal" ? "返回自然手账" : "返回展墙"}</a>
      ${frame}${views(record, photoIndex)}
    </div>
    <section>
      <h1 tabindex="-1">${escape(name(record))}</h1>
      ${record.name && latin(record) ? `<p class="binomial">${escape(latin(record))}</p>` : ""}
      ${record.observation ? `<p class="observation">${escape(record.observation)}</p>` : ""}
      <h2>照片取色</h2>
      ${palette.length ? `<div class="swatches" aria-label="馆内色签">${palette.map((color, index) =>
        chip(color.hex, [color.label, color.view, color.location].filter(Boolean).join(" · "), index)).join("")}</div>` : ""}
      ${available ? '<p class="sample-hint" id="sample-hint">点击照片可读取展示图的 sRGB 色值。使用键盘时，聚焦照片后可用方向键移动取色点，按 Enter 或空格取色。</p><div id="sample-result" class="sample-result" hidden></div>' : ""}
      <p id="copy-status" class="copy-status" role="status"></p>
      <details id="recent" class="recent" hidden><summary>最近取色</summary><div class="swatches"></div></details>
      <div class="foot">
        <div>${[record.museum || record.institution, record.accession].filter(Boolean).map(escape).join(" · ")}</div>
        <div>${photo ? photoByline(photo, record) : ""}</div>
        <div class="links">
          ${available ? `<a href="${photoSource(photo.src)}" target="_blank" rel="noopener">查看完整展示图</a>` : ""}
          ${external(photo?.originalURL, "查看原图")}
          ${sourceLink(photo?.source || photo?.evidence, "图片出处")}
          ${external(photo?.licenseURL, "查看许可")}
          <a href="${escape(fragment("book", record.id, photoIndex, wallId))}">标本记录</a>
          ${hall === "journal" ? '<a href="conservatory/index.html" target="_blank" rel="noopener">页角图版出处</a>' : ""}
        </div>
      </div>
    </section>`;
    setupStudy(record, photo, available);
  }

  async function copyHex(hex) {
    const status = main.querySelector("#copy-status, [data-journal-status]");
    let copied = false;
    try {
      await navigator.clipboard.writeText(hex);
      copied = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = hex;
      field.className = "copy-proxy";
      field.readOnly = true;
      const trigger = document.activeElement;
      document.body.append(field);
      field.select();
      try { copied = document.execCommand("copy"); } catch { /* Manual selection remains available. */ }
      field.remove();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({preventScroll: true});
    }

    if (!status?.isConnected) return;
    status.textContent = copied ? `已复制 ${hex}` : "请选择色值并使用系统复制命令。";
    if (copied) return;
    let manual = document.querySelector("#manual-copy");
    if (!manual) {
      manual = document.createElement("input");
      manual.id = "manual-copy";
      manual.readOnly = true;
      manual.setAttribute("aria-label", "可手动复制的色值");
      status.insertAdjacentElement("afterend", manual);
    }
    manual.value = hex;
    manual.focus({preventScroll: true});
    manual.select();
  }

  function setupStudy(record, photo, available) {
    const sampleButton = main.querySelector(".sample");
    const marker = main.querySelector(".sample-marker");
    const result = main.querySelector("#sample-result");
    const status = main.querySelector("#copy-status");
    const recent = main.querySelector("#recent");
    const history = picks.get(record.id) || [];
    picks.set(record.id, history);
    let pixels;
    let point = history.find(item => item.photoKey === photo?.key) || { x: .5, y: .5 };
    let lastPick = history[0];
    const version = renderVersion;

    const drawRecent = () => {
      recent.hidden = history.length === 0;
      recent.querySelector(".swatches").innerHTML = history.map((item, index) => chip(item.hex, "", index, "pick")).join("");
      recent.querySelectorAll("[data-pick]").forEach(button => button.addEventListener("click", () => {
        copyHex(history[Number(button.dataset.pick)].hex);
      }));
    };

    function drawResult() {
      if (!result || !lastPick) return;
      result.hidden = false;
      result.innerHTML = `<b style="background:${lastPick.hex}" aria-hidden="true"></b>
        <input aria-label="取色结果" readonly value="${lastPick.hex}" size="7">
        <button type="button">复制 HEX</button>`;
      result.querySelector("button").addEventListener("click", () => copyHex(lastPick.hex));
      result.querySelector("input").addEventListener("focus", event => event.target.select());
    }

    main.querySelectorAll("[data-palette]").forEach(button => button.addEventListener("click", () => {
      copyHex(record.palette[Number(button.dataset.palette)].hex);
    }));
    drawResult();
    drawRecent();
    if (!available) return;

    const image = sampleButton.querySelector("img");
    let pixelLoading;

    function imageBounds() {
      const box = image.getBoundingClientRect();
      const naturalWidth = image.naturalWidth || photo.displayWidth;
      const naturalHeight = image.naturalHeight || photo.displayHeight;
      if (!naturalWidth || !naturalHeight || !box.width || !box.height) return null;
      const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
      const width = naturalWidth * scale;
      const height = naturalHeight * scale;
      return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
    }

    function mark() {
      const bounds = imageBounds();
      if (!bounds) return;
      const box = sampleButton.getBoundingClientRect();
      marker.style.left = `${bounds.left - box.left + point.x * bounds.width}px`;
      marker.style.top = `${bounds.top - box.top + point.y * bounds.height}px`;
      marker.hidden = false;
    }

    async function getPixels() {
      if (pixels) return pixels;
      if (!pixelLoading) {
        pixelLoading = (async () => {
          const source = window.MuseumImages ? await window.MuseumImages.read(photo) : image;
          if (!source.complete && source.decode) await source.decode();
          const canvas = document.createElement("canvas");
          canvas.width = source.naturalWidth;
          canvas.height = source.naturalHeight;
          const context = canvas.getContext("2d", {willReadFrequently: true});
          context.drawImage(source, 0, 0);
          return { context, width: canvas.width, height: canvas.height };
        })();
      }
      try {
        pixels = await pixelLoading;
        return pixels;
      } catch (error) {
        pixelLoading = null;
        throw error;
      }
    }

    let sampleRequest = 0;
    sampleButton.addEventListener("click", async event => {
      // Keyboard activation keeps the movable point, while pointer activation maps into the actual photo bounds.
      if (event.detail !== 0 || event.pointerType) {
        const bounds = imageBounds();
        if (!bounds) return;
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = (event.clientY - bounds.top) / bounds.height;
        if (x < 0 || x >= 1 || y < 0 || y >= 1) {
          status.textContent = "请在照片画幅内取色。";
          return;
        }
        point = { x, y };
      }
      mark();
      const sampledPoint = point;
      const request = ++sampleRequest;
      try {
        const { context, width, height } = await getPixels();
        const x = Math.min(width - 1, Math.floor(sampledPoint.x * width));
        const y = Math.min(height - 1, Math.floor(sampledPoint.y * height));
        const rgba = context.getImageData(x, y, 1, 1).data;
        if (version !== renderVersion || request !== sampleRequest) return;
        if (!rgba[3]) {
          status.textContent = "此处为透明像素，请选择照片内的其他位置。";
          return;
        }
        const hex = "#" + [...rgba.slice(0, 3)].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
        lastPick = { ...sampledPoint, hex, photoKey: photo.key };
        history.unshift(lastPick);
        if (history.length > 8) history.length = 8;
        status.textContent = `取色结果 ${hex}`;
        drawResult();
        drawRecent();
      } catch {
        if (version === renderVersion && request === sampleRequest) status.textContent = "暂时无法读取这张照片的像素，请重新取色。";
      }
    });

    const clamp = value => Math.max(0, Math.min(.99999, value));
    sampleButton.addEventListener("keydown", event => {
      const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? .08 : .015;
      point = { x: clamp(point.x + direction[0] * step), y: clamp(point.y + direction[1] * step) };
      mark();
    });
    sampleButton.addEventListener("focus", mark);
    if (history.some(item => item.photoKey === photo.key)) {
      if (image.complete) mark();
      else image.addEventListener("load", mark, {once: true});
    }
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        if (!marker.hidden) mark();
      });
      observer.observe(sampleButton);
      cleanup = () => observer.disconnect();
    }
  }

  function facts(record) {
    const family = [record.familyZh, record.family].filter(Boolean).join(" ");
    const fields = [
      ["科", family],
      ["属", record.genus],
      ["馆藏机构", record.museum || record.institution],
      [record.idType || "记录编号", record.accession],
      ["馆方名称", record.originalName && record.originalName !== latin(record) ? record.originalName : ""],
      ["采集地", record.locality || record.country]
    ];
    return fields.filter(([, value]) => value).map(([label, value]) =>
      `<tr><th scope="row">${escape(label)}</th><td>${escape(value)}</td></tr>`).join("");
  }

  function photoLicenses(record, noticeConditions) {
    return record.photos.map((photo, index) => {
      const label = viewName(photo, index, record.photos.length);
      const links = [
        external(photo.originalURL, "查看原图"),
        sourceLink(photo.source, "图片出处"),
        photo.evidence !== photo.source && photo.evidence !== photo.licenseURL ? external(photo.evidence, "出处依据") : "",
        external(photo.licenseURL, photo.license || "查看许可")
      ].filter(Boolean).join("");
      return `<div class="license-item"><h3>${escape(label)}</h3>
        ${photoAttribution(photo, record) ? `<p>署名：${escape(photoAttribution(photo, record))}</p>` : ""}
        ${photo.conditions && photo.conditions !== noticeConditions ? `<p>${escape(photo.conditions)}</p>` : ""}
        ${photo.hasImage && photo.note && photo.note !== photo.conditions ? `<p>${escape(photo.note)}</p>` : ""}
        ${photo.hasImage && photo.displayTreatment ? `<p>展示处理：${escape(photo.displayTreatment)}。展示图沿用原图许可。</p>` : ""}
        ${photo.hasImage && photo.wallCropped && photo.wallTreatment ? `<p>${escape(photo.wallTreatment)}。</p>` : ""}
        ${paperMask(photo) ? `<p>${paperMaskNote}</p>` : ""}
        <div class="links">${links}${!photo.licenseURL && photo.license ? escape(photo.license) : ""}</div>
      </div>`;
    }).join("");
  }

  function book() {
    const {record, photoIndex} = route;
    const photo = record.photos[photoIndex];
    const hasImage = photo?.hasImage && photo.src;
    const chosen = photo ? viewName(photo, photoIndex, record.photos.length) : "";
    const photoLinks = [
      external(photo?.originalURL, "查看原图"),
      external(photo?.licenseURL, "查看此图许可")
    ].filter(Boolean).join(" · ");
    const recordLinks = [
      sourceLink(record.museumURL || record.source, "馆方标本记录"),
      record.museumURL && record.source !== record.museumURL ? sourceLink(record.source, "标本记录") : "",
      external(record.datasetURL, "来源数据集")
    ].filter(Boolean).join("");
    const noticeConditions = hasImage ? "" : photo?.conditions;
    const linkedPhoto = photo?.source || record.museumURL || record.source;
    main.className = "book";
    main.innerHTML = `<aside class="directory" aria-labelledby="directory-title">
      <h2 id="directory-title">标本目录</h2>
      <label class="searchbox">${searchIcon}<input type="search" aria-label="搜索学名、中文名或编号" placeholder="搜索学名、中文名或编号" value="${escape(search)}"></label>
      <details class="directory-disclosure" ${!narrow.matches || mobileDirectoryOpen || search ? "open" : ""}>
        <summary>目录 <span class="directory-count" aria-live="polite"></span></summary>
        <nav class="records" aria-label="标本目录"></nav>
      </details>
    </aside>
    <article>
      <h1 tabindex="-1">${escape(name(record))}</h1>
      ${record.name && latin(record) ? `<p class="binomial">${escape(latin(record))}</p>` : ""}
      <div class="content">
        <figure class="cleanphoto">
          ${hasImage ? `<a class="book-photo-link" href="${photoSource(photo.src)}" target="_blank" rel="noopener" aria-label="查看完整展示图">${imageMarkup(photo, record)}</a>
            <figcaption>${escape(chosen)} · ${photoByline(photo, record)}<br>${photoLinks}</figcaption>`
          : `<div class="restricted">本馆为此照片提供出处链接。 ${sourceLink(linkedPhoto, "前往馆方查看")}
            ${noticeConditions ? `<p>${escape(noticeConditions)}</p>` : ""}
            ${!positions.has(record.id) ? `<p>返回展厅时将回到上次可展出的标本「${escape(name(records.get(wallId)))}」。</p>` : ""}</div>`}
          ${views(record, photoIndex)}
        </figure>
        <section>
          <h2 class="section">标本记录</h2>
          <table class="facts"><tbody>${facts(record)}</tbody></table>
          <div class="record-actions">${positions.has(record.id) ? `<a href="${escape(fragment("study", record.id, photoIndex))}">近观标本</a>` : ""}${recordLinks}</div>
        </section>
      </div>
      ${record.observation ? `<section class="lower"><h2 class="section">翅面观察</h2><p>${escape(record.observation)}</p></section>` : ""}
      <section class="lower"><h2 class="section">图片来源与许可</h2>${photoLicenses(record, noticeConditions)}</section>
    </article>`;

    const searchInput = main.querySelector("input[type=search]");
    const disclosure = main.querySelector(".directory-disclosure");
    searchInput.addEventListener("input", () => {
      search = searchInput.value;
      disclosure.open = true;
      directoryResults();
    });
    disclosure.addEventListener("toggle", () => {
      if (narrow.matches && disclosure.isConnected) mobileDirectoryOpen = disclosure.open;
    });
    directoryResults(true);
  }

  function directoryResults(keepCurrentVisible = false) {
    const list = main.querySelector(".records");
    const searchTerms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const results = directory.filter(record => {
      const haystack = [record.name, record.latin, record.binomial, record.originalName, record.accession, record.id, record.family, record.familyZh, record.genus, record.museum]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      return searchTerms.every(term => haystack.includes(term));
    });
    main.querySelector(".directory-count").textContent = `${results.length} 条`;
    list.innerHTML = results.length ? results.map(record => {
      const current = record.id === route.record.id;
      const label = name(record);
      const distinction = nameCounts.get(label) > 1
        ? [record.museum || record.institution, record.accession].filter(Boolean).join(" · ")
        : "";
      return `<a href="${escape(fragment("book", record.id, null, wallId))}" ${current ? 'class="active" aria-current="page"' : ""}>
        ${escape(label)}${searchTerms.length && record.name && latin(record) ? `<i>${escape(latin(record))}</i>` : ""}
        ${distinction ? `<small>${escape(distinction)}</small>` : ""}</a>`;
    }).join("") : "<p>没有匹配的标本。</p>";

    if (keepCurrentVisible) {
      const current = list.querySelector(".active");
      if (current) list.scrollTop = Math.max(0, current.offsetTop - list.offsetTop - list.clientHeight / 2);
    }
  }

  let cleanup = () => {};

  function render(restoreFocus = true) {
    ++renderVersion;
    cleanup();
    cleanup = () => {};
    const previous = route;
    const active = document.activeElement;
    const focusedStep = active?.dataset.step;
    const focusedView = active?.dataset.view;
    route = parseRoute();
    updateModeLinks();
    if (route.mode !== "plaque") {
      closingPlacard = false;
      main.querySelector("dialog.placard[open]")?.close();
    }
    if (isWall(route.mode)) {
      if (route.mode === "gallery" && previous && !isWall(previous.mode)) highlightedId = wallId;
      wall();
      if (route.mode === "plaque") placard();
    }
    if (route.mode === "study") study();
    if (route.mode === "book") book();

    if (!initialRender && restoreFocus && route.mode !== "plaque") {
      let target;
      if (route.mode === "gallery" && previous?.mode === "gallery" && focusedStep) {
        target = main.querySelector(`[data-step="${focusedStep}"]:not(:disabled)`) || main.querySelector("[data-step]:not(:disabled)");
      }
      if (route.mode === "gallery" && previous && previous.mode !== "gallery") {
        const fromPlacard = previous.mode === "plaque";
        target = exhibitControl(fromPlacard ? previous.record.id : wallId, fromPlacard ? ".plaque" : ".frame-link");
      }
      if (route.mode === previous?.mode && focusedView !== undefined) {
        target = main.querySelector(`[data-view="${route.photoIndex}"]`);
      }
      const stayingOnWall = isWall(route.mode) && isWall(previous?.mode);
      if (hall === "journal" && route.mode === "gallery" && previous?.mode === "gallery" && previous.record.id !== route.record.id) {
        target = main.querySelector("h1");
        window.scrollTo(0, 0);
      }
      if (!stayingOnWall && (route.mode !== previous?.mode || route.record.id !== previous?.record.id)) window.scrollTo(0, 0);
      if (route.mode === "book" && route.record.id !== previous?.record.id && narrow.matches && active?.closest(".records")) {
        target = main.querySelector("h1");
        target.scrollIntoView({block: "start"});
      }
      (target || main.querySelector("h1"))?.focus({preventScroll: true});
    }
    initialRender = false;
  }

  window.addEventListener("hashchange", () => render());
  narrow.addEventListener("change", () => render(false));
  main.addEventListener("click", event => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    const view = Number(button.dataset.view);
    if (view !== route.photoIndex && route.record.photos[view]) navigate(fragment(route.mode, route.record.id, view, wallId));
  });
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest("input,textarea,select,[contenteditable]")) return;
    if (route.mode === "plaque") return; // The modal handles Escape and its open state makes the wall inert.
    if (event.key === "Escape" && route.mode !== "gallery") {
      event.preventDefault();
      navigate(galleryFragment());
    }
    if (route.mode === "gallery" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      moveWall(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  render();
})();
