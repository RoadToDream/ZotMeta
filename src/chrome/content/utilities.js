Utilities = {
    modernProgressStyleID: "zotmeta-progress-style",
    concurrentThreadsPref: "extensions.zotmeta.concurrentThreads",
    itemSaveQueue: Promise.resolve(),
    failedTag: "ZotMeta: Failed",
    skippedTag: "ZotMeta: Skipped",
    DOI_RE: /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i,
    ARXIV_RE: /\b(?:arxiv\s*(?:id)?\s*[:：]\s*)?((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?)\b/i,

    createElement(doc, tagName, className = null, text = null) {
        var element = doc.createElementNS("http://www.w3.org/1999/xhtml", tagName);
        if (className) {
            element.className = className;
        }
        if (text !== null) {
            element.textContent = text;
        }
        return element;
    },

    ensureModernProgressStyle(doc) {
        if (doc.getElementById(this.modernProgressStyleID)) {
            return;
        }
        var style = this.createElement(doc, "style");
        style.id = this.modernProgressStyleID;
        style.textContent = [
            ".zotmeta-progress-panel{position:fixed;right:18px;bottom:18px;width:360px;max-width:calc(100vw - 36px);z-index:2147483647;background:rgba(250,250,250,.96);border:1px solid rgba(0,0,0,.16);border-radius:8px;box-shadow:0 18px 44px rgba(0,0,0,.24),0 2px 8px rgba(0,0,0,.12);font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2328;overflow:hidden;backdrop-filter:saturate(1.2) blur(18px)}",
            ".zotmeta-progress-header{display:flex;align-items:flex-start;gap:10px;padding:12px 12px 8px}",
            ".zotmeta-progress-mark{width:20px;height:20px;border-radius:50%;background:#2563eb;box-shadow:inset 0 0 0 5px rgba(255,255,255,.72);flex:0 0 auto;margin-top:1px}",
            ".zotmeta-progress-title{font-weight:650;font-size:13px;line-height:1.25;margin:0 0 3px}",
            ".zotmeta-progress-summary{font-size:12px;line-height:1.35;color:#5f6672;overflow-wrap:anywhere}",
            ".zotmeta-progress-close{appearance:none;border:0;background:transparent;color:#6b7280;font-size:17px;line-height:1;padding:0 2px;cursor:pointer;margin-left:auto}",
            ".zotmeta-progress-close:hover{color:#111827}",
            ".zotmeta-progress-track{height:6px;background:#e7eaf0;border-radius:999px;overflow:hidden;margin:0 12px 10px}",
            ".zotmeta-progress-fill{height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#14b8a6);border-radius:999px;transition:width .22s ease}",
            ".zotmeta-progress-rows{border-top:1px solid rgba(0,0,0,.08);max-height:220px;overflow:auto}",
            ".zotmeta-progress-row{padding:9px 12px 10px}",
            ".zotmeta-progress-row+.zotmeta-progress-row{border-top:1px solid rgba(0,0,0,.07)}",
            ".zotmeta-progress-row-text{font-size:12px;line-height:1.35;color:#374151;overflow-wrap:anywhere}",
            ".zotmeta-progress-row-track{height:4px;background:#edf0f4;border-radius:999px;overflow:hidden;margin-top:7px}",
            ".zotmeta-progress-row-fill{height:100%;width:0%;background:#2563eb;border-radius:999px;transition:width .22s ease}",
            ".zotmeta-progress-row.is-error .zotmeta-progress-row-fill,.zotmeta-progress-panel.is-error .zotmeta-progress-fill{background:#dc2626}",
            ".zotmeta-progress-row.is-done:not(.is-error) .zotmeta-progress-row-fill,.zotmeta-progress-panel.is-done:not(.is-error) .zotmeta-progress-fill{background:#16a34a}",
            ".zotmeta-progress-panel.is-error .zotmeta-progress-mark{background:#dc2626}",
            ".zotmeta-progress-panel.is-done:not(.is-error) .zotmeta-progress-mark{background:#16a34a}"
        ].join("\n");
        doc.documentElement.appendChild(style);
    },

    getConcurrentThreads(defaultValue = 6) {
        try {
            if (typeof Services !== 'undefined' && Services.prefs) {
                return this.clampConcurrentThreads(Services.prefs.getIntPref(this.concurrentThreadsPref, defaultValue));
            }
        } catch (error) {}
        return this.clampConcurrentThreads(defaultValue);
    },

    setConcurrentThreads(value) {
        var threads = this.clampConcurrentThreads(value);
        if (typeof Services !== 'undefined' && Services.prefs) {
            Services.prefs.setIntPref(this.concurrentThreadsPref, threads);
        }
        return threads;
    },

    clampConcurrentThreads(value) {
        var threads = parseInt(value, 10);
        if (isNaN(threads)) {
            threads = 6;
        }
        return Math.min(Math.max(threads, 1), 12);
    },

    createModernProgressHandle(window, title, message) {
        if (!window || !window.document || !window.document.documentElement) {
            return null;
        }
        var doc = window.document;
        var mount = doc.body || doc.documentElement;
        this.ensureModernProgressStyle(doc);

        var panel = this.createElement(doc, "div", "zotmeta-progress-panel");
        var header = this.createElement(doc, "div", "zotmeta-progress-header");
        var mark = this.createElement(doc, "div", "zotmeta-progress-mark");
        var copy = this.createElement(doc, "div");
        var titleElement = this.createElement(doc, "div", "zotmeta-progress-title", title);
        var summaryElement = this.createElement(doc, "div", "zotmeta-progress-summary", message);
        var closeButton = this.createElement(doc, "button", "zotmeta-progress-close", "x");
        var track = this.createElement(doc, "div", "zotmeta-progress-track");
        var fill = this.createElement(doc, "div", "zotmeta-progress-fill");
        var rows = this.createElement(doc, "div", "zotmeta-progress-rows");

        closeButton.setAttribute("type", "button");
        closeButton.setAttribute("aria-label", "Close ZotMeta progress");
        closeButton.addEventListener("click", () => {
            if (panel.parentNode) {
                panel.parentNode.removeChild(panel);
            }
        });

        copy.appendChild(titleElement);
        copy.appendChild(summaryElement);
        header.appendChild(mark);
        header.appendChild(copy);
        header.appendChild(closeButton);
        track.appendChild(fill);
        panel.appendChild(header);
        panel.appendChild(track);
        panel.appendChild(rows);
        mount.appendChild(panel);

        var handle = {
            type: "modern",
            root: panel,
            titleElement,
            summaryElement,
            fill,
            rows,
            closeTimer: null,
            progress: null,
            changeHeadline(headline) {
                this.titleElement.textContent = headline;
            },
            show() {},
            startCloseTimer(timeout) {
                if (this.closeTimer) {
                    window.clearTimeout(this.closeTimer);
                }
                this.closeTimer = window.setTimeout(() => {
                    if (this.root.parentNode) {
                        this.root.parentNode.removeChild(this.root);
                    }
                }, timeout);
            }
        };
        handle.progress = this.createModernProgressItem(handle, message, true);
        return handle;
    },

    createModernProgressItem(handle, message, isOverall = false) {
        if (isOverall) {
            return {
                setProgress(progress) {
                    handle.fill.style.width = Math.min(Math.max(progress, 0), 100) + "%";
                },
                setText(text) {
                    handle.summaryElement.textContent = text;
                },
                setIcon() {},
                setError() {
                    handle.root.classList.add("is-error");
                }
            };
        }

        var row = this.createElement(handle.root.ownerDocument, "div", "zotmeta-progress-row");
        var text = this.createElement(handle.root.ownerDocument, "div", "zotmeta-progress-row-text", message);
        var track = this.createElement(handle.root.ownerDocument, "div", "zotmeta-progress-row-track");
        var fill = this.createElement(handle.root.ownerDocument, "div", "zotmeta-progress-row-fill");
        track.appendChild(fill);
        row.appendChild(text);
        row.appendChild(track);
        handle.rows.appendChild(row);

        return {
            row,
            setProgress(progress) {
                fill.style.width = Math.min(Math.max(progress, 0), 100) + "%";
            },
            setText(newText) {
                text.textContent = newText;
            },
            setIcon() {},
            setError() {
                row.classList.add("is-error");
            },
            setDone(hasFailures) {
                row.classList.add("is-done");
                if (hasFailures) {
                    row.classList.add("is-error");
                }
            }
        };
    },

    initializeModernProgress(window, title, message) {
        var handle = this.createModernProgressHandle(window, title, message);
        if (!handle) {
            return this.initializeProgress(title, message);
        }
        handle.progress.setProgress(0);
        handle.progress.setText(message);
        return handle;
    },

    createProgressWindow(title, message, icon, closeTimer = null) {
        var progressWindow = new Zotero.ProgressWindow({closeOnClick:true});
        progressWindow.changeHeadline(title);
        progressWindow.progress = new progressWindow.ItemProgress(icon, message);
        progressWindow.show();
        if (closeTimer) {
            progressWindow.startCloseTimer(closeTimer);
        }
        return progressWindow;
    },

    publishError(title, message) {
        var errorIcon = "chrome://zotero/skin/cross.png";
        var progressWindowError = this.createProgressWindow(title, message, errorIcon, 3000);
        progressWindowError.progress.setError();
    },

    publishSuccess(title, message) {
        var successIcon = "chrome://zotero/skin/tick.png";
        this.createProgressWindow(title, message, successIcon, 3000);
    },

    initializeProgress(title, message) {
        var loadingIcon = "chrome://zotero/skin/spinner-16px.png";
        var progressWindowProgress = this.createProgressWindow(title, message, loadingIcon);
        progressWindowProgress.progress.setProgress(0);
        progressWindowProgress.progress.setText(message);
        return progressWindowProgress;
    },

    addProgressItem(handle, message, progress = 0) {
        if (handle.type === "modern") {
            var modernItem = this.createModernProgressItem(handle, message);
            modernItem.setProgress(progress);
            return modernItem;
        }
        var loadingIcon = "chrome://zotero/skin/spinner-16px.png";
        var progressItem = new handle.ItemProgress(loadingIcon, message);
        progressItem.setProgress(Math.min(Math.max(progress, 0), 100));
        return progressItem;
    },

    updateProgressItem(progressItem, progress, message, isFinished = false, hasFailures = false) {
        var validatedProgress = Math.min(Math.max(progress, 0), 100);
        progressItem.setProgress(validatedProgress);
        progressItem.setText(message);
        if (isFinished) {
            if (progressItem.setDone) {
                progressItem.setDone(hasFailures);
            }
            if (hasFailures) {
                var errorIcon = "chrome://zotero/skin/cross.png";
                progressItem.setIcon(errorIcon);
                progressItem.setError();
            } else {
                var successIcon = "chrome://zotero/skin/tick.png";
                progressItem.setIcon(successIcon);
            }
        }
    },

    publishProgress(handle, progress, message, title = null) {
        var validatedProgress = Math.min(Math.max(progress, 0), 100);
        handle.progress.setProgress(validatedProgress);
        handle.progress.setText(message);
        if (validatedProgress === 100) {
            var successIcon = "chrome://zotero/skin/tick.png";
            handle.progress.setIcon(successIcon);
        }
        if (title) {
            handle.changeHeadline(title);
        }
        handle.show();
    },

    publishFinishedProgress(handle, message, title, hasFailures) {
        handle.progress.setProgress(100);
        handle.progress.setText(message);
        if (hasFailures) {
            var errorIcon = "chrome://zotero/skin/cross.png";
            handle.progress.setIcon(errorIcon);
            handle.progress.setError();
            if (handle.root) {
                handle.root.classList.add("is-done", "is-error");
            }
        } else {
            var successIcon = "chrome://zotero/skin/tick.png";
            handle.progress.setIcon(successIcon);
            if (handle.root) {
                handle.root.classList.add("is-done");
            }
        }
        if (title) {
            handle.changeHeadline(title);
        }
        handle.show();
        if (handle.type === "modern") {
            handle.startCloseTimer(8000);
        }
    },

    fetchWithTimeout(url, requestInfo = {}, timeout = 10000) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var request = Object.assign({}, requestInfo);
        if (controller && !request.signal) {
            request.signal = controller.signal;
        }

        return new Promise((resolve, reject) => {
            var timer = setTimeout(() => {
                if (controller) {
                    controller.abort();
                }
                reject(new Error('Request timed out'));
            }, timeout);

            fetch(url, request)
                .then(resolve)
                .catch(reject)
                .finally(() => clearTimeout(timer));
        });
    },

    async responseTextOrNull(response, errorTitle, errorMessage) {
        if (!response || !response.ok) {
            return null;
        }
        return response.text();
    },

    parseJsonOrNull(data) {
        try {
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    },

    safeGetFromJson(json, keyArray) {
        if (!json) {
            return null;
        }
        var jsonLoc = json;
        for (const key of keyArray) {
            if (jsonLoc !== null && typeof jsonLoc === 'object' && key in jsonLoc) {
                jsonLoc = jsonLoc[key];
            } else {
                return null;
            }
        }
        return jsonLoc;
    },

    decodeHTMLEntities(text) {
        if (typeof text !== 'string' || !text) {
            return text;
        }

        var entities = {
            amp: '&',
            lt: '<',
            gt: '>',
            quot: '"',
            apos: "'",
            nbsp: ' '
        };

        return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function(match, entity) {
            if (entity.charAt(0) === '#') {
                var isHex = entity.charAt(1).toLowerCase() === 'x';
                var value = isHex ? entity.slice(2) : entity.slice(1);
                var codePoint = parseInt(value, isHex ? 16 : 10);
                if (!isNaN(codePoint)) {
                    return String.fromCharCode(codePoint);
                }
            }
            return entities[entity] || match;
        });
    },

    normalizeWhitespace(text) {
        if (typeof text !== 'string') {
            return text;
        }
        return text.replace(/\s+/g, ' ').trim();
    },

    applyMetadata(item, metaData, fieldMap) {
        var changed = false;
        for (const metaKey in fieldMap) {
            var value = metaData[metaKey];
            if (this.isEmpty(value)) {
                continue;
            }
            var target = fieldMap[metaKey];
            if (target === 'creators') {
                item.setCreators(value);
            } else {
                item.setField(target, value);
            }
            changed = true;
        }
        return changed;
    },

    saveItemTx(item) {
        var savePromise = this.itemSaveQueue.then(() => item.saveTx());
        this.itemSaveQueue = savePromise.catch(() => {});
        return savePromise;
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

    addTagIfMissing(item, tagName) {
        if (!item || typeof item.addTag !== 'function' || this.hasTag(item, tagName)) {
            return false;
        }
        item.addTag(tagName);
        return true;
    },

    removeTagIfPresent(item, tagName) {
        if (!item || typeof item.removeTag !== 'function' || !this.hasTag(item, tagName)) {
            return false;
        }
        item.removeTag(tagName);
        return true;
    },

    async markItemUpdateStatus(item, status) {
        var changed = false;
        if (status === 0) {
            changed = this.removeTagIfPresent(item, this.failedTag) || changed;
            changed = this.removeTagIfPresent(item, this.skippedTag) || changed;
        } else if (status === 2) {
            changed = this.removeTagIfPresent(item, this.failedTag) || changed;
            changed = this.addTagIfMissing(item, this.skippedTag) || changed;
        } else {
            changed = this.removeTagIfPresent(item, this.skippedTag) || changed;
            changed = this.addTagIfMissing(item, this.failedTag) || changed;
        }

        if (changed) {
            await this.saveItemTx(item);
        }
    },

    delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    },

    isRegularItem(item) {
        return item && typeof item.isRegularItem === 'function' && item.isRegularItem();
    },

    isAttachment(item) {
        return item && typeof item.isAttachment === 'function' && item.isAttachment();
    },

    isPDFAttachment(item) {
        return this.isAttachment(item)
            && item.attachmentContentType === "application/pdf";
    },

    cleanDOI(doi) {
        if (!doi) {
            return null;
        }
        return doi.replace(/[.,;:)]+$/g, "");
    },

    extractIdentifiersFromText(text) {
        if (!text) {
            return {
                DOI: null,
                arxivID: null
            };
        }

        var doiMatch = text.match(this.DOI_RE);
        var arxivMatch = text.match(this.ARXIV_RE);
        return {
            DOI: doiMatch ? this.cleanDOI(doiMatch[0]) : null,
            arxivID: arxivMatch ? arxivMatch[1] : null
        };
    },

    async getAttachmentFullText(attachment) {
        if (!this.isPDFAttachment(attachment) || !Zotero.Fulltext || !Zotero.File) {
            return "";
        }

        try {
            var cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
            if (!cacheFile) {
                return "";
            }
            if (typeof cacheFile.exists === 'function' && !cacheFile.exists()) {
                return "";
            }
            return await Zotero.File.getContentsAsync(cacheFile);
        } catch (error) {
            return "";
        }
    },

    async extractIdentifiersFromAttachment(attachment) {
        var text = await this.getAttachmentFullText(attachment);
        return this.extractIdentifiersFromText(text);
    },

    getItemAttachments(item) {
        if (!item || typeof item.getAttachments !== 'function') {
            return [];
        }
        var attachmentIDs = item.getAttachments();
        var attachments = [];
        for (let id of attachmentIDs) {
            var attachment = Zotero.Items.get(id);
            if (attachment) {
                attachments.push(attachment);
            }
        }
        return attachments;
    },

    async extractIdentifiersFromItemAttachments(item) {
        var attachments = this.getItemAttachments(item);
        for (let attachment of attachments) {
            var identifiers = await this.extractIdentifiersFromAttachment(attachment);
            if (identifiers.DOI || identifiers.arxivID) {
                return identifiers;
            }
        }
        return {
            DOI: null,
            arxivID: null
        };
    },

    applyIdentifiersToItem(item, identifiers) {
        var changed = false;
        if (identifiers.DOI && !item.getField('DOI')) {
            item.setField('DOI', identifiers.DOI);
            changed = true;
        }
        if (identifiers.arxivID && !item.getField('archiveID')) {
            item.setField('archiveID', "arXiv:" + identifiers.arxivID);
            changed = true;
        }
        if (identifiers.arxivID && !item.getField('repository')) {
            item.setField('repository', "arXiv");
            changed = true;
        }
        if (identifiers.arxivID && !item.getField('url')) {
            item.setField('url', "https://arxiv.org/abs/" + identifiers.arxivID);
            changed = true;
        }
        return changed;
    },

    getItemDisplayTitle(item) {
        if (!item) {
            return "Unknown item";
        }
        var title = item.getField ? item.getField('title') : null;
        if (title) {
            return title;
        }
        return item.id ? "Item " + item.id : "Untitled item";
    },

    pluralize(count, singular, plural = null) {
        if (count === 1) {
            return count + " " + singular;
        }
        return count + " " + (plural || singular + "s");
    },

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        return text.slice(0, maxLength - 3).trim() + "...";
    },

    formatBatchProgress(doneCount, totalCount, successCount, failedCount, skippedCount) {
        var message = doneCount + "/" + totalCount + " checked";
        var details = [];
        if (successCount > 0) {
            details.push(successCount + " updated");
        }
        if (failedCount > 0) {
            details.push(failedCount + " failed");
        }
        if (skippedCount > 0) {
            details.push(skippedCount + " skipped");
        }
        if (details.length > 0) {
            message += " - " + details.join(", ");
        }
        return message;
    },

    formatBatchRow(batchName, doneCount, totalCount, successCount, failedCount, skippedCount) {
        return batchName + ": " + this.formatBatchProgress(doneCount, totalCount, successCount, failedCount, skippedCount);
    },

    formatBatchSummary(successCount, failedCount, skippedCount, failedItems) {
        var parts = [];
        if (successCount > 0) {
            parts.push(this.pluralize(successCount, "item") + " updated");
        }
        if (failedCount > 0) {
            parts.push(this.pluralize(failedCount, "item") + " failed");
        }
        if (skippedCount > 0) {
            parts.push(this.pluralize(skippedCount, "item") + " skipped");
        }
        var summary = parts.length > 0 ? parts.join(", ") + "." : "No supported items found.";

        if (failedItems.length > 0) {
            var shownItems = failedItems.slice(0, 3).map(item => this.truncateText(item, 60));
            summary += " Failed: " + shownItems.join("; ");
            if (failedItems.length > shownItems.length) {
                summary += "; +" + (failedItems.length - shownItems.length) + " more";
            }
            if (!/[.!?]$/.test(summary)) {
                summary += ".";
            }
        }

        return summary;
    },

    getBatchSummaryTitle(successCount, failedCount, skippedCount) {
        if (failedCount > 0 && successCount > 0) {
            return "Metadata updated with issues";
        }
        if (failedCount > 0) {
            return "Metadata update failed";
        }
        if (successCount > 0) {
            return skippedCount > 0 ? "Metadata updated with skips" : "Metadata updated";
        }
        return "No metadata updated";
    },

    isEmpty(value) {
        if (typeof value === 'string') {
            return value.trim() === '';
        } else if (Array.isArray(value)) {
            return value.length === 0;
        } else if (typeof value === 'object' && value !== null) {
            return Object.keys(value).length === 0;
        } else {
            return false;
        }
    }
};
