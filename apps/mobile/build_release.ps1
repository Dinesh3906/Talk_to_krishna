$ErrorActionPreference = 'Stop'

$env:GRADLE_USER_HOME = 'D:\.gradle'
$env:ANDROID_HOME = 'C:\Users\chala\AppData\Local\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Set-Location -Path 'd:\talk to krisna\apps\mobile\android'

$apk = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'
if (Test-Path $apk) {
    Remove-Item -Path $apk -Force -ErrorAction SilentlyContinue
}

Write-Host "=== Starting assembleRelease for Native Android APK ==="
& .\gradlew.bat -g D:\.gradle --project-cache-dir D:\.gradle\project-cache assembleRelease --console=plain

Write-Host "=== Starting bundleRelease for Google Play Store AAB ==="
& .\gradlew.bat -g D:\.gradle --project-cache-dir D:\.gradle\project-cache bundleRelease --console=plain

Write-Host "=== Verifying Built Artifacts ==="
$apk = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'
$aab = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\bundle\release\app-release.aab'
$rootApk = 'd:\talk to krisna\talk-to-krishna.apk'
$rootAab = 'd:\talk to krisna\talk-to-krishna-release.aab'

if (Test-Path $apk) {
    Copy-Item -Path $apk -Destination $rootApk -Force
    $apkItem = Get-Item $rootApk
    Write-Host "SUCCESS: Release APK generated at $rootApk ($([math]::Round($apkItem.Length/1MB,2)) MB)"
} else {
    Write-Error "ERROR: APK not found at $apk"
}

if (Test-Path $aab) {
    Copy-Item -Path $aab -Destination $rootAab -Force
    $aabItem = Get-Item $rootAab
    Write-Host "SUCCESS: Release AAB generated at $rootAab ($([math]::Round($aabItem.Length/1MB,2)) MB)"
} else {
    Write-Error "ERROR: AAB not found at $aab"
}

Write-Host "=== Checking Certificate Fingerprints on Generated Bundle ==="
& "$env:JAVA_HOME\bin\keytool.exe" -printcert -jarfile $rootAab | Select-String -Pattern "SHA1:|SHA256:|Owner:"

Write-Host "=== Checking for Connected Android Devices ==="
$devices = & "$env:ANDROID_HOME\platform-tools\adb.exe" devices
if ($devices -match 'ZD222MB89X') {
    Write-Host "Deploying to connected Motorola Moto g64 5G (ZD222MB89X)..."
    & "$env:ANDROID_HOME\platform-tools\adb.exe" -s ZD222MB89X install -r $rootApk
    & "$env:ANDROID_HOME\platform-tools\adb.exe" -s ZD222MB89X shell am start -n com.talktokrishna.ai/.MainActivity
} elseif ($devices -match '\tdevice') {
    Write-Host "Deploying to connected device..."
    & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r $rootApk
    & "$env:ANDROID_HOME\platform-tools\adb.exe" shell am start -n com.talktokrishna.ai/.MainActivity
} else {
    Write-Host "No ADB device connected. Skipping physical device deployment."
}

Write-Host "=== Build Completed Successfully! ==="

