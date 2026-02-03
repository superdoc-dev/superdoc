import * as vscode from 'vscode';
import * as path from 'path';

function debug(message: string) {
  console.log('[SuperDoc - Provider]', message);
}

export class SuperDocEditorProvider implements vscode.CustomEditorProvider<SuperDocDocument> {
  public static readonly viewType = 'superdoc.docxEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SuperDocDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<SuperDocDocument> {
    debug(`Opening DOCX file: ${uri.fsPath}`);
    const fileUri = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    const data = await vscode.workspace.fs.readFile(fileUri);
    return new SuperDocDocument(uri, data);
  }

  async resolveCustomEditor(
    document: SuperDocDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    debug(`Resolving custom editor for: ${document.uri.fsPath}`);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewPanel.webview.html = this.getWebviewContent(webviewPanel.webview);
    this.setupMessageHandler(webviewPanel.webview, document);

    // Send document data when webview is ready
    const readyListener = webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message.type === 'ready') {
        debug(`Sending document to webview, size: ${document.data.length}`);
        webviewPanel.webview.postMessage({
          type: 'update',
          content: { data: Array.from(document.data) },
        });
      }
    });

    // Watch for external file changes
    const fileWatcher = this.setupFileWatcher(document, webviewPanel.webview);

    webviewPanel.onDidDispose(() => {
      readyListener.dispose();
      fileWatcher.dispose();
    });
  }

  private setupFileWatcher(document: SuperDocDocument, webview: vscode.Webview): vscode.FileSystemWatcher {
    const fileDir = vscode.Uri.joinPath(document.uri, '..');
    const fileName = path.basename(document.uri.fsPath);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(fileDir, fileName)
    );

    watcher.onDidChange(async (uri) => {
      // Ignore our own saves (within 1 second)
      if (Date.now() - document.lastSaveTime < 1000) {
        debug('Ignoring file change - recent save');
        return;
      }

      debug(`External file change detected: ${uri.fsPath}`);
      await document.reloadFromDisk();
      debug(`Sending reload to webview, size: ${document.data.length} bytes`);
      webview.postMessage({
        type: 'reload',
        content: { data: Array.from(document.data) },
      });
    });

    return watcher;
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'style.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} https: data:; img-src ${webview.cspSource} https: data: blob:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline';">
        <link href="${styleUri}" rel="stylesheet">
        <title>SuperDoc Editor</title>
      </head>
      <body>
        <div id="superdoc-toolbar"></div>
        <div id="superdoc"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private setupMessageHandler(webview: vscode.Webview, document: SuperDocDocument): void {
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'update': {
          debug(`Received update from webview, size: ${message.content?.length}`);
          document.update(new Uint8Array(message.content));
          await document.save();
          debug(`Document saved: ${document.uri.fsPath}`);
          break;
        }
        case 'debug':
          debug(message.message);
          break;
      }
    });
  }

  // Required by CustomEditorProvider interface
  async saveCustomDocument(document: SuperDocDocument): Promise<void> {
    await document.save();
  }

  async saveCustomDocumentAs(document: SuperDocDocument, destination: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.data);
  }

  async revertCustomDocument(document: SuperDocDocument): Promise<void> {
    await document.reloadFromDisk();
  }

  async backupCustomDocument(
    document: SuperDocDocument,
    context: vscode.CustomDocumentBackupContext
  ): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(context.destination, document.data);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try { await vscode.workspace.fs.delete(context.destination); } catch {}
      },
    };
  }
}

class SuperDocDocument implements vscode.CustomDocument {
  private _data: Uint8Array;
  private _lastSaveTime = 0;

  constructor(public readonly uri: vscode.Uri, initialData: Uint8Array) {
    this._data = initialData;
  }

  get data(): Uint8Array {
    return this._data;
  }

  get lastSaveTime(): number {
    return this._lastSaveTime;
  }

  update(newData: Uint8Array): void {
    this._data = newData;
  }

  async save(): Promise<void> {
    this._lastSaveTime = Date.now();
    await vscode.workspace.fs.writeFile(this.uri, this._data);
  }

  async reloadFromDisk(): Promise<void> {
    this._data = await vscode.workspace.fs.readFile(this.uri);
  }

  dispose(): void {}
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
