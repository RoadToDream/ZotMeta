Arxiv = {
    requestQueue: Promise.resolve(),
    lastRequestTime: 0,
    requestInterval: 3000,

    requestMetadata(arxivID) {
        // arXiv permits one connection and one request every three seconds.
        var request = this.requestQueue.then(async () => {
            var wait = this.requestInterval - (Date.now() - this.lastRequestTime);
            if (wait > 0) {
                await Utilities.delay(wait);
            }
            this.lastRequestTime = Date.now();
            var url = 'https://export.arxiv.org/api/query?id_list=' + encodeURIComponent(arxivID);
            var response = await Utilities.fetchWithTimeout(url, { method: 'GET' }, 10000);
            if (!response || !response.ok) {
                Zotero.debug('ZotMeta: arXiv lookup failed (' + (response ? response.status : 'no response') + ')');
                return null;
            }
            return response.text();
        });
        this.requestQueue = request.catch(() => {});
        return request;
    },

    generateAuthor(name) {
        if (!name) {
            return null;
        }

        var fullName = name.replace(/\s+/g, ' ').trim();
        var lastSpaceIndex = fullName.lastIndexOf(' ');
        if (lastSpaceIndex !== -1) {
            return {
                "firstName": fullName.slice(0, lastSpaceIndex).trim(),
                "lastName": fullName.slice(lastSpaceIndex + 1).trim(),
                "creatorType": "author"
            };
        }
        return { "firstName": "", "lastName": fullName, "creatorType": "author" };
    },

    generateAuthors(authorNodes) {
        var newAuthorList = [];
        if (authorNodes) {
            for (var i = 0; i < authorNodes.length; i++) {
                var nameNode = authorNodes[i].getElementsByTagName('name')[0];
                var author = nameNode ? this.generateAuthor(nameNode.textContent) : null;
                if (author) {
                    newAuthorList.push(author);
                }
            }
        }
        return newAuthorList;
    },

    generateDate(date) {
        if (!date) {
            return null;
        }
        return date.split('T')[0];
    },

    getTextContent(parent, tagName) {
        var nodes = parent.getElementsByTagName(tagName);
        if (!nodes || nodes.length === 0) {
            return null;
        }
        return Utilities.decodeHTMLEntities(Utilities.normalizeWhitespace(nodes[0].textContent));
    },

    getArxivTextContent(parent, localName) {
        var nodes = parent.getElementsByTagNameNS('http://arxiv.org/schemas/atom', localName);
        if (!nodes || nodes.length === 0) {
            nodes = parent.getElementsByTagName('arxiv:' + localName);
        }
        if (!nodes || nodes.length === 0) {
            return null;
        }
        return Utilities.decodeHTMLEntities(Utilities.normalizeWhitespace(nodes[0].textContent));
    },

    getArxivAttribute(parent, localName, attributeName) {
        var nodes = parent.getElementsByTagNameNS('http://arxiv.org/schemas/atom', localName);
        if (!nodes || nodes.length === 0) {
            nodes = parent.getElementsByTagName('arxiv:' + localName);
        }
        if (!nodes || nodes.length === 0) {
            return null;
        }
        return nodes[0].getAttribute(attributeName);
    },

    normalizeArxivID(value) {
        if (!value) {
            return null;
        }
        var text = Utilities.normalizeWhitespace(value);
        var match = text.match(/(?:arxiv\s*(?:id)?\s*[:：]\s*)?((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?)/i);
        return match ? match[1] : null;
    },

    getArxivIDFromDOI(value) {
        var match = PubMed.normalizeDOI(value).match(/^10\.48550\/arxiv\.(.+)$/i);
        var id = match ? this.normalizeArxivID(match[1]) : null;
        return id && id === match[1] ? id : null;
    },

    getArxivID(item) {
        var archiveID = item.getField('archiveID');
        var arxivID = this.normalizeArxivID(archiveID);
        if (arxivID) {
            return arxivID;
        }

        var url = item.getField('url');
        if (url) {
            var urlMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#.]+(?:\.\d+)?(?:v\d+)?)/i);
            if (urlMatch) {
                return this.normalizeArxivID(urlMatch[1]);
            }
        }

        var extra = item.getField('extra');
        arxivID = this.normalizeArxivID(extra);
        if (arxivID) {
            return arxivID;
        }

        arxivID = this.getArxivIDFromDOI(item.getField('DOI')) || this.getArxivIDFromDOI(url);
        if (arxivID) {
            return arxivID;
        }

        return null;
    },

    async getMetaData(item) {
        var arxivID = this.getArxivID(item);
        if (!arxivID) {
            return null;
        }
        try {
            var metadata = await this.getAtomMetaData(arxivID);
            if (metadata) {
                return metadata;
            }
        } catch (error) {
            Zotero.debug('ZotMeta: arXiv lookup failed; trying DOI metadata: ' + error);
        }
        try {
            return await this.getDOIMetaData(item, arxivID);
        } catch (error) {
            Zotero.debug('ZotMeta: arXiv DOI lookup failed: ' + error);
            return null;
        }
    },

    async getDOIMetaData(item, arxivID) {
        // The DOI describes the latest version; require a match for a pinned v1/v2/etc.
        var version = arxivID.match(/v(\d+)$/i);
        var doi = '10.48550/arXiv.' + arxivID.replace(/v\d+$/i, '');
        var response = await Utilities.fetchWithTimeout('https://doi.org/' + doi, {
            method: 'GET', headers: new Headers({ Accept: 'application/vnd.citationstyles.csl+json' })
        }, 10000);
        var data = Utilities.parseJsonOrNull(await Utilities.responseTextOrNull(response));
        if (!data || !data.title || PubMed.normalizeDOI(data.DOI).toLowerCase() !== doi.toLowerCase()) {
            return null;
        }
        if (version && String(data.version) !== version[1]) {
            return null;
        }
        var date = Journal.getPublicationDate(data);
        var existingDate = item.getField('date') || '';
        // DataCite may supply only a year; keep an existing date with finer precision.
        if (date && /^\d{4}$/.test(date) && existingDate.startsWith(date + '-')) {
            date = '';
        }
        return {
            Title: Journal.generateTitle(data),
            Authors: Journal.generateAuthors(data.author),
            PublishDate: date || '',
            Abstract: Utilities.normalizeWhitespace(data.abstract || ''),
            DOI: item.getField('DOI') ? '' : doi,
            Repository: 'arXiv',
            ArchiveID: 'arXiv:' + arxivID,
            URL: 'https://arxiv.org/abs/' + arxivID
        };
    },

    getAtomMetaData(arxivID) {
        return this.requestMetadata(arxivID)
            .then(data => {
                if (!data) {
                    return null;
                }
                try {
                    var parser = new DOMParser();
                    var xmlDoc = parser.parseFromString(data, "application/xml");
                    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                        return null;
                    }
                    var entry = xmlDoc.getElementsByTagName('entry')[0];
                    if (!entry) {
                        return null;
                    }
                    var returnedID = this.normalizeArxivID(this.getTextContent(entry, 'id'));
                    if (!returnedID || returnedID.replace(/v\d+$/i, '') !== arxivID.replace(/v\d+$/i, '') ||
                        (/v\d+$/i.test(arxivID) && returnedID !== arxivID)) {
                        return null;
                    }

                    var Title = this.getTextContent(entry, 'title');
                    if (!Title) {
                        return null;
                    }
                    var Authors = this.generateAuthors(entry.getElementsByTagName('author'));
                    var PublishDate = this.generateDate(this.getTextContent(entry, 'published'));
                    var Abstract = this.getTextContent(entry, 'summary');
                    var JournalRef = this.getArxivTextContent(entry, 'journal_ref');
                    var DOI = this.getArxivTextContent(entry, 'doi');
                    var Category = this.getArxivAttribute(entry, 'primary_category', 'term');

                    return {
                        "Title": Title ? Title : "",
                        "Authors": Authors ? Authors : "",
                        "PublishDate": PublishDate ? PublishDate : "",
                        "Abstract": Abstract ? Abstract : "",
                        "JournalRef": JournalRef ? JournalRef : "",
                        "DOI": DOI ? DOI : "",
                        "Repository": "arXiv",
                        "ArchiveID": "arXiv:" + arxivID,
                        "URL": "https://arxiv.org/abs/" + arxivID,
                        "Category": Category ? Category : ""
                    };
                } catch (error) {
                    return null;
                }
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
            "PublishDate": "date",
            "Abstract": "abstractNote",
            "JournalRef": "publicationTitle",
            "DOI": "DOI",
            "Repository": "repository",
            "ArchiveID": "archiveID",
            "URL": "url"
        });
        if (!changed) {
            return 1;
        }
        await Utilities.saveItemTx(item);
        return 0;
    }
};
