import * as vscode from 'vscode';
import { getLanguageKeywords } from './languageSupport';
import strip from 'strip-comments';

/**
 * 程式碼處理選項
 */
export interface CodeProcessingOptions {
    includeStructure: boolean;
    includeImports: boolean;
    includeComments: boolean;
}

/**
 * 移除程式碼中的註解
 * @param code 原始程式碼
 * @param languageId 語言 ID
 * @returns 去除註解後的程式碼
 */
export function removeComments(code: string): string {
    // 使用 strip-comments 套件移除註解
    return strip(code, {
        preserveNewlines: false
    });
}

/**
 * 處理程式碼，分析結構和相關引用
 * @param document 文件
 * @param selection 選取範圍
 * @param options 處理選項
 * @returns 分析結果
 */
export async function processCode(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    options: CodeProcessingOptions
): Promise<{ structure?: string; imports?: string; code: string }> {
    const selectedCode = document.getText(selection);
    const result: { structure?: string; imports?: string; code: string } = {
        code: options.includeComments ? selectedCode : removeComments(selectedCode)
    };
    
    // 獲取結構資訊
    if (options.includeStructure) {
        result.structure = await analyzeStructure(document, selection);
    }
    
    // 獲取相關的引用/匯入
    if (options.includeImports) {
        // 注意使用處理過的程式碼來尋找引用
        result.imports = await findRelevantImports(document, result.code);
    }
    
    return result;
}

/**
 * 分析程式碼結構
 * @param document 文件
 * @param selection 選取範圍
 * @returns 結構資訊字串
 */
async function analyzeStructure(
    document: vscode.TextDocument,
    selection: vscode.Selection
): Promise<string> {
    try {
        // 獲取文件中的所有符號
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        if (!symbols || symbols.length === 0) {
            return "無法識別程式碼結構";
        }

        // 找出包含選取區域的符號
        const containingSymbols = findContainingSymbols(symbols, selection);
        
        // 格式化符號資訊
        return formatSymbolInfo(containingSymbols, document.languageId);
    } catch (error) {
        console.error('獲取結構資訊時出錯:', error);
        return "無法解析程式碼結構";
    }
}

/**
 * 找出包含選取區域的符號
 * @param symbols 符號列表
 * @param selection 選取範圍
 * @returns 包含該範圍的符號列表
 */
function findContainingSymbols(
    symbols: vscode.DocumentSymbol[],
    selection: vscode.Selection
): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];

    function traverse(symbolList: vscode.DocumentSymbol[]) {
        for (const symbol of symbolList) {
            if (rangeContains(symbol.range, selection)) {
                result.push(symbol);
                
                if (symbol.children && symbol.children.length > 0) {
                    traverse(symbol.children);
                }
            }
        }
    }

    traverse(symbols);

    // 按照符號範圍大小排序（從大到小，即從外層到內層）
    result.sort((a, b) => {
        const aSize = (a.range.end.line - a.range.start.line) * 1000 + (a.range.end.character - a.range.start.character);
        const bSize = (b.range.end.line - b.range.start.line) * 1000 + (b.range.end.character - b.range.start.character);
        return bSize - aSize;
    });

    return result;
}

/**
 * 檢查範圍是否包含另一個範圍
 */
function rangeContains(container: vscode.Range, contained: vscode.Range): boolean {
    if (container.start.line > contained.start.line) {
        return false;
    }
    if (container.end.line < contained.end.line) {
        return false;
    }
    if (container.start.line === contained.start.line && container.start.character > contained.start.character) {
        return false;
    }
    if (container.end.line === contained.end.line && container.end.character < contained.end.character) {
        return false;
    }
    return true;
}

/**
 * 格式化符號資訊
 * @param symbols 符號列表
 * @param languageId 語言 ID
 * @returns 格式化後的字串
 */
function formatSymbolInfo(symbols: vscode.DocumentSymbol[], languageId: string): string {
    if (symbols.length === 0) {
        return "無法識別結構資訊";
    }
    
    const formattedSymbols = symbols.map(symbol => {
        let kind = getSymbolKindName(symbol.kind);
        let detail = getSymbolDetail(symbol, languageId);
        return `- ${kind}: ${symbol.name}${detail}`;
    });
    
    return formattedSymbols.join('\n');
}

/**
 * 獲取符號種類的名稱
 * @param kind 符號種類
 * @returns 符號種類的名稱
 */
