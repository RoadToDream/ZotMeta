window.addEventListener('load', async function (event) {
    await Zotero.initializationPromise;
    ZotMeta.init();
    ZotMeta.addToWindow(window);
});
