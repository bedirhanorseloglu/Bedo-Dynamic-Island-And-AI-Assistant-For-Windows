param(
    [int]$ElectronPid = 0,
    [long]$OverlayHwnd = 0
)

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
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public class WinAudioHelper {
    private static IMMDeviceEnumerator sharedEnumerator;
    private static IAudioEndpointVolume renderEndpoint;
    private static string cachedRenderDeviceId;
    private static long lastRenderDeviceCheckTicks;

    private static IAudioEndpointVolume captureEndpoint;
    private static string cachedCaptureDeviceId;
    private static long lastCaptureDeviceCheckTicks;

    private const long DEVICE_RECHECK_INTERVAL_TICKS = 30000000L; // 3 seconds

    private static IMMDeviceEnumerator GetEnumerator() {
        if (sharedEnumerator == null) {
            sharedEnumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        }
        return sharedEnumerator;
    }

    private static void ReleaseEnumerator() {
        if (sharedEnumerator != null) {
            try { Marshal.ReleaseComObject(sharedEnumerator); } catch {}
            sharedEnumerator = null;
        }
    }

    public static void InvalidateRenderEndpoint() {
        if (renderEndpoint != null) {
            try { Marshal.ReleaseComObject(renderEndpoint); } catch {}
            renderEndpoint = null;
        }
        cachedRenderDeviceId = null;
        lastRenderDeviceCheckTicks = 0;
    }

    public static void InvalidateCaptureEndpoint() {
        if (captureEndpoint != null) {
            try { Marshal.ReleaseComObject(captureEndpoint); } catch {}
            captureEndpoint = null;
        }
        cachedCaptureDeviceId = null;
        lastCaptureDeviceCheckTicks = 0;
    }

    public static void InvalidateAudioEndpoint() {
        InvalidateRenderEndpoint();
        InvalidateCaptureEndpoint();
        ReleaseEnumerator();
    }

    private static bool EnsureRenderEndpoint(bool forceCheck) {
        long nowTicks = DateTime.UtcNow.Ticks;
        if (renderEndpoint != null && !forceCheck && (nowTicks - lastRenderDeviceCheckTicks) < DEVICE_RECHECK_INTERVAL_TICKS) {
            return true;
        }
        lastRenderDeviceCheckTicks = nowTicks;
        IMMDevice dev = null;
        try {
            var enumerator = GetEnumerator();
            if (enumerator == null) {
                InvalidateRenderEndpoint();
                return false;
            }
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            if (dev == null) {
                enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
            }
            if (dev == null) {
                InvalidateRenderEndpoint();
                return false;
            }
            string devId = null;
            try { dev.GetId(out devId); } catch {}
            if (renderEndpoint != null && devId != null && devId == cachedRenderDeviceId) {
                return true;
            }
            InvalidateRenderEndpoint();
            Guid epvId = typeof(IAudioEndpointVolume).GUID;
            dev.Activate(ref epvId, 23, 0, out renderEndpoint);
            if (renderEndpoint == null) return false;
            cachedRenderDeviceId = devId;
            return true;
        } catch {
            InvalidateRenderEndpoint();
            ReleaseEnumerator();
            return false;
        } finally {
            if (dev != null) try { Marshal.ReleaseComObject(dev); } catch {}
        }
    }

    private static bool EnsureCaptureEndpoint(bool forceCheck) {
        long nowTicks = DateTime.UtcNow.Ticks;
        if (captureEndpoint != null && !forceCheck && (nowTicks - lastCaptureDeviceCheckTicks) < DEVICE_RECHECK_INTERVAL_TICKS) {
            return true;
        }
        lastCaptureDeviceCheckTicks = nowTicks;
        IMMDevice dev = null;
        try {
            var enumerator = GetEnumerator();
            if (enumerator == null) {
                InvalidateCaptureEndpoint();
                return false;
            }
            enumerator.GetDefaultAudioEndpoint(1, 1, out dev);
            if (dev == null) {
                enumerator.GetDefaultAudioEndpoint(1, 0, out dev);
            }
            if (dev == null) {
                enumerator.GetDefaultAudioEndpoint(1, 2, out dev);
            }
            if (dev == null) {
                InvalidateCaptureEndpoint();
                return false;
            }
            string devId = null;
            try { dev.GetId(out devId); } catch {}
            if (captureEndpoint != null && devId != null && devId == cachedCaptureDeviceId) {
                return true;
            }
            InvalidateCaptureEndpoint();
            Guid epvId = typeof(IAudioEndpointVolume).GUID;
            dev.Activate(ref epvId, 23, 0, out captureEndpoint);
            if (captureEndpoint == null) return false;
            cachedCaptureDeviceId = devId;
            return true;
        } catch {
            InvalidateCaptureEndpoint();
            ReleaseEnumerator();
            return false;
        } finally {
            if (dev != null) try { Marshal.ReleaseComObject(dev); } catch {}
        }
    }

    public static int GetVolume(out bool muted) {
        muted = false;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                if (!EnsureRenderEndpoint(attempt > 0)) return -1;
                float v = 0;
                int hrVol = renderEndpoint.GetMasterVolumeLevelScalar(out v);
                int hrMute = renderEndpoint.GetMute(out muted);
                if (hrVol < 0 || hrMute < 0) {
                    InvalidateRenderEndpoint();
                    continue;
                }
                return (int)Math.Round(v * 100);
            } catch {
                InvalidateRenderEndpoint();
            }
        }
        return -1;
    }

    public static int GetMicMuted(out bool muted) {
        muted = false;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                if (!EnsureCaptureEndpoint(attempt > 0)) return -1;
                int hrMute = captureEndpoint.GetMute(out muted);
                if (hrMute < 0) {
                    InvalidateCaptureEndpoint();
                    continue;
                }
                return 0;
            } catch {
                InvalidateCaptureEndpoint();
            }
        }
        return -1;
    }

    public static bool SetMicMuted(bool mute) {
        try {
            var enumerator = GetEnumerator();
            if (enumerator == null) return false;
            Guid epvId = typeof(IAudioEndpointVolume).GUID;
            bool anySucceeded = false;
            for (int role = 0; role < 3; role++) {
                IMMDevice dev = null;
                IAudioEndpointVolume ep = null;
                try {
                    enumerator.GetDefaultAudioEndpoint(1, role, out dev);
                    if (dev != null) {
                        dev.Activate(ref epvId, 23, 0, out ep);
                        if (ep != null && ep.SetMute(mute, Guid.Empty) >= 0) {
                            anySucceeded = true;
                        }
                    }
                } finally {
                    if (ep != null) try { Marshal.ReleaseComObject(ep); } catch {}
                    if (dev != null) try { Marshal.ReleaseComObject(dev); } catch {}
                }
            }
            return anySucceeded;
        } catch {
            InvalidateCaptureEndpoint();
            ReleaseEnumerator();
            return false;
        }
    }

    public static bool SetVolume(int percent) {
        int clamped = Math.Max(0, Math.Min(100, percent));
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                if (!EnsureRenderEndpoint(attempt > 0)) return false;
                int hr1 = renderEndpoint.SetMasterVolumeLevelScalar(clamped / 100.0f, Guid.Empty);
                int hr2 = renderEndpoint.SetMute(clamped <= 0, Guid.Empty);
                if (hr1 < 0 || hr2 < 0) {
                    InvalidateRenderEndpoint();
                    continue;
                }
                return true;
            } catch {
                InvalidateRenderEndpoint();
            }
        }
        return false;
    }

    public static bool ToggleMute() {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                bool muted = false;
                if (GetVolume(out muted) < 0 || renderEndpoint == null) return false;
                int hr = renderEndpoint.SetMute(!muted, Guid.Empty);
                if (hr < 0) {
                    InvalidateRenderEndpoint();
                    continue;
                }
                return true;
            } catch {
                InvalidateRenderEndpoint();
            }
        }
        return false;
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
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetWindowText(IntPtr hWnd, string lpString);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr hObject);
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int pquns);

    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint SYNCHRONIZE = 0x00100000;
    const uint WAIT_OBJECT_0 = 0x00000000;
    const int QUNS_RUNNING_D3D_FULL_SCREEN = 3;
    const int GWL_STYLE = -16;
    const int WS_POPUP = unchecked((int)0x80000000);
    const int UNWANTED_OVERLAY_STYLE_BITS =
        0x00C00000 | // WS_CAPTION (WS_BORDER | WS_DLGFRAME)
        0x00080000 | // WS_SYSMENU
        0x00040000 | // WS_THICKFRAME
        0x00020000 | // WS_MINIMIZEBOX
        0x00010000;  // WS_MAXIMIZEBOX
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOZORDER = 0x0004;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint SWP_FRAMECHANGED = 0x0020;

    static IntPtr watchedParentHandle = IntPtr.Zero;
    static int watchedParentPid = 0;
    static bool overlayTitleCleared = false;
    static long lastOverlayHwnd = 0;

    public static bool EnforceFramelessOverlay(long hwndValue, bool forceFrameRefresh) {
        if (hwndValue == 0) return false;
        IntPtr hwnd = new IntPtr(hwndValue);
        if (!IsWindow(hwnd)) return false;
        try {
            if (lastOverlayHwnd != hwndValue) {
                lastOverlayHwnd = hwndValue;
                overlayTitleCleared = false;
            }
            if (!overlayTitleCleared || forceFrameRefresh) {
                SetWindowText(hwnd, "");
                overlayTitleCleared = true;
            }
            int style = GetWindowLong(hwnd, GWL_STYLE);
            bool hasUnwantedBits = (style & UNWANTED_OVERLAY_STYLE_BITS) != 0;
            bool missingPopup = (style & WS_POPUP) == 0;
            if (hasUnwantedBits || missingPopup || forceFrameRefresh) {
                int cleanStyle = (style & ~UNWANTED_OVERLAY_STYLE_BITS) | WS_POPUP;
                if (cleanStyle != style) {
                    SetWindowLong(hwnd, GWL_STYLE, cleanStyle);
                }
                SetWindowPos(
                    hwnd,
                    IntPtr.Zero,
                    0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
                );
                return true;
            }
        } catch {}
        return false;
    }

    static uint cachedPid = 0;
    static string cachedProcName = "";
    static bool cachedIsGame = false;
    static bool cachedIsExcluded = false;
    static bool cachedPathDenied = false;

    public static bool IsParentProcessAlive(int parentPid) {
        if (parentPid <= 0) return true;
        if (watchedParentPid != parentPid) {
            if (watchedParentHandle != IntPtr.Zero) {
                try { CloseHandle(watchedParentHandle); } catch {}
                watchedParentHandle = IntPtr.Zero;
            }
            watchedParentPid = parentPid;
            watchedParentHandle = OpenProcess(SYNCHRONIZE, false, (uint)parentPid);
        }
        if (watchedParentHandle == IntPtr.Zero) {
            // If SYNCHRONIZE handle could not be opened, try QueryLimitedInformation once
            IntPtr hCheck = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)parentPid);
            if (hCheck == IntPtr.Zero) {
                return Marshal.GetLastWin32Error() == 5; // Access denied means still alive
            }
            CloseHandle(hCheck);
            return true;
        }
        uint waitRes = WaitForSingleObject(watchedParentHandle, 0);
        if (waitRes == WAIT_OBJECT_0) {
            try { CloseHandle(watchedParentHandle); } catch {}
            watchedParentHandle = IntPtr.Zero;
            return false;
        }
        return true;
    }

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

    static void ClassifyProcess(uint processId, out string procBaseName, out bool isGame, out bool isExcluded, out bool pathDenied) {
        if (processId == cachedPid && processId != 0) {
            procBaseName = cachedProcName;
            isGame = cachedIsGame;
            isExcluded = cachedIsExcluded;
            pathDenied = cachedPathDenied;
            return;
        }
        procBaseName = "";
        isGame = false;
        isExcluded = false;
        pathDenied = false;
        try {
            string executablePath = GetProcessImagePath(processId, out pathDenied);
            if (!string.IsNullOrEmpty(executablePath)) {
                string normalizedPath = executablePath.Replace('/', '\\').ToLowerInvariant();
                procBaseName = Path.GetFileNameWithoutExtension(executablePath) ?? "";
                string fileBase = procBaseName.ToLowerInvariant();
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
        } catch {}

        cachedPid = processId;
        cachedProcName = procBaseName;
        cachedIsGame = isGame;
        cachedIsExcluded = isExcluded;
        cachedPathDenied = pathDenied;
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

            string proc;
            bool isGame, isExcluded, pathDenied;
            ClassifyProcess(processId, out proc, out isGame, out isExcluded, out pathDenied);
            proc = (proc ?? "").Trim();
            if (proc.Length == 0) return;

            string low = proc.ToLowerInvariant();
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
                StringBuilder titleSb = new StringBuilder(256);
                GetWindowText(hwnd, titleSb, titleSb.Capacity);
                string title = titleSb.ToString().ToLowerInvariant();
                if (title.Contains("meet.google.com") || title.Contains("google meet") || title.Contains("zoom") || title.Contains("microsoft teams")) {
                    category = "meeting";
                } else if (title.Contains("youtube") || title.Contains("netflix") || title.Contains("twitch") || title.Contains("tv+") || title.Contains("tvplus")) {
                    category = "media";
                } else {
                    category = "browser";
                }
                return;
            }
            if (isGame && !isExcluded) {
                category = "game";
                return;
            }
        } catch {}
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

            string proc;
            bool isGame, isExcluded, pathDenied;
            ClassifyProcess(processId, out proc, out isGame, out isExcluded, out pathDenied);
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
            elseif ($lowApp -match 'nvidia|geforce') { $candidates.Add('nvidia overlay'); $candidates.Add('nvcontainer') }
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
using System.Threading;

