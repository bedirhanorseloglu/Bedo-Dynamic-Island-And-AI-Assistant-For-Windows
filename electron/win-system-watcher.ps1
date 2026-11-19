param([int]$ElectronPid = 0)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$ghelperBridgeLoaded = $false
try {
    Import-Module (Join-Path $PSScriptRoot 'ghelper-notification-bridge.psm1') -ErrorAction Stop
    $ghelperBridgeLoaded = [bool](Start-GHelperNotificationBridge)
} catch {}

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public class WinAudioHelper {
    private static IAudioEndpointVolume endpoint;
    private static IAudioEndpointVolume micEndpoint;

    public static int GetVolume(out bool muted) {
        muted = false;
        try {
            if (endpoint == null) {
                var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (dev == null) return -1;
                Guid epvId = typeof(IAudioEndpointVolume).GUID;
                dev.Activate(ref epvId, 23, 0, out endpoint);
                if (endpoint == null) return -1;
            }
            float v = 0;
            endpoint.GetMasterVolumeLevelScalar(out v);
            endpoint.GetMute(out muted);
            return (int)Math.Round(v * 100);
        } catch {
            return -1;
        }
    }

    public static int GetMicMuted(out bool muted) {
        muted = false;
        try {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            IMMDevice dev = null;
            enumerator.GetDefaultAudioEndpoint(1, 1, out dev);
            if (dev == null) return -1;
            Guid epvId = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume ep = null;
            dev.Activate(ref epvId, 23, 0, out ep);
            if (ep == null) return -1;
            ep.GetMute(out muted);
            return 0;
        } catch {
            return -1;
        }
    }

    public static bool SetMicMuted(bool mute) {
        try {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            for (int role = 0; role < 3; role++) {
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(1, role, out dev);
                if (dev != null) {
                    Guid epvId = typeof(IAudioEndpointVolume).GUID;
                    IAudioEndpointVolume ep = null;
                    dev.Activate(ref epvId, 23, 0, out ep);
                    if (ep != null) {
                        ep.SetMute(mute, Guid.Empty);
                    }
                }
            }
            return true;
        } catch {
            return false;
        }
    }

    public static bool SetVolume(int percent) {
        try {
            bool dummy;
            if (endpoint == null) GetVolume(out dummy);
            if (endpoint == null) return false;
            int clamped = Math.Max(0, Math.Min(100, percent));
            endpoint.SetMasterVolumeLevelScalar(clamped / 100.0f, Guid.Empty);
            endpoint.SetMute(clamped <= 0, Guid.Empty);
            return true;
        } catch {
            return false;
        }
    }

    public static bool ToggleMute() {
        try {
            bool muted = false;
            if (GetVolume(out muted) < 0 || endpoint == null) return false;
            endpoint.SetMute(!muted, Guid.Empty);
            return true;
        } catch {
            return false;
        }
    }
}

