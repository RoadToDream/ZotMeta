// class ThreadPool {
//     constructor(numThreads) {
//         this.numThreads = numThreads;
//         this.jobs = [];
//         this.jobsRunning = {
//             _value: 0, 
//             onChangeCallback: null,

//             get value() {
//                 return this._value;
//             },

//             set value(newValue) {
//                 var originalValue = this._value;
//                 if (newValue !== this._value) {
//                     this._value = newValue;
//                 }
//                 if (newValue < originalValue) {
//                     if (this.onChangeCallback) {
//                         this.onChangeCallback();
//                     }
//                 }
//             },

//             setOnChangeCallback(callback) {
//                 this.onChangeCallback = callback;
//             },
//         };

//         this.jobsRunning.setOnChangeCallback(async () => {
//             await this.fill_pool();
//         });
//     }

//     submit(job) {
//         this.jobs.push(job);
//     }

//     execute() {
//         this.fill_pool();
//     }

//     async wait() {
//         while (this.jobs.length !== 0 || this.jobsRunning.value !== 0) {
//             await new Promise((resolve) => setTimeout(resolve, 1000));
//         }
//     }

//     async fill_pool() {
//         for (let index = 0; index < this.numThreads - this.jobsRunning.value; index++) {
//             if (this.jobs.length === 0) {
//                 break;
//             }
//             const selected_job = this.jobs.shift();
//             this.jobsRunning.value++;
//             await selected_job();
//             this.jobsRunning.value--;
//         }
//     }
// }


// async function test() {
//     var pool = new ThreadPool(5);
//     for (let index = 0; index < 1; index++) {
//         pool.submit(async () => {
//             const min = 500;
//             const max = 1000;
//             const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
//             await new Promise((resolve) => setTimeout(resolve, randomNumber));
//             console.log(index + " seconds passed.");
//         });
//     }
//     pool.execute();
//     await pool.wait();
//     console.log("Finished");
// }

// test();

// jobs = [1,2,3];
// async function wait() {
//     while (jobs.length !== 0) {
//         // Wait until the lock is released.
//         await new Promise((resolve) => setTimeout(resolve, 100));
//     }
// }

// wait();

// jobs = [1,2,3];
// async function example() {
//     while (jobs.length !== 0) {
//         await new Promise((resolve) => setTimeout(resolve, 1000)); // Sleep for 1 second
//     }
        
// }

// await example();


// function fetchWithTimeout(url, timeout) {
//     // Create a new Promise that will reject if the fetch call doesn't complete within the specified timeout
//     const timeoutPromise = new Promise((_, reject) => {
//         setTimeout(() => {
//             reject(new Error('Request timed out'));
//         }, timeout);
//     });

//     // Use Promise.race to race between the fetch call and the timeout promise
//     return Promise.race([
//         fetch(url), // The fetch call
//         timeoutPromise // The timeout promise
//     ]);
// }

// // Example usage
// const url = 'https://www.google.com/';
// const timeout = 1000; // 5 seconds timeout

// fetchWithTimeout(url, timeout)
//     .then(response => {
//         if (!response.ok) {
//             throw new Error(`HTTP error! Status: ${response.status}`);
//         }
//         return response;
//     })
//     .then(data => {
//         console.log(data);
//     })
//     .catch(error => {
//         console.error(error.message);
//     });

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
        // if (item.itemTypeID !== Zotero.ItemTypes.getID('journalArticle')) {
        //     Utilities.publishError("Unsupported Item Type", "Only Journal Article is supported.")
        //     return;
        // }
        // if (!doi) {
        //     // Utilities.publishError("DOI not found", "DOI is required to retrieve metadata.")
        //     return;
        // }

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

Utilities = {
    publishError(title, message) {
        var progressWindowError = new Zotero.ProgressWindow({closeOnClick:true});
        var errorIcon = "chrome://zotero/skin/cross.png";
        progressWindowError.changeHeadline(title);
        progressWindowError.progress = new progressWindowError.ItemProgress(errorIcon, message);
        progressWindowError.progress.setError();
        progressWindowError.show();
        progressWindowError.startCloseTimer(3000);
    },
    publishSuccess(title, message) {
        var progressWindowSuccess = new Zotero.ProgressWindow({closeOnClick:true});
        var successIcon = "chrome://zotero/skin/tick.png";
        progressWindowSuccess.changeHeadline(title);
        progressWindowSuccess.progress = new progressWindowSuccess.ItemProgress(successIcon, message);
        progressWindowSuccess.show();
        progressWindowSuccess.startCloseTimer(3000);
    },
    initializeProgress(title, message) {
        var progressWindowProgress = new Zotero.ProgressWindow({closeOnClick:true});
        var loadingIcon = "chrome://zotero/skin/spinner-16px.png";
        progressWindowProgress.changeHeadline(title);
        progressWindowProgress.progress = new progressWindowProgress.ItemProgress(loadingIcon, message);
        progressWindowProgress.progress.setProgress(0);
        progressWindowProgress.progress.setText(message);
        progressWindowProgress.show();
        return progressWindowProgress;
        
    },
    publishProgress(handle, progress, message) {
        var validated_progress = Math.min(Math.max(progress, 0), 100);
        handle.progress.setProgress(validated_progress);
        handle.progress.setText(message);
        if (progress === 100) {
            var successIcon = "chrome://zotero/skin/tick.png";
            handle.progress.setIcon(successIcon);
        }
        handle.show();
    },

    fetchWithTimeout(url, requestInfo, timeout) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Request timed out'));
            }, timeout);
        });
    
        return Promise.race([
            fetch(url, requestInfo),
            timeoutPromise
        ]);
    },

    safeGetFromJson(json, key_array) {
        if (!json) {
            return null;
        }
        var json_loc = json;
        for (const key of key_array) {
            if (key in json_loc) {
                json_loc = json_loc[key];
            } else {
                return null;
            }
        }
        return json_loc;
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

class Item {
    getField(key) {
        return "10.13334/j.0258-8013.pcsee.2012.36.020";
    }
}

async function test() {
    var item = new Item();
    var metadata = await ZotMeta.getMetaData(item);
    return metadata;
}

test();