public static class WinBrightnessHelper {
    private static ManagementEventWatcher watcher;
    private static int pendingBrightness = -1;
    private static bool watcherActive = false;

    public static bool IsEventWatcherActive {
        get { return watcherActive; }
    }

    public static void Reset() {
        watcherActive = false;
        Interlocked.Exchange(ref pendingBrightness, -1);
        if (watcher != null) {
            try { watcher.Stop(); } catch {}
            try { watcher.Dispose(); } catch {}
            watcher = null;
        }
    }

    public static int QueryCurrentBrightnessOnce() {
        try {
            using (var searcher = new ManagementObjectSearcher("root\\wmi", "SELECT CurrentBrightness FROM WmiMonitorBrightness")) {
                using (var results = searcher.Get()) {
                    foreach (ManagementObject obj in results) {
                        using (obj) {
                            object val = obj["CurrentBrightness"];
                            if (val != null) return Convert.ToInt32(val);
                        }
                    }
                }
            }
        } catch {}
        return -1;
    }

    public static bool StartEventWatcher() {
        if (watcherActive && watcher != null) return true;
        Reset();
        try {
            var scope = new ManagementScope("root\\wmi");
            var query = new WqlEventQuery("SELECT * FROM WmiMonitorBrightnessEvent");
            watcher = new ManagementEventWatcher(scope, query);
            watcher.EventArrived += (sender, args) => {
                try {
                    object raw = args.NewEvent["Brightness"];
                    if (raw != null) {
                        int val = Convert.ToInt32(raw);
                        if (val >= 0 && val <= 100) {
                            Interlocked.Exchange(ref pendingBrightness, val);
                        }
                    }
                } catch {}
            };
            watcher.Start();
            watcherActive = true;
            return true;
        } catch {
            Reset();
            return false;
        }
    }

