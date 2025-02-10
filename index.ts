/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { $, env, ShellError } from "bun";
import { parseArgs } from "util";
import { resolve, isAbsolute } from "path";
import type { text } from "stream/consumers";

function error(message: string): void {
    console.write(
        `${Bun.color("red", "ansi")}${message}${Bun.color("white", "ansi")}\n`
    );
}

function errorAndExit(message: string): never {
    error(message);
    process.exit(1);
}

function warn(message: string): void {
    console.write(
        `${Bun.color("yellow", "ansi")}${message}${Bun.color(
            "white",
            "ansi"
        )}\n`
    );
}

function info(message: string): void {
    console.write(
        `${Bun.color("cyan", "ansi")}${message}${Bun.color("white", "ansi")}\n`
    );
}

function ok(message: string): void {
    console.write(
        `${Bun.color("lightgreen", "ansi")}${message}${Bun.color(
            "white",
            "ansi"
        )}\n`
    );
}

function purple(message: string): void {
    console.write(
        `${Bun.color("mediumorchid", "ansi")}${message}${Bun.color(
            "white",
            "ansi"
        )}\n`
    );
}

function checkIfToolsAreInPath(): void {
    const tools = ["mkvpropedit", "ffprobe", "ffmpeg"];
    for (const tool of tools) {
        if (!Bun.which(tool)) {
            errorAndExit(`ERROR: ${tool} not in PATH`);
        }
    }
}

function writeSeparator(): void {
    const width = process.stdout.columns || 80;
    console.write("=".repeat(width));
}

async function getAbsolutPath(path: string): Promise<string> {
    if (isAbsolute(path)) {
        return path;
    }

    return resolve(await $`pwd`.text(), path);
}

async function cropFlagIsSet(path: string): Promise<boolean> {
    const output = await $`mkvmerge -J ${path}`.json();
    for (const track of output["tracks"]) {
        if ("cropping" in track["properties"]) {
            return true;
        }
    }
    return false;
}

async function getVideoInfo(
    path: string
): Promise<{ width: number; height: number; duration: number }> {
    const output =
        await $`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio -show_entries format=duration -of json ${path}`.json();

    return {
        width: output["streams"][0]["width"],
        height: output["streams"][0]["height"],
        duration: output["format"]["duration"],
    };
}

function padNumberToString(num: number): string {
    return `${num}`.padStart(2, "0");
}

function secsToTime(secs: number): string {
    const hours = Math.floor(secs / 60 / 60);
    const minutes = Math.floor((secs / 60) % 60);
    const seconds = Math.floor(secs % 60);

    return `${padNumberToString(hours)}:${padNumberToString(
        minutes
    )}:${padNumberToString(seconds)}`;
}

type Frame = {
    width: number;
    height: number;
    x: number;
    y: number;
};

type Crop = {
    top: number;
    bottom: number;
    left: number;
    right: number;
};

function calculateCrop(
    video: {
        width: number;
        height: number;
    },
    frame: Frame
): Crop {
    return {
        left: frame.x,
        top: frame.y,
        right: video.width - (frame.width + frame.x),
        bottom: video.height - (frame.height + frame.y),
    };
}

async function detectSafeCrop(
    path: string,
    startInSecs: number,
    durationInSec: number,
    limit: number = 24,
    round: number = 2
): Promise<Frame> {
    const start = secsToTime(startInSecs);
    const duration = secsToTime(durationInSec);
    const { stdout, stderr } =
        await $`ffmpeg.exe -hide_banner -loglevel info -ss ${start} -skip_frame nokey -i "${path}" -vf "cropdetect=mode=black,cropdetect=limit=${limit},cropdetect=round=${round},cropdetect=skip=0,cropdetect=reset=1" -t ${duration} -f null -`.quiet();

    if (!stderr) {
        errorAndExit("ffmpeg did not output anything.");
    }

    const cropRegex = /.*crop=(?<width>\d+):(?<height>\d+):(?<x>\d+):(?<y>\d+)/;

    let count = 0;

    let frame = {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
    };

    for (let line of stderr.toString().split("\n")) {
        const match = line.match(cropRegex);
        if (!match?.groups) {
            continue;
        }

        const width = parseInt(match.groups.width);
        const height = parseInt(match.groups.height);
        const x = parseInt(match.groups.x);
        const y = parseInt(match.groups.y);

        if (width > frame.width) {
            frame.width = width;
            frame.x = x;
        }
        if (height > frame.height) {
            frame.height = height;
            frame.y = y;
        }

        count += 1;
    }

    info(`Checked ${count} frames.`);

    return frame;
}

