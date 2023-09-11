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

    generateAuthors (author) {
        var new_author_list = [];
        if (author) {
            author.forEach(element => {
                new_author_list.push(
                  {
                    "firstName": element["given"],
                    "lastName": element["family"],
                    "creatorType": "author"
                  }
                )
            });
        }
        return new_author_list;
    },

    generateDate (date) {
        if (!date) {
            return null;
        }
        if (date.length > 0) {
            return date[0].join("-");
        }
        else {
            return null;
        }
    },

    getMetaData (item) {
        var doi = item.getField('DOI');
        if (item.itemTypeID !== Zotero.ItemTypes.getID('journalArticle')) {
            Utilities.publishError("Unsupported Item Type", "Only Journal Article is supported.")
            return;
        }
        if (!doi) {
            // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
            return;
        }

        var url = 'http://dx.doi.org/' + doi;
        const headers = new Headers({'Accept': 'application/vnd.citationstyles.csl+json'});
        var requestInfo = { method: 'GET', headers };
        return Utilities.fetchWithTimeout(url, requestInfo, 3000)
            .then(response => {
                if (!response.ok) {
                    Utilities.publishError("Error retrieving metadata", 
                        "Please check if DOI is correct and if you have network access to dx.doi.org.");
                    return null;
                        
                }
                return response.text()
            })
            .then(data => {
                try {
                    return JSON.parse(data)
                } catch (error) {
                    return null;
                }
            })
            .then(data_json => {
                var Title = Utilities.safeGetFromJson(data_json, ["title"]);
                var Authors = this.generateAuthors(Utilities.safeGetFromJson(data_json, ["author"]));
                var Publication = Utilities.safeGetFromJson(data_json, ["container-title"]);
                var Volume = Utilities.safeGetFromJson(data_json, ["volume"]);
                var Issue = Utilities.safeGetFromJson(data_json, ["issue"]);
                var Pages = Utilities.safeGetFromJson(data_json, ["page"]);
                var PublishDate = this.generateDate(Utilities.safeGetFromJson(data_json, ["published", "date-parts"]));
                var JournalAbbr = Utilities.safeGetFromJson(data_json, ["container-title-short"]);
                var Language = Utilities.safeGetFromJson(data_json, ["language"]);
                return {
                            "Title": Title ? Title : "",
                            "Authors": Authors ? Authors : "",
                            "Publication": Publication ? Publication : "",
                            "Volume": Volume ? Volume : "",
                            "Issue": Issue ? Issue : "",
                            "Pages": Pages ? Pages : "",
                            "PublishDate": PublishDate ? PublishDate : "",
                            "JournalAbbr": JournalAbbr ? JournalAbbr : "",
                            "Language": Language ? Language : ""
                        };
            });
    },
      
    async updateMetadata(item) {
        var metaData = await this.getMetaData(item);
        if (!metaData) {
            return 1;
        }
        
        if (!Utilities.isEmpty(metaData["Title"]))       item.setField('title',metaData["Title"]);
        if (!Utilities.isEmpty(metaData["Authors"]))     item.setCreators(metaData["Authors"]);
        if (!Utilities.isEmpty(metaData["Publication"])) item.setField('publicationTitle',metaData["Publication"]);
        if (!Utilities.isEmpty(metaData["Volume"]))      item.setField('volume',metaData["Volume"]);
        if (!Utilities.isEmpty(metaData["Issue"]))       item.setField('issue',metaData["Issue"]);
        if (!Utilities.isEmpty(metaData["Pages"]))       item.setField('pages',metaData["Pages"]);
        if (!Utilities.isEmpty(metaData["PublishDate"])) item.setField('date',metaData["PublishDate"]);
        if (!Utilities.isEmpty(metaData["JournalAbbr"])) item.setField('journalAbbreviation',metaData["JournalAbbr"]);
        if (!Utilities.isEmpty(metaData["Language"]))    item.setField('language',metaData["Language"]);
        await item.saveTx();
        return 0;
    },

    async updateSelectedItemsMetadata() {
        var items = Zotero.getActiveZoteroPane().getSelectedItems();
        var item_count = items.length;
        if (item_count === 0) {
            Utilities.publishSuccess("Finished", "No item is selected.")
        }
        var progress_handle = Utilities.initializeProgress("Updating metadata for " + item_count + " items...")

        var pool = new ThreadPool(5);
        var progress = 0;
        var success_count = 0;
        var failed_count = 0;
        for (let i = 0; i < item_count; i++) {
            pool.submit(async () => { 
                var status = await this.updateMetadata(items[i]);
                if (status === 0) {
                    success_count++;
                } else if(status === 1) {
                    failed_count++;
                }
                progress++;
                var progress_mapped = Math.round(progress / item_count * 100);
                await Utilities.publishProgress(progress_handle, progress_mapped, progress + " out of " + item_count + " finished updating.");
            });
        }

        pool.execute();
        await pool.wait();
        await Utilities.publishSuccess("Finished", success_count + " items updated, " + failed_count + " items failed.");
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
};
