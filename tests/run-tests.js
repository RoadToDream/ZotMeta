const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
let nextItemID = 1000;

function loadScripts(files) {
    const progressWindows = [];
    class MockItemProgress {
        constructor(icon, message) {
            this.icon = icon;
            this.message = message;
            this.progress = null;
            this.error = false;
        }

        setProgress(progress) {
            this.progress = progress;
        }

        setText(message) {
            this.message = message;
        }

        setIcon(icon) {
            this.icon = icon;
        }

        setError() {
            this.error = true;
        }
    }

    class MockProgressWindow {
        constructor() {
            this.ItemProgress = MockItemProgress;
            this.items = [];
            this.headline = '';
            this.showCount = 0;
            progressWindows.push(this);
        }

        changeHeadline(headline) {
            this.headline = headline;
        }

        show() {
            this.showCount++;
        }

        startCloseTimer(timer) {
            this.closeTimer = timer;
        }
    }

    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        Services: {
            prefs: {
                values: {},
                getIntPref(name, fallback) {
                    return Object.prototype.hasOwnProperty.call(this.values, name)
                        ? this.values[name]
                        : fallback;
                },
                setIntPref(name, value) {
                    this.values[name] = value;
                }
            }
        },
        fetch: async () => {
            throw new Error('Unexpected fetch call');
        },
        Zotero: {
            ItemTypes: {
                getID(type) {
                    return type;
                },
                getName(type) {
                    return type;
                }
            },
            Items: {
                byID: {},
                all: [],
                get(id) {
                    return this.byID[id];
                },
                getAll() {
                    return this.all;
                }
            },
            Fulltext: {
                getItemCacheFile(item) {
                    return item.cacheText ? { exists: () => true, item } : null;
                }
            },
            File: {
                async getContentsAsync(cacheFile) {
                    return cacheFile.item.cacheText || '';
                }
            },
            ProgressWindow: MockProgressWindow,
            Utilities: {
                Internal: {
                    openedPreferenceIDs: [],
                    openPreferences(paneID) {
                        this.openedPreferenceIDs.push(paneID);
                    }
                }
            },
            debug() {}
        },
        __progressWindows: progressWindows
    });

    for (const file of files) {
        const code = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    vm.runInContext(`
        this.ThreadPool = typeof ThreadPool !== 'undefined' ? ThreadPool : this.ThreadPool;
    `, context);
    return context;
}

function makeItem(fields, itemTypeID = 'preprint') {
    return {
        id: nextItemID++,
        libraryID: 1,
        itemTypeID,
        fields: Object.assign({}, fields),
        creators: [],
        tags: [],
        saved: false,
        getField(field) {
            return this.fields[field] || '';
        },
        setField(field, value) {
            this.fields[field] = value;
        },
        setCreators(creators) {
            this.creators = creators;
        },
        getTags() {
            return this.tags.map(tag => ({ tag }));
        },
        addTag(tag) {
            if (!this.tags.includes(tag)) {
                this.tags.push(tag);
            }
        },
        removeTag(tag) {
            this.tags = this.tags.filter(candidate => candidate !== tag);
        },
        isRegularItem() {
            return true;
        },
        isAttachment() {
            return false;
        },
        getAttachments() {
            return this.attachmentIDs || [];
        },
        async saveTx() {
            this.saved = true;
        }
    };
}

