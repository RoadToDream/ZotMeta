Book = {
    generateAuthor(author) {
        if (!Utilities.safeGetFromJson(author, ["name"])) {
            return null;
        }

        var fullName = Utilities.safeGetFromJson(author, ["name"]);

        if (fullName.includes(',')) {
            const [lastName, firstName] = fullName.split(',').map(part => part.trim());
            return { firstName, lastName, "creatorType": "author" };
        }

        const lastSpaceIndex = fullName.lastIndexOf(' ');
        if (lastSpaceIndex !== -1) {
            const lastName = fullName.slice(lastSpaceIndex + 1).trim();
            const firstName = fullName.slice(0, lastSpaceIndex).trim();
            return { firstName, lastName, "creatorType": "author" };
        }

        return { firstName: fullName, lastName: '', "creatorType": "author" };
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

    getMetaData (item) {
        if (item.itemTypeID !== Zotero.ItemTypes.getID('book')) {
            // Utilities.publishError("Unsupported Item Type", "Only Book is supported.")
            return null;
        }
        var rawISBN = item.getField('ISBN');
        var isbn = rawISBN ? rawISBN.replace(/[\s-]/g, '') : '';
        if (!isbn) {
            // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
            return null;
        }

        var url = 'https://openlibrary.org/api/books?jscmd=data&format=json&bibkeys=ISBN:' + isbn;
        var requestInfo = { method: 'GET' };
        return Utilities.fetchWithTimeout(url, requestInfo, 10000)
            .then(response => Utilities.responseTextOrNull(response, "Error retrieving metadata",
                "Please check if ISBN is correct and if you have network access to openlibrary.org."))
            .then(data => data ? Utilities.parseJsonOrNull(data) : null)
            .then(dataJson => {
                var KeyISBN = 'ISBN:' + isbn;
                if (!Utilities.safeGetFromJson(dataJson, [KeyISBN])) {
                    return null;
                }
                var Title = Utilities.safeGetFromJson(dataJson, [KeyISBN, "title"]);
                var Authors = this.generateAuthors(Utilities.safeGetFromJson(dataJson, [KeyISBN, "authors"]));
                var Publisher = Utilities.safeGetFromJson(dataJson, [KeyISBN, "publishers","0","name"]);
                var PublishPlace = Utilities.safeGetFromJson(dataJson, [KeyISBN, "publish_places","0","name"]);
                var PublishDate = Utilities.safeGetFromJson(dataJson, [KeyISBN, "publish_date"]);
                var Pages = Utilities.safeGetFromJson(dataJson, [KeyISBN, "number_of_pages"]);
                return {
                            "Title": Title ? Title : "",
                            "Authors": Authors ? Authors : "",
                            "Publisher": Publisher ? Publisher : "",
                            "PublishPlace": PublishPlace ? PublishPlace : "",
                            "PublishDate": PublishDate ? PublishDate : "",
                            "Pages": Pages ? Pages : ""
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
            "Publisher": "publisher",
            "PublishPlace": "place",
            "PublishDate": "date",
            "Pages": "numPages"
        });
        if (!changed) {
            return 1;
        }
        await Utilities.saveItemTx(item);
        return 0;
    },
}
