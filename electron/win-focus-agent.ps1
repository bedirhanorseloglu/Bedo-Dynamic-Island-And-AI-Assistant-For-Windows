param(
    [string]$Agent = "",
    [string]$File = "",
    [string]$Title = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class AgentFocusHelper {
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
                IsToolWindow = (exStyle & 0x00000080) != 0,
                IsMinimized = IsIconic(hWnd)
            });
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static bool FocusWindow(IntPtr hWnd, bool isMinimized) {
        if (hWnd == IntPtr.Zero) return false;
        if (isMinimized) ShowWindow(hWnd, 9);
        IntPtr fg = GetForegroundWindow();
        uint dummy;
        uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, out dummy) : 0;
        uint curThread = GetCurrentThreadId();
        bool attached = false;
        if (fgThread != 0 && fgThread != curThread) {
            attached = AttachThreadInput(curThread, fgThread, true);
        }
        BringWindowToTop(hWnd);
        bool ok = SetForegroundWindow(hWnd);
        if (attached) AttachThreadInput(curThread, fgThread, false);
        return ok;
    }
}
'@

$agentLower = ($Agent | Out-String).Trim().ToLowerInvariant()
$fileLeaf = if ($File) { [System.IO.Path]::GetFileName($File).ToLowerInvariant() } else { "" }

$targetProcs = @()
$titleHints = @()

if ($agentLower -match "antigravity") {
    $targetProcs = @("antigravity", "code")
    $titleHints = @("antigravity")
} elseif ($agentLower -match "codex") {
    $targetProcs = @("codex", "windowsterminal", "code", "pwsh", "powershell", "cmd")
    $titleHints = @("codex")
} elseif ($agentLower -match "claude") {
    $targetProcs = @("claude", "windowsterminal", "code", "pwsh", "powershell")
    $titleHints = @("claude")
} elseif ($agentLower -match "gemini") {
    $targetProcs = @("windowsterminal", "code", "pwsh", "powershell")
    $titleHints = @("gemini")
} else {
    $targetProcs = @("antigravity", "codex", "claude", "code", "windowsterminal")
}

$procs = @{}
Get-Process | ForEach-Object { $procs[[uint32]$_.Id] = $_.ProcessName.ToLowerInvariant() }

$windows = [AgentFocusHelper]::GetVisibleWindows()
$bestWin = $null
$bestScore = -1

foreach ($w in $windows) {
    if ($w.IsToolWindow) { continue }
    $pName = $procs[$w.Pid]
    if (-not $pName) { continue }
    if ($pName -eq "twocode" -or $pName -eq "electron") { continue }

    $tLower = $w.Title.ToLowerInvariant()
    $score = 0

    $procIdx = [Array]::IndexOf($targetProcs, $pName)
    if ($procIdx -ge 0) {
        $score += (100 - ($procIdx * 10))
    }
    foreach ($hint in $titleHints) {
        if ($tLower.Contains($hint)) { $score += 80 }
    }
    if ($fileLeaf -and $tLower.Contains($fileLeaf)) {
        $score += 60
    }

    if ($score -gt $bestScore -and $score -gt 0) {
        $bestScore = $score
        $bestWin = $w
    }
}

if ($bestWin) {
    $ok = [AgentFocusHelper]::FocusWindow($bestWin.Hwnd, $bestWin.IsMinimized)
    @{ ok = $ok; title = $bestWin.Title; process = $procs[$bestWin.Pid] } | ConvertTo-Json -Compress
    exit 0
}

@{ ok = $false } | ConvertTo-Json -Compress
exit 0
