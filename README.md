# `crop4mkv`

**Bun TS script that analyzes crop margins of a video and sets the flags for an MKV.**

[![NPM Version](https://img.shields.io/npm/v/crop4mkv)](https://www.npmjs.com/package/crop4mkv)
[![GitHub License](https://img.shields.io/github/license/WyvernIXTL/crop4mkv)](https://github.com/WyvernIXTL/crop4mkv/blob/master/LICENSE)

-   This script searches with [`ffmpeg` `cropdetect`](https://ffmpeg.org/ffmpeg-filters.html#cropdetect) at multiple different points in the video to check the crop.
-   It then takes the crop per axis that clips the fewest pixels (the safe crop).
-   The crop is then saved into the MKV flags with [MKVToolNix](https://mkvtoolnix.download/) without touching the video stream.

Video players like [MPV](https://mpv.io/) read this MKV flag and crop the video at play time.

## Usage

Generate and set crop tags for a single file:

```sh
crop4mkv ./myVideo.mkv
```

Generate and set crop tags recursively for a directory:

```sh
crop4mkv ./myDir/
```

Do not write tag to file:

```sh
crop4mkv --dryrun PATH
```

Skip check for the existence of crop tags:

```sh
crop4mkv --overwrite PATH
```

Sometimes a movie or show might have a few scenes that are in a different format.
If almost the entire video is 21/9, but one scene is 16/9, it might make sense to ignore that one scene by filtering outliers:

```sh
crop4mkv --filter PATH
```

If you wish filter a large library regularly, you might be interested in the `--guard` flag.
When enabled `crop4mkv` writes a database into the directory that is scanned, which in turn
is used in every consecutive call for skipping already processed files (or files that ffmpeg does not like).

```sh
crop4mkv ./myBigAssLibrary/ --guard # create db and ignore already processed files
```

```sh
crop4mkv ./myBigAssLibrary/ --guard --overwrite # create db but do not ignore processed files
```

For some options, there exist shorthand flags, which you can write together:

```sh
crop4mkv PATH -dof # Dryrun, Overwrite, Filter
```

```sh
crop4mkv PATH -o # Overwrite
```

## Prerequisites

-   [MKVToolNix](https://mkvtoolnix.download/) installed and in [PATH](https://www.howtogeek.com/787217/how-to-edit-environment-variables-on-windows-10-or-11/).
-   [ffmpeg](https://ffmpeg.org/) installed and in PATH.
-   [bun](https://bun.sh/) installed and in PATH.

I recommend for Windows users to install these dependencies apart from bun with [Scoop](https://scoop.sh/):

```sh
scoop bucket add main
scoop install main/ffmpeg
scoop bucket add extras
scoop install extras/mkvtoolnix
```

## Installation

```sh
bun install -g crop4mkv
```

## Images

![Image showing dryrun](https://media.githubusercontent.com/media/WyvernIXTL/crop4mkv/refs/heads/master/images/1-fs8.png)
![Image showing success](https://media.githubusercontent.com/media/WyvernIXTL/crop4mkv/refs/heads/master/images/2-fs8.png)
![Image showing execution of already done file](https://media.githubusercontent.com/media/WyvernIXTL/crop4mkv/refs/heads/master/images/3-fs8.png)
