param(
    [string]$SourceApp = "",
    [string]$Title = "",
    [string]$Artist = "",
    [switch]$CheckOnly
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WinFocusHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

    public class WinInfo {
        public IntPtr Hwnd;
        public uint Pid;
        public string Title;
        public bool IsTopmost;
        public bool IsToolWindow;
        public bool IsMinimized;
    }

    public static List<WinInfo> GetVisibleWindows() {
        var list = new List<WinInfo>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            int exStyle = GetWindowLong(hWnd, -20);
            list.Add(new WinInfo {
                Hwnd = hWnd,
                Pid = pid,
                Title = sb.ToString(),
                IsTopmost = (exStyle & 0x00000008) != 0,
                IsToolWindow = (exStyle & 0x00000080) != 0,
                IsMinimized = IsIconic(hWnd)
            });
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static IntPtr GetTopNormalWindow(List<WinInfo> windows) {
        foreach (var w in windows) {
            if (!w.IsTopmost && !w.IsToolWindow && !w.IsMinimized) {
                return w.Hwnd;
            }
        }
        return IntPtr.Zero;
    }

    public static bool FocusWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        if (IsIconic(hWnd)) {
            ShowWindow(hWnd, 9); // SW_RESTORE
        } else {
            ShowWindow(hWnd, 5); // SW_SHOW
        }
        IntPtr fg = GetForegroundWindow();
        uint fgPid;
        uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, out fgPid) : 0;
        uint curThread = GetCurrentThreadId();
        bool attached = false;
        if (fgThread != 0 && fgThread != curThread) {
            attached = AttachThreadInput(curThread, fgThread, true);
        }
        BringWindowToTop(hWnd);
        bool ok = SetForegroundWindow(hWnd);
        if (attached) {
            AttachThreadInput(curThread, fgThread, false);
        }
        return ok;
    }
}
'@

function Get-CandidateProcessNames([string]$appId) {
    $names = [System.Collections.Generic.List[string]]::new()
    if ([string]::IsNullOrWhiteSpace($appId)) { return $names }
    $lower = $appId.ToLowerInvariant()

    if ($lower -match 'chrome') { $names.Add('chrome') }
    if ($lower -match 'msedge|microsoftedge') { $names.Add('msedge') }
    if ($lower -match 'brave') { $names.Add('brave') }
    if ($lower -match 'opera') { $names.Add('opera') }
    if ($lower -match 'vivaldi') { $names.Add('vivaldi') }
    if ($lower -match '\barc\b|thebrowsercompany') { $names.Add('Arc') }
    if ($lower -match 'comet') { $names.Add('comet') }
    if ($lower -match 'firefox|308046b0af4a39cb|0d797b6d') { $names.Add('firefox') }
    if ($lower -match 'zen') { $names.Add('zen') }
    if ($lower -match 'floorp') { $names.Add('floorp') }
    if ($lower -match 'waterfox') { $names.Add('waterfox') }
    if ($lower -match 'librewolf') { $names.Add('librewolf') }
    if ($lower -match 'thorium') { $names.Add('thorium') }
    if ($lower -match 'chromium') { $names.Add('chromium') }
    if ($lower -match 'yandex') { $names.Add('browser') }
    if ($lower -match 'spotify') { $names.Add('Spotify') }
    if ($lower -match 'applemusic') { $names.Add('AppleMusic') }
    if ($lower -match 'itunes') { $names.Add('iTunes') }
    if ($lower -match 'vlc') { $names.Add('vlc') }
    if ($lower -match 'potplayer') {
        $names.Add('PotPlayerMini64'); $names.Add('PotPlayerMini'); $names.Add('PotPlayer64'); $names.Add('PotPlayer')
    }
    if ($lower -match 'mpc-hc') { $names.Add('mpc-hc64'); $names.Add('mpc-hc') }
    if ($lower -match 'zunemusic|mediaplayer') { $names.Add('Microsoft.Media.Player') }

    if ($appId -match '^([^\\/:]+)\.exe$') {
        $base = $Matches[1]
        if (-not $names.Contains($base)) { $names.Add($base) }
    } elseif ($appId -match '!([^!]+)$') {
        $uwpName = $Matches[1]
        if (-not $names.Contains($uwpName)) { $names.Add($uwpName) }
    } elseif ($appId -match '^([^\\/:.!]+)\.') {
        $dotBase = $Matches[1]
        if (-not $names.Contains($dotBase)) { $names.Add($dotBase) }
    }
    return $names
}

