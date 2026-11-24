(() => {
  "use strict";

  const groups = [
    ["red", "红", "#a63b32"], ["orange", "橙", "#d77d2f"],
    ["yellow", "黄", "#d8bd42"], ["green", "绿", "#69894e"],
    ["blue", "蓝", "#547caa"], ["violet", "紫", "#80649a"],
    ["pink", "粉", "#c77c91"], ["brown", "褐", "#79563d"],
    ["black", "黑", "#292725"], ["white", "白", "#f4f0e8"]
  ];
  const cache = new WeakMap();

  function palette(record) {
    if (!cache.has(record)) {
      const photos = (record.photos || []).map((photo, index) => ({
        photo,
        index,
        colors: new Set(window.VERIFIED_WING_COLORS?.[photo.key] || [])
      })).filter(item => item.photo.hasImage && item.photo.src && item.colors.size);
      cache.set(record, {photos, colors: new Set(photos.flatMap(item => [...item.colors]))});
    }
    return cache.get(record);
  }

  function controls(host, selected, onChange) {
    const available = new Set((window.MUSEUM_DATA?.records || []).flatMap(record => (record.photos || [])
      .flatMap(photo => window.VERIFIED_WING_COLORS?.[photo.key] || [])));
    const shownGroups = groups.filter(([id]) => available.has(id));
    host.innerHTML = `<h3>按翅色浏览</h3><p class="color-directory-note">按照片中的翅色筛选，可多选（符合任一颜色）</p><div class="color-directory-options">${shownGroups.map(([id, label, color]) =>
      `<button type="button" data-color="${id}" aria-pressed="${selected.has(id)}"><i style="--color-chip:${color}"></i>${label}</button>`).join("")}</div><button class="color-directory-reset" type="button" ${selected.size ? "" : "hidden"}>重置颜色</button>`;
    host.querySelectorAll("[data-color]").forEach(button => button.addEventListener("click", () => {
      const next = new Set(selected);
      next.has(button.dataset.color) ? next.delete(button.dataset.color) : next.add(button.dataset.color);
      onChange(next);
      controls(host, next, onChange);
    }));
    host.querySelector(".color-directory-reset").addEventListener("click", () => { onChange(new Set()); controls(host, new Set(), onChange); });
  }
  window.MuseumColorDirectory = {
    mount: controls,
    reset: controls,
    matchingPhoto: (record, selected) => palette(record).photos.find(item => !selected.size || [...selected].some(color => item.colors.has(color))) || null
  };
})();
