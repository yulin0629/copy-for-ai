# 歡迎使用您的 VS Code 擴充功能

## 資料夾內容

* 此資料夾包含擴充功能所需的所有檔案。
* `package.json` - 這是宣告擴充功能和指令的設定檔。
  * 範例插件註冊了一個指令並定義其標題和指令名稱。有了這些資訊，VS Code 可以在指令面板中顯示該指令。目前還不需要載入插件。
* `src/extension.ts` - 這是提供指令實作的主要檔案。
  * 該檔案匯出一個函數 `activate`，該函數會在擴充功能首次啟動時被呼叫（在本例中是透過執行指令）。在 `activate` 函數中，我們呼叫 `registerCommand`。
  * 我們將包含指令實作的函數作為第二個參數傳遞給 `registerCommand`。

## 設定

* 安裝建議的擴充功能（amodio.tsl-problem-matcher、ms-vscode.extension-test-runner 和 dbaeumer.vscode-eslint）。

## 立即開始使用

* 按下 `F5` 以開啟一個新視窗並載入您的擴充功能。
* 從指令面板執行您的指令，按下 (`Ctrl+Shift+P` 或 Mac 上的 `Cmd+Shift+P`) 並輸入 `Hello World`。
* 在 `src/extension.ts` 中設定中斷點以進行除錯。
* 在除錯主控台中查看擴充功能的輸出。

## 進行變更

* 在 `src/extension.ts` 中更改程式碼後，您可以從除錯工具列重新啟動擴充功能。
* 您也可以重新載入 (`Ctrl+R` 或 Mac 上的 `Cmd+R`) 包含擴充功能的 VS Code 視窗以載入您的變更。

## 探索 API

* 您可以開啟 `node_modules/@types/vscode/index.d.ts` 檔案以查看完整的 API。

## 執行測試

* 安裝 [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)。
* 透過 **Tasks: Run Task** 指令執行 "watch" 任務。確保此任務正在執行，否則可能無法發現測試。
* 從活動列開啟測試視圖，然後點擊「執行測試」按鈕，或使用快捷鍵 `Ctrl/Cmd + ; A`。
* 在測試結果視圖中查看測試結果的輸出。
* 對 `src/test/extension.test.ts` 進行變更或在 `test` 資料夾中建立新的測試檔案。
  * 提供的測試執行器只會考慮符合名稱模式 `**.test.ts` 的檔案。
  * 您可以在 `test` 資料夾中建立資料夾以任何方式組織您的測試。

## 進一步探索

* 透過 [打包您的擴充功能](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) 來減少擴充功能的大小並提高啟動時間。
* 在 VS Code 擴充功能市場上 [發布您的擴充功能](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。
* 透過設定 [持續整合](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) 來自動化建置。