function maxLargestAxisOfFrame(frame1: Frame, frame2: Frame): Frame {
    let newFrame: Frame = { ...frame1 };

    if (frame2.width > newFrame.width) {
        newFrame.width = frame2.width;
        newFrame.x = frame2.x;
    }
    if (frame2.height > newFrame.height) {
        newFrame.height = frame2.height;
        newFrame.y = frame2.y;
    }

    return newFrame;
}

async function detectSafeCropFromMultipleParts(
    path: string,
    filmDurationInSecs: number,
    limit: number = 24,
    round: number = 2
): Promise<Frame> {
    if (filmDurationInSecs / 60 < 4) {
        return detectSafeCrop(path, 0, filmDurationInSecs);
    }

    const leftStart = Math.floor(filmDurationInSecs * 0.1);
    const midStart = Math.floor(filmDurationInSecs * 0.5);
    const rightStart = Math.floor(filmDurationInSecs * 0.8);

    const leftDuration = Math.min(midStart - leftStart, 60);
    const midDuration = Math.min(rightStart - midStart, 60);
    const rightDuration = Math.min(filmDurationInSecs - rightStart, 60);

    const [leftFrame, midFrame, rightFrame] = await Promise.all([
        detectSafeCrop(path, leftStart, leftDuration),
        detectSafeCrop(path, midStart, midDuration),
        detectSafeCrop(path, rightStart, rightDuration),
    ]);

    return maxLargestAxisOfFrame(
        leftFrame,
        maxLargestAxisOfFrame(midFrame, rightFrame)
    );
}

async function writeCropToFileMetadata(
    path: string,
    crop: { left: number; top: number; right: number; bottom: number },
    dryrun: boolean = false
) {
    let command = `${$.escape(path)} --edit track:v1 `;
    let changed = false;
    for (const key in crop) {
        if (!(crop as any)[key]) {
            continue;
        }

        const cropValue: number = (crop as any)[key];
        command += `--set pixel-crop-${key}=${cropValue} `;
        changed = true;
    }

    if (!changed) {
        warn(`Skipping write as crop is 0.`);
        return;
    }

    if (dryrun) {
        warn(
            `Dryrun enabled. No metadata will be overwritten. Following would have been executed:`
        );
        purple(`mkvpropedit ${command}`);
        return;
    }

    let { stderr, exitCode } = await $`mkvpropedit ${{
        raw: command,
    }}`.nothrow();
    if (exitCode != 0) {
        console.log(stderr.toString());
        process.exit(exitCode);
    }

    ok(`Write success!`);
}

checkIfToolsAreInPath();

const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
        help: {
            type: "boolean",
        },
        dryrun: {
            type: "boolean",
        },
        overwrite: {
            type: "boolean",
        },
    },
    strict: true,
    allowPositionals: true,
});

if (values["help"] || !positionals[positionals.length - 1].endsWith("mkv")) {
    console.write(`
    help
        `);
    process.exit(0);
}

writeSeparator();

const videoFile = await getAbsolutPath(positionals[positionals.length - 1]);

info(`File: ${videoFile}`);

if (!values["overwrite"] && (await cropFlagIsSet(videoFile))) {
    warn(`Skipping file as mkv crop flags where allready set.`);
    info(`Use --overwrite flag to still process file.`);
    process.exit(0);
}

let videoInfo = await getVideoInfo(videoFile);

info(`Resolution: ${videoInfo.width}x${videoInfo.height}`);
info(`Length: ${secsToTime(videoInfo.duration)} hh:mm:ss`);

let cropFrame = await detectSafeCropFromMultipleParts(
    videoFile,
    videoInfo.duration
);
let crop = calculateCrop(videoInfo, cropFrame);

ok(`Crop:
  - left:   ${crop.left}
  - top:    ${crop.top}
  - right:  ${crop.right}
  - bottom: ${crop.bottom}`);

writeCropToFileMetadata(videoFile, crop, values.dryrun);
