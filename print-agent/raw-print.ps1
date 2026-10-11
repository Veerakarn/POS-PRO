param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$signature = @'
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true)] public static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFOA info);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);
}
'@

Add-Type -TypeDefinition $signature
$bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $FilePath))
$handle = [IntPtr]::Zero
$pointer = [IntPtr]::Zero
try {
  if (-not [RawPrinter]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)) { throw "เปิด Printer Queue ไม่สำเร็จ: $PrinterName" }
  $info = New-Object RawPrinter+DOCINFOA
  $info.pDocName = "POS@PRO"
  $info.pDataType = "RAW"
  if ([RawPrinter]::StartDocPrinter($handle, 1, $info) -eq 0) { throw "เริ่มงานพิมพ์ไม่สำเร็จ" }
  if (-not [RawPrinter]::StartPagePrinter($handle)) { throw "เริ่มหน้าพิมพ์ไม่สำเร็จ" }
  $pointer = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pointer, $bytes.Length)
  $written = 0
  if (-not [RawPrinter]::WritePrinter($handle, $pointer, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw "ส่งข้อมูลไปเครื่องพิมพ์ไม่ครบ" }
  [RawPrinter]::EndPagePrinter($handle) | Out-Null
  [RawPrinter]::EndDocPrinter($handle) | Out-Null
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($pointer) }
  if ($handle -ne [IntPtr]::Zero) { [RawPrinter]::ClosePrinter($handle) | Out-Null }
}
