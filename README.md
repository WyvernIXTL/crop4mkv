# `crop4mkv`

**Bun ts script that analyses crop margins of a video and sets the flags for an mkv.**

* This script searches with [`ffmpeg` `cropdetect`](https://ffmpeg.org/ffmpeg-filters.html#cropdetect) at 3 different points in the video to check the crop.
* It then takes the crop per axis that clips the least pixels (the safe crop).
* The crop is then saved into the mkv flags with [MKVToolNix](https://mkvtoolnix.download/) without touching the video stream.

Video players like [MPV](https://mpv.io/) read this mkv flag and crop the video at play time.


## Usage

Generate and set crop tags for a single file.
```pwsh
crop4mkv PATH_TO_FILE
```

Generate and set crop tags for a directory with powershell:
```pwsh
Get-Childitem -Recurse -Filter *.mkv | foreach { crop4mkv $_.FullName }
```

Do not write tag to file:
```pwsh
crop4mkv PATH_TO_FILE --dryrun
```

Skip check for existance crop tags:
```pwsh
crop4mkv PATH_TO_FILE --overwrite
```


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