public static class WinWindowHelper {
    [StructLayout(LayoutKind.Sequential)] public struct RECT {
        public int Left, Top, Right, Bottom;
    }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr hObject);
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int pquns);
    [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(IntPtr hProcess);

    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const int QUNS_RUNNING_D3D_FULL_SCREEN = 3;

    static uint cachedPid = 0;
    static bool cachedIsGame = false;
    static bool cachedIsExcluded = false;
    static bool cachedPathDenied = false;

    static string GetProcessImagePath(uint processId, out bool accessDenied) {
        accessDenied = false;
        IntPtr hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (hProc == IntPtr.Zero) {
            int err = Marshal.GetLastWin32Error();
            if (err == 5) accessDenied = true;
            return null;
        }
        try {
            StringBuilder sb = new StringBuilder(1024);
            uint size = (uint)sb.Capacity;
            if (QueryFullProcessImageName(hProc, 0, sb, ref size)) {
                return sb.ToString();
            }
            return null;
        } finally {
            CloseHandle(hProc);
        }
    }

    static readonly string[] NonGameProcesses = {
        "chrome", "chromium", "chrome_proxy", "msedge", "msedgewebview2", "firefox",
        "brave", "opera", "opera_gx", "vivaldi", "arc", "librewolf", "waterfox",
        "thorium", "yandex", "duckduckgo", "zen", "comet", "browser", "applicationframehost",
        "vlc", "mpc-hc", "mpc-hc64", "mpc-be", "potplayer", "potplayermini64", "wmplayer", "moviesandtv",
        "netflix", "spotify", "steam", "steamwebhelper", "epicgameslauncher", "battle.net", "eadesktop",
        "explorer", "lockapp", "searchhost", "shellexperiencehost", "startmenuexperiencehost",
        "textinputhost", "dwm", "mstsc", "rdpclip", "taskmgr", "code", "cursor", "windsurf",
        "antigravity", "windowsterminal", "wt", "powershell", "pwsh", "cmd", "discord", "zoom", "teams", "ms-teams"
    };

    static readonly string[] NonGamePathMarkers = {
        "\\google\\chrome\\", "\\microsoft\\edge\\", "\\mozilla firefox\\",
        "\\bravesoftware\\brave-browser\\", "\\opera software\\",
        "\\videolan\\vlc\\", "\\windows media player\\", "\\windows\\system32\\", "\\windows\\explorer.exe"
    };

    static readonly string[] GameInstallMarkers = {
        "\\steamapps\\common\\", "\\epic games\\", "\\xboxgames\\",
        "\\gog games\\", "\\riot games\\", "\\ubisoft game launcher\\games\\",
        "\\ea games\\", "\\origin games\\", "\\games\\"
    };

    static void ClassifyProcess(uint processId, out bool isGame, out bool isExcluded, out bool pathDenied) {
        if (processId == cachedPid && processId != 0) {
            isGame = cachedIsGame;
            isExcluded = cachedIsExcluded;
            pathDenied = cachedPathDenied;
            return;
        }
        isGame = false;
        isExcluded = false;
        pathDenied = false;
        try {
            string processName = "";
            try {
                using (Process process = Process.GetProcessById((int)processId)) {
                    processName = (process.ProcessName ?? "").ToLowerInvariant();
                }
            } catch {}

            foreach (string excluded in NonGameProcesses) {
                if (processName == excluded) {
                    isExcluded = true;
                    break;
                }
            }

            if (!isExcluded) {
                string executablePath = GetProcessImagePath(processId, out pathDenied);
                if (!string.IsNullOrEmpty(executablePath)) {
                    string normalizedPath = executablePath.Replace('/', '\\').ToLowerInvariant();
                    string fileBase = Path.GetFileNameWithoutExtension(executablePath).ToLowerInvariant();
                    foreach (string excluded in NonGameProcesses) {
                        if (fileBase == excluded) {
                            isExcluded = true;
                            break;
                        }
                    }
                    if (!isExcluded) {
                        foreach (string marker in NonGamePathMarkers) {
                            if (normalizedPath.Contains(marker)) {
                                isExcluded = true;
                                break;
                            }
                        }
                    }
                    if (!isExcluded) {
                        foreach (string marker in GameInstallMarkers) {
                            if (normalizedPath.Contains(marker)) {
                                isGame = true;
                                break;
                            }
                        }
                    }
                }
            }
        } catch {}

        cachedPid = processId;
        cachedIsGame = isGame;
        cachedIsExcluded = isExcluded;
        cachedPathDenied = pathDenied;
    }

    public static void TrimMemory() {
        try {
            GC.Collect(GC.MaxGeneration, GCCollectionMode.Optimized, false);
            EmptyWorkingSet(GetCurrentProcess());
        } catch {}
    }

    public static void GetForegroundAppContext(int excludedPid, out string appName, out string category) {
        appName = "";
        category = "desktop";
        try {
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd)) return;
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (processId == 0 || processId == (uint)excludedPid) return;
            using (Process process = Process.GetProcessById((int)processId)) {
                string proc = (process.ProcessName ?? "").Trim();
                string low = proc.ToLowerInvariant();
                string title = "";
                try { title = (process.MainWindowTitle ?? "").ToLowerInvariant(); } catch {}
                appName = proc;

                if (low == "zoom" || low == "teams" || low == "ms-teams" || low == "discord" || low == "skype" || low == "webex" || low == "slack") {
                    category = "meeting";
                    return;
                }
                if (low == "code" || low == "cursor" || low == "windsurf" || low == "antigravity" || low == "antigravity ide" ||
                    low == "idea64" || low == "pycharm64" || low == "webstorm64" || low == "devenv" ||
                    low == "windowsterminal" || low == "wt" || low == "pwsh" || low == "powershell" || low == "cmd") {
                    category = "code";
                    return;
                }
                if (low == "spotify" || low == "vlc" || low == "mpc-hc64" || low == "potplayer" || low == "applemusic") {
                    category = "media";
                    return;
                }
                if (low == "chrome" || low == "msedge" || low == "firefox" || low == "brave" || low == "comet" || low == "arc" || low == "vivaldi") {
                    if (title.Contains("meet.google.com") || title.Contains("google meet") || title.Contains("zoom") || title.Contains("microsoft teams")) {
                        category = "meeting";
                    } else if (title.Contains("youtube") || title.Contains("netflix") || title.Contains("twitch") || title.Contains("tv+") || title.Contains("tvplus")) {
                        category = "media";
                    } else {
                        category = "browser";
                    }
                    return;
                }
                if (IsKnownGameProcess(processId)) {
                    category = "game";
                    return;
                }
            }
        } catch {}
    }

    static bool IsKnownGameProcess(uint processId) {
        bool isGame, isExcluded, pathDenied;
        ClassifyProcess(processId, out isGame, out isExcluded, out pathDenied);
        return isGame && !isExcluded;
    }

    static bool IsWindowCoveringMonitor(IntPtr hwnd) {
        RECT windowRect;
        if (!GetWindowRect(hwnd, out windowRect)) return false;
        IntPtr monitor = MonitorFromWindow(hwnd, 2);
        if (monitor == IntPtr.Zero) return false;
        MONITORINFO info = new MONITORINFO();
        info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(monitor, ref info)) return false;
        const int edgeTolerance = 8;
        return Math.Abs(windowRect.Left - info.rcMonitor.Left) <= edgeTolerance &&
            Math.Abs(windowRect.Top - info.rcMonitor.Top) <= edgeTolerance &&
            Math.Abs(windowRect.Right - info.rcMonitor.Right) <= edgeTolerance &&
            Math.Abs(windowRect.Bottom - info.rcMonitor.Bottom) <= edgeTolerance;
    }

    public static bool IsFullscreenGame(int excludedPid) {
        try {
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd)) return false;
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (processId == 0 || processId == (uint)excludedPid) return false;

            bool isGame, isExcluded, pathDenied;
            ClassifyProcess(processId, out isGame, out isExcluded, out pathDenied);
            if (isExcluded) return false;

            // Fast D3D exclusive fullscreen check (works even with strict kernel anti-cheat)
            int quns = 0;
            if (SHQueryUserNotificationState(out quns) == 0 && quns == QUNS_RUNNING_D3D_FULL_SCREEN) {
                return true;
            }

            // Borderless/windowed fullscreen: match known game paths OR anti-cheat protected processes (Access Denied)
            if (!isGame && !pathDenied) return false;
            return IsWindowCoveringMonitor(hwnd);
        } catch { return false; }
    }
}
'@

