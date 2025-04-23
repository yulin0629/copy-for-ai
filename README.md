## 🌐 語言 | Languages
[English](README.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md)

# Copy For AI

This is a powerful VSCode extension that allows you to copy selected code to the clipboard in an AI-friendly format, optionally including context information to make it easier for AI tools to understand your code.

## Features

This extension provides three main features, allowing you to choose the one that suits your needs:

### 1. Basic Copy Functionality

1. **Preserve Relative Indentation** - Removes common leading spaces to align the code neatly
2. **Convert to Markdown Format** - Automatically adds syntax highlighting
3. **Include File Path and Line Numbers** - Provides basic context for the code

### 2. Enhanced Copy Functionality (with Context)

In addition to the basic features, it also provides:

1. **Code Structure Analysis** - Automatically identifies the function, class, namespace, etc., where the selected area is located
2. **Related Imports Identification** - Intelligently finds import statements related to the selected code
3. **Multiple Output Formats** - Supports Markdown, XML, JSON, and custom formats
4. **Multi-language Support** - Supports most mainstream programming languages

### 3. File Explorer (Context Explorer)

A new feature that allows you to easily select and copy multiple files:

1.  **Multi-file/Snippet Selection** - Use the file explorer interface to select multiple files or code snippets.
2.  **Batch Folder Selection** - Selecting a folder automatically selects all its child files.
3.  **File/Snippet Search Filter** - Quickly filter and display the files or snippets you need.
4.  **Tokens Estimation** - Displays the estimated total number of tokens and percentage for the selected items (files + snippets).
5.  **State Persistence** - Remembers your selection, expansion state, and saved snippets.
6.  **Context Menu Integration** - Supports adding files/folders directly from the file explorer and editor tabs.
7.  **Range Selection** - Supports holding down the Shift key and clicking the checkbox to quickly select multiple files or snippets within a range.
8.  **Item Selection** - Supports clicking the entire row in the file or snippet list to toggle the selection state, making the operation more intuitive.
9.  **Code Snippet Support (Snippets)**:
    *   Select code from the editor, right-click and choose "Add Snippet to Copy For AI Explorer" to save the snippet.
    *   Manage snippets in a separate "Code Snippets" section in the explorer.
    *   Supports selecting, copying, previewing (click to jump to the source code), and removing snippets.
    *   Snippets will save context information (optional, based on settings).
10. **Collapsible Sections**: The file list and code snippet list are now in independently collapsible sections.

## Usage

You can use this feature in the following ways:

### 1. Basic Copy (without Context)

**Context Menu:**
- Select code in the editor
- Right-click the selected text
- Choose the "Copy For AI" option

**Keyboard Shortcut:**
- Select code in the editor
- Press `Ctrl+Alt+C` (Windows/Linux) or `Cmd+Alt+C` (Mac)

**Command Palette:**
- Select code in the editor
- Press `Ctrl+Shift+P` or `Cmd+Shift+P` to open the command palette
- Type "Copy For AI" and choose the command

### 2. Enhanced Copy (with Context)

**Context Menu:**
- Select code in the editor
- Right-click the selected text
- Choose the "Copy For AI (With Context)" option

**Keyboard Shortcut:**
- Select code in the editor
- Press `Ctrl+Alt+Shift+C` (Windows/Linux) or `Cmd+Alt+Shift+C` (Mac)

**Command Palette:**
- Select code in the editor
- Press `Ctrl+Shift+P` or `Cmd+Shift+P` to open the command palette
- Type "Copy For AI (With Context)" and choose the command

### 3. Using the File Explorer (Context Explorer)

**Open the Explorer:**
- Click the "Copy For AI" icon in the activity bar on the left to open the explorer sidebar

**Select Files and Snippets:**
- Check the files, folders, or code snippets you want to copy.
- Checking a folder will automatically select all its child files.
- **Range Selection**: Click the checkbox of the first item (file or snippet), then hold down the Shift key and click the checkbox of another item to select all visible items between them.

**Add Items Using the Context Menu:**
- In the VSCode file explorer, right-click a file and choose "Add File to Copy For AI Explorer"
- In the VSCode file explorer, right-click a folder and choose "Add Folder to Copy For AI Explorer"
- Right-click a tab in the editor and choose "Add Tab to Copy For AI Explorer"
- **New**: Select code in the editor, right-click the selected text, and choose "Add Snippet to Copy For AI Explorer"

**Filter Items:**
- Enter keywords in the search box at the top to quickly filter files or snippets (supports case-insensitive and multi-keyword search).
- Check "Show Selected Only" to focus on the selected items

