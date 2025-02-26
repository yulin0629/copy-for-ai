# Copy For AI

這是一個簡單的 VSCode 擴展，讓你能夠將選取的程式碼以 AI 友善的 Markdown 格式複製到剪貼簿。

## 功能

這個擴展提供了一個便捷的方法，讓你能夠將 VSCode 中的程式碼以 AI 友善的格式複製到剪貼簿。功能特點：

1. **保持相對縮排** - 移除共同的前導空格，讓程式碼整齊對齊
2. **轉換為 Markdown 格式** - 自動添加語法高亮標記
3. **包含文件路徑與行號** - 提供程式碼的完整上下文
4. **支持多種存取方式** - 右鍵選單、鍵盤快捷鍵、命令面板
5. **自動偵測程式語言** - 根據檔案類型添加適當的語言標記

複製的格式範例：

```
## File: RoyalBase/Filters/DumpFilter.cs (22-24)
```csharp
var a = 10;
if (a == 10) {
  a = 5;
}
```
```

## 使用方法

你可以通過以下三種方式使用此功能：

1. **右鍵選單**
   - 在編輯器中選取程式碼
   - 右鍵點擊選取的文字
   - 選擇「Copy For AI」選項

2. **鍵盤快捷鍵**
   - 在編輯器中選取程式碼
   - 按下 `Ctrl+Alt+C`（Windows/Linux）或 `Cmd+Alt+C`（Mac）

3. **命令面板**
   - 在編輯器中選取程式碼
   - 按下 `Ctrl+Shift+P` 或 `Cmd+Shift+P` 開啟命令面板
   - 輸入「Copy For AI」並選擇該命令

接著將複製的內容貼到 ChatGPT、Claude 或其他 AI 工具中，即可保持程式碼的格式和上下文。

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

### 發佈到 VSCode 市集

1. 在 [Azure DevOps](https://dev.azure.com/) 創建帳號
2. 創建一個組織和 Personal Access Token (PAT)
3. 使用以下命令發佈：

```bash
# 登入
vsce login <發布者名稱>

# 發佈
vsce publish
```

詳細的發佈指南請參考 [VSCode 官方文件](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。

## 授權

MIT