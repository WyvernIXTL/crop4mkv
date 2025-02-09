# `Set-Crop`

**Powershell script that analyses crop margins of a video and sets the flags for an mkv.**

## Usage

Set crop for a single file.
```pwsh
Set-Crop PATH_TO_FILE
```

Set Crop for a directory:
```pwsh
Get-Childitem -Recurse -Filter *.mkv | foreach { Set-Crop -LiteralPath $_.FullName }
```

Use dry run:
```pwsh
Set-Crop PATH_TO_FILE -DryRun
```

Use `-LiteralPath` if you are handling unescaped strings and `Path` when handling escaped strings.

Did I meantion my spite for Powershell?


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

### [Scoop](https://scoop.sh/)

```
scoop bucket add stupid-bucket https://github.com/WyvernIXTL/stupid-bucket
scoop install set-crop-for-mkv
```

### Manual

* Download the script.