**Copy Items:**
- Click the "Copy to Clipboard" button at the bottom
- All selected files and snippet contents will be copied to the clipboard in the specified format

**Manage Snippets:**
- In the "Code Snippets" section, you can check/uncheck snippets.
- Clicking a snippet row (not the checkbox) will jump to the source code location and select the corresponding range.
- Clicking the trash icon on the right side of the snippet row will remove the snippet.

Then paste the copied content into ChatGPT, Claude, or other AI tools to maintain the code format and context.


## Output Format Examples

### Basic Copy Format

````markdown
## File: extension.ts (10-20)

```typescript
function activate(context) {
    // Code content
}
```
````

### Enhanced Copy Format (Markdown)

````markdown
# CODE CONTEXT
-----------------

## File
extension.ts (10-20)

## Structure
- Function: activate(context: vscode.ExtensionContext)

## Imports
```typescript
import * as vscode from 'vscode';
```

## Code
```typescript
function activate(context) {
    // Code content
}
```
-----------------
````

### File Explorer Copy Format

````markdown
## File: src/extension.ts
```typescript
import * as vscode from 'vscode';
import { processCode, removeComments } from './codeAnalyzer';
import { formatOutput } from './formatter';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "copy-for-ai" activated!');
}
```

## Snippet: src/formatter.ts (5-15)
### Structure
- Function: formatOutput(options: FormatOptions)
### Imports
```typescript
// ... relevant imports for the snippet ...
```
### Code
```typescript
export function formatOutput(options: FormatOptions): string {
    switch (options.format) {
        // ... snippet code ...
    }
}
```

## File: src/formatter.ts
```typescript
export function formatOutput(options: FormatOptions): string {
    switch (options.format) {
        case OutputFormat.Markdown:
            return formatAsMarkdown(options);
        case OutputFormat.XML:
            return formatAsXML(options);
        default:
            return formatAsMarkdown(options);
    }
}
```
````

## Configuration Options

You can customize the behavior of the extension in the VSCode settings:

1. **copyForAI.includeStructureInfo** (default: true)
   - Whether to include code structure information

2. **copyForAI.includeRelatedImports** (default: true)
   - Whether to include related import statements

3. **copyForAI.outputFormat** (default: "markdown")
   - The output format for context information
   - Options: "markdown", "xml", "json", "custom"

4. **copyForAI.customFormatBefore** (default: "===== CODE CONTEXT START =====")
   - Custom format start marker

5. **copyForAI.customFormatAfter** (default: "===== CODE CONTEXT END =====")
   - Custom format end marker

6. **copyForAI.includeComments** (default: true)
   - Whether to include comments in the code

7. **copyForAI.tokenLimit** (default: 0)
   - Default token limit (0 means no limit)

8. **copyForAI.contextExplorer.excludePatterns** (default: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/bin/**"])
   - File patterns to exclude in the Context Explorer
9. **copyForAI.contextExplorer.followGitignore** (default: true)
   - Whether the Context Explorer should follow the .gitignore file rules in the workspace root.

## Installation

Install from the VSCode extension marketplace:
1. Open VSCode
2. Press `Ctrl+Shift+X` or `Cmd+Shift+X` to open the extensions view
3. Search for "Copy For AI"
4. Click "Install"

## Manual Installation

If you want to install manually:
1. Download the `.vsix` file
2. In VSCode, press `Ctrl+Shift+X` or `Cmd+Shift+X` to open the extensions view
3. Click the "..." button in the top right corner
4. Choose "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Supported Languages

The extension supports all languages supported by VSCode and provides enhanced context analysis for the following languages:

- JavaScript / TypeScript
- Python
- Java
- C#
- C / C++
- Go
- Ruby
- PHP
- Swift
- Rust
- Kotlin

## Development

### Setting Up the Development Environment
```bash
# Clone the repository
git clone <your-repo-url>
cd copy-for-ai

# Install dependencies
npm install
```

### Build
```bash
npm run compile
```

### Watch Mode (for development)
```bash
npm run watch
```

### Test the Extension
```bash
# Method 1: Using F5 key
# Open the project in VSCode, then press F5 to start a new VSCode window for testing

# Method 2: Using command line
code --extensionDevelopmentPath=${PWD}
```

### Package the Extension
```bash
# Make sure you have vsce installed
npm install -g @vscode/vsce

# Package the extension into a .vsix file
vsce package
```
This will generate a `copy-for-ai-0.1.8.vsix` file in the project root directory (version number may vary).

## License

MIT
