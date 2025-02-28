/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { $ } from "bun";
import { stat } from "node:fs/promises";
import { program, Option, InvalidArgumentError, Argument } from "commander";
import pLimit from "p-limit";

import { InternalError, InternalErrorKind } from "./error";
import {
    cropToString,
    dbg,
    error,
    errorAndExit,
    info,
    ok,
    printLicenses,
    purple,
    warn,
    writeSeparator,
} from "./printing";
import {
    getVersion,
    readMkvFromDirRecursive,
    secsToTimeString,
} from "./helper";
import { Direction, type Axis, type Crop, type VideoInfo } from "./types";
import { exit } from "node:process";

function checkIfToolsAreInPath(): void {
    const tools = ["mkvpropedit", "ffprobe", "ffmpeg"];
    for (const tool of tools) {
        if (!Bun.which(tool)) {
            errorAndExit(`ERROR: ${tool} not in PATH`);
        }
    }
}

async function getAbsolutPath(path: string): Promise<string> {
    const videoFile = await Bun.file(path);

    if (!(await videoFile.exists()) || !videoFile.name) {
        throw new InternalError(
            InternalErrorKind.IoError,
            `ERROR: File does not exist: '${videoFile.name || path}'`
        );
    }

    return videoFile.name;
}

async function getVideoInfo(path: string): Promise<VideoInfo> {
    let output;
    try {
        output =
            await $`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio -show_entries format=duration -of json ${path}`.json();
    } catch (e) {
        throw new InternalError(
            InternalErrorKind.ExecutionFailed,
            "ERROR (while executing ffprobe)",
            e
        );
    }

    const result = {
        width: output?.streams?.[0]?.width,
        height: output?.streams?.[0]?.height,
        duration: output?.format?.duration,
    };

    if (!result.width || !result.height || !result.duration) {
        throw new InternalError(
            InternalErrorKind.GarbageReturned,
            "ERROR: ffprobe did no return values in expected structure."
        );
    }

    return result;
}

async function cropFlagIsSet(path: string): Promise<boolean> {
    let output;
    try {
        output = await $`mkvmerge -J ${path}`.json();
    } catch (e) {
        throw new InternalError(
            InternalErrorKind.ExecutionFailed,
            "ERROR (while executing mkvmerge)",
            e
        );
    }
    for (const track of output["tracks"]) {
        if ("cropping" in track["properties"]) {
            return true;
        }
    }
    return false;
}

function calculateCrop(video: VideoInfo, xAxis: Axis, yAxis: Axis): Crop {
    if (xAxis.direction !== Direction.X || yAxis.direction !== Direction.Y) {
        throw new InternalError(InternalErrorKind.WrongAxis);
    }
    return {
        left: xAxis.offset,
        top: yAxis.offset,
        right: video.width - (xAxis.length + xAxis.offset),
        bottom: video.height - (yAxis.length + yAxis.offset),
    };
}

function maxLargestAxis(axisArray: Axis[]): Axis {
    if (axisArray.length === 0)
        throw new InternalError(InternalErrorKind.MissingSamples);
    const result: Axis = { ...axisArray[0] };
    for (const axis of axisArray) {
        if (axis.length > result.length) {
            result.length = axis.length;
            result.offset = axis.offset;
        }
    }
    return result;
}

function quantileOfAxis(sortedAxis: Axis[], percentage: number): number {
    const index = Math.floor(sortedAxis.length * percentage);
    return sortedAxis[index].length;
}

function filterAxis(axis: Axis[]): Axis[] {
    axis.sort((a, b) => a.length - b.length);
    const q1 = quantileOfAxis(axis, 0.25);
    const q3 = quantileOfAxis(axis, 0.75);
    const range = q3 - q1;
    const lowerBound = q1 - 1.5 * range;
    const upperBound = q3 + 1.5 * range;

    const result: Axis[] = [];
    for (const value of axis) {
        if (value.length >= lowerBound && value.length <= upperBound) {
            result.push(value);
        }
    }
    return result;
}

