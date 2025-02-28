# 新功能 --「Context Explorer」需求與設計規格說明

## 背景與目的

新增一個功能，使用者可以透過 VSCode 內的側邊欄面板 (Side Panel View)，選取目前專案中的多個檔案，將其內容快速複製到剪貼簿，以提供給 AI 模型作為上下文 (context) 使用。此需求源自於經常需要把整個專案的部分程式碼複製給 AI 模型的工作流程需求。

## 主要功能需求

1. **檔案選取與內容複製**
   - 使用者可透過勾選 checkbox 選取多個檔案或資料夾
   - 點擊「Copy to Clipboard」按鈕後，自動將所有勾選檔案的內容複製到剪貼簿中
   - 當勾選資料夾時，自動連帶勾選其內所有子檔案；取消勾選資料夾時，也自動取消勾選其內所有子檔案
   - 勾選與取消時，面板底部的摘要列應立即反映最新的檔案數量及預估 Tokens 總量

2. **檔案列表與篩選功能**
   - 檔案列表呈現為可展開與摺疊的樹狀結構
   - 提供模糊篩選功能，使用者輸入關鍵字後，即時過濾檔案列表，僅顯示檔案名稱符合條件的檔案
   - 篩選功能僅根據檔案名稱進行比對，不需額外排序
   - 提供一個開關，可讓使用者選擇是否只顯示已勾選的檔案

3. **狀態持久化與自動更新**
   - Context Explorer 的狀態 (如選取勾選狀態、資料夾展開或摺疊狀態) 應在 VSCode 關閉後保留，下次開啟時恢復
   - 若上次勾選的檔案已經被刪除或不存在，則下次開啟時自動取消該檔案的勾選狀態，並即時更新摘要列資訊

## 性能處理策略

1. **大型專案和檔案處理**
   - 實作延遲加載機制，優先載入可見範圍的檔案列表
   - 設定單一檔案大小上限（例如 5MB），超過上限的檔案需要警告使用者

2. **篩選性能優化**
   - 實作篩選節流（debounce，約 300ms），減少頻繁輸入時的性能問題
   - 使用效率高的模糊比對演算法，支援大型專案篩選
   - 僅在檔案名稱上執行篩選，不篩選檔案內容

3. **檔案系統限制**
   - 預設排除特定類型的檔案或資料夾（如 node_modules、.git、build、dist、bin 等）
   - 忽略二進制檔案、圖片等非文字檔案

## 狀態持久化機制

1. **儲存機制**
   - 使用 extensionContext.globalState 存儲使用者勾選狀態和資料夾展開/摺疊狀態
   - 按專案區分儲存狀態，避免跨專案干擾

2. **檔案監控與狀態更新**
   - 使用 VSCode 的檔案系統監控 API（FileSystemWatcher）監聽檔案變化
   - 當檔案被刪除、移動或重命名時，自動更新選擇狀態

## 輸出格式與現有功能整合

1. **輸出格式**
   - 使用與現有 Copy For AI 功能相同的基本格式（簡單格式，無上下文分析）
   - 應用現有的 copyForAI.outputFormat 設定（markdown、xml、json、custom）
   - 複製整個檔案時不顯示行數，直接以檔案名稱作為標題
   - 不使用 Copy For AI (With Context) 的進階功能

2. **交互方式**
   - 提供固定的側邊欄


## 輸出格式範例

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

## File: src/file2.ts
```typescript
export function activate(context: vscode.ExtensionContext) {
    console.log('擴展 "copy-for-ai" 已啟動！');
}
```
````