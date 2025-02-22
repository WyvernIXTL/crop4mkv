/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ColorInput } from "bun";
import type { Crop } from "./types";
import thirdPartyLicenses from "../embed/THIRD-PARTY-LICENSES.txt";

export function addCssColor<T extends { toString(): string }>(
    message: T,
    color: ColorInput
): string {
    return `${Bun.color(color, "ansi")}${message.toString()}${Bun.color(
        "white",
        "ansi"
    )}\n`;
}

export function error<T extends { toString(): string }>(message: T): void {
    console.write(addCssColor(message, "red"));
}

export function errorAndExit<T extends { toString(): string }>(
    message: T
): never {
    error(message);
    process.exit(1);
}

export function warn<T extends { toString(): string }>(message: T): string {
    return addCssColor(message, "yellow");
}

export function info<T extends { toString(): string }>(message: T): string {
    return addCssColor(message, "cyan");
}

export function ok<T extends { toString(): string }>(message: T): string {
    return addCssColor(message, "lightgreen");
}

export function purple<T extends { toString(): string }>(message: T): string {
    return addCssColor(message, "mediumorchid");
}

export function dbg<T extends { toString(): string }>(message: T): string {
    return addCssColor(message, "lavender");
}

export function writeSeparator(): string {
    const width = process.stdout.columns ?? 160;
    return "=".repeat(width) + "\n";
}

export function cropToString(crop: Crop): string {
    return `Crop:
  - left:   ${crop.left}
  - top:    ${crop.top}
  - right:  ${crop.right}
  - bottom: ${crop.bottom}`;
}

export function printLicenses(): void {
    console.write(
        `
crop4mkv

Copyright Adam McKellar <dev@mckellar.eu> 2025

License:            MPL2
Link License Text:  https://www.mozilla.org/en-US/MPL/2.0/
Repository:         https://github.com/WyvernIXTL/crop4mkv
 
-----------

THIRD PARTY LICENSES:

` + thirdPartyLicenses
    );
}
