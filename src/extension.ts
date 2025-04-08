// src/extension.ts
import * as vscode from 'vscode';
import { processCode, removeComments } from './codeAnalyzer';
import { formatOutput } from './formatter';
import { ContextExplorerProvider } from './contextExplorer/contextExplorerProvider'; // 確認路徑正確
import { Snippet } from './contextExplorer/types'; // 引入 Snippet
import { FileTreeService } from './contextExplorer/fileTreeService'; // 需要 FileTreeService 來估算 token

/**
 * 當擴展被啟動時執行
 * @param context 擴展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('擴展 "copy-for-ai" 已啟動！');

    // 創建 Context Explorer 提供者
    const contextExplorerProvider = new ContextExplorerProvider(context); // 實例化 Provider

    // 註冊基本的複製命令
    const basicCopyCommand = vscode.commands.registerCommand('copy-for-ai.copyForAI', async () => {
        await copyForAI(false);
    });

    // 註冊帶有上下文的複製命令
    const contextCopyCommand = vscode.commands.registerCommand('copy-for-ai.copyForAIWithContext', async () => {
        await copyForAI(true);
    });

    // 註冊 Context Explorer 視圖
    const contextExplorerView = vscode.window.registerWebviewViewProvider(
        ContextExplorerProvider.viewType,
        contextExplorerProvider // 註冊 Provider 實例
    );

    const openSettingsCommand = vscode.commands.registerCommand('copy-for-ai.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'copyForAI');
    });

    // 註冊 Context Explorer 的刷新命令，調用 Provider 的公共方法
    context.subscriptions.push(
        vscode.commands.registerCommand('copy-for-ai.contextExplorer.refresh', () => {
            contextExplorerProvider.refreshFiles(); // 調用 Provider 的方法
        })
    );

    // 註冊添加檔案到 Context Explorer 的命令
    const addFileToExplorerCommand = vscode.commands.registerCommand('copy-for-ai.addFileToExplorer', async (fileUri?: vscode.Uri) => {
        const targetUri = fileUri ?? vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
            vscode.window.showErrorMessage('無法獲取檔案路徑');
            return;
        }
        await contextExplorerProvider.addFileToExplorer(targetUri.fsPath); // 調用 Provider 的方法
    });

    // 註冊添加資料夾到 Context Explorer 的命令
    const addFolderToExplorerCommand = vscode.commands.registerCommand('copy-for-ai.addFolderToExplorer', async (folderUri?: vscode.Uri) => {
         if (!folderUri) {
            vscode.window.showErrorMessage('無法獲取資料夾路徑');
            return;
        }
        await contextExplorerProvider.addFolderToExplorer(folderUri.fsPath); // 調用 Provider 的方法
    });

    // 註冊從編輯器頁籤添加檔案到 Context Explorer 的命令
    const addEditorTabToExplorerCommand = vscode.commands.registerCommand('copy-for-ai.addEditorTabToExplorer', async (resource: any) => {
        let fileUri: vscode.Uri | undefined;

        // 檢查傳入的資源類型
        if (resource instanceof vscode.Uri) {
            fileUri = resource;
        } else if (vscode.window.activeTextEditor) {
            fileUri = vscode.window.activeTextEditor.document.uri;
        }

        if (!fileUri) {
            vscode.window.showErrorMessage('無法獲取當前編輯器中的檔案');
            return;
        }
        await contextExplorerProvider.addFileToExplorer(fileUri.fsPath); // 調用 Provider 的方法
    });

    // *** 新增：註冊添加程式碼片段到 Context Explorer 的命令 ***
    const addSnippetToExplorerCommand = vscode.commands.registerCommand('copy-for-ai.addSnippetToExplorer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('沒有開啟的編輯器');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('請先選取一段程式碼');
            return;
        }

        const document = editor.document;
        const filePath = document.uri.fsPath;
        const relativePath = vscode.workspace.asRelativePath(filePath);
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const code = document.getText(selection);
        const languageId = document.languageId;

        // 估算 Token (需要 FileTreeService 實例，這裡假設 Provider 內部有)
        // 注意：這裡直接訪問 Provider 的內部 service 可能不是最佳實踐，但為了快速實現暫時這樣做
        // 更好的方式是將 token 估算邏輯提取到一個獨立的工具函數或服務中
        let estimatedTokens = 0;
        if (contextExplorerProvider['_service'] && contextExplorerProvider['_service']['_fileTreeService']) {
             // 估算 token 時，我們需要一個臨時檔案或直接傳遞內容
             // 這裡我們模擬一個臨時檔案路徑來調用 estimateTokens，或者修改 estimateTokens 接受內容
             // 為了簡單起見，我們基於內容長度估算
             estimatedTokens = Math.ceil(code.length / 4); // 沿用之前的粗略估算
        } else {
            console.warn('無法訪問 FileTreeService 來估算 Token');
            estimatedTokens = Math.ceil(code.length / 4); // 備用估算
        }


        // 讀取設定，看是否需要包含結構和引用
        const config = vscode.workspace.getConfiguration('copyForAI');
        const includeStructure = config.get<boolean>('includeStructureInfo', true);
        const includeImports = config.get<boolean>('includeRelatedImports', true);
        const includeComments = config.get<boolean>('includeComments', true); // 片段是否移除註解

        let structure: string | undefined;
        let imports: string | undefined;
        let processedCode = code; // 預設使用原始程式碼

        try {
            // 分析結構和引用
            const analysisResult = await processCode(document, selection, {
                includeStructure,
                includeImports,
                includeComments // 傳遞註解選項
            });
            structure = analysisResult.structure;
            imports = analysisResult.imports;
            processedCode = analysisResult.code; // 使用處理過的程式碼 (可能移除了註解)

            // 正規化縮排 (可選，看是否需要在片段中也處理)
            // processedCode = normalizeIndentation(processedCode);

        } catch(error) {
            console.error('分析程式碼片段上下文時出錯:', error);
            vscode.window.showErrorMessage('分析程式碼片段上下文時出錯');
            // 即使分析失敗，仍然可以添加原始碼片段
            processedCode = includeComments ? code : removeComments(code); // 根據設定決定是否移除註解
        }


        const snippet: Snippet = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // 生成唯一 ID
            filePath: filePath,
            relativePath: relativePath,
            startLine: startLine,
            endLine: endLine,
            code: processedCode, // 儲存處理過的程式碼
            languageId: languageId,
            estimatedTokens: estimatedTokens, // 使用估算的 token
            structure: structure, // 儲存分析結果
            imports: imports      // 儲存分析結果
        };

        // 調用 Provider 的方法來添加片段
        await contextExplorerProvider.addSnippetToExplorer(snippet);
    });


    context.subscriptions.push(
        basicCopyCommand,
        contextCopyCommand,
        contextExplorerView,
        openSettingsCommand,
        addFileToExplorerCommand,
        addFolderToExplorerCommand,
        addEditorTabToExplorerCommand,
        addSnippetToExplorerCommand // *** 新增：註冊命令 ***
    );

    // 註冊檔案關聯擴展
    registerFileAssociations();
}

/**
 * 註冊檔案關聯擴展
 * 確保 .mjs 和 .cjs 等檔案類型能正確識別
 */
