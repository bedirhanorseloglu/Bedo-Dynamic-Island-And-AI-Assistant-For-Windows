param(
    [string]$Clsid = "",
    [string]$AppId = "",
    [string]$InvokedArgs = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
    $resolvedClsid = ($Clsid | Out-String).Trim()
    $cleanAppId = ($AppId | Out-String).Trim()

    if (-not $resolvedClsid -and $cleanAppId) {
        foreach ($hive in @('HKCU:\Software\Classes\AppUserModelId', 'HKLM:\Software\Classes\AppUserModelId')) {
            $regPath = Join-Path $hive $cleanAppId
            if (Test-Path -LiteralPath $regPath) {
                $prop = Get-ItemProperty -LiteralPath $regPath -Name 'CustomActivator' -ErrorAction SilentlyContinue
                if ($prop -and $prop.CustomActivator) {
                    $resolvedClsid = [string]$prop.CustomActivator
                    break
                }
            }
        }
    }

    $clsidGuid = [Guid]::Empty
    if (-not $resolvedClsid -or -not [Guid]::TryParse($resolvedClsid, [ref]$clsidGuid) -or $clsidGuid -eq [Guid]::Empty) {
        Write-Output '{"ok":false,"reason":"no-clsid"}'
        exit 0
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct NOTIFICATION_USER_INPUT_DATA {
    [MarshalAs(UnmanagedType.LPWStr)] public string Key;
    [MarshalAs(UnmanagedType.LPWStr)] public string Value;
}

[ComImport, Guid("53E31837-6600-4A81-9395-75CFFE746F94"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface INotificationActivationCallback {
    void Activate(
        [In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
        [In, MarshalAs(UnmanagedType.LPWStr)] string invokedArgs,
        [In, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 3)] NOTIFICATION_USER_INPUT_DATA[] data,
        [In, MarshalAs(UnmanagedType.U4)] uint count
    );
}

public static class ToastComActivator {
    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int dwProcessId);

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(
        [In] ref Guid rclsid,
        [MarshalAs(UnmanagedType.IUnknown)] object pUnkOuter,
        uint dwClsContext,
        [In] ref Guid riid,
        [MarshalAs(UnmanagedType.IUnknown)] out object ppv
    );

    [DllImport("ole32.dll")]
    private static extern int CoAllowSetForegroundWindow(
        [MarshalAs(UnmanagedType.IUnknown)] object pUnk,
        IntPtr lpvReserved
    );

    public static void ActivateToast(Guid clsid, string appId, string invokedArgs) {
        AllowSetForegroundWindow(-1);
        Guid iid = new Guid("53E31837-6600-4A81-9395-75CFFE746F94");
        object obj = null;
        // CLSCTX_INPROC_SERVER (1) | CLSCTX_LOCAL_SERVER (4) = 5
        int hr = CoCreateInstance(ref clsid, null, 5u, ref iid, out obj);
        if (hr < 0 || obj == null) {
            Marshal.ThrowExceptionForHR(hr < 0 ? hr : -2147467259);
        }
        try {
            try { CoAllowSetForegroundWindow(obj, IntPtr.Zero); } catch {}
            var callback = (INotificationActivationCallback)obj;
            callback.Activate(appId ?? "", invokedArgs ?? "", null, 0u);
        } finally {
            try { Marshal.ReleaseComObject(obj); } catch {}
        }
    }
}
'@

    [ToastComActivator]::ActivateToast($clsidGuid, $cleanAppId, $InvokedArgs)
    Write-Output '{"ok":true,"method":"com-toast-activator"}'
} catch {
    $msg = ($_.Exception.Message | Out-String).Trim()
    Write-Output (@{ ok = $false; reason = 'com-activate-error'; error = $msg } | ConvertTo-Json -Compress)
}
