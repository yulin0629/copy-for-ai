# Copy For AI

這是一個強大的 VSCode 擴展，讓你能夠將選取的程式碼以 AI 友善的格式複製到剪貼簿，並可選擇性地包含上下文資訊，使 AI 工具更容易理解您的程式碼。

## 功能特點

這個擴展提供了兩種複製模式，讓你能夠根據需求選擇適合的方式：

### 基本複製功能

1. **保持相對縮排** - 移除共同的前導空格，讓程式碼整齊對齊
2. **轉換為 Markdown 格式** - 自動添加語法高亮標記
3. **包含文件路徑與行號** - 提供程式碼的基本上下文

### 增強複製功能 (含上下文)

除了基本功能外，還提供：

1. **程式碼結構分析** - 自動識別選取區域所在的函數、類別、命名空間等
2. **相關引用/匯入識別** - 智能尋找與選取程式碼相關的引用語句
3. **多種輸出格式** - 支援 Markdown、XML、JSON 和自定義格式
4. **多語言支援** - 支援大多數主流程式語言

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

接著將複製的內容貼到 ChatGPT、Claude 或其他 AI 工具中，即可保持程式碼的格式和上下文。

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
這將在專案根目錄生成一個 `copy-for-ai-0.0.1.vsix` 檔案（版本號可能不同）。

## 授權

MIT