    public static int ConsumeBrightnessEvent() {
        return Interlocked.Exchange(ref pendingBrightness, -1);
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
$lastVolumePoll = [DateTimeOffset]::MinValue
$lastMicPoll = [DateTimeOffset]::MinValue
$lastGameModePoll = [DateTimeOffset]::MinValue
$lastParentCheck = [DateTimeOffset]::MinValue
$lastNotifPoll = [DateTimeOffset]::MinValue
$gameModeActive = $false
$hasActiveMediaSessions = $false
$notificationTask = $null
$notificationListType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]

try {
    if ($OverlayHwnd -ne 0) {
        [void][WinWindowHelper]::EnforceFramelessOverlay($OverlayHwnd, $true)
    }
} catch {}

try {
    $initBri = [WinBrightnessHelper]::QueryCurrentBrightnessOnce()
    if ($initBri -ge 0) {
        $lastBrightness = $initBri
        [void][WinBrightnessHelper]::StartEventWatcher()
    }
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
    try {
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
                    } elseif ($trimmedCmd -match '^overlay-hwnd:(-?\d+)$') {
                        $OverlayHwnd = [long]$Matches[1]
                        [void][WinWindowHelper]::EnforceFramelessOverlay($OverlayHwnd, $true)
                    } elseif ($trimmedCmd -eq 'enforce-frameless') {
                        if ($OverlayHwnd -ne 0) {
                            [void][WinWindowHelper]::EnforceFramelessOverlay($OverlayHwnd, $true)
                        }
                    } elseif ($trimmedCmd -eq 'refresh-watchers') {
                        [WinAudioHelper]::InvalidateAudioEndpoint()
                        [WinBrightnessHelper]::Reset()
                        if ($OverlayHwnd -ne 0) {
                            [void][WinWindowHelper]::EnforceFramelessOverlay($OverlayHwnd, $true)
                        }
                        $lastVolumePoll = [DateTimeOffset]::MinValue
                        $lastMicPoll = [DateTimeOffset]::MinValue
                        try {
                            $refreshedBri = [WinBrightnessHelper]::QueryCurrentBrightnessOnce()
                            if ($refreshedBri -ge 0) {
                                $lastBrightness = $refreshedBri
                                [void][WinBrightnessHelper]::StartEventWatcher()
                            }
                        } catch {}
                    }
                }
                try { $stdinReadTask = $stdinStream.ReadAsync($stdinBuf, 0, $stdinBuf.Length) } catch { $stdinReadTask = $null }
            } else {
                $stdinReadTask = $null
            }
        }
    } catch {}
    $now = [DateTimeOffset]::Now
    # Zero-allocation Win32 SYNCHRONIZE wait on parent Electron handle
    if ($ElectronPid -gt 0 -and ($now - $lastParentCheck).TotalMilliseconds -ge 2500) {
        $lastParentCheck = $now
        if (-not [WinWindowHelper]::IsParentProcessAlive($ElectronPid)) {
            break
        }
    }

    try {

        # Check the foreground window at a low rate and report only state transitions.
        if (($now - $lastGameModePoll).TotalMilliseconds -ge 500) {
            $lastGameModePoll = $now
            if ($OverlayHwnd -ne 0) {
                [void][WinWindowHelper]::EnforceFramelessOverlay($OverlayHwnd, $false)
            }
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

        # Fast in-process SMTC media session/playback detector (adaptive: 300ms when active session, 1000ms when idle)
        $mediaPollMs = if ($hasActiveMediaSessions) { 300 } else { 1000 }
        if (-not $gameModeActive -and $null -ne $mediaManager -and ($now - $lastMediaPoll).TotalMilliseconds -ge $mediaPollMs) {
            $lastMediaPoll = $now
            try {
                $curSess = $null
                $allSessions = $mediaManager.GetSessions()
                $hasActiveMediaSessions = [bool]($allSessions -and $allSessions.Count -gt 0)
                if ($hasActiveMediaSessions) {
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
                    $hasActiveMediaSessions = $true
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

        # Reuse cached render & capture CoreAudio endpoints (zero audiodg RPC churn).
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
        }

        if (($now - $lastMicPoll).TotalMilliseconds -ge 200) {
            $lastMicPoll = $now
            $micMuted = $false
            if ([WinAudioHelper]::GetMicMuted([ref]$micMuted) -ge 0) {
                if (-not $lastMicInit -or $micMuted -ne $lastMicMuted) {
                    $lastMicInit = $true
                    $lastMicMuted = $micMuted
                    Write-Output ((@{ event = 'mic-mute'; muted = [bool]$micMuted }) | ConvertTo-Json -Compress)
                }
            }
        }

        # Pure event-driven brightness via WmiMonitorBrightnessEvent (zero 100ms WMI polling, zero Receive-Job churn)
        $eventBri = [WinBrightnessHelper]::ConsumeBrightnessEvent()
        if ($eventBri -ge 0 -and $eventBri -ne $lastBrightness) {
            if ($lastBrightness -ge 0) {
                $bEv = @{ event = 'brightness'; value = $eventBri }
                Write-Output ($bEv | ConvertTo-Json -Compress)
            }
            $lastBrightness = $eventBri
        }

        # Keep the toast query asynchronous and throttled so its wait cannot delay HUD events or churn WinRT allocations.
        $notifPollMs = if ($gameModeActive) { 600 } else { 380 }
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
    } catch {}

    if ($ghelperBridgeLoaded) {
        try { Invoke-GHelperNotificationMessagePump } catch {}
    }
    Start-Sleep -Milliseconds $(if ($gameModeActive) { 150 } else { 110 })
}
