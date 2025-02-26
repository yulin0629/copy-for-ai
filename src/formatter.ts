import * as vscode from 'vscode';

/**
 * 輸出格式選項
 */
export enum OutputFormat {
    Markdown = 'markdown',
    XML = 'xml',
    JSON = 'json',
    Custom = 'custom'
}

/**
 * 格式化選項
 */
export interface FormatOptions {
    format: OutputFormat;
    filePath: string;
    startLine: number;
    endLine: number;
    languageId: string;
    code: string;
    structure?: string;
    imports?: string;
}

/**
 * 格式化輸出
 * @param options 格式化選項
 * @returns 格式化後的字串
 */
export function formatOutput(options: FormatOptions): string {
    switch (options.format) {
        case OutputFormat.Markdown:
            return formatAsMarkdown(options);
        case OutputFormat.XML:
            return formatAsXML(options);
        case OutputFormat.JSON:
            return formatAsJSON(options);
        case OutputFormat.Custom:
            return formatAsCustom(options);
        default:
            return formatAsMarkdown(options);
    }
}

/**
 * 格式化為 Markdown
 * @param options 格式化選項
 * @returns Markdown 格式的字串
 */
function formatAsMarkdown(options: FormatOptions): string {
    // 基本版本（無結構資訊）
    if (!options.structure && !options.imports) {
        return `## File: ${options.filePath} (${options.startLine}-${options.endLine})\n\n` + 
               `\`\`\`${options.languageId}\n${options.code}\n\`\`\``;
    }
    
    // 增強版本（帶有結構資訊）
    let markdown = `# CODE CONTEXT\n-----------------\n\n`;
    
    // 文件資訊
    markdown += `## File\n${options.filePath} (${options.startLine}-${options.endLine})\n\n`;
    
    // 結構資訊
    if (options.structure) {
        markdown += `## Structure\n${options.structure}\n\n`;
    }
    
    // 引用/匯入資訊
    if (options.imports) {
        markdown += `## Imports\n\`\`\`${options.languageId}\n${options.imports}\n\`\`\`\n\n`;
    }
    
    // 程式碼
    markdown += `## Code\n\`\`\`${options.languageId}\n${options.code}\n\`\`\`\n\n`;
    
    markdown += `-----------------\n`;
    
    return markdown;
}

/**
 * 格式化為 XML
 * @param options 格式化選項
 * @returns XML 格式的字串
 */
function formatAsXML(options: FormatOptions): string {
    let xml = `<codeContext>\n`;
    
    // 文件資訊
    xml += `  <file>${escapeXML(options.filePath)}</file>\n`;
    xml += `  <lineRange>${options.startLine}-${options.endLine}</lineRange>\n`;
    xml += `  <language>${escapeXML(options.languageId)}</language>\n`;
    
    // 結構資訊
    if (options.structure) {
        xml += `  <structure>\n    ${escapeXML(options.structure).replace(/\n/g, '\n    ')}\n  </structure>\n`;
    }
    
    // 引用/匯入資訊
    if (options.imports) {
        xml += `  <imports>\n    ${escapeXML(options.imports).replace(/\n/g, '\n    ')}\n  </imports>\n`;
    }
    
    // 程式碼
    xml += `  <code>\n    ${escapeXML(options.code).replace(/\n/g, '\n    ')}\n  </code>\n`;
    
    xml += `</codeContext>`;
    
    return xml;
}

/**
 * 轉義 XML 特殊字符
 * @param str 輸入字串
 * @returns 轉義後的字串
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 格式化為 JSON
 * @param options 格式化選項
 * @returns JSON 格式的字串
 */
function formatAsJSON(options: FormatOptions): string {
    const jsonObj = {
        codeContext: {
            file: options.filePath,
            lineRange: `${options.startLine}-${options.endLine}`,
            language: options.languageId,
            structure: options.structure,
            imports: options.imports,
            code: options.code
        }
    };
    
    return JSON.stringify(jsonObj, null, 2);
}

/**
 * 格式化為自定義格式
 * @param options 格式化選項
 * @returns 自定義格式的字串
 */
function formatAsCustom(options: FormatOptions): string {
    // 獲取使用者自定義的開始和結束標記
    const config = vscode.workspace.getConfiguration('copyForAI');
    const customFormatBefore = config.get<string>('customFormatBefore', '===== CODE CONTEXT START =====');
    const customFormatAfter = config.get<string>('customFormatAfter', '===== CODE CONTEXT END =====');
    
    let result = `${customFormatBefore}\n`;
    
    // 文件資訊
    result += `FILE: ${options.filePath} (${options.startLine}-${options.endLine})\n`;
    result += `LANGUAGE: ${options.languageId}\n`;
    
    // 結構資訊
    if (options.structure) {
        result += `---\nSTRUCTURE:\n${options.structure}\n`;
    }
    
    // 引用/匯入資訊
    if (options.imports) {
        result += `---\nIMPORTS:\n${options.imports}\n`;
    }
    
    // 程式碼
    result += `---\nCODE:\n${options.code}\n`;
    
    result += `${customFormatAfter}`;
    
    return result;
}