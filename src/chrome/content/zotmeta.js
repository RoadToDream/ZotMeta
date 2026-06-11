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

        // Explicit XUL namespace keeps menu insertion stable in Zotero 7+ chrome windows.
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

        let createParentMenuitem = doc.createElementNS(XUL_NS, 'menuitem');
        createParentMenuitem.id = 'zotmeta-create-parent-item';
        createParentMenuitem.setAttribute('type', 'button');
        createParentMenuitem.setAttribute('label', 'Create Parent Item');
        createParentMenuitem.addEventListener('command', () => {
            this.createParentItemsForSelectedAttachments();
        });
        doc.getElementById('zotero-itemmenu').appendChild(createParentMenuitem);
        this.storeAddedElement(createParentMenuitem);

        this.addToolsMenuItem(window, XUL_NS);

        window.MozXULElement.insertFTLIfNeeded("zotmeta.ftl");
    },

    addToolsMenuItem(window, XUL_NS) {
        let doc = window.document;
        if (doc.getElementById('zotmeta-tools-menuitem')) {
            return;
        }
        let toolsMenu = doc.getElementById('menu_ToolsPopup')
            || doc.getElementById('tools-menu-popup')
            || doc.getElementById('menu-tools-popup');
        if (!toolsMenu) {
            this.log("Tools menu popup not found; ZotMeta control panel menu item was not added.");
            return;
        }

        let separator = doc.createElementNS(XUL_NS, 'menuseparator');
        separator.id = 'zotmeta-tools-separator';
        toolsMenu.appendChild(separator);
        this.storeAddedElement(separator);

        let menuitem = doc.createElementNS(XUL_NS, 'menuitem');
        menuitem.id = 'zotmeta-tools-menuitem';
        menuitem.setAttribute('type', 'button');
        menuitem.setAttribute('label', 'ZotMeta Control Panel');
        menuitem.addEventListener('command', () => {
            this.showControlPanel(window);
        });
        toolsMenu.appendChild(menuitem);
        this.storeAddedElement(menuitem);
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

    getConcurrentThreads() {
        return Utilities.getConcurrentThreads(this.updateMaxConcurrent);
    },

    setConcurrentThreads(value) {
        this.updateMaxConcurrent = Utilities.setConcurrentThreads(value);
        this.fillUpdateQueue();
        return this.updateMaxConcurrent;
    },

    async prepareItemForMetadataUpdate(item) {
        if (!Utilities.isRegularItem(item)) {
            return;
        }
        var needsDOI = item.itemTypeID === Zotero.ItemTypes.getID('journalArticle') && !item.getField('DOI');
        var needsArxiv = item.itemTypeID === Zotero.ItemTypes.getID('preprint') && !Arxiv.getArxivID(item);
        if (!needsDOI && !needsArxiv) {
            return;
        }

        var identifiers = await Utilities.extractIdentifiersFromItemAttachments(item);
        if (Utilities.applyIdentifiersToItem(item, identifiers)) {
            await Utilities.saveItemTx(item);
        }
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
        var maxConcurrent = this.getConcurrentThreads();
        while (this.updateActiveCount < maxConcurrent && this.updateQueue.length > 0) {
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
        await this.prepareItemForMetadataUpdate(item);
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
    },

    getAllLibraryItems() {
        if (!Zotero.Items || typeof Zotero.Items.getAll !== 'function') {
            return [];
        }
        try {
            return Zotero.Items.getAll();
        } catch (error) {
            return [];
        }
    },

    getItemTypeLabel(item) {
        try {
            if (Zotero.ItemTypes && typeof Zotero.ItemTypes.getName === 'function') {
                return Zotero.ItemTypes.getName(item.itemTypeID);
            }
        } catch (error) {}
        return String(item.itemTypeID || "unknown");
    },

    getLibraryStats() {
        var items = this.getAllLibraryItems();
        var stats = {
            totalItems: 0,
            attachments: 0,
            failed: 0,
            skipped: 0,
            typeDistribution: []
        };
        var typeCounts = {};

        for (let item of items) {
            if (Utilities.isAttachment(item)) {
                stats.attachments++;
                continue;
            }
            if (!Utilities.isRegularItem(item)) {
                continue;
            }
            stats.totalItems++;
            if (Utilities.hasTag(item, Utilities.failedTag)) {
                stats.failed++;
            }
            if (Utilities.hasTag(item, Utilities.skippedTag)) {
                stats.skipped++;
            }
            var typeLabel = this.getItemTypeLabel(item);
            typeCounts[typeLabel] = (typeCounts[typeLabel] || 0) + 1;
        }

        for (let typeLabel in typeCounts) {
            stats.typeDistribution.push({
                label: typeLabel,
                count: typeCounts[typeLabel]
            });
        }
        stats.typeDistribution.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        return stats;
    },

    showControlPanel(window = null) {
        this.openPreferencesPane();
    },

    openPreferencesPane() {
        var internalUtilities = Zotero.Utilities && Zotero.Utilities.Internal;
        if (!internalUtilities || typeof internalUtilities.openPreferences !== 'function') {
            Utilities.publishError("ZotMeta settings unavailable", "Zotero preferences could not be opened.");
            return;
        }

        try {
            internalUtilities.openPreferences("zotmeta-prefpane");
        } catch (error) {
            this.log("Unable to open Zotero preferences: " + error);
            Utilities.publishError("ZotMeta settings unavailable", "Zotero preferences could not be opened.");
        }
    },

    getAttachmentTitle(attachment) {
        if (attachment.getField && attachment.getField('title')) {
            return attachment.getField('title');
        }
        if (attachment.attachmentFilename) {
            return attachment.attachmentFilename.replace(/\.pdf$/i, "");
        }
        return "Untitled attachment";
    },

    getParentItemType(identifiers) {
        if (identifiers.DOI) {
            return 'journalArticle';
        }
        if (identifiers.arxivID) {
            return 'preprint';
        }
        return 'document';
    },

    async createParentItemForAttachment(attachment) {
        if (!Utilities.isPDFAttachment(attachment)) {
            return 2;
        }
        if (attachment.parentID) {
            return 2;
        }

        var identifiers = await Utilities.extractIdentifiersFromAttachment(attachment);
        var parent = new Zotero.Item(this.getParentItemType(identifiers));
        parent.libraryID = attachment.libraryID;
        parent.setField('title', this.getAttachmentTitle(attachment));
        Utilities.applyIdentifiersToItem(parent, identifiers);
        await Utilities.saveItemTx(parent);

        attachment.parentID = parent.id;
        await Utilities.saveItemTx(attachment);

        var updater = this.getMetadataUpdater(parent);
        if (updater) {
            var status = await this.updateItemWithRetry(updater, parent);
            await Utilities.markItemUpdateStatus(parent, status);
            return status;
        }
        return 0;
    },

    async createParentItemsForSelectedAttachments() {
        var pane = Zotero.getActiveZoteroPane();
        var selectedItems = pane.getSelectedItems();
        var window = this.getActiveWindow(pane);
        var attachments = selectedItems.filter(item => Utilities.isPDFAttachment(item));
        if (attachments.length === 0) {
            Utilities.publishSuccess("No parent items created", "Select one or more PDF attachments first.");
            return;
        }

        var progressHandle = Utilities.initializeModernProgress(
            window,
            "Creating parent items",
            "Preparing " + Utilities.pluralize(attachments.length, "PDF attachment") + "..."
        );

        var created = 0;
        var failed = 0;
        var skipped = 0;
        var completed = 0;
        for (let attachment of attachments) {
            var progressItem = Utilities.addProgressItem(
                progressHandle,
                this.getAttachmentTitle(attachment) + ": queued"
            );
            var status = 1;
            try {
                status = await this.createParentItemForAttachment(attachment);
                if (status === 2) {
                    skipped++;
                } else if (status === 0) {
                    created++;
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                this.log("Failed to create parent item: " + error);
            }

            completed++;
            var progress = Math.round(completed / attachments.length * 100);
            Utilities.updateProgressItem(
                progressItem,
                100,
                this.getAttachmentTitle(attachment) + ": done",
                true,
                status === 1
            );
            Utilities.publishProgress(
                progressHandle,
                progress,
                Utilities.formatBatchProgress(completed, attachments.length, created, failed, skipped),
                "Creating parent items"
            );
        }

        var summary = created + " parent items created";
        if (failed > 0) {
            summary += ", " + failed + " failed";
        }
        if (skipped > 0) {
            summary += ", " + skipped + " skipped";
        }
        summary += ".";
        var title = failed > 0 ? "Parent item creation finished with issues" : "Parent items created";
        Utilities.publishFinishedProgress(progressHandle, summary, title, failed > 0);
    }
};
