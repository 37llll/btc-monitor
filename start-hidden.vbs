Set WshShell = CreateObject("WScript.Shell")
CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = CurrentDirectory
WshShell.Run "npx electron .", 0, False
Set WshShell = Nothing 