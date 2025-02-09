<# 
.SYNOPSIS
  Checks if a Matroska video file has any crop metadata; if missing, it calculates the crop factor using ffmpeg and applies it with mkvpropedit.

.DESCRIPTION
  This script is completely safe: it uses strict error checking and fails fast on any unexpected condition.
  It uses the following commands:
    • mkvinfo: to check for an existing crop metadata.
    • ffprobe: to get the video’s resolution.
    • ffmpeg: to run cropdetect (with configurable parameters) on the first 10 seconds of the video.
    • mkvpropedit: to set the crop values on the video track.
  A dry run mode is available via the -DryRun parameter.
  The script also converts any relative file path to an absolute file path based on the current working directory.

.PARAMETER FilePath
  The relative or absolute path to the video file to process.

.PARAMETER CropDetect
  The cropdetect parameters to use with ffmpeg, in the format "limit:round:reset". 
  Default is "24:2:0" which is closer to what HandBrake uses.

.PARAMETER DryRun
  If specified, the script will only output the actions it would perform, without making any changes.

.EXAMPLE
  .\SetCrop.ps1 -FilePath ".\VIDEO.mkv" -CropDetect "24:2:0" -DryRun

  This command simulates the crop detection and editing without changing the file.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateScript({ Test-Path $_ })]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [string]$CropDetect = "24:2:0",

    [switch]$DryRun
)

# Convert relative path to absolute path.
try {
    $AbsoluteFilePath = (Resolve-Path $FilePath).Path
} catch {
    Write-Error "Failed to resolve the absolute path for file: $FilePath"
    exit 1
}

# Ensure external tools are available in PATH.
$requiredTools = @("mkvinfo.exe", "mkvpropedit.exe", "ffprobe.exe", "ffmpeg.exe")
foreach ($tool in $requiredTools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$tool' is not found in PATH. Aborting."
        exit 1
    }
}

try {
    Write-Host "Processing file: $AbsoluteFilePath" -ForegroundColor Cyan

    # Check for existing crop info with mkvinfo.
    Write-Host "Running mkvinfo to check for cropping..." -ForegroundColor Cyan
    $mkvinfoOutput = & mkvinfo.exe $AbsoluteFilePath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "mkvinfo failed with exit code $LASTEXITCODE."
    }

    if ($mkvinfoOutput -match "Pixel crop") {
        Write-Host "File already contains crop information; no further action required." -ForegroundColor Yellow
        exit 0
    }

    # Get original video resolution via ffprobe.
    Write-Host "Retrieving video resolution using ffprobe..." -ForegroundColor Cyan
    $ffprobeCommand = "ffprobe.exe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 `"$AbsoluteFilePath`""
    $resolutionOutput = Invoke-Expression $ffprobeCommand
    if ([string]::IsNullOrWhiteSpace($resolutionOutput)) {
        throw "ffprobe did not return resolution information."
    }
    # Expected format "widthxheight", e.g., "1920x1080"
    $resParts = $resolutionOutput.Trim() -split "x"
    if ($resParts.Count -ne 2 -and $resParts.Count -ne 3) {
        throw "Unexpected resolution format: $resolutionOutput"
    }
    [int]$origWidth = $resParts[0]
    [int]$origHeight = $resParts[1]
    Write-Host "Original resolution: ${origWidth}x${origHeight}" -ForegroundColor Green

    Write-Host "Running ffmpeg cropdetect with parameters cropdetect=$CropDetect ..." -ForegroundColor Cyan

    $ffmpegOutput = $( $_goodOutput = & ffmpeg.exe -hide_banner -loglevel info -ss 00:02:00 -skip_frame nokey -i "$AbsoluteFilePath" -vf "cropdetect=$CropDetect" -t 6:00 -f null NUL) 2>&1
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

    $cropW = 0n
    $cropH = 0n
    $cropX = 0n
    $cropY = 0n

    $cropCount = 0

    foreach ($line in $cropDetectionLines) {
        # Extract numbers using regex: crop=w:h:x:y
        $cropRegex = "crop=(\d+):(\d+):(\d+):(\d+)"
        $matches = [regex]::Match($line, $cropRegex)
        if (-not $matches.Success -or $matches.Groups.Count -ne 5) {
            Write-Debug "Failed to match output with regex."
            continue
        }

        $cropW += $matches.Groups[1].Value
        $cropH += $matches.Groups[2].Value
        $cropX += $matches.Groups[3].Value
        $cropY += $matches.Groups[4].Value

        $cropCount += 1
    }

    if ($cropCount -eq 0) {
        throw "Failed to parse any crop detect output."
    }
    Write-Host "Detecteded $cropCount crop lines." -ForegroundColor Green

    $cropW /= $cropCount
    $cropH /= $cropCount
    $cropX /= $cropCount
    $cropY /= $cropCount

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

    # Build the mkvpropedit command.
    # Assume the video track is the first video track, so use '--edit track:v1'.
    # The properties set are "Pixel crop top", "Pixel crop bottom", "Pixel crop left", and "Pixel crop right".
    $mkvpropeditArgs = @(
        "$AbsoluteFilePath",
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