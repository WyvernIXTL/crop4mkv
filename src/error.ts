/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export enum InternalErrorKind {
    WrongAxis = "WrongAxis",
    MissingSamples = "MissingSamples",
    ExecutionFailed = "ExecutionFailed",
    GarbageReturned = "GarbageReturned",
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
