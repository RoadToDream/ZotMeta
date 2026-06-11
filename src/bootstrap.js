var ZotMeta;

function log(msg) {
    Zotero.debug("ZotMeta: " + msg);
}

function install() {
    log("Installed");
}

async function startup({ id, version, rootURI }) {
    log("Starting");
    
    // Load chrome/content file directly via file:/// URL
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/utilities.js');
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/threadpool.js');
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/journal.js');
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/book.js');
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/arxiv.js');
    Services.scriptloader.loadSubScript(rootURI + 'chrome/content/zotmeta.js');
    ZotMeta.init({ id, version, rootURI });
    ZotMeta.addToAllWindows();
}

function onMainWindowLoad({ window }) {
    ZotMeta.addToWindow(window);
}

function onMainWindowUnload({ window }) {
    ZotMeta.removeFromWindow(window);
}

function shutdown() {
    log("Shutting down");
    ZotMeta.removeFromAllWindows();
}

function uninstall() {
    log("Uninstalled");
}