function makeAttachment(fields = {}) {
    const attachment = makeItem(fields, 'attachment');
    attachment.itemTypeID = 'attachment';
    attachment.attachmentContentType = 'application/pdf';
    attachment.attachmentFilename = fields.filename || fields.title || 'attachment.pdf';
    attachment.parentID = fields.parentID || null;
    attachment.cacheText = fields.cacheText || '';
    attachment.isRegularItem = () => false;
    attachment.isAttachment = () => true;
    return attachment;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function createFakeWindow() {
    class FakeElement {
        constructor(ownerDocument, tagName) {
            this.ownerDocument = ownerDocument;
            this.tagName = tagName;
            this.children = [];
            this.parentNode = null;
            this.style = {};
            this.attributes = {};
            this.textContent = '';
            this.className = '';
            this.id = '';
            this.listeners = {};
            this.classList = {
                values: [],
                add: (...classes) => {
                    for (const className of classes) {
                        if (!this.classList.values.includes(className)) {
                            this.classList.values.push(className);
                        }
                    }
                }
            };
        }

        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            this.children = this.children.filter(candidate => candidate !== child);
            child.parentNode = null;
        }

        setAttribute(name, value) {
            this.attributes[name] = value;
        }

        addEventListener(name, listener) {
            this.listeners[name] = listener;
        }
    }

    function createFakeDocument() {
        const document = {
            documentElement: null,
            body: null,
            createElementNS(namespace, tagName) {
                return new FakeElement(document, tagName);
            },
            getElementById(id) {
                function find(element) {
                    if (!element) {
                        return null;
                    }
                    if (element.id === id) {
                        return element;
                    }
                    for (const child of element.children) {
                        const found = find(child);
                        if (found) {
                            return found;
                        }
                    }
                    return null;
                }
                return find(document.documentElement);
            },
            open() {},
            write() {
                this.documentElement = new FakeElement(this, 'html');
                this.body = new FakeElement(this, 'body');
                this.documentElement.appendChild(this.body);
            },
            close() {}
        };
        document.documentElement = new FakeElement(document, 'root');
        document.body = new FakeElement(document, 'body');
        document.documentElement.appendChild(document.body);
        return document;
    }

    const document = createFakeDocument();
    const fakeWindow = {
        document,
        lastTimeout: null,
        openedWindows: [],
        setTimeout(callback, timeout) {
            this.lastTimeout = timeout;
            return 1;
        },
        clearTimeout() {},
        focus() {},
        open() {
            const child = createFakeWindow();
            this.openedWindows.push(child);
            return child;
        }
    };
    return fakeWindow;
}

function createLegacyFakeWindow() {
    class FakeElement {
        constructor(ownerDocument, tagName) {
            this.ownerDocument = ownerDocument;
            this.tagName = tagName;
            this.children = [];
            this.parentNode = null;
            this.style = {};
            this.attributes = {};
            this.textContent = '';
            this.className = '';
            this.id = '';
            this.listeners = {};
            this.classList = {
                values: [],
                add: (...classes) => {
                    for (const className of classes) {
                        if (!this.classList.values.includes(className)) {
                            this.classList.values.push(className);
                        }
                    }
                }
            };
        }

        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            this.children = this.children.filter(candidate => candidate !== child);
            child.parentNode = null;
        }

        setAttribute(name, value) {
            this.attributes[name] = value;
        }

        addEventListener(name, listener) {
            this.listeners[name] = listener;
        }
    }

    const document = {
        documentElement: null,
        createElementNS(namespace, tagName) {
            return new FakeElement(document, tagName);
        },
        getElementById(id) {
            function find(element) {
                if (element.id === id) {
                    return element;
                }
                for (const child of element.children) {
                    const found = find(child);
                    if (found) {
                        return found;
                    }
                }
                return null;
            }
            return find(document.documentElement);
        }
    };
    document.documentElement = new FakeElement(document, 'root');

    const fakeWindow = {
        document,
        lastTimeout: null,
        setTimeout(callback, timeout) {
            this.lastTimeout = timeout;
            return 1;
        },
        clearTimeout() {}
    };
    return fakeWindow;
}

async function testThreadPoolConcurrency(ThreadPool) {
    const pool = new ThreadPool(6);
    let running = 0;
    let maxRunning = 0;
    const completed = [];

    for (let index = 0; index < 18; index++) {
        pool.submit(async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            assert.ok(running <= 6, 'more than 6 jobs ran at once');
            await new Promise(resolve => setTimeout(resolve, 10));
            completed.push(index);
            running--;
        });
    }

    pool.execute();
    await pool.wait();
    assert.equal(completed.length, 18);
    assert.equal(maxRunning, 6);
}

