Option Explicit

Dim shell, fso, repo, pyw, dataServer, aiServer, cmd1, cmd2
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

repo = fso.GetParentFolderName(WScript.ScriptFullName)
pyw = repo & "\\.venv\\Scripts\\pythonw.exe"
dataServer = repo & "\\data_storage_server.py"
aiServer = repo & "\\ai_review_server.py"

If Not fso.FileExists(pyw) Then
  MsgBox "pythonw.exe not found at: " & pyw, vbCritical, "Server Launcher"
  WScript.Quit 1
End If

If Not fso.FileExists(dataServer) Then
  MsgBox "Missing file: " & dataServer, vbCritical, "Server Launcher"
  WScript.Quit 1
End If

If Not fso.FileExists(aiServer) Then
  MsgBox "Missing file: " & aiServer, vbCritical, "Server Launcher"
  WScript.Quit 1
End If

cmd1 = Chr(34) & pyw & Chr(34) & " " & Chr(34) & dataServer & Chr(34)
cmd2 = Chr(34) & pyw & Chr(34) & " " & Chr(34) & aiServer & Chr(34)

' 0 = hidden window, False = do not wait
shell.Run cmd1, 0, False
WScript.Sleep 500
shell.Run cmd2, 0, False