function getSymbolKindName(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.File: return "檔案";
        case vscode.SymbolKind.Module: return "模組";
        case vscode.SymbolKind.Namespace: return "命名空間";
        case vscode.SymbolKind.Package: return "套件";
        case vscode.SymbolKind.Class: return "類別";
        case vscode.SymbolKind.Method: return "方法";
        case vscode.SymbolKind.Property: return "屬性";
        case vscode.SymbolKind.Field: return "欄位";
        case vscode.SymbolKind.Constructor: return "建構函數";
        case vscode.SymbolKind.Enum: return "列舉";
        case vscode.SymbolKind.Interface: return "介面";
        case vscode.SymbolKind.Function: return "函數";
        case vscode.SymbolKind.Variable: return "變數";
        case vscode.SymbolKind.Constant: return "常數";
        case vscode.SymbolKind.String: return "字串";
        case vscode.SymbolKind.Number: return "數字";
        case vscode.SymbolKind.Boolean: return "布林值";
        case vscode.SymbolKind.Array: return "陣列";
        case vscode.SymbolKind.Object: return "物件";
        case vscode.SymbolKind.Key: return "鍵";
        case vscode.SymbolKind.Null: return "空值";
        case vscode.SymbolKind.EnumMember: return "列舉成員";
        case vscode.SymbolKind.Struct: return "結構";
        case vscode.SymbolKind.Event: return "事件";
        case vscode.SymbolKind.Operator: return "運算子";
        case vscode.SymbolKind.TypeParameter: return "類型參數";
        default: return "未知";
    }
}

/**
 * 獲取符號的詳細資訊
 * @param symbol 符號
 * @param languageId 語言 ID
 * @returns 格式化的詳細資訊
 */
function getSymbolDetail(symbol: vscode.DocumentSymbol, languageId: string): string {
    if (symbol.kind === vscode.SymbolKind.Function || 
        symbol.kind === vscode.SymbolKind.Method || 
        symbol.kind === vscode.SymbolKind.Constructor) {
        return symbol.detail ? `(${symbol.detail})` : '()';
    } else if (symbol.detail) {
        return `: ${symbol.detail}`;
    }
    return '';
}

/**
 * 從選取的程式碼中提取使用的標識符
 * @param code 程式碼
 * @param languageId 語言 ID
 * @returns 使用的標識符集合
 */
function extractUsedIdentifiers(code: string, languageId: string): Set<string> {
    const identifiers = new Set<string>();
    
    // 使用正則表達式提取可能的標識符
    const identifierRegex = /\b([a-zA-Z_$][\w$]*)\b/g;
    let match;
    
    while ((match = identifierRegex.exec(code)) !== null) {
        identifiers.add(match[1]);
    }
    
    // 過濾掉關鍵字
    const keywords = getLanguageKeywords(languageId);
    if (keywords.length > 0) {
        for (const keyword of keywords) {
            identifiers.delete(keyword);
        }
    }
    
    return identifiers;
}

/**
 * 尋找與選取程式碼相關的引用/匯入語句
 * @param document 文件
 * @param selectedCode 選取的程式碼
 * @returns 相關的引用/匯入語句
 */
async function findRelevantImports(document: vscode.TextDocument, selectedCode: string): Promise<string> {
    const languageId = document.languageId;
    
    // 從選取的程式碼中提取使用的標識符
    const usedIdentifiers = extractUsedIdentifiers(selectedCode, languageId);
    
    // 尋找引用的正則表達式
    const importPatterns: Record<string, RegExp> = {
        'typescript': /^import .* from ['"].*['"];?$/gm,
        'javascript': /^(import .* from ['"].*['"];?|const .* = require\(['"].*['"]\);?)$/gm,
        'python': /^(import .*|from .* import .*)$/gm,
        'java': /^import .*;$/gm,
        'csharp': /^using .*;$/gm,
        'cpp': /^#include .*$/gm,
        'go': /^import (\([\s\S]*?\)|".*")$/gm,
    };
    
    const pattern = importPatterns[languageId] || /^(import|using|require|include|#include|from)/gm;
    
    // 獲取文件全文
    const fullText = document.getText();
    
    // 匹配所有引用語句
    const allImports: string[] = [];
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
        allImports.push(match[0]);
    }
    
    // 檢查每個引用語句是否包含使用的標識符
    const relevantImports: string[] = [];
    for (const importStmt of allImports) {
        for (const identifier of usedIdentifiers) {
            if (importStmt.includes(identifier)) {
                relevantImports.push(importStmt);
                break;
            }
        }
    }
    
    return relevantImports.join('\n');
}