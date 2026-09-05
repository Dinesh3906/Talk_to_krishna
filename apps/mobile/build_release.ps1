$ErrorActionPreference = 'Stop'

$env:GRADLE_USER_HOME = 'D:\.gradle'
$env:ANDROID_HOME = 'C:\Users\chala\AppData\Local\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Set-Location -Path 'd:\talk to krisna\apps\mobile\android'

Write-Host "=== Starting assembleRelease for Native Android APK ==="
& .\gradlew.bat -g D:\.gradle --project-cache-dir D:\.gradle\project-cache assembleRelease --console=plain

Write-Host "=== Starting bundleRelease for Google Play Store AAB ==="
& .\gradlew.bat -g D:\.gradle --project-cache-dir D:\.gradle\project-cache bundleRelease --console=plain

Write-Host "=== Verifying Built Artifacts ==="
$apk = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'
$aab = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\bundle\release\app-release.aab'

if (Test-Path $apk) {
    $apkItem = Get-Item $apk
    Write-Host "SUCCESS: Native Release APK generated at $apk ($([math]::Round($apkItem.Length/1MB,2)) MB)"
} else {
    Write-Error "ERROR: APK not found at $apk"
}

if (Test-Path $aab) {
    $aabItem = Get-Item $aab
    Write-Host "SUCCESS: Native Play Store AAB generated at $aab ($([math]::Round($aabItem.Length/1MB,2)) MB)"
} else {
    Write-Error "ERROR: AAB not found at $aab"
}

Write-Host "=== Deploying to connected Motorola Moto g64 5G (ZD222MB89X) ==="
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s ZD222MB89X install -r $apk
Write-Host "=== Launching App on Device ==="
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s ZD222MB89X shell am start -n com.talktokrishna.app/.MainActivity
Write-Host "=== Completed Successfully! ==="
