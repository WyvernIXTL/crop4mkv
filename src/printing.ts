/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ColorInput } from "bun";
import type { Crop } from "./types";
import thirdPartyLicenses from "../embed/THIRD-PARTY-LICENSES.txt";
import runtimeLicensing from "../embed/RUNTIME-LICENSING.md" with { type: "txt" };

export function addCssColor<T extends { toString(): string }>(
    message: T,
    color: ColorInput
): string {
    return `${Bun.color(color, "ansi-16m")}${message.toString()}${Bun.color(
        "white",
        "ansi-16m"
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

` +
            thirdPartyLicenses +
            runtimeLicensing
    );
}

export class ProgressBar {
    private progress = -1;
    private running = 1;

    constructor(private length: number, private terminalWidth: number) {
        this.tick();
    }

    private render(): void {
        const ratio = Math.abs(this.progress / this.length);
        const percent = Math.ceil(ratio * 100);
        const runningRatio = Math.abs(this.running / this.length);
        const tail = ` | ${percent}% | ${this.progress} / ${this.length}  `;
        const head = "";
        const availableLength =
            this.terminalWidth - Bun.stringWidth(tail) - Bun.stringWidth(head);
        const progressPoints = Math.ceil(availableLength * ratio);
        const runningPoints = Math.ceil(availableLength * runningRatio);
        const progressString =
            "▓".repeat(progressPoints) +
            "▒".repeat(
                progressPoints + runningPoints <= availableLength
                    ? runningPoints
                    : availableLength - progressPoints
            ) +
            "░".repeat(
                Math.max(availableLength - progressPoints - runningPoints, 0)
            );
        console.write(head + progressString + tail);
    }

    public started(): void {
        this.running++;
        this.carriageReturn();
        this.render();
    }

    public tick(): void {
        if (this.running > 0) this.running--;
        this.progress++;
        this.render();
    }

    public carriageReturn(): void {
        console.write("\r");
    }
}
