class ThreadPool {
    constructor(numThreads) {
        this.numThreads = numThreads;
        this.jobs = [];
        this.executionPromise = null;
    }

    submit(job) {
        this.jobs.push(job);
    }

    execute() {
        if (!this.executionPromise) {
            this.executionPromise = this.run();
        }
        return this.executionPromise;
    }

    async wait() {
        if (!this.executionPromise) {
            this.execute();
        }
        await this.executionPromise;
    }

    async run() {
        var workerCount = Math.min(this.numThreads, this.jobs.length);
        var workers = [];
        for (let index = 0; index < workerCount; index++) {
            workers.push(this.runWorker());
        }
        await Promise.all(workers);
    }

    async runWorker() {
        while (this.jobs.length > 0) {
            const selectedJob = this.jobs.shift();
            await selectedJob();
        }
    }
}