function registerFileAssociations() {
    // 設定 .mjs 檔案為 JavaScript
    vscode.languages.setLanguageConfiguration('javascript', {
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
    });

    // 確保 .mjs 和 .cjs 檔案被識別為 JavaScript
    const jsConfig = vscode.workspace.getConfiguration('files');
    const associations = jsConfig.get<{[key: string]: string}>('associations', {});

    // 檢查是否已經有相關關聯
    let hasChanged = false;

    if (!associations['*.mjs']) {
        associations['*.mjs'] = 'javascript';
        hasChanged = true;
    }

    if (!associations['*.cjs']) {
        associations['*.cjs'] = 'javascript';
        hasChanged = true;
    }

    // 如果有變更，更新設定
    if (hasChanged) {
        jsConfig.update('associations', associations, vscode.ConfigurationTarget.Global);
    }
}

/**
 * 複製程式碼到剪貼簿（適用於 AI 分析）
 * @param includeContext 是否包含上下文資訊
 */
async function copyForAI(includeContext: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('沒有開啟的編輯器');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('沒有選取任何程式碼');
        return;
    }

    // 顯示進度指示（如果需要上下文分析）
    if (includeContext) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "分析程式碼...",
            cancellable: false
        }, async (progress) => {
            await doCopy(editor, selection, includeContext, progress);
        });
    } else {
        await doCopy(editor, selection, includeContext);
    }
}

