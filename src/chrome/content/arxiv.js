Arxiv = {
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

        return null;
    },

    getMetaData(item) {
        var arxivID = this.getArxivID(item);
        if (!arxivID) {
            return null;
        }

        var url = 'https://export.arxiv.org/api/query?id_list=' + encodeURIComponent(arxivID);
        return Utilities.fetchWithTimeout(url, { method: 'GET' }, 10000)
            .then(response => Utilities.responseTextOrNull(response, "Error retrieving metadata",
                "Please check if the arXiv ID is correct and if you have network access to arxiv.org."))
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

                    var Title = this.getTextContent(entry, 'title');
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
