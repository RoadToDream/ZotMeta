ZotMeta = {
    id: null,
    version: null,
    rootURI: null,
    initialized: false,
    addedElementIDs: [],
    updateQueue: [],
    updateActiveCount: 0,
    updateMaxConcurrent: 6,
    updateProgressHandle: null,
    updateBatchCounter: 0,
    updateTotals: null,

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
        if (doc.getElementById('update-metadata')) {
            return;
        }

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
        let fluentLink = doc.querySelector('[href="zotmeta.ftl"]');
        if (fluentLink) {
            fluentLink.remove();
        }
    },

    removeFromAllWindows() {
        var windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (!win.ZoteroPane) continue;
            this.removeFromWindow(win);
        }
    },

    isArxivPreprint(item) {
        if (item.itemTypeID !== Zotero.ItemTypes.getID('preprint')) {
            return false;
        }
        var repository = item.getField('repository');
        var archiveID = item.getField('archiveID');
        if (repository && repository.toLowerCase().indexOf('arxiv') !== -1) {
            return true;
        }
        if (archiveID && archiveID.toLowerCase().indexOf('arxiv:') === 0) {
            return true;
        }
        return Arxiv.getArxivID(item) !== null;
    },

    getMetadataUpdater(item) {
        if (item.itemTypeID === Zotero.ItemTypes.getID('book')) {
            return Book;
        }
        if (item.itemTypeID === Zotero.ItemTypes.getID('journalArticle')) {
            return Journal;
        }
        if (this.isArxivPreprint(item)) {
            return Arxiv;
        }
        return null;
    },

    getActiveWindow(pane = null) {
        if (pane && pane.document && pane.document.defaultView) {
            return pane.document.defaultView;
        }
        if (typeof Zotero.getMainWindow === 'function') {
            return Zotero.getMainWindow();
        }
        return null;
    },

    createUpdateTotals() {
        return {
            total: 0,
            completed: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            failedItems: []
        };
    },

    ensureUpdateProgress(window = null) {
        if (!this.updateProgressHandle) {
            this.updateProgressHandle = Utilities.initializeModernProgress(
                window,
                "Updating metadata",
                "Preparing metadata updates..."
            );
            this.updateTotals = this.createUpdateTotals();
        }
    },

    enqueueUpdateBatch(items, window = null) {
        this.ensureUpdateProgress(window);
        this.updateBatchCounter++;
        var batch = {
            name: "Batch " + this.updateBatchCounter,
            total: items.length,
            completed: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            failedItems: [],
            progressItem: null
        };
        batch.progressItem = Utilities.addProgressItem(
            this.updateProgressHandle,
            batch.name + ": queued " + Utilities.pluralize(batch.total, "item")
        );

        this.updateTotals.total += items.length;
        for (let item of items) {
            this.updateQueue.push({
                item,
                batch
            });
        }

        this.refreshUpdateProgress();
        this.fillUpdateQueue();
    },

    refreshUpdateProgress() {
        if (!this.updateProgressHandle || !this.updateTotals) {
            return;
        }
        var progress = this.updateTotals.total > 0
            ? Math.round(this.updateTotals.completed / this.updateTotals.total * 100)
            : 0;
        Utilities.publishProgress(
            this.updateProgressHandle,
            progress,
            Utilities.formatBatchProgress(
                this.updateTotals.completed,
                this.updateTotals.total,
                this.updateTotals.success,
                this.updateTotals.failed,
                this.updateTotals.skipped
            ),
            "Updating metadata"
        );
    },

    refreshUpdateBatch(batch, isFinished = false) {
        var progress = batch.total > 0
            ? Math.round(batch.completed / batch.total * 100)
            : 0;
        Utilities.updateProgressItem(
            batch.progressItem,
            progress,
            Utilities.formatBatchRow(batch.name, batch.completed, batch.total, batch.success, batch.failed, batch.skipped),
            isFinished,
            batch.failed > 0
        );
    },

    fillUpdateQueue() {
        while (this.updateActiveCount < this.updateMaxConcurrent && this.updateQueue.length > 0) {
            var task = this.updateQueue.shift();
            this.updateActiveCount++;
            this.runUpdateTask(task);
        }
    },

    async runUpdateTask(task) {
        try {
            await this.processUpdateTask(task);
        } finally {
            this.updateActiveCount--;
            this.fillUpdateQueue();
            this.finishUpdateQueueIfIdle();
        }
    },

    async processUpdateTask(task) {
        var item = task.item;
        var batch = task.batch;
        var updater = this.getMetadataUpdater(item);
        if (!updater) {
            await this.recordUpdateResult(batch, item, 2);
            return;
        }

        try {
            var status = await this.updateItemWithRetry(updater, item);
            await this.recordUpdateResult(batch, item, status);
        } catch (error) {
            this.log("Failed to update item metadata: " + error);
            await this.recordUpdateResult(batch, item, 1);
        }
    },

    async updateItemWithRetry(updater, item) {
        var status = await updater.updateMetadata(item);
        if (status === 0) {
            return status;
        }
        await Utilities.delay(500);
        return updater.updateMetadata(item);
    },

    async recordUpdateResult(batch, item, status) {
        try {
            await Utilities.markItemUpdateStatus(item, status);
        } catch (error) {
            this.log("Failed to update ZotMeta status tag: " + error);
        }

        batch.completed++;
        this.updateTotals.completed++;

        if (status === 0) {
            batch.success++;
            this.updateTotals.success++;
        } else if (status === 2) {
            batch.skipped++;
            this.updateTotals.skipped++;
        } else {
            batch.failed++;
            this.updateTotals.failed++;
            var title = Utilities.getItemDisplayTitle(item);
            batch.failedItems.push(title);
            this.updateTotals.failedItems.push(title);
        }

        this.refreshUpdateBatch(batch, batch.completed === batch.total);
        this.refreshUpdateProgress();
    },

    finishUpdateQueueIfIdle() {
        if (!this.updateProgressHandle || this.updateActiveCount !== 0 || this.updateQueue.length !== 0) {
            return;
        }

        var totals = this.updateTotals;
        var summary = Utilities.formatBatchSummary(totals.success, totals.failed, totals.skipped, totals.failedItems);
        var title = Utilities.getBatchSummaryTitle(totals.success, totals.failed, totals.skipped);
        Utilities.publishFinishedProgress(this.updateProgressHandle, summary, title, totals.failed > 0);
        this.updateProgressHandle = null;
        this.updateTotals = null;
    },

    async updateSelectedItemsMetadata() {
        var pane = Zotero.getActiveZoteroPane();
        var items = pane.getSelectedItems();
        var window = this.getActiveWindow(pane);
        var itemCount = items.length;
        if (itemCount === 0) {
            if (this.updateProgressHandle) {
                this.refreshUpdateProgress();
            } else {
                Utilities.publishSuccess("No metadata updated", "Select one or more supported items first.");
            }
            return;
        }
        this.enqueueUpdateBatch(items, window);
    }
};