/**
 * 執行複製操作
 * @param editor 編輯器
 * @param selection 選取範圍
 * @param includeContext 是否包含上下文
 * @param progress 進度報告（可選）
 */
async function doCopy(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    includeContext: boolean,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
) {
    const document = editor.document;
    const text = document.getText(selection);
    const fileName = document.fileName;
    const relativePath = vscode.workspace.asRelativePath(fileName);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const languageId = document.languageId;

    // 讀取設定
    const config = vscode.workspace.getConfiguration('copyForAI');
    let outputFormat = config.get<string>('outputFormat', 'markdown');

    // 確保格式是有效的，否則使用預設值
    if (!['markdown', 'xml', 'json', 'custom'].includes(outputFormat)) {
        outputFormat = 'markdown';
        vscode.window.showWarningMessage(`不支援的輸出格式: ${outputFormat}，已改用預設 Markdown 格式`);
    }

    // 檢查是否需要過濾註解
    const includeComments = config.get<boolean>('includeComments', true);

    // 處理程式碼（包括結構分析等）
    let extraContext: any = {};
    let processedCode = text;

    if (includeContext) {
        progress?.report({ message: "分析程式碼結構..." });

        const includeStructure = config.get<boolean>('includeStructureInfo', true);
        const includeImports = config.get<boolean>('includeRelatedImports', true);

        const result = await processCode(document, selection, {
            includeStructure,
            includeImports,
            includeComments // 傳遞註解選項
        });

        extraContext.structure = result.structure;
        extraContext.imports = result.imports;
        processedCode = result.code; // 使用處理過的程式碼
    } else if (!includeComments) {
        // 僅移除註解但不需要上下文分析
        processedCode = removeComments(text);
    }

    // 處理程式碼縮排
    processedCode = normalizeIndentation(processedCode);

    // 格式化輸出
    const formattedOutput = formatOutput({
        format: outputFormat as any,
        filePath: relativePath,
        startLine,
        endLine,
        languageId,
        code: processedCode, // 使用處理過的程式碼
        ...extraContext
    });

    // 複製到剪貼簿
    await vscode.env.clipboard.writeText(formattedOutput);

    // 顯示成功訊息
    if (includeContext) {
        vscode.window.showInformationMessage(`已複製程式碼和上下文到剪貼簿 (格式: ${outputFormat})`);
    } else {
        vscode.window.showInformationMessage('已複製程式碼到剪貼簿');
    }
}

/**
 * 正規化程式碼縮排
 * @param code 原始程式碼
 * @returns 處理後的程式碼
 */
function normalizeIndentation(code: string): string {
    const lines = code.split('\n');

    // 找出共同的前導空白字元數量 (非空白行)
    let minIndent = Number.MAX_VALUE;
    for (const line of lines) {
        // 跳過空白行
        if (line.trim().length === 0) {
            continue;
        }
        // 計算每行前面有多少空白
        const indent = line.search(/\S|$/);
        if (indent < minIndent) {
            minIndent = indent;
        }
    }

    // 如果全都是空白行，設置為0
    if (minIndent === Number.MAX_VALUE) {
        minIndent = 0;
    }

    // 移除共同的前導空白，確保所有行都從第一欄開始
    const processedLines = lines.map(line => {
        // 處理空白行
        if (line.trim().length === 0) {
            return '';
        }
        // 移除每行的共同前導空白字元
        return line.substring(minIndent);
    });

    return processedLines.join('\n');
}

/**
 * 當擴展被停用時執行
 */
export function deactivate() {}