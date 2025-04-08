# Copy For AI

這是一個強大的 VSCode 擴展，讓你能夠將選取的程式碼以 AI 友善的格式複製到剪貼簿，並可選擇性地包含上下文資訊，使 AI 工具更容易理解您的程式碼。

## 功能特點

這個擴展提供了三種主要功能，讓你能夠根據需求選擇適合的方式：

### 1. 基本複製功能

1. **保持相對縮排** - 移除共同的前導空格，讓程式碼整齊對齊
2. **轉換為 Markdown 格式** - 自動添加語法高亮標記
3. **包含文件路徑與行號** - 提供程式碼的基本上下文

### 2. 增強複製功能 (含上下文)

除了基本功能外，還提供：

1. **程式碼結構分析** - 自動識別選取區域所在的函數、類別、命名空間等
2. **相關引用/匯入識別** - 智能尋找與選取程式碼相關的引用語句
3. **多種輸出格式** - 支援 Markdown、XML、JSON 和自定義格式
4. **多語言支援** - 支援大多數主流程式語言

### 3. 檔案瀏覽器 (Context Explorer)

全新功能讓你可以輕鬆選取並複製多個檔案：

1.  **多檔案/片段選取** - 使用檔案瀏覽器介面勾選多個檔案或程式碼片段。
2.  **資料夾批次選取** - 勾選資料夾自動選取所有子檔案。
3.  **檔案/片段搜尋篩選** - 快速篩選顯示需要的檔案或片段。
4.  **Tokens 預估** - 顯示選取項目（檔案+片段）的預估 tokens 總數量和百分比。
5.  **狀態持久化** - 記住您的選取、展開狀態**和已儲存的片段**。
6.  **右鍵選單整合** - 支援從檔案總管和編輯器頁籤直接添加檔案/資料夾。
7.  **範圍選取** - 支援按住 Shift 鍵點擊勾選框，快速選取範圍內的多個檔案或片段。
8.  **選取項目** - 支援在檔案或片段列表中點擊整列來切換選取狀態，操作更為直覺。
9.  **程式碼片段支援 (Snippets)**:
    *   從編輯器選取程式碼，右鍵選擇「Add Snippet to Copy For AI Explorer」即可儲存片段。
    *   在瀏覽器中獨立的「程式碼片段」區塊管理片段。
    *   支援勾選、複製、預覽（點擊跳轉至原始碼）和移除片段。
    *   片段會儲存上下文資訊（可選，根據設定）。
10. **可摺疊區塊**: 檔案列表和程式碼片段列表現在位於可獨立摺疊的區塊中。

## 使用方法

你可以通過以下方式使用此功能：

### 1. 基本複製 (無上下文)

**右鍵選單：**
- 在編輯器中選取程式碼
- 右鍵點擊選取的文字
- 選擇「Copy For AI」選項

**鍵盤快捷鍵：**
- 在編輯器中選取程式碼
- 按下 `Ctrl+Alt+C`（Windows/Linux）或 `Cmd+Alt+C`（Mac）

**命令面板：**
- 在編輯器中選取程式碼
- 按下 `Ctrl+Shift+P` 或 `Cmd+Shift+P` 開啟命令面板
- 輸入「Copy For AI」並選擇該命令

### 2. 增強複製 (含上下文)

**右鍵選單：**
- 在編輯器中選取程式碼
- 右鍵點擊選取的文字
- 選擇「Copy For AI (With Context)」選項

**鍵盤快捷鍵：**
- 在編輯器中選取程式碼
- 按下 `Ctrl+Alt+Shift+C`（Windows/Linux）或 `Cmd+Alt+Shift+C`（Mac）

**命令面板：**
- 在編輯器中選取程式碼
- 按下 `Ctrl+Shift+P` 或 `Cmd+Shift+P` 開啟命令面板
- 輸入「Copy For AI (With Context)」並選擇該命令

### 3. 使用檔案瀏覽器 (Context Explorer)

**開啟瀏覽器：**
- 點擊左側活動欄中的「Copy For AI」圖示，開啟瀏覽器側邊欄

**選取檔案與片段：**
- 勾選想要複製的檔案、資料夾或程式碼片段。
- 勾選資料夾將自動選取所有子檔案。
- **範圍選取**：點擊第一個項目（檔案或片段）的勾選框，然後按住 Shift 鍵點擊另一個項目的勾選框，即可選取兩者之間的所有可見項目。

**使用右鍵選單添加項目：**
- 在 VSCode 檔案總管中，右鍵點擊檔案，選擇「Add File to Copy For AI Explorer」
- 在 VSCode 檔案總管中，右鍵點擊資料夾，選擇「Add Folder to Copy For AI Explorer」
- 在編輯器頁籤上，右鍵點擊頁籤，選擇「Add Tab to Copy For AI Explorer」
- **新增：** 在編輯器中選取程式碼，右鍵點擊選取的文字，選擇「Add Snippet to Copy For AI Explorer」