# Load WinRT UserNotificationListener
$notifSupported = $false
$listener = $null
$asTaskGeneric = $null
$asStreamMethod = $null
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    $asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1
    } | Select-Object -First 1
    $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
    if ($listener.GetAccessStatus().ToString() -eq 'Allowed') {
        $notifSupported = $true
    }
} catch {}

function Start-AsyncOp($WinRtOperation, $ResultType) {
    return $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtOperation))
}

$mediaManager = $null
$lastMediaSig = ''
$lastMediaPoll = [DateTimeOffset]::MinValue
try {
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    if ($null -ne $asTaskGeneric) {
        $mgrTask = Start-AsyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
        if ($mgrTask.Wait(1500)) { $mediaManager = $mgrTask.Result }
    }
} catch {}

function Get-NotificationAppLogoDataUri($AppInfo) {
    $memoryStream = $null
    $sourceStream = $null
    $randomAccessStream = $null
    try {
        if ($null -eq $AppInfo -or $null -eq $asTaskGeneric -or $null -eq $asStreamMethod) { return '' }
        $displayInfo = $AppInfo.DisplayInfo
        $getLogoMethod = $displayInfo.GetType().GetMethods() | Where-Object {
            $_.Name -eq 'GetLogo' -and $_.GetParameters().Count -eq 1
        } | Select-Object -First 1
        if ($null -eq $getLogoMethod) { return '' }
        $sizeType = $getLogoMethod.GetParameters()[0].ParameterType
        $size = [Activator]::CreateInstance($sizeType, [object[]]@([single]64, [single]64))
        $logoReference = $getLogoMethod.Invoke($displayInfo, @($size))
        if ($null -eq $logoReference) { return '' }

        $logoTask = Start-AsyncOp ($logoReference.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime])
        if (-not $logoTask.Wait(1800)) { return '' }
        $randomAccessStream = $logoTask.Result
        if ($null -eq $randomAccessStream) { return '' }

        $sourceStream = $asStreamMethod.Invoke($null, @($randomAccessStream))
        $memoryStream = New-Object System.IO.MemoryStream
        $sourceStream.CopyTo($memoryStream)
        $bytes = $memoryStream.ToArray()
        if ($bytes.Length -le 0 -or $bytes.Length -gt 524288) { return '' }

        $contentType = [string]$randomAccessStream.ContentType
        $mime = 'image/png'
        if ($bytes.Length -ge 4 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) {
            $mime = 'image/png'
        } elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF) {
            $mime = 'image/jpeg'
        } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) {
            $mime = 'image/bmp'
        } elseif ($bytes.Length -ge 4 -and $bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49 -and $bytes[2] -eq 0x46) {
            $mime = 'image/gif'
        } elseif ($contentType -match '^image/(png|jpeg|gif|webp|bmp|svg\+xml)$') {
            $mime = $contentType
        }
        return "data:$mime;base64,$([Convert]::ToBase64String($bytes))"
    } catch {
        return ''
    } finally {
        if ($null -ne $sourceStream) { try { $sourceStream.Dispose() } catch {} }
        if ($null -ne $memoryStream) { try { $memoryStream.Dispose() } catch {} }
        if ($null -ne $randomAccessStream) { try { $randomAccessStream.Dispose() } catch {} }
    }
}

