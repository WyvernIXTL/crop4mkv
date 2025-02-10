<# 
.SYNOPSIS
  Checks if a Matroska video file has any crop metadata; if missing, it calculates the crop factor using ffmpeg and applies it with mkvpropedit.

.DESCRIPTION
  It uses the following commands:
    • mkvinfo: to check for an existing crop metadata.
    • ffprobe: to get the video’s resolution.
    • ffmpeg: to run cropdetect (with configurable parameters) on the first 10 seconds of the video.
    • mkvpropedit: to set the crop values on the video track.
  A dry run mode is available via the -DryRun parameter.

.PARAMETER Path
  The relative or absolute path to the video file to process.

.PARAMETER LiteralPath
  The not escaped relative or absolute path to the video file to process.

.PARAMETER CropDetect
  The cropdetect parameters to use with ffmpeg. Especially rounding might interest you.
  https://ffmpeg.org/ffmpeg-filters.html#cropdetect

.PARAMETER DryRun
  If specified, the script will only output the actions it would perform, without making any changes.

.PARAMETER OverWrite
  Skip check if crop tag allready exists.

.PARAMETER VerboseCropCheck
  Output ffmpeg crop detection output

.PARAMETER Algorithm
  * `MostSeenCropWins` - The crop that is most given out by ffmpeg is used.
  * `SafestCropWins` - The crop that saves most of the image is used. (Default)

.EXAMPLE
  .\SetCrop.ps1 -Path ".\VIDEO.mkv" -DryRun

  This command simulates the crop detection and editing without changing the file.
#>

[CmdletBinding()]
param (
    [ValidateScript({ Test-Path -Path $_ })]
    [string]$Path,

    [ValidateScript({ Test-Path -LiteralPath $_ })]
    [string]$LiteralPath,

    [Parameter(Mandatory = $false)]
    [string]$CropDetect = "cropdetect=mode=black,cropdetect=limit=24,cropdetect=round=2,cropdetect=skip=0,cropdetect=reset=1",

    [switch]$DryRun,

    [switch]$OverWrite,

    [switch]$VerboseCropCheck,

    [ValidateSet('SafestCropWins','MostSeenCropWins')]
    [string]$Algorithm = 'SafestCropWins'
)


# Convert relative path to absolute path.
try {
    if ($Path -ne "") {
        $AbsolutePathObj = (Resolve-Path -Path $Path)
        
    } elseif ($LiteralPath -ne "") {
        $AbsolutePathObj = (Resolve-Path -LiteralPath $LiteralPath)
    } else {
        throw "Please input a Path or a LiteralPath"
    }
} catch {
    Write-Error "Failed to resolve the absolute path for file: $Path"
    exit 1
}

$AbsolutePath = $AbsolutePathObj.Path

# Ensure external tools are available in PATH.
$requiredTools = @("mkvinfo.exe", "mkvpropedit.exe", "ffprobe.exe", "ffmpeg.exe")
foreach ($tool in $requiredTools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$tool' is not found in PATH. Aborting."
        exit 1
    }
}

