var ZotMetaPreferences = {
    concurrentThreadsPref: "extensions.zotmeta.concurrentThreads",
    failedTag: "ZotMeta: Failed",
    skippedTag: "ZotMeta: Skipped",

    initialized: false,
    settingsBound: false,
    activityCountsByYear: {},
    activitySelectedYear: null,

    scheduleInit() {
        if (typeof Zotero !== 'undefined' && Zotero.Promise && typeof Zotero.Promise.delay === 'function') {
            Zotero.Promise.delay().then(() => this.initWhenReady());
            return;
        }
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(() => this.initWhenReady(), 0);
        }
    },

    initWhenReady() {
        var root = document.getElementById("zotmeta-preferences");
        if (!root) {
            this.scheduleInit();
            return;
        }
        if (!this.initialized) {
            root.addEventListener("showing", () => this.init());
            this.initialized = true;
        }
        this.init();
    },

    init() {
        this.safeRender(() => this.renderSettings(), "settings");
        this.safeRender(() => this.renderProjectInfo(), "project");
        this.safeRenderAsync(() => this.renderStats(), "stats");
    },

    safeRender(callback, section) {
        try {
            callback();
        } catch (error) {
            if (typeof Zotero !== 'undefined' && typeof Zotero.debug === 'function') {
                Zotero.debug("ZotMeta preferences: failed to render " + section + ": " + error);
            }
        }
    },

    async safeRenderAsync(callback, section) {
        try {
            await callback();
        } catch (error) {
            if (typeof Zotero !== 'undefined' && typeof Zotero.debug === 'function') {
                Zotero.debug("ZotMeta preferences: failed to render " + section + ": " + error);
            }
        }
    },

    clampConcurrentThreads(value) {
        var threads = parseInt(value, 10);
        if (isNaN(threads)) {
            threads = 6;
        }
        return Math.min(Math.max(threads, 1), 12);
    },

    getConcurrentThreads() {
        try {
            return this.clampConcurrentThreads(Services.prefs.getIntPref(this.concurrentThreadsPref, 6));
        } catch (error) {
            return 6;
        }
    },

    setConcurrentThreads(value) {
        var threads = this.clampConcurrentThreads(value);
        Services.prefs.setIntPref(this.concurrentThreadsPref, threads);
        return threads;
    },

    createElement(tagName, className = null, text = null) {
        var element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
        if (className) {
            element.className = className;
        }
        if (text !== null) {
            element.textContent = text;
        }
        return element;
    },

    renderSettings() {
        var range = document.getElementById("zotmeta-pref-concurrent-range");
        var number = document.getElementById("zotmeta-pref-concurrent-number");
        var save = document.getElementById("zotmeta-pref-save");
        if (!range || !number || !save) {
            return;
        }
        var threads = this.getConcurrentThreads();
        range.value = threads;
        number.value = threads;

        if (this.settingsBound) {
            return;
        }
        this.settingsBound = true;
        range.addEventListener("input", () => {
            number.value = range.value;
        });
        number.addEventListener("input", () => {
            range.value = number.value;
        });
        save.addEventListener("click", () => {
            var savedThreads = this.setConcurrentThreads(number.value);
            range.value = savedThreads;
            number.value = savedThreads;
        });
    },

    isRegularItem(item) {
        return item && typeof item.isRegularItem === 'function' && item.isRegularItem();
    },

    isAttachment(item) {
        return item && typeof item.isAttachment === 'function' && item.isAttachment();
    },

    hasTag(item, tagName) {
        if (!item || typeof item.getTags !== 'function') {
            return false;
        }
        var tags = item.getTags();
        for (let tag of tags) {
            var currentTag = typeof tag === 'string' ? tag : tag.tag;
            if (currentTag === tagName) {
                return true;
            }
        }
        return false;
    },

    async getAllLibraryItems() {
        if (!Zotero.Items || typeof Zotero.Items.getAll !== 'function') {
            return [];
        }
        try {
            var items;
            if (Zotero.Items.getAll.length === 0) {
                items = Zotero.Items.getAll();
            } else {
                items = Zotero.Items.getAll(this.getUserLibraryID(), false, false);
            }
            if (items && typeof items.then === 'function') {
                items = await items;
            }
            if (Zotero.Items.loadDataTypes && items && items.length) {
                await Zotero.Items.loadDataTypes(items, ['itemData', 'childItems', 'tags']);
            }
            return items || [];
        } catch (error) {
            return [];
        }
    },

    getUserLibraryID() {
        if (Zotero.Libraries && Zotero.Libraries.userLibraryID) {
            return Zotero.Libraries.userLibraryID;
        }
        if (typeof Zotero.libraryID !== 'undefined') {
            return Zotero.libraryID;
        }
        return 1;
    },

    getItemTypeLabel(item) {
        try {
            if (Zotero.ItemTypes && typeof Zotero.ItemTypes.getName === 'function') {
                return Zotero.ItemTypes.getName(item.itemTypeID);
            }
        } catch (error) {}
        return String(item.itemTypeID || "unknown");
    },

    async getLibraryStats() {
        var stats = await this.getItemStatsFromDB();
        var typeCounts = {};
        var activityCountsByYear = {};

        if (!stats) {
            stats = this.createEmptyStats();
            for (let item of await this.getAllLibraryItems()) {
                if (this.isAttachment(item)) {
                    stats.attachments++;
                    continue;
                }
                if (!this.isRegularItem(item)) {
                    continue;
                }
                stats.totalItems++;
                if (this.hasTag(item, this.failedTag)) {
                    stats.failed++;
                }
                if (this.hasTag(item, this.skippedTag)) {
                    stats.skipped++;
                }
                var typeLabel = this.getItemTypeLabel(item);
                typeCounts[typeLabel] = (typeCounts[typeLabel] || 0) + 1;
                var activityDate = this.getActivityDate(item);
                if (activityDate) {
                    var year = activityDate.getFullYear();
                    var key = this.formatDateKey(activityDate);
                    if (!activityCountsByYear[year]) {
                        activityCountsByYear[year] = {};
                    }
                    activityCountsByYear[year][key] = (activityCountsByYear[year][key] || 0) + 1;
                }
            }

            for (let typeLabel in typeCounts) {
                stats.typeDistribution.push({
                    label: typeLabel,
                    count: typeCounts[typeLabel]
                });
            }
            stats.typeDistribution.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        }
        this.activityCountsByYear = await this.getActivityCountsByYear(activityCountsByYear);
        if (this.activitySelectedYear === null) {
            this.activitySelectedYear = new Date().getFullYear();
        }
        stats.activity = this.createActivityForYear(this.activitySelectedYear);
        return stats;
    },

    createEmptyStats() {
        return {
            totalItems: 0,
            attachments: 0,
            failed: 0,
            skipped: 0,
            typeDistribution: [],
            activity: this.createEmptyActivity()
        };
    },

    async getItemStatsFromDB() {
        if (!Zotero.DB || typeof Zotero.DB.valueQueryAsync !== 'function' || typeof Zotero.DB.queryAsync !== 'function') {
            return null;
        }
        try {
            var libraryID = this.getUserLibraryID();
            var attachmentTypeID = Zotero.ItemTypes.getID('attachment');
            var noteTypeID = Zotero.ItemTypes.getID('note');
            var annotationTypeID = Zotero.ItemTypes.getID('annotation');
            var regularTypeIDs = [attachmentTypeID, noteTypeID, annotationTypeID].filter(typeID => typeID);
            var regularFilter = regularTypeIDs.length
                ? "AND itemTypeID NOT IN (" + regularTypeIDs.map(() => "?").join(", ") + ") "
                : "";
            var regularParams = [libraryID].concat(regularTypeIDs);

            var stats = this.createEmptyStats();
            stats.totalItems = await Zotero.DB.valueQueryAsync(
                "SELECT COUNT(*) FROM items WHERE libraryID=? " + regularFilter
                + "AND itemID NOT IN (SELECT itemID FROM deletedItems)",
                regularParams
            );
            stats.attachments = attachmentTypeID
                ? await Zotero.DB.valueQueryAsync(
                    "SELECT COUNT(*) FROM items WHERE libraryID=? AND itemTypeID=? "
                    + "AND itemID NOT IN (SELECT itemID FROM deletedItems)",
                    [libraryID, attachmentTypeID]
                )
                : 0;
            stats.failed = await this.getTaggedRegularItemCount(libraryID, this.failedTag, regularTypeIDs);
            stats.skipped = await this.getTaggedRegularItemCount(libraryID, this.skippedTag, regularTypeIDs);

            var typeRows = await Zotero.DB.queryAsync(
                "SELECT itemTypes.typeName AS label, COUNT(*) AS count FROM items "
                + "JOIN itemTypes USING (itemTypeID) "
                + "WHERE libraryID=? " + regularFilter
                + "AND itemID NOT IN (SELECT itemID FROM deletedItems) "
                + "GROUP BY items.itemTypeID ORDER BY count DESC, label",
                regularParams
            );
            stats.typeDistribution = typeRows.map(row => ({
                label: row.label,
                count: row.count
            }));
            return stats;
        } catch (error) {
            if (typeof Zotero !== 'undefined' && typeof Zotero.debug === 'function') {
                Zotero.debug("ZotMeta preferences: falling back to item-object stats: " + error);
            }
            return null;
        }
    },

    async getTaggedRegularItemCount(libraryID, tagName, excludedTypeIDs) {
        var typeFilter = excludedTypeIDs.length
            ? "AND items.itemTypeID NOT IN (" + excludedTypeIDs.map(() => "?").join(", ") + ") "
            : "";
        return Zotero.DB.valueQueryAsync(
            "SELECT COUNT(DISTINCT items.itemID) FROM items "
            + "JOIN itemTags USING (itemID) "
            + "JOIN tags USING (tagID) "
            + "WHERE items.libraryID=? AND tags.name=? " + typeFilter
            + "AND items.itemID NOT IN (SELECT itemID FROM deletedItems)",
            [libraryID, tagName].concat(excludedTypeIDs)
        );
    },

    createEmptyActivity() {
        return {
            days: [],
            max: 0,
            total: 0
        };
    },

    async getActivityCountsByYear(fallbackCounts) {
        if (!Zotero.DB || typeof Zotero.DB.queryAsync !== 'function') {
            return fallbackCounts;
        }
        try {
            var excludedTypeIDs = [
                Zotero.ItemTypes.getID('attachment'),
                Zotero.ItemTypes.getID('note'),
                Zotero.ItemTypes.getID('annotation')
            ].filter(typeID => typeID);
            var placeholders = excludedTypeIDs.map(() => "?").join(", ");
            var typeFilter = placeholders ? "AND itemTypeID NOT IN (" + placeholders + ") " : "";
            var rows = await Zotero.DB.queryAsync(
                "SELECT DATE(dateAdded) AS dateAdded, COUNT(*) AS count FROM items "
                + "WHERE libraryID=? " + typeFilter
                + "AND itemID NOT IN (SELECT itemID FROM deletedItems) "
                + "GROUP BY DATE(dateAdded)",
                [this.getUserLibraryID()].concat(excludedTypeIDs)
            );
            var counts = {};
            for (let row of rows) {
                var date = this.parseDateAdded(row.dateAdded);
                if (!date) {
                    continue;
                }
                var year = date.getFullYear();
                var key = this.formatDateKey(date);
                if (!counts[year]) {
                    counts[year] = {};
                }
                counts[year][key] = row.count;
            }
            return counts;
        } catch (error) {
            if (typeof Zotero !== 'undefined' && typeof Zotero.debug === 'function') {
                Zotero.debug("ZotMeta preferences: falling back to item activity counts: " + error);
            }
            return fallbackCounts;
        }
    },

    getActivityDate(item) {
        var value = item.dateAdded;
        if (!value && item.getField) {
            value = item.getField('dateAdded') || item.getField('dateAdded', true);
        }
        return this.parseDateAdded(value);
    },

    parseDateAdded(value) {
        if (!value) {
            return null;
        }
        if (value instanceof Date) {
            return this.startOfDay(value);
        }
        var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
            return null;
        }
        return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    },

    startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    },

    addDays(date, days) {
        var nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + days);
        return nextDate;
    },

    formatDateKey(date) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        return year + "-" + month + "-" + day;
    },

    createActivityForYear(year) {
        var today = this.startOfDay(new Date());
        var selectedYear = Math.min(parseInt(year, 10) || today.getFullYear(), today.getFullYear());
        var firstDate = new Date(selectedYear, 0, 1);
        var lastDate = new Date(selectedYear, 11, 31);
        var gridStart = this.addDays(firstDate, -firstDate.getDay());
        var gridEnd = this.addDays(lastDate, 6 - lastDate.getDay());
        var activityCounts = this.activityCountsByYear[selectedYear] || {};
        var days = [];
        var max = 0;
        var total = 0;

        for (let date = gridStart; date <= gridEnd; date = this.addDays(date, 1)) {
            var key = this.formatDateKey(date);
            var count = activityCounts[key] || 0;
            var inRange = date >= firstDate && date <= lastDate;
            var isFuture = date > today;
            if (inRange && count > max) {
                max = count;
            }
            if (inRange && !isFuture) {
                total += count;
            }
            days.push({
                key,
                count: inRange && !isFuture ? count : 0,
                inRange,
                isFuture
            });
        }

        return {
            days,
            max,
            total,
            year: selectedYear,
            canGoNext: selectedYear < today.getFullYear()
        };
    },

    async renderStats() {
        var stats = await this.getLibraryStats();
        var cards = document.getElementById("zotmeta-pref-stats-cards");
        if (!cards) {
            return;
        }
        cards.textContent = "";
        var values = [
            ["Total items", stats.totalItems],
            ["Attachments", stats.attachments],
            ["Failed", stats.failed],
            ["Skipped", stats.skipped]
        ];
        for (let value of values) {
            var card = this.createElement("div", "zotmeta-pref-card");
            var cardValue = this.createElement("div", "zotmeta-pref-card-value", value[1]);
            var label = this.createElement("div", "zotmeta-pref-card-label", value[0]);
            card.appendChild(cardValue);
            card.appendChild(label);
            cards.appendChild(card);
        }

        var typeList = document.getElementById("zotmeta-pref-type-list");
        if (!typeList) {
            return;
        }
        typeList.textContent = "";
        var types = stats.typeDistribution.slice(0, 8);
        if (types.length === 0) {
            var empty = this.createElement("div", "zotmeta-pref-info", "No regular items found.");
            typeList.appendChild(empty);
        } else {
            for (let type of types) {
                var row = this.createElement("div", "zotmeta-pref-type-row");
                var label = this.createElement("div", null, type.label);
                var bar = this.createElement("div", "zotmeta-pref-type-bar");
                var fill = this.createElement("div", "zotmeta-pref-type-fill");
                fill.style.width = (stats.totalItems > 0 ? Math.round(type.count / stats.totalItems * 100) : 0) + "%";
                var count = this.createElement("div", null, type.count);
                bar.appendChild(fill);
                row.appendChild(label);
                row.appendChild(bar);
                row.appendChild(count);
                typeList.appendChild(row);
            }
        }
        this.renderActivity(stats.activity);
    },

    renderActivity(activity) {
        var grid = document.getElementById("zotmeta-pref-activity-grid");
        var summary = document.getElementById("zotmeta-pref-activity-summary");
        var year = document.getElementById("zotmeta-pref-activity-year");
        var previous = document.getElementById("zotmeta-pref-activity-previous");
        var next = document.getElementById("zotmeta-pref-activity-next");
        if (!grid || !summary || !year || !previous || !next) {
            return;
        }

        grid.textContent = "";
        year.textContent = activity.year;
        summary.textContent = (activity.total || 0) + " regular items added";
        previous.disabled = false;
        next.disabled = !activity.canGoNext;
        this.bindActivityNavigation(previous, next);
        this.setActivityCellSize(grid, activity.days.length);
        for (let day of activity.days) {
            var cell = this.createElement("div", "zotmeta-pref-activity-cell level-" + this.getActivityLevel(day.count, activity.max));
            cell.setAttribute("title", day.key + ": " + day.count + " added");
            if (!day.inRange) {
                cell.className += " is-outside";
            }
            if (day.isFuture) {
                cell.className += " is-future";
            }
            grid.appendChild(cell);
        }
    },

    bindActivityNavigation(previous, next) {
        if (previous.dataset.zotmetaBound === "true" && next.dataset.zotmetaBound === "true") {
            return;
        }
        previous.dataset.zotmetaBound = "true";
        next.dataset.zotmetaBound = "true";
        previous.addEventListener("click", () => {
            this.activitySelectedYear = (this.activitySelectedYear || new Date().getFullYear()) - 1;
            this.renderActivity(this.createActivityForYear(this.activitySelectedYear));
        });
        next.addEventListener("click", () => {
            var currentYear = new Date().getFullYear();
            this.activitySelectedYear = Math.min((this.activitySelectedYear || currentYear) + 1, currentYear);
            this.renderActivity(this.createActivityForYear(this.activitySelectedYear));
        });
    },

    setActivityCellSize(grid, dayCount) {
        var weekCount = Math.max(1, Math.ceil(dayCount / 7));
        var availableWidth = grid.clientWidth || grid.parentNode.clientWidth || 520;
        var gap = 2;
        var size = Math.floor((availableWidth - gap * (weekCount - 1)) / weekCount);
        size = Math.min(Math.max(size, 5), 9);
        grid.style.setProperty("--zotmeta-activity-cell", size + "px");
    },

    getActivityLevel(count, max) {
        if (!count || !max) {
            return 0;
        }
        if (count >= max) {
            return 4;
        }
        return Math.max(1, Math.ceil(count / max * 4));
    },

    renderProjectInfo() {
        var project = document.getElementById("zotmeta-pref-project");
        if (!project) {
            return;
        }
        project.textContent = "";
        var link = this.createElement("a", "zotmeta-pref-link", "RoadToDream/ZotMeta");
        link.setAttribute("href", "https://github.com/RoadToDream/ZotMeta");
        link.addEventListener("click", event => {
            event.preventDefault();
            if (typeof Zotero !== 'undefined' && typeof Zotero.launchURL === 'function') {
                Zotero.launchURL("https://github.com/RoadToDream/ZotMeta");
            }
        });
        var note = this.createElement("span", null, " - Star ZotMeta if it helps.");
        project.appendChild(link);
        project.appendChild(note);
    }
};

ZotMetaPreferences.initWhenReady();