async function samplesForSection(
    path: string,
    startInSecs: number,
    durationInSec: number,
    limit: number = 24,
    round: number = 2,
    verbose?: { log: (msg: string) => void }
): Promise<Axis[]> {
    const start = secsToTimeString(startInSecs);
    const duration = secsToTimeString(durationInSec);
    const { stderr } =
        await $`ffmpeg -hide_banner -loglevel info -ss ${start} -skip_frame nokey -i "${path}" -vf "cropdetect=mode=black,cropdetect=limit=${limit},cropdetect=round=${round},cropdetect=skip=0,cropdetect=reset=1" -t ${duration} -f null -`
            .quiet()
            .catch((e) => {
                throw new InternalError(
                    InternalErrorKind.ExecutionFailed,
                    "ERROR (while executing ffmpeg)",
                    e
                );
            });

    if (!stderr) {
        throw new InternalError(
            InternalErrorKind.MissingSamples,
            "ffmpeg did not output anything."
        );
    }

    const cropRegex = /.*crop=(?<width>\d+):(?<height>\d+):(?<x>\d+):(?<y>\d+)/;

    let count = 0;

    const samples: Axis[] = [];

    for (const line of stderr.toString().split("\n")) {
        const match = line.match(cropRegex);
        if (!match?.groups) {
            continue;
        }

        samples.push({
            length: parseInt(match.groups.width),
            offset: parseInt(match.groups.x),
            direction: Direction.X,
        });
        samples.push({
            length: parseInt(match.groups.height),
            offset: parseInt(match.groups.y),
            direction: Direction.Y,
        });

        count += 1;
    }

    if (verbose) {
        verbose.log(dbg(`Extracted crop of ${count} frames.`));
    }

    return samples;
}

function calculateStartAndDuration(
    filmDurationInSecs: number,
    parts: number,
    maxDurationPerPartInSecs: number
): { start: number; duration: number }[] {
    const partLength = Math.floor(filmDurationInSecs / parts);
    const result: { start: number; duration: number }[] = [];
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

function cropFromMultiAxis(
    videoInfo: VideoInfo,
    samples: Axis[],
    filter: boolean,
    verbose?: { log: (msg: string) => void }
): Crop {
    const xAxis = samples.filter((sample) => sample.direction == Direction.X);
    const yAxis = samples.filter((sample) => sample.direction == Direction.Y);
    const xFiltered = filter ? filterAxis(xAxis) : xAxis;
    const yFiltered = filter ? filterAxis(yAxis) : yAxis;
    if (verbose) {
        verbose.log(
            dbg(
                `Filtered out ${
                    xAxis.length - xFiltered.length
                } samples from x axis.`
            )
        );
        verbose.log(
            dbg(
                `Filtered out ${
                    yAxis.length - yFiltered.length
                } samples from y axis.`
            )
        );
    }
    const xMax = maxLargestAxis(xFiltered);
    const yMax = maxLargestAxis(yFiltered);
    return calculateCrop(videoInfo, xMax, yMax);
}

async function detectSafeCropFromMultipleParts(
    path: string,
    videoInfo: VideoInfo,
    parts: number = 3,
    maxDurationPerPartInSecs: number = 60,
    limit: number = 24,
    round: number = 2,
    filter: boolean = true,
    verbose?: { videoInfo: VideoInfo; log: (msg: string) => void }
): Promise<Crop> {
    if (videoInfo.duration < maxDurationPerPartInSecs) {
        const samples = await samplesForSection(
            path,
            0,
            videoInfo.duration,
            limit,
            round,
            verbose
        );
        return cropFromMultiAxis(videoInfo, samples, filter, verbose);
    }

    const framesStartAndDuration = calculateStartAndDuration(
        videoInfo.duration,
        parts,
        maxDurationPerPartInSecs
    );

    const samplesPromise: Promise<Axis[]>[] = [];

    for (const { start, duration } of framesStartAndDuration) {
        samplesPromise.push(
            samplesForSection(path, start, duration, limit, round, verbose)
        );
    }

    const results = await Promise.all(samplesPromise);
    const samples = results.flat(1);

    if (samples.length == 0) {
        throw new InternalError(
            InternalErrorKind.MissingSamples,
            "ERROR: Failed extracting any samples."
        );
    }

    return cropFromMultiAxis(videoInfo, samples, filter, verbose);
}

async function writeCropToFileMetadata(
    path: string,
    crop: Crop,
    dryrun: boolean = false,
    log: (msg: string) => void
) {
    let command = `${$.escape(path)} --edit track:v1 `;
    let changed = false;
    for (const key in crop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(crop as any)[key]) {
            continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cropValue: number = (crop as any)[key];
        command += `--set pixel-crop-${key}=${cropValue} `;
        changed = true;
    }

    if (!changed) {
        log(warn(`Skipping write as crop is 0.`));
        return;
    }

    if (dryrun) {
        log(
            warn(
                `Dryrun enabled. No metadata will be overwritten. Following would have been executed:`
            )
        );
        log(purple(`mkvpropedit ${command}`));
        return;
    }

    await $`mkvpropedit ${{
        raw: command,
    }}`
        .quiet()
        .catch((e) => {
            throw new InternalError(
                InternalErrorKind.ExecutionFailed,
                "ERROR (while executing mkvpropedit)",
                e
            );
        });

    log(ok(`Write success!`));
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
function optionsParseInt(value: any, _dummy: any) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
        throw new InvalidArgumentError(`'${value}' is not an integer.`);
    }
    return parsedValue;
}

