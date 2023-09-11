ZotMeta.Journal = {    
    generateAuthors (author) {
        var newAuthorList = [];
        if (author) {
            author.forEach(element => {
                newAuthorList.push(
                  {
                    "firstName": element["given"],
                    "lastName": element["family"],
                    "creatorType": "author"
                  }
                )
            });
        }
        return newAuthorList;
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
            .then(dataJson => {
                var Title = Utilities.safeGetFromJson(dataJson, ["title"]);
                var Authors = this.generateAuthors(Utilities.safeGetFromJson(dataJson, ["author"]));
                var Publication = Utilities.safeGetFromJson(dataJson, ["container-title"]);
                var Volume = Utilities.safeGetFromJson(dataJson, ["volume"]);
                var Issue = Utilities.safeGetFromJson(dataJson, ["issue"]);
                var Pages = Utilities.safeGetFromJson(dataJson, ["page"]);
                var PublishDate = this.generateDate(Utilities.safeGetFromJson(dataJson, ["published", "date-parts"]));
                var JournalAbbr = Utilities.safeGetFromJson(dataJson, ["container-title-short"]);
                var Language = Utilities.safeGetFromJson(dataJson, ["language"]);
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
                var status = await this.updateMetadata(items[i]);
                if (status === 0) {
                    successCount++;
                } else if(status === 1) {
                    failedCount++;
                }
                progress++;
                var progressMapped = Math.round(progress / itemCount * 100);
                await Utilities.publishProgress(progressHandle, progressMapped, progress + " out of " + itemCount + " finished updating.");
            });
        }

        pool.execute();
        await pool.wait();
        await Utilities.publishSuccess("Finished", successCount + " items updated, " + failedCount + " items failed.");
    }
}