CreateObject("WScript.Shell").Run "cmd /c cd /d """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & """ && npm start", 0, False
