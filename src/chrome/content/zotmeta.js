ZotMeta = {
    id: null,
    version: null,
    rootURI: null,
    initialized: false,
    addedElementIDs: [],

    init({ id, version, rootURI } = {}) {
        if (this.initialized) return;
        this.id = id;
        this.version = version;
        this.rootURI = rootURI;
        this.initialized = true;
    },
    
    log(msg) {
        Zotero.debug("ZotMeta: " + msg);
    },

    addToWindow(window) {
        let doc = window.document;
        
        // createElementNS() necessary in Zotero 6; createElement() defaults to HTML in Zotero 7
        let XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
        
        // Add menu option
        let menuitem = doc.createElementNS(XUL_NS, 'menuitem');
        menuitem.id = 'update-metadata';
        menuitem.setAttribute('type', 'button');
        menuitem.setAttribute('data-l10n-id', 'update-metadata');
        menuitem.addEventListener('command', () => {
            this.updateSelectedItemsMetadata();
        });
        doc.getElementById('zotero-itemmenu').appendChild(menuitem);
        this.storeAddedElement(menuitem);
        
        // Use strings from zotmeta.ftl (Fluent) in Zotero 7
        if (Zotero.platformMajorVersion >= 102) {
            window.MozXULElement.insertFTLIfNeeded("zotmeta.ftl");
        }
        // Use strings from zotmeta.properties (legacy properties format) in Zotero 6
        else {
            let stringBundle = Services.strings.createBundle(
                'chrome://zotmeta/locale/zotmeta.properties'
            );
            doc.getElementById('update-metadata')
                .setAttribute('label', stringBundle.GetStringFromName('update-metadata.label'));
        }
    },
    
    addToAllWindows() {
        var windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (!win.ZoteroPane) continue;
            this.addToWindow(win);
        }
    },
    
    storeAddedElement(elem) {
        if (!elem.id) {
            throw new Error("Element must have an id");
        }
        this.addedElementIDs.push(elem.id);
    },
    
    removeFromWindow(window) {
        var doc = window.document;
        // Remove all elements added to DOM
        for (let id of this.addedElementIDs) {
            // ?. (null coalescing operator) not available in Zotero 6
            let elem = doc.getElementById(id);
            if (elem) elem.remove();
        }
        doc.querySelector('[href="zotmeta.ftl"]').remove();
    },
    
    removeFromAllWindows() {
        var windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (!win.ZoteroPane) continue;
            this.removeFromWindow(win);
        }
    },

    async updateSelectedItemsMetadata() {
        var items = Zotero.getActiveZoteroPane().getSelectedItems();
        var itemCount = items.length;
        if (itemCount === 0) {
            Utilities.publishSuccess("Finished", "No item is selected.")
        }
        var progressHandle = Utilities.initializeProgress("Updating metadata for " + itemCount + " items...")

        var pool = new ThreadPool(5);
        var progress = 0;
        var successCount = 0;
        var failedCount = 0;
        for (let i = 0; i < itemCount; i++) {
            pool.submit(async () => {
                var item = items[i];
                var status;
                if (item.itemTypeID === Zotero.ItemTypes.getID('book')) {
                    status = await Book.updateMetadata(item);
                } else if (item.itemTypeID === Zotero.ItemTypes.getID('journalArticle')) {
                    status = await Journal.updateMetadata(item);
                } else {
                    status = 1;
                }
                if (status === 0) {
                    successCount++;
                } else if(status === 1) {
                    failedCount++;
                }
                progress++;
                var progressMapped = Math.round(progress / itemCount * 100);
                Utilities.publishProgress(progressHandle, progressMapped, progress + " out of " + itemCount + " finished updating.");
            });
        }

        pool.execute();
        await pool.wait();
        Utilities.publishProgress(progressHandle, 100, successCount + " items updated, " + failedCount + " items failed.", "Finished");
    }
};
