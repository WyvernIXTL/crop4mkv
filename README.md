# `crop4mkv`

**Bun ts script that analyses crop margins of a video and sets the flags for an mkv.**

* This script searches with [`ffmpeg` `cropdetect`](https://ffmpeg.org/ffmpeg-filters.html#cropdetect) at 3 different points in the video to check the crop.
* It then takes the crop per axis that clips the least pixel (the safes crop).
* The crop is then saved into the mkv flags with [MKVToolNix](https://mkvtoolnix.download/) without touching the video stream.

Video players like [MPV](https://mpv.io/) read this mkv flag and crop the video at play time.


## Usage

Set crop for a single file.
```pwsh
crop4mkv PATH_TO_FILE
```

Set Crop for a directory:
```pwsh
Get-Childitem -Recurse -Filter *.mkv | foreach { crop4mkv $_.FullName }
```

Use dry run:
```pwsh
crop4mkv PATH_TO_FILE --dryrun
```

Skip checking if crop tags allready exist:
```pwsh
crop4mkv PATH_TO_FILE --overwrite
```

Use `-LiteralPath` if you are handling unescaped strings and `Path` when handling escaped strings.

Did I meantion my spite for Powershell?


## Prequisites

* [MKVToolNix](https://mkvtoolnix.download/) installed and in [PATH](https://www.howtogeek.com/787217/how-to-edit-environment-variables-on-windows-10-or-11/).
* [ffmpeg](https://ffmpeg.org/) installed and in PATH.
* [bun](https://bun.sh/)

I recommend for Windows users to install these dependencies apart from bun with [Scoop](https://scoop.sh/):
```
scoop bucket add main
scoop install main/ffmpeg
scoop bucket add extras
scoop install extras/mkvtoolnix
```

## Installation

```
bun install -g crop4mkv
```
