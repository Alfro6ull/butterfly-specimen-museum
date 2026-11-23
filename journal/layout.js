(() => {
  "use strict";

  const chevron = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
  const pencil = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 15 1-4 8.7-8.7a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L9 15l-5 1Z M12 4l4 4"/></svg>';

  function journalPhoto(item, escape, external) {
    if (!/^[a-z0-9][a-z0-9._-]*\.webp$/i.test(item.file || "")) return "";
    const image = `journal/images/${escape(item.file)}`;
    const name = item.title || "野外记录";
    const place = [item.location, item.date].filter(Boolean).map(escape).join(" · ");
    const source = external(item.source, "图片出处");
    const license = external(item.licenseURL, item.license || "查看许可") || escape(item.license);
    return `<figure class="journal-field-photo">
      <a href="${image}" target="_blank" rel="noopener" aria-label="${escape(`查看完整图片：${name}`)}"><img src="${image}" alt="${escape(name)}" loading="lazy" decoding="async"></a>
      <figcaption><strong>${escape(name)}</strong>
        ${place ? `<span>${place}</span>` : ""}
        ${item.caption ? `<span>${escape(item.caption)}</span>` : ""}
        <span class="journal-photo-source">${escape(item.author)} ${source} ${license}</span>
      </figcaption>
    </figure>`;
  }

  function fieldSection(profile, record, inlinePhoto, escape, external) {
    const fields = profile ? [
      ["观察地域", profile.region], ["栖息地", profile.habitat],
      ["成蝶季节", profile.season], ["生活史", profile.lifeCycle], ["幼虫寄主", profile.host]
    ] : [
      ["馆藏机构", record.museum || record.institution],
      [record.idType || "馆藏编号", record.accession],
      ["采集地", record.locality || record.country],
      ["科", [record.familyZh, record.family].filter(Boolean).join(" ")]
    ];
    const rows = fields.filter(([, value]) => value).map(([key, value]) =>
      `<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join("");
    const lead = profile?.lead || record.observation;
    const treatments = [...new Set((profile?.images || []).map(item => item.treatment).filter(Boolean))];
    return `<section class="journal-entry" aria-labelledby="journal-entry-title">
      <h2 id="journal-entry-title">${profile ? "野外观察" : "馆藏记录"}</h2>
      ${lead ? `<p class="journal-lead">${escape(lead)}</p>` : ""}
      <div class="journal-entry-layout${inlinePhoto ? " has-field-photo" : ""}">
        ${rows ? `<dl class="journal-facts">${rows}</dl>` : ""}
        ${inlinePhoto}
      </div>
      ${profile?.fieldNote ? `<div class="journal-field-note"><h3>${pencil}观察提示</h3><p>${escape(profile.fieldNote)}</p></div>` : ""}
      ${profile?.sources?.length ? `<details class="journal-sources">
        <summary>资料出处</summary>
        ${profile.taxonomyNote ? `<p>${escape(profile.taxonomyNote)}</p>` : ""}
        <ul>${profile.sources.map(item => external(item.url, item.label)).filter(Boolean).map(link => `<li>${link}</li>`).join("")}</ul>
        ${profile.images?.length ? "<p>补充图像为网页展示转为 WebP，沿用各图原始许可。</p>" : ""}
        ${treatments.map(treatment => `<p>${escape(treatment)}</p>`).join("")}
      </details>` : ""}
    </section>`;
  }

  function palette(swatches, escape, studyHref) {
    const colors = (swatches || []).filter(item => /^#[a-f0-9]{6}$/i.test(item.hex)).slice(0, 5);
    return `<section class="journal-palette" aria-labelledby="journal-palette-title">
      <div class="journal-palette-heading"><h2 id="journal-palette-title">照片取色</h2><a href="${escape(studyHref)}">近观取色 ${chevron}</a></div>
      ${colors.length ? `<div class="journal-swatches">${colors.map(({hex, label}) =>
        `<button type="button" data-copy-hex="${hex.toUpperCase()}" aria-label="${escape(`复制${label ? `${label}的` : ""}色值 ${hex.toUpperCase()}`)}"${label ? ` title="${escape(label)}"` : ""}>
          <span class="journal-ink" style="--ink:${hex}" aria-hidden="true"></span><code>${hex.toUpperCase()}</code>
        </button>`).join("")}</div>` : ""}
      <p class="journal-status" data-journal-status role="status"></p>
    </section>`;
  }

  window.renderFieldJournal = ({record, photo, page, total, profile, title, imageHTML, creditHTML, toolsHTML, navigationHTML, studyHref, bookHref, swatches, featured, viewsHTML, escape, external}) => {
    const latin = record.latin || record.binomial || profile?.binomial || "";
    const profileImages = profile?.images || [];
    const heroFieldPhoto = profileImages.find(item => item.kind === "host" || item.kind === "plate") || profileImages[0];
    const inlinePhoto = heroFieldPhoto ? journalPhoto(heroFieldPhoto, escape, external) : "";
    const remaining = profileImages.filter(item => item !== heroFieldPhoto);
    const photos = remaining.map(item => journalPhoto(item, escape, external)).filter(Boolean);
    const botanical = ["orchid", "fern", "palm", "taro"][(page - 1) % 4];
    const view = photo?.view || (photo?.title ? "馆藏照片" : "");
    const imageTitle = `近观${title}`;
    const indexLinks = (featured || []).filter(item => String(item.href || "").startsWith("#"));
    const index = indexLinks.length ? `<details class="journal-index">
      <summary>观察索引</summary>
      <nav aria-label="观察专题">${indexLinks.map(item => `<a href="${escape(item.href)}"${item.id === record.id ? ' aria-current="page"' : ""}>${escape(item.title)}</a>`).join("")}</nav>
    </details>` : "";
    return `<header class="journal-header">
      <div class="journal-room-name"><span class="journal-room-mark" aria-hidden="true"></span><span>自然手账</span></div>
      ${toolsHTML}
    </header>
    <div class="journal-controls">
      ${index}
      <div class="journal-navigation" aria-label="标本 ${page} / ${total}">${navigationHTML}</div>
    </div>
    <div class="journal-volume">
      <article class="journal-spread" data-exhibit="${escape(record.id)}" aria-label="自然手账">
        <div class="journal-page journal-left">
          <header class="journal-entry-heading">
            ${view ? `<p class="journal-view">${escape(view)}</p>` : ""}
            <h1 tabindex="-1">${escape(title)}</h1>
            ${latin && latin !== title ? `<p class="journal-latin" lang="la">${escape(latin)}</p>` : ""}
          </header>
          <figure class="journal-specimen">
            <a class="frame-link" href="${escape(studyHref)}" aria-label="${escape(imageTitle)}">
              <span class="journal-mount">${imageHTML}</span>
            </a>
            <figcaption>
              <button class="plaque" type="button" data-plaque="${escape(record.id)}" aria-haspopup="dialog" aria-controls="specimen-placard" aria-label="${escape(`查看${title}展签`)}"><span>标本展签</span>${chevron}</button>
              ${creditHTML}
            </figcaption>
          </figure>
          ${viewsHTML || ""}
          ${palette(swatches, escape, studyHref)}
        </div>
        <div class="journal-page journal-right">
          <div class="journal-right-inner">
            ${fieldSection(profile, record, inlinePhoto, escape, external)}
            <a class="journal-book-link" href="${escape(bookHref)}">打开百科 ${chevron}</a>
          </div>
          ${profile ? "" : `<footer class="journal-page-footer">
            <a class="journal-botanical" href="conservatory/index.html" aria-label="页角植物图版出处">
              <img src="conservatory/${botanical}.webp" alt="" aria-hidden="true"><span>页角植物图版</span>
            </a>
          </footer>`}
        </div>
      </article>
      ${photos.length ? `<details class="journal-field-appendix">
        <summary><span>野外图录</span><span>${photos.length} 张</span>${chevron}</summary>
        <div class="journal-field-photos">${photos.join("")}</div>
      </details>` : ""}
    </div>
    <p class="greenhouse-credit"><a href="conservatory/index.html" target="_blank" rel="noopener">温室布景出处</a></p>`;
  };
})();
