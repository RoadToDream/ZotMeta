Journal = {
    generateAuthor(author) {
        if (!author) {
            return null;
        }
        if (author.literal) {
            return {
                "firstName": "",
                "lastName": author.literal,
                "creatorType": "author"
            };
        }
        if (!author.given && !author.family) {
            return null;
        }
        return {
            "firstName": author["given"] || "",
            "lastName": author["family"] || "",
            "creatorType": "author"
        };
    },

    generateAuthors (authors) {
        var newAuthorList = [];
        if (authors) {
            authors.forEach(author => {
                var creator = this.generateAuthor(author);
                if (creator) {
                    newAuthorList.push(creator);
                }
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

    getPublicationDate(dataJson) {
        var dateParts = Utilities.safeGetFromJson(dataJson, ["published-print", "date-parts"]);
        if (!dateParts) {
            dateParts = Utilities.safeGetFromJson(dataJson, ["published", "date-parts"]);
        }
        if (!dateParts) {
            dateParts = Utilities.safeGetFromJson(dataJson, ["issued", "date-parts"]);
        }
        return this.generateDate(dateParts);
    },

    getFirstText(value) {
        if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
        }
        return value;
    },

    generateTitle(dataJson) {
        var Title = this.getFirstText(Utilities.safeGetFromJson(dataJson, ["title"]));
        var Subtitle = this.getFirstText(Utilities.safeGetFromJson(dataJson, ["subtitle"]));

        if (Title && Subtitle && Title.indexOf(Subtitle) === -1) {
            Title = Title + ": " + Subtitle;
        } else if (!Title && Subtitle) {
            Title = Subtitle;
        }

        return Utilities.decodeHTMLEntities(Title);
    },

    getMetaData (item) {
        if (item.itemTypeID !== Zotero.ItemTypes.getID('journalArticle')) {
            // Utilities.publishError("Unsupported Item Type", "Only Journal Article is supported.")
            return null;
        }
        var doi = item.getField('DOI');
        if (!doi) {
            // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
            return null;
        }
        doi = doi.trim();

        var url = 'https://doi.org/' + doi;
        const headers = new Headers({'Accept': 'application/vnd.citationstyles.csl+json'});
        var requestInfo = { method: 'GET', headers };
        return Utilities.fetchWithTimeout(url, requestInfo, 10000)
            .then(response => Utilities.responseTextOrNull(response, "Error retrieving metadata",
                "Please check if DOI is correct and if you have network access to doi.org."))
            .then(data => data ? Utilities.parseJsonOrNull(data) : null)
            .then(dataJson => {
                if (!dataJson) {
                    return null;
                }
                var Title = this.generateTitle(dataJson);
                var Authors = this.generateAuthors(Utilities.safeGetFromJson(dataJson, ["author"]));
                var Publication = Utilities.decodeHTMLEntities(this.getFirstText(Utilities.safeGetFromJson(dataJson, ["container-title"])));
                var Volume = Utilities.safeGetFromJson(dataJson, ["volume"]);
                var Issue = Utilities.safeGetFromJson(dataJson, ["issue"]);
                var Pages = Utilities.safeGetFromJson(dataJson, ["page"]);
                var PublishDate = this.getPublicationDate(dataJson);
                var JournalAbbr = Utilities.decodeHTMLEntities(this.getFirstText(Utilities.safeGetFromJson(dataJson, ["container-title-short"])));
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

        var changed = Utilities.applyMetadata(item, metaData, {
            "Title": "title",
            "Authors": "creators",
            "Publication": "publicationTitle",
            "Volume": "volume",
            "Issue": "issue",
            "Pages": "pages",
            "PublishDate": "date",
            "JournalAbbr": "journalAbbreviation",
            "Language": "language"
        });
        if (!changed) {
            return 1;
        }
        await Utilities.saveItemTx(item);
        return 0;
    }
}
