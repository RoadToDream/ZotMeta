Book = {
    generateAuthor(author) {
        if (!Utilities.safeGetFromJson(author, ["name"])) {
            return null;
        }
        
        fullName = Utilities.safeGetFromJson(author, ["name"]);
    
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
                newAuthorList.push(
                    this.generateAuthor(author)
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
        var isbn = item.getField('ISBN').replace(/-/g, '');
        if (item.itemTypeID !== Zotero.ItemTypes.getID('book')) {
            // Utilities.publishError("Unsupported Item Type", "Only Book is supported.")
            return null;
        }
        if (!isbn) {
            // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
            return null;
        }

        var url = 'https://openlibrary.org/api/books?jscmd=data&format=json&bibkeys=ISBN:' + isbn;
        var requestInfo = { method: 'GET' };
        return Utilities.fetchWithTimeout(url, requestInfo, 3000)
            .then(response => {
                if (!response.ok) {
                    Utilities.publishError("Error retrieving metadata", 
                        "Please check if ISBN is correct and if you have network access to openlibrary.org.");
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
                var KeyISBN = 'ISBN:' + isbn;
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
        
        if (!Utilities.isEmpty(metaData["Title"]))          item.setField('title',metaData["Title"]);
        if (!Utilities.isEmpty(metaData["Authors"]))        item.setCreators(metaData["Authors"]);
        if (!Utilities.isEmpty(metaData["Publisher"]))      item.setField('publisher',metaData["Publisher"]);
        if (!Utilities.isEmpty(metaData["PublishPlace"]))   item.setField('place',metaData["PublishPlace"]);
        if (!Utilities.isEmpty(metaData["PublishDate"]))    item.setField('date',metaData["PublishDate"]);
        if (!Utilities.isEmpty(metaData["Pages"]))          item.setField('numPages',metaData["Pages"]);
        await item.saveTx();
        return 0;
    },
}