$ErrorActionPreference = 'Stop'
$env:ANDROID_HOME = 'C:\Users\chala\AppData\Local\Android\Sdk'
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
$apk = 'd:\talk to krisna\apps\mobile\android\app\build\outputs\apk\release\app-release.apk'

Write-Host "=== Waiting for phone to be plugged in via USB... ==="
& $adb wait-for-device

Write-Host "=== Device detected! Installing Release APK ($([math]::Round((Get-Item $apk).Length/1MB,2)) MB)... ==="
& $adb install -r $apk

Write-Host "=== Launching Talk to Krishna on device... ==="
& $adb shell am start -n com.talktokrishna.ai/.MainActivity

Write-Host "=== SUCCESS: App is now running on your phone! ==="