try {
    Write-Host "================================================================================================================================================" -ForegroundColor White
    Write-Host $AbsolutePathObj -ForegroundColor White

    # Check for existing crop info with mkvinfo.
    if (-not $OverWrite) {
        $mkvinfoOutput = & mkvinfo.exe $AbsolutePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "mkvinfo failed with exit code $LASTEXITCODE."
        }

        if ($mkvinfoOutput -match "Pixel crop") {
            Write-Host "File already contains crop information; no further action required." -ForegroundColor Yellow
            exit 0
        }
    }
    

    # Get original video resolution via ffprobe.
    Write-Host "Retrieving video resolution using ffprobe..." -ForegroundColor Cyan
    $ffprobeCommand = "ffprobe -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio -of json `"$AbsolutePath`""
    $ffprobeCommandOutput = Invoke-Expression $ffprobeCommand
    if ([string]::IsNullOrWhiteSpace($ffprobeCommandOutput)) {
        throw "ffprobe did not return resolution information."
    }
    $ffprobeOutput = $ffprobeCommandOutput | ConvertFrom-Json

    [int]$origWidth = $ffprobeOutput.streams[0].width
    [int]$origHeight = $ffprobeOutput.streams[0].height
    Write-Host "Original resolution: ${origWidth}x${origHeight}" -ForegroundColor Green

    Write-Host "Running ffmpeg cropdetect with parameters $CropDetect ..." -ForegroundColor Cyan

    $ffmpegOutput = $( & ffmpeg.exe -hide_banner -loglevel info -ss 00:02:00 -skip_frame nokey -i "$AbsolutePath" -vf "$CropDetect" -t 6:00 -f null NUL) 2>&1
    if ($LASTEXITCODE -ne 0) { 
        throw "ffmpeg cropdetect failed with exit code $LASTEXITCODE."
    }
    if ($ffmpegOutput.Count -eq 0) {
        throw "ffmpeg output empty."
    }

    # Parse the last cropdetect line. Look for lines containing "crop=".
    $cropDetectionLines = $ffmpegOutput | Select-String -Pattern "crop=\d+:\d+:\d+:\d+"
    if (-not $cropDetectionLines) {
        throw "No crop information was found by ffmpeg cropdetect."
    }
    if ($cropDetectionLines.Count -eq 0) {
        throw "Count of detected lines is 0."
    }


    [int]$cropW = 0
    [int]$cropH = 0
    [int]$cropX = 0
    [int]$cropY = 0

    $cropCount = 0

    if ($Algorithm -eq "MostSeenCropWins") {
        $xMap = @{}
        $yMap = @{}
    }

    foreach ($line in $cropDetectionLines) {
        if ($VerboseCropCheck) {
            Write-Host $line
        }

        # Extract numbers using regex: crop=w:h:x:y
        $cropRegex = "crop=(\d+):(\d+):(\d+):(\d+)"
        $cropRegexMatches = [regex]::Match($line, $cropRegex)
        if (-not $cropRegexMatches.Success -or $cropRegexMatches.Groups.Count -ne 5) {
            Write-Debug "Failed to match output with regex."
            continue
        }

        if ($Algorithm -eq "SafestCropWins") {
            if ([int]($cropRegexMatches.Groups[1].Value) -gt [int]$cropW) {
                $cropW = $cropRegexMatches.Groups[1].Value
                $cropX = $cropRegexMatches.Groups[3].Value
            }
            if ([int]($cropRegexMatches.Groups[2].Value) -gt [int]$cropH) {
                $cropH = $cropRegexMatches.Groups[2].Value
                $cropY = $cropRegexMatches.Groups[4].Value
            }
        } elseif ($Algorithm -eq "MostSeenCropWins") {
            $xVal = @{
                width = [int]$cropRegexMatches.Groups[1].Value
                crop = [int]$cropRegexMatches.Groups[3].Value
            } | ConvertTo-Json -Compress
            $yVal = @{
                height = [int]$cropRegexMatches.Groups[2].Value
                crop = [int]$cropRegexMatches.Groups[4].Value
            } | ConvertTo-Json -Compress

            if (-not $xMap.ContainsKey($xVal)) {
                $xMap[$xVal] = 1
            }
            if (-not $yMap.ContainsKey($yVal)) {
                $yMap[$yVal] = 1
            }

            $xMap[$xVal] += 1
            $yMap[$yVal] += 1
        } else {
            throw "SafestCropWins or MostSeenCropWins must be selected"
        }

        $cropCount += 1
    }

    if ($cropCount -eq 0) {
        throw "Failed to parse any crop detect output."
    }
    Write-Host "Detecteded $cropCount crop lines." -ForegroundColor Green


    if ($Algorithm -eq "MostSeenCropWins") {
        $xVal = ($xMap.GetEnumerator() | Sort-Object -Descending -Property Value | Select-Object -First 1).Key | ConvertFrom-Json
        $cropX = $xVal.crop
        $cropW = $xVal.width
        $yVal = ($yMap.GetEnumerator() | Sort-Object -Descending -Property Value | Select-Object -First 1).Key | ConvertFrom-Json
        $cropY = $yVal.crop
        $cropH = $yVal.height
    }

    Write-Host "Parsed cropdetect values: width=$cropW, height=$cropH, x=$cropX, y=$cropY" -ForegroundColor Green

    # Calculate crop margins.
    # left crop is cropX, top crop is cropY.
    # right crop is original width minus (cropX + detected crop width).
    # bottom crop is original height minus (cropY + detected crop height).
    [int]$cropLeft = $cropX
    [int]$cropTop = $cropY
    [int]$cropRight = $origWidth - ($cropX + $cropW)
    [int]$cropBottom = $origHeight - ($cropY + $cropH)

    Write-Host "Calculated margins:" -ForegroundColor Cyan
    Write-Host "  Crop Left  : $cropLeft"
    Write-Host "  Crop Top   : $cropTop"
    Write-Host "  Crop Right : $cropRight"
    Write-Host "  Crop Bottom: $cropBottom"

    if ($cropTop -eq 0 -and $cropBottom -eq 0 -and  $cropLeft -eq 0 -and  $cropRight -eq 0) {
        Write-Host "No margin to write." -ForegroundColor Yellow
        exit 0
    }

    $mkvpropeditArgs = @(
        "$AbsolutePath",
        "--edit", "track:v1"
    )
    if ($cropTop -ne 0) {
        $mkvpropeditArgs += "--set"
        $mkvpropeditArgs += "pixel-crop-top=$cropTop"
    }
    if ($cropBottom -ne 0) {
        $mkvpropeditArgs += "--set"
        $mkvpropeditArgs += "pixel-crop-bottom=$cropBottom"
    }
    if ($cropLeft -ne 0) {
        $mkvpropeditArgs += "--set"
        $mkvpropeditArgs += "pixel-crop-left=$cropLeft"
    }
    if ($cropRight -ne 0) {
        $mkvpropeditArgs += "--set"
        $mkvpropeditArgs += "pixel-crop-right=$cropRight"
    }

    $commandString = "mkvpropedit.exe " + ($mkvpropeditArgs -join " ")

    if ($DryRun) {
        Write-Host "Dry Run enabled. The following command would be executed:" -ForegroundColor Yellow
        Write-Host $commandString -ForegroundColor Magenta
    }
    else {
        Write-Host "Applying crop properties with mkvpropedit..." -ForegroundColor Cyan
        & mkvpropedit.exe @mkvpropeditArgs
        if ($LASTEXITCODE -ne 0) {
            throw "mkvpropedit failed with exit code $LASTEXITCODE."
        }
        Write-Host "Crop properties set successfully." -ForegroundColor Green
    }
}
catch {
    Write-Error "An error occurred: $_"
    exit 1
}