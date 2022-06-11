// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

async function getTemplateInfo(
  wsPath: string
): Promise<{ ext: string; templatePath: string } | null> {
  const templateDirectory = wsPath + "/extensions/templates";
  const folders = (
    await fs.promises.readdir(templateDirectory, { withFileTypes: true })
  )
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const extDirectory = await vscode.window.showQuickPick(folders, {
    placeHolder: "Select a ext",
  });
  if (!extDirectory) {
    return null;
  }

  const specificTemplateDir = templateDirectory + "/" + extDirectory;

  const files = fs.readdirSync(specificTemplateDir);

  const choosedTemplate = await vscode.window.showQuickPick(files, {
    placeHolder: "Select a template",
  });

  if (!choosedTemplate) {
    return null;
  }

  return {
    ext: extDirectory,
    templatePath: specificTemplateDir + "/" + choosedTemplate,
  };
}

async function createStrFromTemplate(
  templatePath: string,
  filename: string
): Promise<string | null> {
  const templateStr = await new Promise<string>((resolve, reject) => {
    fs.readFile(templatePath, "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          reject(new Error("Template file of the language does not exist"));
          return;
        }
        reject(err);
        return;
      }
      resolve(data);
    });
  });

  const matchedStrArray = templateStr.match(/%(.*?)%/g) || [];

  let result: string = templateStr;

  const replacedVar: Set<string> = new Set();
  
  for (const s of matchedStrArray) {
    if(replacedVar.has(s)){ continue;}
    
    if (s === "%FILENAME%") {
      result = result.replace(s, filename);
    } else {
      const input = await vscode.window.showInputBox({
        placeHolder: "",
        prompt: s,
        value: "",
      });

      if (!input) {
        return null;
      }

      result = result.replaceAll(s, input);
      replacedVar.add(s);
    }
  }
  return result;
}

function isDirectory(path: string): boolean {
  return fs.lstatSync(path).isDirectory();
}

export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "template-tools.createFromTemplate",
    async (folder: string | undefined) => {
      let newUri: vscode.Uri | null = null; // folder will be undefined when triggered by keybinding
      if (!folder) {
        // so triggered by a keybinding
        const originalClipboard = await vscode.env.clipboard.readText();
        await vscode.commands.executeCommand("copyFilePath");
        folder = await vscode.env.clipboard.readText(); // returns a string

        await vscode.env.clipboard.writeText(originalClipboard);

        // see note below for parsing multiple files/folders
        newUri = await vscode.Uri.file(folder); // make it a Uri
      }

      if (!!newUri && !isDirectory(newUri.fsPath)) {
        vscode.window.showWarningMessage("Please choose a folder to create file");
        return;
      }

      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      const wsedit = new vscode.WorkspaceEdit();
      if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("no folder");
        return;
      }
      const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

      const templateInput = await getTemplateInfo(wsPath);
      if (!templateInput) {
        return;
      }

      const input1 = await vscode.window.showInputBox({
        placeHolder: "Filename",
        prompt: "Enter the File name",
        value: "",
      });
      if (!input1) {
        return;
      }

      const result = await createStrFromTemplate(
        templateInput.templatePath,
        input1
      );
      if (!result) {
        return;
      }

      const filePath = vscode.Uri.file(
        (newUri?.fsPath || wsPath) +
          "/" +
          (input1 || "New File") +
          `.${templateInput.ext}`
      );
      vscode.window.showInformationMessage(filePath.toString());
      wsedit.createFile(filePath, { ignoreIfExists: true });
      wsedit.insert(filePath, new vscode.Position(0, 0), result);
      vscode.workspace.applyEdit(wsedit);
      vscode.window.showInformationMessage(
        `Created a new file: ${filePath.path}`
      );
    }
  );

  let disposable2 = vscode.commands.registerCommand(
    "template-tools.insertFromTemplate",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Please open a file...");
        return;
      }

      if (!vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage("no folder");
        return;
      }
      const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

      const templateInput = await getTemplateInfo(wsPath);
      if (!templateInput) {
        return;
      }

      const result = await createStrFromTemplate(
        templateInput.templatePath,
        path.basename(editor.document.fileName).replace(/\.[^/.]+$/, "")
      );
      if (!result) {
        return;
      }

      editor.insertSnippet(new vscode.SnippetString(result));
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(disposable2);
}

// this method is called when your extension is deactivated
export function deactivate() {}
