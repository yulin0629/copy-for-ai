// src/contextExplorer/fileInfoReader.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jschardet from 'jschardet'; // 導入編碼檢測套件

/**
 * 負責讀取檔案內容和獲取檔案資訊 (如語言 ID)
 */
export class FileInfoReader {
    private _outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
    }

    /**
     * 輸出日誌
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileInfoReader] ${message}`);
    }

    /**
     * 輸出錯誤日誌
     */
    private _logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [FileInfoReader] 錯誤: ${message}`);
        if (error) {
            const details = error instanceof Error ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}` : String(error);
            this._outputChannel.appendLine(`詳細資訊: ${details}`);
        }
    }

    /**
     * 根據檔案路徑獲取語言 ID
     */
    public getLanguageId(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();

        // 檔案副檔名對應到語言 ID
        // 保持與原 FileTreeService 一致
        const extensionMap: Record<string, string> = {
            '.js': 'javascript',
            '.mjs': 'javascript',
            '.cjs': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascriptreact',
            '.tsx': 'typescriptreact',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.rs': 'rust',
            '.kt': 'kotlin',
            '.md': 'markdown',
            '.cshtml': 'razor',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.xml': 'xml',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.sh': 'shellscript',
            '.bat': 'bat',
            '.ps1': 'powershell',
            '.sql': 'sql',
            '.dockerfile': 'dockerfile',
            '.gitignore': 'gitignore',
            '.env': 'dotenv',
            '.conf': 'properties', // 常見設定檔
            '.ini': 'ini',
            '.toml': 'toml',
            '.lua': 'lua',
            '.dart': 'dart',
            '.scala': 'scala',
            '.groovy': 'groovy',
            '.r': 'r',
            '.perl': 'perl',
            '.ex': 'elixir', // Elixir
            '.exs': 'elixir', // Elixir Script
            '.vue': 'vue',
            '.svelte': 'svelte',
            '.graphql': 'graphql',
            '.tf': 'terraform', // Terraform
            '.hcl': 'terraform', // Terraform HCL
            '.gradle': 'groovy', // Gradle files often use Groovy
            '.csproj': 'xml', // C# project file
            '.vb': 'vb', // Visual Basic
            '.fs': 'fsharp', // F#
            '.fsi': 'fsharp', // F# signature file
            '.fsx': 'fsharp', // F# script file
            '.xaml': 'xml', // XAML files
            '.tex': 'latex', // LaTeX
            '.bib': 'bibtex', // BibTeX
            '.jl': 'julia', // Julia
            '.cr': 'crystal', // Crystal
            '.nim': 'nim', // Nim
            '.d': 'd', // D language
            '.pas': 'pascal', // Pascal
            '.pl': 'perl', // Perl
            '.pm': 'perl', // Perl module
            '.t': 'perl', // Perl test file
            '.asm': 'assembly', // Assembly language (generic)
            '.s': 'assembly', // Assembly language (common extension)
            '.clj': 'clojure', // Clojure
            '.cljs': 'clojure', // ClojureScript
            '.cljc': 'clojure', // Clojure/ClojureScript common
            '.edn': 'clojure', // EDN data format
            '.erl': 'erlang', // Erlang
            '.hrl': 'erlang', // Erlang header
            '.hs': 'haskell', // Haskell
            '.lhs': 'haskell', // Literate Haskell
            '.elm': 'elm', // Elm
            '.purs': 'purescript', // PureScript
            '.zig': 'zig', // Zig
            '.v': 'vlang', // V language
            '.sol': 'solidity', // Solidity
            '.abap': 'abap', // ABAP
            '.ada': 'ada', // Ada
            '.cob': 'cobol', // COBOL
            '.f': 'fortran', // Fortran (fixed-form)
            '.f90': 'fortran', // Fortran (free-form)
            '.f95': 'fortran',
            '.f03': 'fortran',
            '.f08': 'fortran',
            '.lisp': 'lisp', // Lisp
            '.lsp': 'lisp',
            '.ml': 'ocaml', // OCaml
            '.mli': 'ocaml', // OCaml interface
            '.mll': 'ocaml', // OCaml lexer
            '.mly': 'ocaml', // OCaml parser
            '.pro': 'prolog', // Prolog
            '.plg': 'prolog',
            '.scheme': 'scheme', // Scheme
            '.scm': 'scheme',
            '.tcl': 'tcl', // TCL
            '.sv': 'systemverilog', // SystemVerilog
            '.svh': 'systemverilog',
            '.vhd': 'vhdl', // VHDL
            '.vhdl': 'vhdl',
        };

        // 處理無副檔名的常見設定檔
        const basename = path.basename(filePath).toLowerCase();
        const noExtMap: Record<string, string> = {
            'dockerfile': 'dockerfile',
            '.gitignore': 'gitignore', // 雖然有 '.' 但視為無副檔名處理
            'makefile': 'makefile',
            'cmakelists.txt': 'cmake',
            'requirements.txt': 'pip-requirements',
            'gemfile': 'ruby',
            'rakefile': 'ruby',
            'build.gradle': 'groovy',
            'settings.gradle': 'groovy',
            'pom.xml': 'xml', // Maven POM
            'package.json': 'json',
            'composer.json': 'json',
            'tsconfig.json': 'jsonc', // tsconfig often allows comments
            'jsconfig.json': 'jsonc',
            '.babelrc': 'json',
            '.eslintrc.js': 'javascript',
            '.eslintrc.json': 'json',
            '.prettierrc': 'json',
            '.vimrc': 'viml', // Vim Script
            '.bashrc': 'shellscript',
            '.zshrc': 'shellscript',
            '.profile': 'shellscript',
            'license': 'plaintext', // 通常是純文字
            'readme': 'markdown', // 通常是 Markdown
        };

        if (noExtMap[basename]) {
            return noExtMap[basename];
        }

        return extensionMap[extension] || 'plaintext'; // 預設為純文字
    }

    /**
     * 讀取檔案內容，自動偵測編碼
     */
    public readFileContent(filePath: string): string | null {
        try {
            // 檢查檔案是否存在
            if (!fs.existsSync(filePath)) {
                this._logError(`檔案不存在: ${filePath}`);
                return null;
            }

            // 讀取檔案為 Buffer
            const buffer = fs.readFileSync(filePath);

            // 如果檔案為空，直接返回空字串
            if (buffer.length === 0) {
                this._log(`檔案為空: ${filePath}`);
                return "";
            }

            // 偵測檔案編碼
            // jschardet 對於純 ASCII 或 UTF-8 (無 BOM) 可能會誤判
            // 優先嘗試 UTF-8，如果失敗再使用偵測結果
            let fileContent: string | null = null;
            let detectedEncoding: string | null = null;

            try {
                fileContent = buffer.toString('utf8');
                // 簡單檢查是否亂碼 (尋找常見的亂碼符號 �)
                if (fileContent.includes('\uFFFD')) {
                    this._log(`檔案 ${path.basename(filePath)} 使用 UTF-8 讀取時可能包含亂碼，嘗試偵測編碼...`);
                    fileContent = null; // 重置 fileContent，以便後續使用偵測的編碼
                } else {
                    this._log(`檔案 ${path.basename(filePath)} 已成功使用 UTF-8 讀取`);
                    return fileContent; // UTF-8 讀取成功且無明顯亂碼
                }
            } catch (utf8Error) {
                 this._log(`檔案 ${path.basename(filePath)} 使用 UTF-8 讀取失敗，嘗試偵測編碼...`);
                 fileContent = null;
            }


            // 如果 UTF-8 讀取失敗或包含亂碼，則進行編碼偵測
            if (fileContent === null) {
                try {
                    const detection = jschardet.detect(buffer);
                    // 只在偵測可信度較高時使用偵測結果
                    if (detection && detection.encoding && detection.confidence > 0.5) {
                        detectedEncoding = detection.encoding.toLowerCase();
                        this._log(`檔案 ${path.basename(filePath)} 的偵測編碼為: ${detectedEncoding} (可信度: ${detection.confidence.toFixed(2)})`);

                        // 檢查 Node.js 是否支援此編碼
                        if (Buffer.isEncoding(detectedEncoding)) {
                            fileContent = buffer.toString(detectedEncoding as BufferEncoding);
                            // 再次檢查亂碼
                            if (fileContent.includes('\uFFFD')) {
                                this._log(`使用偵測到的編碼 ${detectedEncoding} 讀取 ${path.basename(filePath)} 仍可能包含亂碼，回退至 UTF-8 (忽略錯誤)`);
                                fileContent = buffer.toString('utf8', 0, buffer.length); // 忽略錯誤再次嘗試 UTF-8
                            }
                        } else {
                            this._log(`Node.js 不支援偵測到的編碼 ${detectedEncoding}，回退至 UTF-8 (忽略錯誤)`);
                            fileContent = buffer.toString('utf8', 0, buffer.length); // 忽略錯誤嘗試 UTF-8
                        }
                    } else {
                        this._log(`編碼偵測失敗或可信度低 (${detection?.confidence?.toFixed(2)})，回退至 UTF-8 (忽略錯誤)`);
                        fileContent = buffer.toString('utf8', 0, buffer.length); // 忽略錯誤嘗試 UTF-8
                    }
                } catch (detectError) {
                     this._logError(`讀取或偵測檔案 ${path.basename(filePath)} 編碼時出錯`, detectError);
                     this._log(`回退至 UTF-8 (忽略錯誤)`);
                     fileContent = buffer.toString('utf8', 0, buffer.length); // 最終回退
                }
            }


            // 如果檔案內容為空或無法讀取，返回 null
            if (fileContent === null || fileContent === undefined) {
                this._logError(`檔案內容無法讀取: ${filePath}`);
                return null;
            }

            return fileContent;
        } catch (error) {
            this._logError(`讀取檔案 ${filePath} 時出錯`, error);
            return null;
        }
    }
}