function testModernProgressPanel(Utilities) {
    const fakeWindow = createFakeWindow();
    const handle = Utilities.initializeModernProgress(fakeWindow, 'Updating metadata', 'Preparing metadata updates...');
    assert.equal(handle.type, 'modern');
    assert.equal(handle.titleElement.textContent, 'Updating metadata');
    assert.equal(handle.summaryElement.textContent, 'Preparing metadata updates...');

    const batchItem = Utilities.addProgressItem(handle, 'Batch 1: queued 10 items');
    Utilities.updateProgressItem(batchItem, 50, 'Batch 1: 5/10 checked');
    assert.equal(batchItem.row.children[0].textContent, 'Batch 1: 5/10 checked');
    assert.equal(batchItem.row.children[1].children[0].style.width, '50%');

    Utilities.publishFinishedProgress(handle, '10 items updated.', 'Metadata updated', false);
    assert.equal(handle.titleElement.textContent, 'Metadata updated');
    assert.equal(handle.summaryElement.textContent, '10 items updated.');
    assert.equal(handle.fill.style.width, '100%');
    assert.equal(fakeWindow.lastTimeout, 8000);
}

async function waitForQueueToFinish(ZotMeta) {
    for (let index = 0; index < 100; index++) {
        if (!ZotMeta.updateProgressHandle && ZotMeta.updateActiveCount === 0 && ZotMeta.updateQueue.length === 0) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for metadata queue');
}

async function testSharedUpdatePopup(context) {
    const { Zotero, ZotMeta, Book, __progressWindows } = context;
    let running = 0;
    let maxRunning = 0;
    let completed = 0;
    let saveRunning = false;

    Book.updateMetadata = async (item) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        assert.ok(running <= 6, 'metadata queue exceeded concurrency limit');
        await new Promise(resolve => setTimeout(resolve, 10));
        await context.Utilities.saveItemTx(item);
        completed++;
        running--;
        return 0;
    };

    function makeSaveSensitiveItem(title) {
        const item = makeItem({ title }, 'book');
        item.saveTx = async () => {
            assert.equal(saveRunning, false, 'saveTx calls overlapped');
            saveRunning = true;
            await new Promise(resolve => setTimeout(resolve, 2));
            saveRunning = false;
            item.saved = true;
        };
        return item;
    }

    const firstSelection = Array.from({ length: 10 }, (_, index) => makeSaveSensitiveItem('First ' + index));
    const secondSelection = Array.from({ length: 10 }, (_, index) => makeSaveSensitiveItem('Second ' + index));

    Zotero.getActiveZoteroPane = () => ({
        getSelectedItems() {
            return firstSelection;
        }
    });
    await ZotMeta.updateSelectedItemsMetadata();

    Zotero.getActiveZoteroPane = () => ({
        getSelectedItems() {
            return secondSelection;
        }
    });
    await ZotMeta.updateSelectedItemsMetadata();

    await waitForQueueToFinish(ZotMeta);
    assert.equal(completed, 20);
    assert.equal(maxRunning, 6);
    assert.equal(__progressWindows.length, 1);
    assert.equal(__progressWindows[0].headline, 'Metadata updated');
}

async function testUpdateRetry(context) {
    const { ZotMeta } = context;
    let attempts = 0;
    const updater = {
        async updateMetadata() {
            attempts++;
            return attempts === 1 ? 1 : 0;
        }
    };

    const status = await ZotMeta.updateItemWithRetry(updater, makeItem({ title: 'Retry me' }, 'book'));
    assert.equal(status, 0);
    assert.equal(attempts, 2);
}

async function testStatusTags(context) {
    const { Utilities } = context;
    const failedItem = makeItem({ title: 'Failed item' }, 'book');
    await Utilities.markItemUpdateStatus(failedItem, 1);
    assert.deepEqual(failedItem.tags, ['ZotMeta: Failed']);

    await Utilities.markItemUpdateStatus(failedItem, 0);
    assert.deepEqual(failedItem.tags, []);

    const skippedItem = makeItem({ title: 'Skipped item' }, 'book');
    await Utilities.markItemUpdateStatus(skippedItem, 2);
    assert.deepEqual(skippedItem.tags, ['ZotMeta: Skipped']);

    await Utilities.markItemUpdateStatus(skippedItem, 1);
    assert.deepEqual(skippedItem.tags, ['ZotMeta: Failed']);
}

