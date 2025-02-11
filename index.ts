/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { $, type ColorInput } from "bun";
import { parseArgs } from "util";

function printWithCssColor<T extends { toString(): string }>(
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

function error<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "red");
}

function errorAndExit<T extends { toString(): string }>(message: T): never {
    error(message);
    process.exit(1);
}

function warn<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "yellow");
}

function info<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "cyan");
}

function ok<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "lightgreen");
}

function purple<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "mediumorchid");
}

function dbg<T extends { toString(): string }>(message: T): void {
    printWithCssColor(message, "lavender");
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
    const videoFile = await Bun.file(path);

    if (!(await videoFile.exists()) || !videoFile.name) {
        errorAndExit(`ERROR: File does not exist: '${videoFile.name || path}'`);
    }

    return videoFile.name;
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

type Axis = {
    length: number;
    offset: number;
};

type VideoInfo = { width: number; height: number; duration: number };

async function cropFlagIsSet(path: string): Promise<boolean> {
    const output = await $`mkvmerge -J ${path}`.json().catch((e) => {
        error("ERROR (while executing mkvmerge):");
        errorAndExit(e.stdout.toString());
    });
    for (const track of output["tracks"]) {
        if ("cropping" in track["properties"]) {
            return true;
        }
    }
    return false;
}

async function getVideoInfo(path: string): Promise<VideoInfo> {
    const output =
        await $`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio -show_entries format=duration -of json ${path}`
            .json()
            .catch((e) => {
                error("ERROR (while executing ffprobe):");
                errorAndExit(e.stderr.toString());
            });

    return {
        width: output["streams"][0]["width"],
        height: output["streams"][0]["height"],
        duration: output["format"]["duration"],
    };
}

function padNumberToString(num: number): string {
    return `${num}`.padStart(2, "0");
}

function secsToTimeString(secs: number): string {
    const hours = Math.floor(secs / 60 / 60);
    const minutes = Math.floor((secs / 60) % 60);
    const seconds = Math.floor(secs % 60);

    return `${padNumberToString(hours)}:${padNumberToString(
        minutes
    )}:${padNumberToString(seconds)}`;
}

function calculateCrop(video: VideoInfo, frame: Frame): Crop {
    return {
        left: frame.x,
        top: frame.y,
        right: video.width - (frame.width + frame.x),
        bottom: video.height - (frame.height + frame.y),
    };
}

function maxLargestAxis(axisArray: Axis[]): Axis {
    if (!(axisArray.length > 0))
        errorAndExit(`ERROR: No axis passed for maxing.`);
    let result: Axis = { ...axisArray[0] };
    for (const axis of axisArray) {
        if (axis.length > result.length) {
            result.length = axis.length;
            result.offset = axis.offset;
        }
    }
    return result;
}

function maxLargestAxisOfFrameList(frameList: Frame[]): Frame {
    if (!(frameList.length > 0))
        errorAndExit(`ERROR: No frames passed for maxing.`);
    let result: Frame = { ...frameList[0] };
    for (const frame of frameList) {
        if (frame.width > result.width) {
            result.width = frame.width;
            result.x = frame.x;
        }
        if (frame.height > result.height) {
            result.height = frame.height;
            result.y = frame.y;
        }
    }
    return result;
}

function splitFrameArrayByAxis(frames: Frame[]): {
    xAxisArray: Axis[];
    yAxisArray: Axis[];
} {
    return {
        xAxisArray: frames.map<Axis>((frame) => {
            return { length: frame.width, offset: frame.x };
        }),
        yAxisArray: frames.map((frame) => {
            return { length: frame.height, offset: frame.y };
        }),
    };
}

function quantileOfAxis(sortedAxis: Axis[], percentage: number): number {
    const index = Math.floor(sortedAxis.length * percentage);
    return sortedAxis[index].length;
}

function filterOutliersForAxis(axis: Axis[]): Axis[] {
    axis.sort((a, b) => a.length - b.length);
    const q1 = quantileOfAxis(axis, 0.25);
    const q3 = quantileOfAxis(axis, 0.75);
    const range = q3 - q1;
    const lowerBound = q1 - 1.5 * range;
    const upperBound = q3 + 1.5 * range;

    let result: Axis[] = [];
    for (const value of axis) {
        if (value.length >= lowerBound && value.length <= upperBound) {
            result.push(value);
        }
    }
    return result;
}

function filterOutliersForFramesAndReturnMaxFrame(
    frames: Frame[],
    verbose: boolean = false
): Frame {
    const { xAxisArray, yAxisArray } = splitFrameArrayByAxis(frames);
    const filteredXAxisArray = filterOutliersForAxis(xAxisArray);
    const filteredYAxisArray = filterOutliersForAxis(yAxisArray);

    if (verbose) {
        dbg(
            `Filtered X Axis Crop: ${
                xAxisArray.length - filteredXAxisArray.length
            }/${xAxisArray.length}`
        );
        dbg(
            `Filtered Y Axis Crop: ${
                yAxisArray.length - filteredYAxisArray.length
            }/${yAxisArray.length}`
        );
    }

    const maxedXAxis = maxLargestAxis(filteredXAxisArray);
    const maxedYAxis = maxLargestAxis(filteredYAxisArray);

    return {
        width: maxedXAxis.length,
        height: maxedYAxis.length,
        x: maxedXAxis.offset,
        y: maxedYAxis.offset,
    };
}

async function detectSafeCrop(
    path: string,
    startInSecs: number,
    durationInSec: number,
    limit: number = 24,
    round: number = 2,
    verbose: boolean = false
): Promise<Frame> {
    const start = secsToTimeString(startInSecs);
    const duration = secsToTimeString(durationInSec);
    const { stderr } =
        await $`ffmpeg -hide_banner -loglevel info -ss ${start} -skip_frame nokey -i "${path}" -vf "cropdetect=mode=black,cropdetect=limit=${limit},cropdetect=round=${round},cropdetect=skip=0,cropdetect=reset=1" -t ${duration} -f null -`
            .quiet()
            .catch((e) => {
                error("ERROR (while executing ffmpeg):");
                errorAndExit(e.stderr.toString());
            });

    if (!stderr) {
        errorAndExit("ffmpeg did not output anything.");
    }

    const cropRegex = /.*crop=(?<width>\d+):(?<height>\d+):(?<x>\d+):(?<y>\d+)/;

    let count = 0;

    let frames: Frame[] = [];

    for (let line of stderr.toString().split("\n")) {
        const match = line.match(cropRegex);
        if (!match?.groups) {
            continue;
        }

        const width = parseInt(match.groups.width);
        const height = parseInt(match.groups.height);
        const x = parseInt(match.groups.x);
        const y = parseInt(match.groups.y);

        frames.push({
            width: parseInt(match.groups.width),
            height: parseInt(match.groups.height),
            x: parseInt(match.groups.x),
            y: parseInt(match.groups.y),
        });

        count += 1;
    }

    info(`Checked ${count} frames.`);

    return filterOutliersForFramesAndReturnMaxFrame(frames, verbose);
}

function cropToString(crop: Crop): string {
    return `Crop:
  - left:   ${crop.left}
  - top:    ${crop.top}
  - right:  ${crop.right}
  - bottom: ${crop.bottom}`;
}

function calculateStartAndDuration(
    filmDurationInSecs: number,
    parts: number,
    maxDurationPerPartInSecs: number
): { start: number; duration: number }[] {
    let partLength = Math.floor(filmDurationInSecs / parts);
    let result: { start: number; duration: number }[] = [];
    for (let i = 0; i < parts; i += 1) {
        const start = i * partLength;
        result.push({
            start: start,
            duration: Math.min(
                (i + 1) * partLength - start,
                maxDurationPerPartInSecs
            ),
        });
    }

    return result;
}

async function detectSafeCropFromMultipleParts(
    path: string,
    filmDurationInSecs: number,
    parts: number = 3,
    maxDurationPerPartInSecs: number = 60,
    limit: number = 24,
    round: number = 2,
    filterOutlierForParts: boolean = false,
    verbose?: { videoInfo: VideoInfo }
): Promise<Frame> {
    if (filmDurationInSecs < maxDurationPerPartInSecs) {
        return detectSafeCrop(
            path,
            0,
            filmDurationInSecs,
            limit,
            round,
            !!verbose
        );
    }

    const framesStartAndDuration = calculateStartAndDuration(
        filmDurationInSecs,
        parts,
        maxDurationPerPartInSecs
    );

    let resultsPromise: Promise<Frame>[] = [];

    for (const { start, duration } of framesStartAndDuration) {
        resultsPromise.push(
            detectSafeCrop(path, start, duration, limit, round, !!verbose)
        );
    }

    const results = await Promise.all(resultsPromise);

    if (verbose) {
        dbg(`====== Frames ======`);
        for (let i = 0; i < framesStartAndDuration.length; i += 1) {
            dbg(`=== Frame ===`);
            dbg(`Start: ${secsToTimeString(framesStartAndDuration[i].start)}`);
            dbg(cropToString(calculateCrop(verbose.videoInfo, results[i])));
        }
    }

    if (filterOutlierForParts) {
        return filterOutliersForFramesAndReturnMaxFrame(results, !!verbose);
    } else {
        return maxLargestAxisOfFrameList(results);
    }
}

async function writeCropToFileMetadata(
    path: string,
    crop: Crop,
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

    let { stderr } = await $`mkvpropedit ${{
        raw: command,
    }}`
        .nothrow()
        .quiet()
        .catch((e) => {
            error("ERROR (while executing mkvpropedit):");
            errorAndExit(e.stderr.toString());
        });

    ok(`Write success!`);
}

// ███▄ ▄███▓ ▄▄▄       ██▓ ███▄    █
// ▓██▒▀█▀ ██▒▒████▄    ▓██▒ ██ ▀█   █
// ▓██    ▓██░▒██  ▀█▄  ▒██▒▓██  ▀█ ██▒
// ▒██    ▒██ ░██▄▄▄▄██ ░██░▓██▒  ▐▌██▒
// ▒██▒   ░██▒ ▓█   ▓██▒░██░▒██░   ▓██░
// ░ ▒░   ░  ░ ▒▒   ▓▒█░░▓  ░ ▒░   ▒ ▒
// ░  ░      ░  ▒   ▒▒ ░ ▒ ░░ ░░   ░ ▒░
// ░      ░     ░   ▒    ▒ ░   ░   ░ ░
//        ░         ░  ░ ░           ░

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
        verbose: {
            type: "boolean",
        },
        limit: {
            type: "string",
            default: "24",
        },
        parts: {
            type: "string",
            default: "6",
        },
        maxduration: {
            type: "string",
            default: "60",
        },
        rmoutlier: {
            type: "boolean",
        },
    },
    strict: true,
    allowPositionals: true,
});