**篩選項目：**
- 在頂部搜尋框中輸入關鍵字快速篩選檔案或片段（支援不區分大小寫和多關鍵字搜尋）。
- 勾選「僅顯示已選取」來專注於已選取的項目

**複製項目：**
- 點擊底部的「複製到剪貼簿」按鈕
- 所有選取的檔案和片段內容將按照設定的格式複製到剪貼簿

**管理片段：**
- 在「程式碼片段」區塊中，可以勾選/取消勾選片段。
- 點擊片段列（非勾選框）可以跳轉到原始碼位置並選取對應範圍。
- 點擊片段列右側的垃圾桶圖示可以移除該片段。

接著將複製的內容貼到 ChatGPT、Claude 或其他 AI 工具中，即可保持程式碼的格式和上下文。


## 輸出格式範例

### 基本複製格式

````markdown
## File: extension.ts (10-20)

```typescript
function activate(context) {
    // 程式碼內容
}
```
````

### 增強複製格式 (Markdown)

````markdown
# CODE CONTEXT
-----------------

## File
extension.ts (10-20)

## Structure
- 函數: activate(context: vscode.ExtensionContext)

## Imports
```typescript
import * as vscode from 'vscode';
```

## Code
```typescript
function activate(context) {
    // 程式碼內容
}
```
-----------------
````

### 檔案瀏覽器複製格式

````markdown
## File: src/extension.ts
```typescript
import * as vscode from 'vscode';
import { processCode, removeComments } from './codeAnalyzer';
import { formatOutput } from './formatter';

export function activate(context: vscode.ExtensionContext) {
    console.log('擴展 "copy-for-ai" 已啟動！');
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

## 設定選項

你可以在 VSCode 設定中自定義擴展的行為：

1. **copyForAI.includeStructureInfo** (預設: true)
   - 是否包含程式碼結構資訊

2. **copyForAI.includeRelatedImports** (預設: true)
   - 是否包含相關的引用/匯入語句

3. **copyForAI.outputFormat** (預設: "markdown")
   - 上下文資訊的輸出格式
   - 選項: "markdown", "xml", "json", "custom"

4. **copyForAI.customFormatBefore** (預設: "===== CODE CONTEXT START =====")
   - 自定義格式的開始標記

5. **copyForAI.customFormatAfter** (預設: "===== CODE CONTEXT END =====")
   - 自定義格式的結束標記

6. **copyForAI.includeComments** (預設: true)
   - 是否包含程式碼中的註解

7. **copyForAI.tokenLimit** (預設: 0)
   - 預設 token 上限（0 表示無上限）

8. **copyForAI.contextExplorer.excludePatterns** (預設: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/bin/**"])
   - Context Explorer 中排除的檔案模式
9. **copyForAI.contextExplorer.followGitignore** (預設: true)
   - Context Explorer 是否遵循工作區根目錄下的 .gitignore 檔案規則。

## 安裝

從 VSCode 擴展市集安裝：
1. 開啟 VSCode
2. 按 `Ctrl+Shift+X` 或 `Cmd+Shift+X` 開啟擴展視窗
3. 搜尋 "Copy For AI"
4. 點擊 "Install"

## 手動安裝

如果你想手動安裝：
1. 下載 `.vsix` 檔案
2. 在 VSCode 中按 `Ctrl+Shift+X` 或 `Cmd+Shift+X` 開啟擴展視窗
3. 點擊右上角的 "..." 按鈕
4. 選擇 "Install from VSIX..."
5. 選擇下載的 `.vsix` 檔案

## 支援的程式語言

擴展支援所有 VSCode 支援的程式語言，並為以下語言提供增強的上下文分析：

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

## 開發

### 準備開發環境
```bash
# 複製專案
git clone <your-repo-url>
cd copy-for-ai

# 安裝依賴
npm install
```

### 建置
```bash
npm run compile
```

### 監視模式（開發時使用）
```bash
npm run watch
```

### 測試擴展
```bash
# 方法 1: 使用 F5 鍵
# 在 VSCode 中開啟專案，然後按 F5 啟動新的 VSCode 視窗進行測試

# 方法 2: 使用命令列
code --extensionDevelopmentPath=${PWD}
```

### 打包擴展
```bash
# 先確保你已安裝 vsce
npm install -g @vscode/vsce

# 打包擴展為 .vsix 檔案
vsce package
```
這將在專案根目錄生成一個 `copy-for-ai-0.1.8.vsix` 檔案（版本號可能不同）。

## 授權

MIT