async function testIdentifierExtraction(context) {
    const { Utilities, Zotero, ZotMeta } = context;
    const identifiers = Utilities.extractIdentifiersFromText(
        'arXiv:2209.14577v1 [stat.ML]\nDOI: 10.1108/03321640510615607.'
    );
    assert.equal(identifiers.arxivID, '2209.14577v1');
    assert.equal(identifiers.DOI, '10.1108/03321640510615607');

    const attachment = makeAttachment({
        title: 'paper.pdf',
        cacheText: 'Published with doi 10.1234/ABC.DEF and other text.'
    });
    Zotero.Items.byID[attachment.id] = attachment;

    const item = makeItem({ DOI: '' }, 'journalArticle');
    item.attachmentIDs = [attachment.id];
    await ZotMeta.prepareItemForMetadataUpdate(item);
    assert.equal(item.fields.DOI, '10.1234/ABC.DEF');
    assert.equal(item.saved, true);
}

async function testCreateParentItem(context) {
    const { Zotero, ZotMeta } = context;
    const createdItems = [];

    Zotero.Item = function(itemType) {
        const item = makeItem({}, itemType);
        createdItems.push(item);
        return item;
    };

    const originalUpdateItemWithRetry = ZotMeta.updateItemWithRetry;
    ZotMeta.updateItemWithRetry = async () => 0;

    const arxivAttachment = makeAttachment({
        title: '2209.14577v1.pdf',
        filename: '2209.14577v1.pdf',
        cacheText: 'arXiv:2209.14577v1 [stat.ML]'
    });
    const arxivStatus = await ZotMeta.createParentItemForAttachment(arxivAttachment);
    assert.equal(arxivStatus, 0);
    assert.equal(createdItems[0].itemTypeID, 'preprint');
    assert.equal(createdItems[0].fields.archiveID, 'arXiv:2209.14577v1');
    assert.equal(arxivAttachment.parentID, createdItems[0].id);

    const dummyAttachment = makeAttachment({
        title: 'unknown.pdf',
        filename: 'unknown.pdf',
        cacheText: 'No identifiers here'
    });
    const dummyStatus = await ZotMeta.createParentItemForAttachment(dummyAttachment);
    assert.equal(dummyStatus, 0);
    assert.equal(createdItems[1].itemTypeID, 'document');
    assert.equal(createdItems[1].fields.title, 'unknown.pdf');
    assert.deepEqual(createdItems[1].tags, []);

    ZotMeta.updateItemWithRetry = originalUpdateItemWithRetry;
}

function testControlPanel(context) {
    const { Services, Zotero, ZotMeta, Utilities } = context;
    assert.equal(ZotMeta.getConcurrentThreads(), 6);
    assert.equal(ZotMeta.setConcurrentThreads(14), 12);
    assert.equal(Services.prefs.values['extensions.zotmeta.concurrentThreads'], 12);
    assert.equal(ZotMeta.setConcurrentThreads(0), 1);
    assert.equal(Utilities.getConcurrentThreads(), 1);

    const failed = makeItem({ title: 'Failed' }, 'journalArticle');
    failed.tags = ['ZotMeta: Failed'];
    const skipped = makeItem({ title: 'Skipped' }, 'book');
    skipped.tags = ['ZotMeta: Skipped'];
    const regular = makeItem({ title: 'Regular' }, 'journalArticle');
    const attachment = makeAttachment({ title: 'Attachment' });
    Zotero.Items.all = [failed, skipped, regular, attachment];

    const stats = ZotMeta.getLibraryStats();
    assert.equal(stats.totalItems, 3);
    assert.equal(stats.attachments, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.skipped, 1);
    assert.deepEqual(plain(stats.typeDistribution.map(type => type.label)), ['journalArticle', 'book']);

    const fakeWindow = createFakeWindow();
    ZotMeta.id = 'zotmeta@roadtodream.tech';
    ZotMeta.showControlPanel(fakeWindow);
    assert.deepEqual(Zotero.Utilities.Internal.openedPreferenceIDs, ['zotmeta-prefpane']);
    assert.equal(fakeWindow.openedWindows.length, 0);
}