if (values["help"] || !positionals[positionals.length - 1].endsWith("mkv")) {
    console.write(`
crop4mkv

Bun ts script that analyses crop margins of a video and sets the flags for an mkv.

Usage: crop4mkv [Options] FILE_PATH

Options:
--dryrun      When set does not write tags to file.
--overwrite   When set does not check if tags are allready set.
--rmoutlier   Use outlier filtering for parts as well. This might result in some scenes being overly cropped.
--limit       Sets the value of a pixel where it is detected as black if lower. (Default: 24)
--parts       At how many points do you want to check your video? The more the better is the coverage. (Default: 6)
--maxduration What is the maximum duration to check per point. (Default: 60)
--help        Shows this message.
--verbose     Prints information for debugging.

Examples:

crop4mkv --dryrun --overwrite movie.mkv // checks what crop4mkv would do

crop4mkv --rmoutlier movie.mkv // Sometimes there are movies where only a few scenes are not 21:9 but 16:9. 
// Setting this option might result in some scenes being more cropped than wanted.

crop4mkv --parts 2 --maxduration 30 movie.mkv // slightly faster, as less video is checked


Copyright Adam McKellar <dev@mckellar.eu> 2025

This Program ('crop4mkv') is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
        `);
    process.exit(0);
}

writeSeparator();

const videoFilePath = await getAbsolutPath(positionals[positionals.length - 1]);

info(`File: ${videoFilePath}`);

if (!values["overwrite"] && (await cropFlagIsSet(videoFilePath))) {
    warn(`Skipping file as mkv crop flags where allready set.`);
    info(`Use --overwrite flag to still process file.`);
    process.exit(0);
}

let videoInfo = await getVideoInfo(videoFilePath);

info(`Resolution: ${videoInfo.width}x${videoInfo.height}`);
info(`Length: ${secsToTimeString(videoInfo.duration)} hh:mm:ss`);

let cropFrame = await detectSafeCropFromMultipleParts(
    videoFilePath,
    videoInfo.duration,
    parseInt(values.parts),
    parseInt(values.maxduration),
    parseInt(values.limit),
    undefined,
    values.rmoutlier,
    values.verbose ? { videoInfo: videoInfo } : undefined
);
let crop = calculateCrop(videoInfo, cropFrame);

ok(cropToString(crop));

writeCropToFileMetadata(videoFilePath, crop, values.dryrun);
