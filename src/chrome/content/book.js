Book = {
    requestQueue: Promise.resolve(),
    lastRequestTime: 0,
    requestInterval: 1000,
    authorCache: new Map(),

    request(path) {
        // Share the one-request-per-second allowance across all book workers.
        var request = this.requestQueue.then(async () => {
            var wait = this.requestInterval - (Date.now() - this.lastRequestTime);
            if (wait > 0) {
                await Utilities.delay(wait);
            }
            this.lastRequestTime = Date.now();
            var response = await Utilities.fetchWithTimeout('https://openlibrary.org' + path,
                { method: 'GET' }, 10000);
            if (!response || !response.ok) {
                Zotero.debug('ZotMeta: Open Library request failed (' +
                    (response ? response.status : 'no response') + '): ' + path);
                return null;
            }
            var data = Utilities.parseJsonOrNull(await response.text());
            if (!data) {
                Zotero.debug('ZotMeta: Open Library returned invalid JSON: ' + path);
            }
            return data;
        }).catch(error => {
            Zotero.debug('ZotMeta: Open Library request failed: ' + path + ': ' + error);
            return null;
        });
        this.requestQueue = request;
        return request;
    },

    async getAuthor(author) {
        if (author && author.name) {
            return author;
        }
        var key = author && author.key;
        if (!key || !/^\/authors\/OL\d+A$/.test(key)) {
            return null;
        }
        if (!this.authorCache.has(key)) {
            var request = this.request(key + '.json').then(data => {
                if (!data || !data.name) {
                    this.authorCache.delete(key);
                    return null;
                }
                return data;
            });
            this.authorCache.set(key, request);
        }
        return this.authorCache.get(key);
    },

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

    async getMetaData(item) {
        if (item.itemTypeID !== Zotero.ItemTypes.getID('book')) {
            // Utilities.publishError("Unsupported Item Type", "Only Book is supported.")
            return null;
        }
        var rawISBN = item.getField('ISBN');
        var isbn = rawISBN ? rawISBN.replace(/[\s-]/g, '').toUpperCase() : '';
        if (!isbn) {
            // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
            return null;
        }

        // The legacy /api/books endpoint can return 404 even for existing editions.
        var edition = await this.request('/isbn/' + encodeURIComponent(isbn) + '.json');
        if (!edition || !edition.title) {
            return null;
        }
        var authors = await Promise.all((edition.authors || []).map(author => this.getAuthor(author)));
        return {
            Title: Utilities.combineTitleAndSubtitle(edition.title, edition.subtitle),
            // Preserve existing creators if any author record could not be resolved.
            Authors: authors.every(author => author) ? this.generateAuthors(authors) : [],
            Publisher: Utilities.safeGetFromJson(edition, ['publishers', '0']) || '',
            PublishPlace: Utilities.safeGetFromJson(edition, ['publish_places', '0']) || '',
            PublishDate: edition.publish_date || '',
            Pages: edition.number_of_pages || (/^\d+$/.test(edition.pagination || '') ? edition.pagination : '')
        };
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