async function main() {
    const context = loadScripts([
        'src/chrome/content/utilities.js',
        'src/chrome/content/threadpool.js',
        'src/chrome/content/journal.js',
        'src/chrome/content/book.js',
        'src/chrome/content/arxiv.js',
        'src/chrome/content/zotmeta.js'
    ]);

    const { Utilities, ThreadPool, Journal, Book, Arxiv, ZotMeta } = context;

    assert.equal(Utilities.decodeHTMLEntities('A &amp; B &#x1f;'), 'A & B \u001f');
    assert.equal(Utilities.safeGetFromJson({ a: [{ b: 3 }] }, ['a', '0', 'b']), 3);
    assert.equal(Utilities.normalizeWhitespace('  one\n two\tthree  '), 'one two three');
    assert.equal(Utilities.pluralize(1, 'item'), '1 item');
    assert.equal(Utilities.pluralize(2, 'item'), '2 items');
    assert.equal(
        Utilities.formatBatchProgress(4, 10, 2, 1, 1),
        '4/10 checked - 2 updated, 1 failed, 1 skipped'
    );
    assert.equal(
        Utilities.formatBatchSummary(2, 1, 1, ['A very long failed item title that should be clipped before it fills the whole popup']),
        '2 items updated, 1 item failed, 1 item skipped. Failed: A very long failed item title that should be clipped befo...'
    );
    assert.equal(Utilities.getBatchSummaryTitle(2, 0, 1), 'Metadata updated with skips');
    assert.equal(Utilities.getBatchSummaryTitle(0, 0, 3), 'No metadata updated');
    testModernProgressPanel(Utilities);

    const applyItem = makeItem({});
    assert.equal(Utilities.applyMetadata(applyItem, {
        Title: 'New title',
        Authors: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }]
    }, {
        Title: 'title',
        Authors: 'creators'
    }), true);
    assert.equal(applyItem.fields.title, 'New title');
    assert.equal(applyItem.creators[0].lastName, 'Lovelace');

    assert.deepEqual(plain(Book.generateAuthor({ name: 'Lovelace, Ada' })), {
        firstName: 'Ada',
        lastName: 'Lovelace',
        creatorType: 'author'
    });
    assert.deepEqual(plain(Book.generateAuthors([{ missing: true }, { name: 'Grace Hopper' }])), [{
        firstName: 'Grace',
        lastName: 'Hopper',
        creatorType: 'author'
    }]);

    assert.equal(Journal.generateTitle({
        title: ['Main title'],
        subtitle: ['Subtitle']
    }), 'Main title: Subtitle');
    assert.equal(Journal.getPublicationDate({
        issued: { 'date-parts': [[2024, 5, 2]] }
    }), '2024-5-2');
    assert.deepEqual(plain(Journal.generateAuthors([{ literal: 'Research Consortium' }])), [{
        firstName: '',
        lastName: 'Research Consortium',
        creatorType: 'author'
    }]);

    assert.equal(Arxiv.getArxivID(makeItem({ archiveID: 'arXiv:2401.12345v2' })), '2401.12345v2');
    assert.equal(Arxiv.getArxivID(makeItem({ url: 'https://arxiv.org/pdf/hep-th/9901001.pdf' })), 'hep-th/9901001');
    assert.equal(Arxiv.getArxivID(makeItem({ extra: 'arXiv ID: 2310.00001' })), '2310.00001');
    assert.equal(ZotMeta.isArxivPreprint(makeItem({ url: 'https://arxiv.org/abs/2401.12345' })), true);

    await testThreadPoolConcurrency(ThreadPool);
    await testSharedUpdatePopup(context);
    await testUpdateRetry(context);
    await testStatusTags(context);
    await testIdentifierExtraction(context);
    await testCreateParentItem(context);
    testControlPanel(context);

    console.log('All tests passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
