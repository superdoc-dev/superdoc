import * as vscode from 'vscode';
import { SuperDocEditorProvider } from './superdocEditorProvider';

function debug(message: string) {
    console.log('[SuperDoc - Activator]', message);
}

export function activate(context: vscode.ExtensionContext) {
    try {
        debug('Beginning activation...');

        // Register custom editor provider
        const provider = new SuperDocEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            'superdoc.docxEditor',
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );

        // Register command to open with SuperDoc
        const openCommand = vscode.commands.registerCommand('superdoc.openWithSuperdoc', (uri: vscode.Uri) => {
            vscode.commands.executeCommand('vscode.openWith', uri, 'superdoc.docxEditor');
        });

        context.subscriptions.push(providerRegistration, openCommand);
        debug('Registered extension');
        debug('Activation complete');
        vscode.window.showInformationMessage('SuperDoc extension activated.');
    } catch (error) {
        debug(`Activation error - ${error}`);
        vscode.window.showErrorMessage(`Failed to activate SuperDoc: ${error}`);
    }
}

export function deactivate() {
    debug('Extension deactivated');
}