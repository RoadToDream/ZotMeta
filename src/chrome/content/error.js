class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "TimeoutError";
    }
}

class UnsupportedItemTypeError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnsupportedItemTypeError";
    }
}