$script:appProcessLogoCache = @{}
function Get-NotificationProcessLogoDataUri($AppName, $AppId) {
    try {
        $cacheKey = "$AppId|$AppName".ToLowerInvariant().Trim()
        if (-not $cacheKey -or $cacheKey -eq '|') { return '' }
        if ($script:appProcessLogoCache.ContainsKey($cacheKey)) {
            return $script:appProcessLogoCache[$cacheKey]
        }

        $candidates = New-Object System.Collections.Generic.List[string]
        if ($AppId) {
            $idTail = ($AppId -split '[!\\/.]')[-1]
            if ($idTail) { $candidates.Add($idTail) }
            $idClean = ($AppId -replace '^electron\.app\.', '')
            if ($idClean) { $candidates.Add($idClean) }
        }
        if ($AppName -and $AppName -ne 'Windows') {
            $candidates.Add($AppName)
            $noSpaces = ($AppName -replace '\s+', '')
            if ($noSpaces) { $candidates.Add($noSpaces) }
            $lowApp = $AppName.ToLowerInvariant().Trim()
            if ($lowApp -match 'visual studio code|vscode') { $candidates.Add('code') }
            elseif ($lowApp -match 'google chrome') { $candidates.Add('chrome') }
            elseif ($lowApp -match 'microsoft edge') { $candidates.Add('msedge') }
            elseif ($lowApp -match 'telegram') { $candidates.Add('telegram') }
            elseif ($lowApp -match 'g-?helper') { $candidates.Add('ghelper') }
            elseif ($lowApp -match 'windows security|defender') { $candidates.Add('securityhealthsystray') }
        }

        $exePath = ''
        $procs = Get-Process -ErrorAction SilentlyContinue
        foreach ($cand in ($candidates | Select-Object -Unique)) {
            if (-not $cand -or $cand.Length -lt 2) { continue }
            $lowCand = $cand.ToLowerInvariant()
            $match = $procs | Where-Object {
                $_.Path -and (
                    $_.ProcessName.ToLowerInvariant() -eq $lowCand -or
                    $_.ProcessName.ToLowerInvariant().Contains($lowCand) -or
                    ($_.MainWindowTitle -and $_.MainWindowTitle.ToLowerInvariant().Contains($lowCand))
                )
            } | Select-Object -First 1
            if ($null -ne $match -and $match.Path) {
                $exePath = $match.Path
                break
            }
        }

        $dataUri = ''
        if ($exePath -and (Test-Path -LiteralPath $exePath)) {
            Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
            $ico = $null; $bmp = $null; $ms = $null
            try {
                $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
                if ($null -ne $ico) {
                    $bmp = $ico.ToBitmap()
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    $bytes = $ms.ToArray()
                    if ($bytes.Length -gt 0 -and $bytes.Length -le 524288) {
                        $dataUri = "data:image/png;base64,$([Convert]::ToBase64String($bytes))"
                    }
                }
            } finally {
                if ($null -ne $ms) { try { $ms.Dispose() } catch {} }
                if ($null -ne $bmp) { try { $bmp.Dispose() } catch {} }
                if ($null -ne $ico) { try { $ico.Dispose() } catch {} }
            }
        }
        $script:appProcessLogoCache[$cacheKey] = $dataUri
        return $dataUri
    } catch {
        return ''
    }
}