function Test-TitleMatch([string]$haystack, [string]$needleTitle, [string]$needleArtist) {
    if ([string]::IsNullOrWhiteSpace($haystack)) { return $false }
    $h = $haystack.ToLowerInvariant()
    if (-not [string]::IsNullOrWhiteSpace($needleTitle)) {
        $t = $needleTitle.Trim().ToLowerInvariant()
        if ($t.Length -ge 3 -and $h.Contains($t)) { return $true }
        # Handle truncated or decorated titles (e.g. first 18 chars)
        if ($t.Length -ge 12) {
            $prefix = $t.Substring(0, [Math]::Min(18, $t.Length)).Trim()
            if ($prefix.Length -ge 8 -and $h.Contains($prefix)) { return $true }
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($needleArtist)) {
        $a = $needleArtist.Trim().ToLowerInvariant()
        if ($a.Length -ge 3 -and $h.Contains($a)) { return $true }
    }
    return $false
}

$allWindows = [WinFocusHelper]::GetVisibleWindows()
$fgHwnd = [WinFocusHelper]::GetForegroundWindow()
$topNormalHwnd = [WinFocusHelper]::GetTopNormalWindow($allWindows)
$candidateNames = Get-CandidateProcessNames $SourceApp
$targetPids = [System.Collections.Generic.HashSet[uint32]]::new()

foreach ($procName in $candidateNames) {
    try {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            $null = $targetPids.Add([uint32]$p.Id)
        }
    } catch {}
}

$appWindows = @($allWindows | Where-Object { $targetPids.Contains($_.Pid) -and -not $_.IsToolWindow })
if ($appWindows.Count -eq 0) {
    $appWindows = @($allWindows | Where-Object { $targetPids.Contains($_.Pid) })
}

if ($CheckOnly -and $appWindows.Count -eq 0) {
    Write-Output '{"exists":false,"reason":"no-window"}'
    exit 0
}

function Test-IsWindowActive([IntPtr]$hwnd) {
    return ($hwnd -eq $fgHwnd) -or ($topNormalHwnd -ne [IntPtr]::Zero -and $hwnd -eq $topNormalHwnd)
}

# 1. Exact window title match among candidate app windows
foreach ($w in $appWindows) {
    if (Test-TitleMatch $w.Title $Title $Artist) {
        if ($CheckOnly) {
            Write-Output '{"exists":true,"reason":"window-title"}'
            exit 0
        }
        $alreadyActive = Test-IsWindowActive $w.Hwnd
        if (-not $alreadyActive) {
            $null = [WinFocusHelper]::FocusWindow($w.Hwnd)
        }
        Write-Output (@{ ok = $true; alreadyActive = $alreadyActive; method = 'window-title'; title = $w.Title } | ConvertTo-Json -Compress)
        exit 0
    }
}

