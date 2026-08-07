# Keyboard-only text injection via Win32 SendInput (no clipboard, no Tab key).
# Tabs must already be expanded to spaces in the text file.
param(
  [Parameter(Mandatory = $true)][string]$TextFile,
  [int]$DelayMs = 0,
  [int]$TabWidth = 4,
  [switch]$ClearAutoIndent
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ArKeyboard {
  public const uint INPUT_KEYBOARD = 1;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;
  public const ushort VK_BACK = 0x08;
  public const ushort VK_RETURN = 0x0D;

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion u;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  static int InputSize = Marshal.SizeOf(typeof(INPUT));

  public static void SendUnicode(char ch) {
    INPUT[] inputs = new INPUT[2];
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].u.ki.wVk = 0;
    inputs[0].u.ki.wScan = ch;
    inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].u.ki.wVk = 0;
    inputs[1].u.ki.wScan = ch;
    inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    uint sent = SendInput(2, inputs, InputSize);
    if (sent != 2) {
      throw new InvalidOperationException("SendInput unicode failed: " + Marshal.GetLastWin32Error());
    }
  }

  public static void TapVk(ushort vk) {
    INPUT[] inputs = new INPUT[2];
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].u.ki.wVk = vk;
    inputs[0].u.ki.dwFlags = 0;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].u.ki.wVk = vk;
    inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;
    uint sent = SendInput(2, inputs, InputSize);
    if (sent != 2) {
      throw new InvalidOperationException("SendInput vk failed: " + Marshal.GetLastWin32Error());
    }
  }
}
"@

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
# Safety: never emit Tab keystrokes — expand any leftover tabs to spaces
$spaces = ' ' * [Math]::Max(1, $TabWidth)
$text = $text.Replace([string][char]9, $spaces)

$lineLead = 0
$atLineStart = $true
$lineBuf = New-Object System.Text.StringBuilder

function Get-Delay {
  if ($DelayMs -gt 0) {
    $jitter = Get-Random -Minimum 0 -Maximum ([Math]::Max(1, $DelayMs))
    Start-Sleep -Milliseconds ($DelayMs + $jitter)
  }
}

foreach ($ch in $text.ToCharArray()) {
  $code = [int][char]$ch

  if ($code -eq 13) { continue }

  if ($code -eq 10) {
    [ArKeyboard]::TapVk([ArKeyboard]::VK_RETURN)
    Get-Delay

    if ($ClearAutoIndent) {
      # Editors like LeetCode/Monaco auto-indent after Enter.
      # Clear that before we type this line's own leading spaces.
      Start-Sleep -Milliseconds 25
      $toClear = $lineLead
      $trimmed = $lineBuf.ToString().TrimEnd()
      if ($trimmed.EndsWith('{') -or $trimmed.EndsWith(':') -or $trimmed.EndsWith('(')) {
        $toClear += $TabWidth
      }
      for ($b = 0; $b -lt $toClear; $b++) {
        [ArKeyboard]::TapVk([ArKeyboard]::VK_BACK)
        if ($DelayMs -gt 0) { Start-Sleep -Milliseconds 2 }
      }
    }

    $lineLead = 0
    $atLineStart = $true
    $null = $lineBuf.Clear()
    continue
  }

  # Never send tab as a key — treat as spaces (already expanded, but be safe)
  if ($code -eq 9) {
    for ($i = 0; $i -lt $TabWidth; $i++) {
      [ArKeyboard]::SendUnicode([char]' ')
      if ($atLineStart) { $lineLead++ }
      Get-Delay
    }
    $null = $lineBuf.Append($spaces)
    continue
  }

  [ArKeyboard]::SendUnicode($ch)
  $null = $lineBuf.Append($ch)

  if ($atLineStart) {
    if ($ch -eq ' ') {
      $lineLead++
    } else {
      $atLineStart = $false
    }
  }

  Get-Delay
}
