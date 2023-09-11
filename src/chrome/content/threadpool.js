class ThreadPool {
    constructor(numThreads) {
        this.numThreads = numThreads;
        this.jobs = [];
        this.jobsRunning = {
            _value: 0, 
            onChangeCallback: null,

            get value() {
                return this._value;
            },

            set value(newValue) {
                var originalValue = this._value;
                if (newValue !== this._value) {
                    this._value = newValue;
                }
                if (newValue < originalValue) {
                    if (this.onChangeCallback) {
                        this.onChangeCallback();
                    }
                }
            },

            setOnChangeCallback(callback) {
                this.onChangeCallback = callback;
            },
        };

        this.jobsRunning.setOnChangeCallback(async () => {
            await this.fill_pool();
        });
    }

    submit(job) {
        this.jobs.push(job);
    }

    execute() {
        this.fill_pool();
    }

    async wait() {
        while (this.jobs.length !== 0 || this.jobsRunning.value !== 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    async fill_pool() {
        for (let index = 0; index < this.numThreads - this.jobsRunning.value; index++) {
            if (this.jobs.length === 0) {
                break;
            }
            const selected_job = this.jobs.shift();
            this.jobsRunning.value++;
            await selected_job();
            this.jobsRunning.value--;
        }
    }
}