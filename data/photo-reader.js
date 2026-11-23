/* File URLs can give each image its own opaque origin. The local data-script
   contains the same WebP bytes and gives the sampling canvas an origin-clean image. */
(function () {
  'use strict';
  const pending = new Map();
  window.__MUSEUM_PLATES = Object.create(null);

  function localImageData(photo) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'media/pixels/' + encodeURIComponent(photo.key) + '.js';
      tag.onload = () => {
        const dataURL = window.__MUSEUM_PLATES[photo.key];
        delete window.__MUSEUM_PLATES[photo.key];
        tag.remove();
        if (dataURL) resolve(dataURL);
        else reject(new Error('无法读取照片像素'));
      };
      tag.onerror = () => {
        tag.remove();
        reject(new Error('缺少本地照片像素文件'));
      };
      document.head.appendChild(tag);
    });
  }

  function read(photo) {
    if (!photo || !photo.hasImage || !photo.src) return Promise.reject(new Error('此条目仅提供馆方链接'));
    if (pending.has(photo.key)) return pending.get(photo.key);
    const promise = (async () => {
      const image = new Image();
      image.src = location.protocol === 'file:' ? await localImageData(photo) : photo.src;
      await image.decode();
      return image;
    })();
    pending.set(photo.key, promise);
    promise.catch(() => pending.delete(photo.key));
    if (pending.size > 10) pending.delete(pending.keys().next().value);
    return promise;
  }
  window.MuseumImages = Object.freeze({read});
}());
