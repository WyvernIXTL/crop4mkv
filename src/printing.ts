import type { ColorInput } from "bun";
import type { Crop } from "./types";

export function printWithCssColor<T extends { toString(): string }>(
    message: T,
    color: ColorInput
): void {
    console.write(
        `${Bun.color(color, "ansi")}${message.toString()}${Bun.color(
            "white",
            "ansi"
        )}\n`
    );
}

export function error<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "red");
}

export function errorAndExit<T extends { toString(): string }>(
    message: T
): never {
    error(message);
    process.exit(1);
}

export function warn<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "yellow");
}

export function info<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "cyan");
}

export function ok<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "lightgreen");
}

export function purple<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "mediumorchid");
}

export function dbg<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "lavender");
}

export function writeSeparator(): void {
    const width = process.stdout.columns || 80;
    console.write("=".repeat(width) + "\n");
}

export function cropToString(crop: Crop): string {
    return `Crop:
  - left:   ${crop.left}
  - top:    ${crop.top}
  - right:  ${crop.right}
  - bottom: ${crop.bottom}`;
}
