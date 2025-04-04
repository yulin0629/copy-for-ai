# File Explorer Side Bar View 畫面描述

## 畫面規格：Copy for AI - File Explorer Side Bar View

**目的：**

讓使用者在 VSCode 中選取 **目前專案** 的 Files，以便複製其內容作為 AI 模型的上下文 (context)。此視窗將作為 VSCode 的 **(Primary  Side Bar View)** 呈現，使用單一 Webview 實作。

**View 整體佈局：**

垂直堆疊佈局，由上而下分為四個主要區塊：

1. **標題列 (Header)**
2. **篩選區塊 (Filter Area)**
3. **檔案列表區塊 (File List Area)**
4. **底部摘要列含複製按鈕 (Footer Summary Bar)**

**區塊與元素詳細描述：**

### 1. 標題列 (Header)

* **元素類型：** Label (Header)
* **位置：** Webview 頂部
* **元素：**
    * **標題文字：** "Copy for AI - File Explorer"
        * **樣式：** 符合 VSCode 主題的標準樣式。
    * **設定按鈕：** (圖示按鈕) 齒輪圖示
        * **功能：** 開啟設定。
        * **行為：** 點擊後直接開啟 VSCode 這個 extension 的設定。

### 2. 篩選區塊 (Filter Area)

* **元素類型：** 複合元素
* **位置：** 標題列下方
* **元素：**
    * **篩選輸入框：** (文字輸入框) 預設文字 "搜尋檔案..."，位於 Webview 內部頂端
        * **功能：** 允許使用者輸入關鍵字篩選檔案。
        * **行為：** 輸入時在 Webview 中即時篩選檔案清單，根據檔案路徑與名稱進行模糊比對，顯示符合條件的檔案。
        * **左側圖示：** 扁平化的向量圖示 (SVG)，而非表情符號。
    * **清除篩選按鈕 (X 圖示)：** (按鈕)
        * **功能：** 清除篩選框內容。
        * **行為：** 點擊後清空篩選框並重置檔案列表。
        * **可見性：** 只在篩選框有內容時顯示，無內容時隱藏。
    * **顯示已選取開關：** (勾選框) 標籤文字 "僅顯示已選取"
        * **功能：** 切換是否只顯示已選取的檔案。
        * **行為：** 勾選時篩選出所有已選取的檔案，取消勾選時顯示所有檔案。


### 3. 檔案列表區塊 (File List Area)

* **元素類型：** 自訂樹狀結構/列表 (Custom Tree/List Structure)
* **位置：** 篩選區塊下方，Webview 底部摘要列上方
* **實作方式：** 使用 HTML/CSS/JavaScript 在 Webview 中自行實作的樹狀結構/列表
* **初始狀態：** 預設展開根目錄和專案根目錄，其他資料夾摺疊
* **排除規則：** 自動排除 node_modules、.git、.vscode 等常見非程式碼資料夾，同時遵循 .gitignore 規則
* **顯示模式：**
    * **樹狀模式：** 無搜尋條件時，以樹狀結構顯示檔案和資料夾
    * **列表模式：** 有搜尋條件時，以扁平列表顯示符合條件的檔案，並顯示完整路徑

* **元素 (每行)：**
    * **選取框 (Checkbox)：** (HTML Checkbox 元素)
        * **功能：** 選取/取消選取檔案或資料夾。
        * **行為：** 選取資料夾時，Webview 中的 JavaScript 負責自動連帶選取所有子檔案；取消選取資料夾時自動取消選取所有子檔案。
    * **展開/摺疊指示符號：** (HTML 元素或圖示) (僅資料夾且在樹狀模式下)
        * **功能：** 展開/摺疊資料夾，顯示子項目。
        * **行為：** 點擊後由 JavaScript 處理展開或摺疊資料夾，狀態會被記憶並通過通信同步到擴展主程序。
    * **資料夾/檔案圖示：** (圖示)
        * **功能：** 區分資料夾、檔案和專案根目錄。
        * **樣式：** 使用與 VSCode 檔案圖示相似的圖示，與檔案總管視覺風格一致。
        * **專案根目錄：** 使用特殊圖示（如房子圖示）表示。
    * **檔案/資料夾名稱：** (文字標籤)
        * **功能：** 顯示檔案或資料夾名稱。
        * **搜尋模式下：** 同時顯示完整路徑，便於辨識。
    * **tokens數量(百分比)：** (文字標籤) 例如 "1050", "2001(2%)", "10(<1%)"
        * **功能：** 顯示檔案或資料夾的 tokens 數量（資料夾顯示其所有子檔案 tokens 的總和）及其占總容量的比例，有設定 tokens 上限(>0)時，顯示百分比。
        * **位置：** 檔案/資料夾名稱右側。

### 4. 底部摘要列 (Footer Summary Bar)

* **元素類型：** HTML 容器元素
* **位置：** Webview 底部
* **元素：**
    * **選取檔案數量：** (文字標籤) 例如 "6 files selected"
        * **功能：** 顯示已選取的檔案總數。
    * **Tokens 預估資訊：** (文字標籤) 例如 "1234 tokens estimated"
        * **功能：** 顯示目前選取檔案內容的預估 tokens 總量。
    * **Tokens 預估進度條：** (HTML 進度條元素)
        * **功能：** 顯示目前選取檔案 tokens 總量佔上限的比例。
        * **行為：** 隨選取檔案數量變化，由 JavaScript 即時更新。
        * **百分比顯示：** 進度條旁顯示具體百分比數值（例如 "45%"）, 可以超過 100%
        * **顯示條件：** 設定 tokens 上限(>0)時才顯示
    * **複製按鈕：** (主要按鈕) "複製到剪貼簿"
        * **功能：** 將選取的所有檔案內容複製到剪貼簿。
        * **樣式：** 藍色主要按鈕樣式，明顯且易於識別。
        * **行為：** 點擊後向擴展主程序發送複製請求，由主程序處理實際的檔案讀取與複製操作，同時在 Webview 中顯示進度指示器。

**交互流程與反饋：**

1. **複製成功：**
   - 主程序通知 Webview 顯示成功通知提示 "X files copied to clipboard (Y tokens)"
   - 提示可包含「在編輯器中預覽」選項

2. **複製失敗：**
   - 主程序通知 Webview 顯示錯誤通知，說明失敗原因
   
3. **搜尋模式切換：**
   - 當使用者在搜尋框輸入文字時，視圖自動切換為列表模式
   - 當搜尋框清空時，視圖恢復為樹狀模式
   - 列表模式下顯示檔案的完整路徑，便於定位

4. **設定排除規則：**
   - 點擊設定按鈕時直接開啟 VSCode 設定編輯器
   - 設定編輯器定位到排除模式設定
   - 使用者可設定 glob 模式排除不需要的檔案

5. **狀態持久化：**
   - 選取狀態在切換視圖和重啟 VSCode 後保持不變
   - 展開/摺疊狀態也會被保存