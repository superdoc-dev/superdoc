# **SuperDoc VS Code Extension**

<img src="logo.png" alt="SuperDoc Logo" width="200">

Edit and view DOCX files inside Visual Studio Code with [SuperDoc](https://github.com/superdoc-dev/superdoc).

## **Features**

- **Edit DOCX in VS Code** - Keep your code and documents open side-by-side
- **Live reload** - When an AI agent or external process modifies your file, your document automatically refreshes
- **Auto-save** - Changes are saved as you type

## **Usage**

Once installed, any `.docx` file you open will automatically use SuperDoc. Just open a file and start editing.

## **Install**

**Coming soon to the VS Code Marketplace.** Star this repository to get notified.

### Install from VSIX

1. Clone the repo and install dependencies:
   ```
   npm install
   ```
2. Build the VSIX file:
   ```
   npm run package
   ```
3. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Run `Extensions: Install from VSIX...`
5. Select the generated `.vsix` file from the project folder

### Run from source

```
npm install
npm run compile
```

Then press `F5` in VS Code to launch a development window.

## **License**

This project is licensed under the GNU Affero General Public License version 3.0 (AGPLv3). See the full license at [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html).
