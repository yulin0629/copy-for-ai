# Copy For AI

這是一個簡單的 VSCode 擴展，讓你能夠將選取的程式碼以 AI 友善的 Markdown 格式複製到剪貼簿。

## 功能

當你在編輯器中選取一段程式碼後，右鍵選單中會出現「Copy For AI」選項。點擊此選項後，擴展會：

1. 保持程式碼的相對縮排，但移除共同的前導空格
2. 將程式碼轉換為 Markdown 格式
3. 添加檔案路徑和行號資訊
4. 自動偵測程式語言
5. 將結果複製到剪貼簿

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

1. 在編輯器中選取程式碼
2. 右鍵選單 -> 選擇「Copy For AI」
3. 將複製的內容貼到 ChatGPT、Claude 或其他 AI 工具中

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

### 建置
```bash
npm run compile
```

### 監視模式
```bash
npm run watch
```

### 打包
```bash
npm run package
```

## 授權

MIT