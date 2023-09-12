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
    
    publishProgress(handle, progress, message, title = null) {
        var validatedProgress = Math.min(Math.max(progress, 0), 100);
        handle.progress.setProgress(validatedProgress);
        handle.progress.setText(message);
        if (progress === 100) {
            var successIcon = "chrome://zotero/skin/tick.png";
            handle.progress.setIcon(successIcon);
        }
        if (title) {
            handle.changeHeadline(title);
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

    safeGetFromJson(json, keyArray) {
        if (!json) {
            return null;
        }
        var jsonLoc = json;
        for (const key of keyArray) {
            if (key in jsonLoc) {
                jsonLoc = jsonLoc[key];
            } else {
                return null;
            }
        }
        return jsonLoc;
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