program
    .name("crop4mkv")
    .description(
        "Bun TS script that analyzes crop margins of a video and sets the flags for an MKV."
    )
    .version(getVersion())
    .option("-d, --dryrun", "When set does not write tags to file.")
    .option(
        "-o, --overwrite",
        "When set does not check if tags are allready set."
    )
    .option("--no-filter", "Disables filtering outliers.")
    .addOption(
        new Option(
            "--limit <number>",
            "Pixels with brightness below the limit are detected as black."
        )
            .default(24)
            .argParser(optionsParseInt)
    )
    .addOption(
        new Option(
            "--parts <number>",
            "At how many points do you want to check your video? The more the better is the coverage."
        )
            .default(6)
            .argParser(optionsParseInt)
    )
    .addOption(
        new Option(
            "--max-duration <number>",
            "Maximum duration per part in seconds."
        )
            .default(60)
            .argParser(optionsParseInt)
    )
    .addOption(
        new Option(
            "--concurrency <number>",
            "Limits concurrency on promises being fullfilled. This limit is in place to hinder your system memory from running full on huge folders."
        )
            .default(20)
            .argParser(optionsParseInt)
    )
    .option("--verbose", "Prints more information.")
    .option("--license", "Prints license information.")
    .addArgument(
        new Argument("<PATH>", "Path of folder or mkv file.").argOptional()
    );

program.parse(Bun.argv);

const opts = program.opts();

if (opts.license) {
    printLicenses();
    exit(0);
}

if (program.args.length == 0) {
    program.help();
}

async function cropFile(path: string, log: (msg: string) => void) {
    log(writeSeparator());

    log(info(`File: ${path}`));

    if (!opts.overwrite && (await cropFlagIsSet(path))) {
        log(warn(`Skipping file as mkv crop flags where allready set.`));
        log(info(`Use --overwrite flag to still process file.`));
        return;
    }

    const videoInfo = await getVideoInfo(path);

    log(info(`Resolution: ${videoInfo.width}x${videoInfo.height}`));
    log(info(`Length: ${secsToTimeString(videoInfo.duration)} hh:mm:ss`));

    const crop = await detectSafeCropFromMultipleParts(
        path,
        videoInfo,
        opts.parts,
        opts.maxDuration,
        opts.limit,
        undefined,
        opts.filter,
        opts.verbose ? { videoInfo: videoInfo, log } : undefined
    );

    log(ok(cropToString(crop)));

    await writeCropToFileMetadata(path, crop, opts.dryrun, log);
}

let paths: string[];

try {
    const pathStat = await stat(program.args[0]);
    if (pathStat.isDirectory()) {
        paths = await readMkvFromDirRecursive(program.args[0]);
    } else if (pathStat.isFile()) {
        const path = await getAbsolutPath(program.args[0]);
        paths = [path];
    } else {
        errorAndExit("Path given is neither file nor folder.");
    }
} catch (e) {
    if (e instanceof Error)
        errorAndExit(`ERROR (while reading path):\n${e.message}`);
    if (typeof e === "string")
        errorAndExit(`ERROR (while reading path):\n${e}`);
    throw e;
}

const limit = pLimit(opts.concurrency);
const promises = paths.map(async (path) =>
    limit(async () => {
        let stringBuffer = "";
        const log = (msg: string) => (stringBuffer += msg);
        try {
            await cropFile(path, log);
            console.write(stringBuffer);
        } catch (e) {
            console.write(stringBuffer);
            if (e instanceof InternalError) {
                error(e.message);
                if (e.cause) {
                    error(e.cause);
                }
            } else {
                throw e;
            }
        }
    })
);

const results = await Promise.allSettled(promises);
for (const result of results) {
    if (result.status == "rejected") {
        errorAndExit(result.reason);
    }
}