try {
    Add-Type -ReferencedAssemblies System.Management -TypeDefinition @'
using System;
using System.Management;

public class WinBrightnessHelper {
    private static ManagementObject cachedObj;

    public static int GetBrightness() {
        try {
            if (cachedObj != null) {
                cachedObj.Get();
                object val = cachedObj["CurrentBrightness"];
                if (val != null) return Convert.ToInt32(val);
            }
            using (var searcher = new ManagementObjectSearcher("root\\wmi", "SELECT CurrentBrightness FROM WmiMonitorBrightness")) {
                foreach (ManagementObject obj in searcher.Get()) {
                    cachedObj = obj;
                    object val = obj["CurrentBrightness"];
                    if (val != null) return Convert.ToInt32(val);
                }
            }
        } catch {
            cachedObj = null;
        }
        return -1;
    }
}
'@ -ErrorAction Stop
} catch {}

$lastVol = -1
$lastMuted = $false
$lastMicInit = $false
$lastMicMuted = $false
$lastAppName = ''
$lastAppCategory = ''
$lastBrightness = -1
$seenNotifIds = @{}
$watcherStartedAt = [DateTimeOffset]::Now
$notificationsInitialized = $false
$initialized = $false
$lastVolumePoll = [DateTimeOffset]::MinValue
$lastBrightnessPoll = [DateTimeOffset]::MinValue
$lastGameModePoll = [DateTimeOffset]::MinValue
$lastParentCheck = [DateTimeOffset]::MinValue
$lastBrightnessJobPoll = [DateTimeOffset]::MinValue
$lastNotifPoll = [DateTimeOffset]::MinValue
$gameModeActive = $false
$lastGcPoll = [DateTimeOffset]::MinValue
$notificationTask = $null
$notificationListType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
$brightnessEventSubscription = $null
try {
    # WMI brightness events arrive as the display changes; no repeated CIM scans.
    $brightnessEventSubscription = Register-WmiEvent -Namespace 'root\wmi' -Query 'SELECT * FROM WmiMonitorBrightnessEvent' -SourceIdentifier 'TwoCodeBrightness' -ErrorAction Stop
} catch {}

$stdinStream = $null
$stdinBuf = New-Object byte[] 256
$stdinAcc = ''
$stdinReadTask = $null
try {
    $stdinStream = [Console]::OpenStandardInput()
    if ($null -ne $stdinStream) {
        $stdinReadTask = $stdinStream.ReadAsync($stdinBuf, 0, $stdinBuf.Length)
    }
} catch {}

