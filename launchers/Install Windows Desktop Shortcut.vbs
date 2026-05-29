Option Explicit

Dim shell, fso, launcherDir, projectDir, targetPath, desktopPath, shortcutPath, shortcut

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

launcherDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetAbsolutePathName(fso.BuildPath(launcherDir, ".."))
targetPath = fso.BuildPath(launcherDir, "Open Haizong Project.bat")
desktopPath = shell.SpecialFolders("Desktop")
shortcutPath = fso.BuildPath(desktopPath, "Open Haizong Project.lnk")

If Not fso.FileExists(targetPath) Then
  MsgBox "Could not find the Windows launcher:" & vbCrLf & targetPath, vbCritical, "Haizong Launcher"
  WScript.Quit 1
End If

Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = targetPath
shortcut.WorkingDirectory = projectDir
shortcut.WindowStyle = 1
shortcut.Description = "Start the Haizong project"
shortcut.Save

MsgBox "Desktop shortcut created:" & vbCrLf & shortcutPath, vbInformation, "Haizong Launcher"
