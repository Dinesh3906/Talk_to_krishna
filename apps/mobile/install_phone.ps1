$ErrorActionPreference = 'Stop'
$env:ANDROID_HOME = 'C:\Users\chala\AppData\Local\Android\Sdk'
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
$apk = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'

if (-not (Test-Path $apk)) {
    Write-Error "APK not found at $apk. Please build it first."
    exit 1
}

Write-Host "=== Checking connected Android devices ==="
$devices = & $adb devices
$devices | Out-Host

if (-not (($devices | Out-String) -match '\tdevice\b')) {
    Write-Warning "No authorized device detected via ADB."
    Write-Host "Please ensure:"
    Write-Host "  1. Phone is connected via USB cable"
    Write-Host "  2. Developer Options -> USB Debugging is ON"
    Write-Host "  3. Accept the 'Allow USB debugging' prompt on your phone screen"
    exit 1
}

Write-Host "=== Installing Native Release APK to phone ($([math]::Round((Get-Item $apk).Length/1MB,2)) MB) ==="
$ErrorActionPreference = 'Continue'
$installOutput = & $adb install -r $apk 2>&1 | Out-String
$installOutput | Out-Host

if ($installOutput -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
    Write-Host "Signature mismatch detected. Uninstalling previous conflicting build..."
    & $adb uninstall com.talktokrishna.ai
    Write-Host "Re-installing APK..."
    $installOutput2 = & $adb install $apk 2>&1 | Out-String
    $installOutput2 | Out-Host
    if ($installOutput2 -notmatch 'Success') {
        Write-Error "ADB install failed: $installOutput2"
        exit 1
    }
} elseif ($installOutput -notmatch 'Success') {
    Write-Error "ADB install failed: $installOutput"
    exit 1
}

Write-Host "=== Launching Talk to Krishna on device ==="
& $adb shell am start -n com.talktokrishna.ai/.MainActivity

Write-Host "=== Successfully installed and started! ==="