while ($true) {
    if ($null -ne $stdinReadTask -and $stdinReadTask.IsCompleted) {
        $bytesRead = 0
        try { $bytesRead = $stdinReadTask.Result } catch { $bytesRead = 0 }
        if ($bytesRead -gt 0) {
            $stdinAcc += [System.Text.Encoding]::UTF8.GetString($stdinBuf, 0, $bytesRead)
            while ($stdinAcc.Contains("`n")) {
                $nlIdx = $stdinAcc.IndexOf("`n")
                $trimmedCmd = $stdinAcc.Substring(0, $nlIdx).Trim()
                $stdinAcc = $stdinAcc.Substring($nlIdx + 1)
                if ($trimmedCmd -match '^set-volume:(\d+)$') {
                    $targetVol = [int]$Matches[1]
                    if ([WinAudioHelper]::SetVolume($targetVol)) {
                        $lastVol = [Math]::Max(0, [Math]::Min(100, $targetVol))
                        $lastMuted = ($lastVol -le 0)
                    }
                } elseif ($trimmedCmd -eq 'toggle-mute') {
                    if ([WinAudioHelper]::ToggleMute()) {
                        $m = $false
                        $v = [WinAudioHelper]::GetVolume([ref]$m)
                        if ($v -ge 0) { $lastVol = $v; $lastMuted = $m }
                    }
                } elseif ($trimmedCmd -match '^set-mic-mute:(true|false)$') {
                    $targetMicMute = ($Matches[1] -eq 'true')
                    if ([WinAudioHelper]::SetMicMuted($targetMicMute)) {
                        $lastMicMuted = $targetMicMute
                        $lastMicInit = $true
                        Write-Output ((@{ event = 'mic-mute'; muted = [bool]$targetMicMute }) | ConvertTo-Json -Compress)
                    }
                }
            }
            try { $stdinReadTask = $stdinStream.ReadAsync($stdinBuf, 0, $stdinBuf.Length) } catch { $stdinReadTask = $null }
        } else {
            $stdinReadTask = $null
        }
    }
    $now = [DateTimeOffset]::Now
    # Parent Electron lifecycle guard: check every 2.5s instead of 120ms to avoid Get-Process allocation churn
    if ($ElectronPid -gt 0 -and ($now - $lastParentCheck).TotalMilliseconds -ge 2500) {
        $lastParentCheck = $now
        $parentProc = Get-Process -Id $ElectronPid -ErrorAction SilentlyContinue
        if ($null -eq $parentProc -or $parentProc.HasExited) {
            break
        }
    }

    try {

        # Check the foreground window at a low rate and report only state transitions.
        if (($now - $lastGameModePoll).TotalMilliseconds -ge 500) {
            $lastGameModePoll = $now
            $isFullscreen = [WinWindowHelper]::IsFullscreenGame($ElectronPid)
            if ($isFullscreen -ne $gameModeActive) {
                $gameModeActive = $isFullscreen
                Write-Output ((@{ event = 'game-mode'; active = [bool]$gameModeActive }) | ConvertTo-Json -Compress)
            }
            $fgApp = ''
            $fgCat = 'desktop'
            [WinWindowHelper]::GetForegroundAppContext($ElectronPid, [ref]$fgApp, [ref]$fgCat)
            if ($fgApp -ne $lastAppName -or $fgCat -ne $lastAppCategory) {
                $lastAppName = $fgApp
                $lastAppCategory = $fgCat
                Write-Output ((@{ event = 'app-context'; app = $fgApp; category = $fgCat }) | ConvertTo-Json -Compress)
            }
        }

        # Fast in-process SMTC media session/playback detector (zero PowerShell spawn)
        # Skip during fullscreen game mode (island suppresses media bar during games anyway)
        if (-not $gameModeActive -and $null -ne $mediaManager -and ($now - $lastMediaPoll).TotalMilliseconds -ge 250) {
            $lastMediaPoll = $now
            try {
                $curSess = $null
                $allSessions = $mediaManager.GetSessions()
                if ($allSessions -and $allSessions.Count -gt 0) {
                    foreach ($s in $allSessions) {
                        try {
                            $spb = $s.GetPlaybackInfo()
                            if ($spb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
                                $curSess = $s
                                break
                            }
                        } catch {}
                    }
                }
                if ($null -eq $curSess) {
                    $curSess = $mediaManager.GetCurrentSession()
                }
                $sig = 'none'
                if ($null -ne $curSess) {
                    $pb = $curSess.GetPlaybackInfo()
                    $st = [string]$pb.PlaybackStatus
                    if ($st -ne 'Closed' -and $st -ne 'Stopped') {
                        $tl = $curSess.GetTimelineProperties()
                        $sig = "$($curSess.SourceAppUserModelId)|$st|$($tl.EndTime.TotalSeconds)"
                    }
                }
                if ($lastMediaSig -ne '' -and $sig -ne $lastMediaSig) {
                    Write-Output ((@{ event = 'media-changed' }) | ConvertTo-Json -Compress)
                }
                $lastMediaSig = $sig
            } catch {}
        }

        # Reuse the audio endpoint and sample at 10 Hz for responsive HUD updates.
        if (($now - $lastVolumePoll).TotalMilliseconds -ge 100) {
            $lastVolumePoll = $now
            $muted = $false
            $vol = [WinAudioHelper]::GetVolume([ref]$muted)
            if ($vol -ge 0) {
                if ($lastVol -lt 0) {
                    $lastVol = $vol
                    $lastMuted = $muted
                    $initObj = @{ event = 'init-audio'; volume = $vol; muted = [bool]$muted }
                    Write-Output ($initObj | ConvertTo-Json -Compress)
                } elseif ($vol -ne $lastVol -or $muted -ne $lastMuted) {
                    $lastVol = $vol
                    $lastMuted = $muted
                    $evObj = @{ event = 'volume'; value = $vol; muted = [bool]$muted }
                    Write-Output ($evObj | ConvertTo-Json -Compress)
                }
            }
            $micMuted = $false
            if ([WinAudioHelper]::GetMicMuted([ref]$micMuted) -ge 0) {
                if (-not $lastMicInit -or $micMuted -ne $lastMicMuted) {
                    $lastMicInit = $true
                    $lastMicMuted = $micMuted
                    Write-Output ((@{ event = 'mic-mute'; muted = [bool]$micMuted }) | ConvertTo-Json -Compress)
                }
            }
        }

        # Sample brightness at 10 Hz on desktop; in game mode rely on event-driven WmiMonitorBrightnessEvent
        # (or low-rate 600ms fallback) to eliminate continuous WmiPrvSE CPU overhead.
        $skipBrightnessPoll = $gameModeActive -and ($null -ne $brightnessEventSubscription) -and ($lastBrightness -ge 0)
        $brightnessPollMs = if ($gameModeActive) { 600 } else { 100 }
        if (-not $wmiBrightnessUnsupported -and -not $skipBrightnessPoll -and ($lastBrightness -lt 0 -or ($now - $lastBrightnessPoll).TotalMilliseconds -ge $brightnessPollMs)) {
            $lastBrightnessPoll = $now
            $bri = -1
            try { $bri = [WinBrightnessHelper]::GetBrightness() } catch {}
            if ($bri -lt 0) {
                $bObj = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($null -ne $bObj -and $null -ne $bObj.CurrentBrightness) {
                    $bri = [int]$bObj.CurrentBrightness
                } else {
                    # External/desktop monitors do not expose WmiMonitorBrightness; stop polling WMI at 10 Hz.
                    $wmiBrightnessUnsupported = $true
                }
            }
            if ($bri -ge 0) {
                if ($lastBrightness -ge 0 -and $bri -ne $lastBrightness) {
                    $bEv = @{ event = 'brightness'; value = $bri }
                    Write-Output ($bEv | ConvertTo-Json -Compress)
                }
                $lastBrightness = $bri
            }
        }
        $brightnessJobPollMs = if ($gameModeActive) { 150 } else { 500 }
        if ($null -ne $brightnessEventSubscription -and ($now - $lastBrightnessJobPoll).TotalMilliseconds -ge $brightnessJobPollMs) {
            $lastBrightnessJobPoll = $now
            $bEvent = Receive-Job -Job $brightnessEventSubscription -ErrorAction SilentlyContinue | Select-Object -Last 1
            if ($null -ne $bEvent) {
                $bri = -1
                try { $bri = [int]$bEvent.SourceEventArgs.NewEvent.Brightness } catch {}
                if ($bri -ge 0 -and $bri -ne $lastBrightness) {
                    $lastBrightness = $bri
                    $bEv = @{ event = 'brightness'; value = $bri }
                    Write-Output ($bEv | ConvertTo-Json -Compress)
                }
            }
        }

        # Keep the toast query asynchronous and throttled so its wait cannot delay brightness events or churn WinRT allocations.
        $notifPollMs = if ($gameModeActive) { 550 } else { 350 }
        if ($notifSupported -and $null -ne $listener) {
            $notifs = $null
            if ($null -eq $notificationTask) {
                if (($now - $lastNotifPoll).TotalMilliseconds -ge $notifPollMs) {
                    $lastNotifPoll = $now
                    $notificationTask = Start-AsyncOp ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) $notificationListType
                }
            } elseif ($notificationTask.IsCompleted) {
                try { $notifs = $notificationTask.Result } catch {}
                $notificationTask = $null
            }
            if ($null -ne $notifs) {
                if ($seenNotifIds.Count -gt 500) {
                    $activeIds = @{}
                    foreach ($item in $notifs) { $activeIds[[string]$item.Id] = $true }
                    $seenNotifIds = $activeIds
                }
                foreach ($n in $notifs) {
                    $nid = [string]$n.Id
                    if (-not $seenNotifIds.ContainsKey($nid)) {
                        $seenNotifIds[$nid] = $true

                        # The first successful snapshot is a baseline. Existing toasts
                        # must not replay as fresh alerts when TwoCode starts.
                        $isNewSinceWatcherStart = $false
                        try { $isNewSinceWatcherStart = $n.CreationTime -ge $watcherStartedAt } catch {}
                        if ($notificationsInitialized -or $isNewSinceWatcherStart) {
                            $appName = 'Windows'
                            $appId = ''
                            try { $appName = [string]$n.AppInfo.DisplayInfo.DisplayName } catch {}
                            try { $appId = [string]$n.AppInfo.AppUserModelId } catch {}
                            $appLogo = Get-NotificationAppLogoDataUri $n.AppInfo

                            $titleTxt = ''
                            $bodyTxt = ''
                            try {
                                $binding = $n.Notification.Visual.GetBinding('ToastGeneric')
                                if ($null -ne $binding) {
                                    $els = @($binding.GetTextElements())
                                    if ($els.Length -ge 1) { $titleTxt = [string]$els[0].Text }
                                    if ($els.Length -ge 2) {
                                        $bodyTxt = ($els | Select-Object -Skip 1 | ForEach-Object { [string]$_.Text }) -join "`n"
                                    }
                                    if (-not $appLogo) {
                                        try {
                                            $imgs = @($binding.GetImageElements())
                                            foreach ($imgEl in $imgs) {
                                                $imgSrc = [string]$imgEl.Src
                                                if ($imgSrc -and $imgSrc -match '^(?:file:///|[A-Za-z]:[/\\])') {
                                                    $localImgPath = $imgSrc -replace '^file:///', ''
                                                    $localImgPath = [System.Uri]::UnescapeDataString($localImgPath).Replace('/', '\')
                                                    if (Test-Path -LiteralPath $localImgPath) {
                                                        $imgBytes = [System.IO.File]::ReadAllBytes($localImgPath)
                                                        if ($imgBytes.Length -gt 0 -and $imgBytes.Length -le 524288) {
                                                            $imgExt = [System.IO.Path]::GetExtension($localImgPath).ToLowerInvariant()
                                                            $imgMime = if ($imgExt -eq '.jpg' -or $imgExt -eq '.jpeg') { 'image/jpeg' } elseif ($imgExt -eq '.webp') { 'image/webp' } else { 'image/png' }
                                                            $appLogo = "data:$imgMime;base64,$([Convert]::ToBase64String($imgBytes))"
                                                            break
                                                        }
                                                    }
                                                }
                                            }
                                        } catch {}
                                    }
                                }
                            } catch {}

                            if (-not $appLogo) {
                                $appLogo = Get-NotificationProcessLogoDataUri $appName $appId
                            }

                            if ($titleTxt -or $bodyTxt) {
                                $nEv = @{
                                    event = 'notification'
                                    id = $nid
                                    app = $appName
                                    appId = $appId
                                    logo = $appLogo
                                    title = if ($titleTxt) { $titleTxt } else { $appName }
                                    body = $bodyTxt
                                }
                                Write-Output ($nEv | ConvertTo-Json -Compress)
                            }
                        }
                    }
                }
                $notificationsInitialized = $true
            }
        }

        $initialized = $true
    } catch {}

    # Periodic garbage collection + working-set trim to keep PowerShell RAM minimal (skip during fullscreen games)
    if (-not $initialized -or (-not $gameModeActive -and ($now - $lastGcPoll).TotalSeconds -ge 25)) {
        $lastGcPoll = $now
        [WinWindowHelper]::TrimMemory()
    }

    if ($ghelperBridgeLoaded) { Invoke-GHelperNotificationMessagePump }
    Start-Sleep -Milliseconds $(if ($gameModeActive) { 150 } else { 120 })
}
