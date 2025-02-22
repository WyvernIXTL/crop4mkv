/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export function padNumberToString(num: number): string {
    return `${num}`.padStart(2, "0");
}

export function secsToTimeString(secs: number): string {
    const hours = Math.floor(secs / 60 / 60);
    const minutes = Math.floor((secs / 60) % 60);
    const seconds = Math.floor(secs % 60);

    return `${padNumberToString(hours)}:${padNumberToString(
        minutes
    )}:${padNumberToString(seconds)}`;
}

export async function readMkvFromDirRecursive(path: string): Promise<string[]> {
    const entries = await readdir(path, {
        withFileTypes: true,
        recursive: true,
    });
    return entries
        .filter((e) => e.isFile() && e.name.endsWith("mkv"))
        .map((e) => join(e.parentPath, e.name));
}
