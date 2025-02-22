export enum InternalErrorKind {
    WrongAxis = "WrongAxis",
    MissingSamples = "MissingSamples",
    ExecutionFailed = "ExecutionFailed",
    IoError = "IoError",
}

export class InternalError extends Error {
    kind: InternalErrorKind;
    cause?: unknown;

    constructor(kind: InternalErrorKind, message?: string, cause?: unknown) {
        super(message || `Internal error: ${kind}`);
        this.kind = kind;
        this.name = "InternalError";
        this.cause = cause;
    }
}
