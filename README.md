# `Set-Crop`

**Powershell script that analyses crop margins of a video and sets the flags for an mkv.**

## Usage

Set crop for a single file.
```pwsh
Set-Crop PATH_TO_FILE
```

Set Crop for a directory:
```pwsh
Get-Childitem -Recurse -Filter *.mkv | foreach { Set-Crop $_ }
```

## Prequisites

* [MKVToolNix](https://mkvtoolnix.download/) installed and in [PATH](https://www.howtogeek.com/787217/how-to-edit-environment-variables-on-windows-10-or-11/).
* [ffmpeg](https://ffmpeg.org/) installed and in PATH.

I recommend for Windows users to install these dependencies with [Scoop](https://scoop.sh/):
```
scoop bucket add main
scoop install main/ffmpeg
scoop bucket add extras
scoop install extras/mkvtoolnix
```

## Installation

### Manual

* Download the script.