# 2. Search browser tabs via UI Automation in candidate app windows (skipping web page DOM)
# Skip UIA tab selection for Comet because UIA SelectionItemPattern.Select() can crash Comet's browser process;
# read-only tab enumeration in CheckOnly mode is safe.
$skipUiaTabWalk = (-not $CheckOnly) -and ($SourceApp -match 'comet')
if ($appWindows.Count -gt 0 -and -not $skipUiaTabWalk) {
    try {
        Add-Type -AssemblyName UIAutomationClient
        Add-Type -AssemblyName UIAutomationTypes

        $uiaClientAsm = [System.Windows.Automation.AutomationElement].Assembly.Location
        $uiaTypesAsm = [System.Windows.Automation.ControlType].Assembly.Location
        Add-Type -ReferencedAssemblies @($uiaClientAsm, $uiaTypesAsm) -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Windows.Automation;

public static class WinTabWalker {
    public static List<AutomationElement> FindTabItems(IntPtr hwnd, int maxNodes) {
        var result = new List<AutomationElement>();
        var root = AutomationElement.FromHandle(hwnd);
        if (root == null) return result;
        var walker = TreeWalker.ControlViewWalker;
        var queue = new Queue<AutomationElement>();
        queue.Enqueue(root);
        int visited = 0;
        while (queue.Count > 0 && visited < maxNodes) {
            var cur = queue.Dequeue();
            visited++;
            try {
                var ct = cur.Current.ControlType;
                if (ct == ControlType.Document) {
                    continue;
                }
                if (ct == ControlType.TabItem) {
                    result.Add(cur);
                    continue;
                }
                var child = walker.GetFirstChild(cur);
                while (child != null) {
                    queue.Enqueue(child);
                    child = walker.GetNextSibling(child);
                }
            } catch {
                // Ignore transient UIA elements
            }
        }
        return result;
    }
}
'@

        function Select-TabAndFocus($tab, $hwnd, [string]$tabName, [string]$method) {
            $switched = $false
            $isSelected = $false
            try {
                $selPattern = $null
                if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selPattern) -and $null -ne $selPattern) {
                    if ($selPattern.Current.IsSelected) {
                        $isSelected = $true
                    } else {
                        $selPattern.Select()
                        $switched = $true
                    }
                }
            } catch {}
            $alreadyActive = (Test-IsWindowActive $hwnd) -and $isSelected
            if (-not $alreadyActive) {
                $null = [WinFocusHelper]::FocusWindow($hwnd)
            }
            Write-Output (@{ ok = $true; alreadyActive = $alreadyActive; method = $method; tabSwitched = $switched; tab = $tabName } | ConvertTo-Json -Compress)
            exit 0
        }

        $windowTabs = @()
        $totalTabs = 0
        foreach ($w in $appWindows) {
            try {
                $tabs = [WinTabWalker]::FindTabItems($w.Hwnd, 800)
                $totalTabs += $tabs.Count
                foreach ($tab in $tabs) {
                    $tabName = $tab.Current.Name
                    if (-not [string]::IsNullOrWhiteSpace($Title) -and (Test-TitleMatch $tabName $Title $Artist)) {
                        if ($CheckOnly) {
                            Write-Output '{"exists":true,"reason":"tab-match"}'
                            exit 0
                        }
                        Select-TabAndFocus $tab $w.Hwnd $tabName 'uia-tab'
                    }
                    $windowTabs += [pscustomobject]@{ Tab = $tab; Hwnd = $w.Hwnd; Name = $tabName }
                }
            } catch {}
        }

        # Secondary pass: when paused, some web players (e.g. YouTube Music, Spotify Web)
        # revert their tab title from the song title back to the service name.
        foreach ($entry in $windowTabs) {
            $n = if ($entry.Name) { $entry.Name.ToLowerInvariant() } else { '' }
            if ($n -match 'youtube music|spotify|soundcloud|apple music|deezer|tidal|bandcamp') {
                if ($CheckOnly) {
                    Write-Output '{"exists":true,"reason":"tab-service"}'
                    exit 0
                }
                Select-TabAndFocus $entry.Tab $entry.Hwnd $entry.Name 'uia-tab-service'
            }
        }

        if ($CheckOnly) {
            if ($totalTabs -gt 0) {
                Write-Output '{"exists":false,"reason":"tab-closed"}'
            } else {
                Write-Output '{"exists":false,"reason":"no-tabs-found"}'
            }
            exit 0
        }
    } catch {}
}

if ($CheckOnly) {
    Write-Output '{"exists":false,"reason":"fallback-no-match"}'
    exit 0
}

# 3. Fallback: focus the first visible window of the candidate app (e.g. Spotify, Apple Music, browser)
if ($appWindows.Count -gt 0) {
    $w = $appWindows[0]
    $alreadyActive = Test-IsWindowActive $w.Hwnd
    if (-not $alreadyActive) {
        $null = [WinFocusHelper]::FocusWindow($w.Hwnd)
    }
    Write-Output (@{ ok = $true; alreadyActive = $alreadyActive; method = 'app-window'; title = $w.Title } | ConvertTo-Json -Compress)
    exit 0
}

# 4. Fallback: if SourceApp wasn't mapped, search any visible window whose title matches the playing title
if (-not [string]::IsNullOrWhiteSpace($Title)) {
    foreach ($w in $allWindows) {
        if (Test-TitleMatch $w.Title $Title "") {
            $alreadyActive = Test-IsWindowActive $w.Hwnd
            if (-not $alreadyActive) {
                $null = [WinFocusHelper]::FocusWindow($w.Hwnd)
            }
            Write-Output (@{ ok = $true; alreadyActive = $alreadyActive; method = 'global-title'; title = $w.Title } | ConvertTo-Json -Compress)
            exit 0
        }
    }
}

Write-Output (@{ ok = $false; reason = 'no-matching-window'; sourceApp = $SourceApp } | ConvertTo-Json -Compress)
