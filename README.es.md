## 🌐 Idiomas | Languages
[English](README.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md)

# Copy For AI

Esta es una poderosa extensión de VSCode que te permite copiar el código seleccionado al portapapeles en un formato amigable para la IA, incluyendo opcionalmente información de contexto para facilitar a las herramientas de IA la comprensión de tu código.

## Características

Esta extensión proporciona tres características principales, permitiéndote elegir la que mejor se adapte a tus necesidades:

### 1. Funcionalidad de Copia Básica

1. **Preservar la Indentación Relativa** - Elimina los espacios comunes al principio para alinear el código de manera ordenada
2. **Convertir a Formato Markdown** - Agrega automáticamente resaltado de sintaxis
3. **Incluir Ruta del Archivo y Números de Línea** - Proporciona contexto básico para el código

### 2. Funcionalidad de Copia Mejorada (con Contexto)

Además de las características básicas, también proporciona:

1. **Análisis de la Estructura del Código** - Identifica automáticamente la función, clase, espacio de nombres, etc., donde se encuentra el área seleccionada
2. **Identificación de Importaciones Relacionadas** - Encuentra inteligentemente las declaraciones de importación relacionadas con el código seleccionado
3. **Múltiples Formatos de Salida** - Soporta Markdown, XML, JSON y formatos personalizados
4. **Soporte Multilenguaje** - Soporta la mayoría de los lenguajes de programación principales

### 3. Explorador de Archivos (Context Explorer)

Una nueva característica que te permite seleccionar y copiar fácilmente múltiples archivos:

1.  **Selección Múltiple de Archivos/Fragmentos** - Usa la interfaz del explorador de archivos para seleccionar múltiples archivos o fragmentos de código.
2.  **Selección de Carpeta en Lote** - Seleccionar una carpeta selecciona automáticamente todos sus archivos hijos.
3.  **Filtro de Búsqueda de Archivos/Fragmentos** - Filtra y muestra rápidamente los archivos o fragmentos que necesitas.
4.  **Estimación de Tokens** - Muestra el número total estimado de tokens y el porcentaje para los elementos seleccionados (archivos + fragmentos).
5.  **Persistencia del Estado** - Recuerda tu selección, estado de expansión y fragmentos guardados.
6.  **Integración con el Menú Contextual** - Soporta agregar archivos/carpetas directamente desde el explorador de archivos y las pestañas del editor.
7.  **Selección de Rango** - Soporta mantener presionada la tecla Shift y hacer clic en la casilla de verificación para seleccionar rápidamente múltiples archivos o fragmentos dentro de un rango.
8.  **Selección de Elementos** - Soporta hacer clic en toda la fila en la lista de archivos o fragmentos para alternar el estado de selección, haciendo la operación más intuitiva.
9.  **Soporte de Fragmentos de Código (Snippets)**:
    *   Selecciona código desde el editor, haz clic derecho y elige "Add Snippet to Copy For AI Explorer" para guardar el fragmento.
    *   Administra fragmentos en una sección separada "Code Snippets" en el explorador.
    *   Soporta seleccionar, copiar, previsualizar (clic para saltar a la ubicación del código fuente) y eliminar fragmentos.
    *   Los fragmentos guardarán información de contexto (opcional, basado en la configuración).
10. **Secciones Colapsables**: La lista de archivos y la lista de fragmentos de código ahora están en secciones colapsables de manera independiente.

## Uso

Puedes usar esta característica de las siguientes maneras:

### 1. Copia Básica (sin Contexto)

**Menú Contextual:**
- Selecciona código en el editor
- Haz clic derecho en el texto seleccionado
- Elige la opción "Copy For AI"

**Atajo de Teclado:**
- Selecciona código en el editor
- Presiona `Ctrl+Alt+C` (Windows/Linux) o `Cmd+Alt+C` (Mac)

**Paleta de Comandos:**
- Selecciona código en el editor
- Presiona `Ctrl+Shift+P` o `Cmd+Shift+P` para abrir la paleta de comandos
- Escribe "Copy For AI" y elige el comando

### 2. Copia Mejorada (con Contexto)

**Menú Contextual:**
- Selecciona código en el editor
- Haz clic derecho en el texto seleccionado
- Elige la opción "Copy For AI (With Context)"

**Atajo de Teclado:**
- Selecciona código en el editor
- Presiona `Ctrl+Alt+Shift+C` (Windows/Linux) o `Cmd+Alt+Shift+C` (Mac)

**Paleta de Comandos:**
- Selecciona código en el editor
- Presiona `Ctrl+Shift+P` o `Cmd+Shift+P` para abrir la paleta de comandos
- Escribe "Copy For AI (With Context)" y elige el comando

### 3. Usando el Explorador de Archivos (Context Explorer)

**Abrir el Explorador:**
- Haz clic en el ícono "Copy For AI" en la barra de actividad a la izquierda para abrir la barra lateral del explorador

**Seleccionar Archivos y Fragmentos:**
- Marca los archivos, carpetas o fragmentos de código que deseas copiar.
- Marcar una carpeta seleccionará automáticamente todos sus archivos hijos.
- **Selección de Rango**: Haz clic en la casilla de verificación del primer elemento (archivo o fragmento), luego mantén presionada la tecla Shift y haz clic en la casilla de verificación de otro elemento para seleccionar todos los elementos visibles entre ellos.

**Agregar Elementos Usando el Menú Contextual:**
- En el explorador de archivos de VSCode, haz clic derecho en un archivo y elige "Add File to Copy For AI Explorer"
- En el explorador de archivos de VSCode, haz clic derecho en una carpeta y elige "Add Folder to Copy For AI Explorer"
- Haz clic derecho en una pestaña en el editor y elige "Add Tab to Copy For AI Explorer"
- **Nuevo**: Selecciona código en el editor, haz clic derecho en el texto seleccionado y elige "Add Snippet to Copy For AI Explorer"

**Filtrar Elementos:**
- Ingresa palabras clave en el cuadro de búsqueda en la parte superior para filtrar rápidamente archivos o fragmentos (soporta búsqueda insensible a mayúsculas y múltiples palabras clave).
- Marca "Show Selected Only" para enfocarte en los elementos seleccionados

**Copiar Elementos:**
- Haz clic en el botón "Copy to Clipboard" en la parte inferior
- Todos los contenidos de los archivos y fragmentos seleccionados se copiarán al portapapeles en el formato especificado

**Administrar Fragmentos:**
- En la sección "Code Snippets", puedes marcar/desmarcar fragmentos.
- Hacer clic en una fila de fragmento (no en la casilla de verificación) saltará a la ubicación del código fuente y seleccionará el rango correspondiente.
- Hacer clic en el ícono de la papelera en el lado derecho de la fila del fragmento eliminará el fragmento.

Luego, pega el contenido copiado en ChatGPT, Claude u otras herramientas de IA para mantener el formato y contexto del código.


## Ejemplos de Formato de Salida

### Formato de Copia Básica

````markdown
## File: extension.ts (10-20)

```typescript
function activate(context) {
    // Contenido del código
}
```
````

### Formato de Copia Mejorada (Markdown)

````markdown
# CODE CONTEXT
-----------------

## File
extension.ts (10-20)

## Structure
- Función: activate(context: vscode.ExtensionContext)

## Imports
```typescript
import * as vscode from 'vscode';
```

## Code
```typescript
function activate(context) {
    // Contenido del código
}
```
-----------------
````

### Formato de Copia del Explorador de Archivos

````markdown
## File: src/extension.ts
```typescript
import * as vscode from 'vscode';
import { processCode, removeComments } from './codeAnalyzer';
import { formatOutput } from './formatter';

export function activate(context: vscode.ExtensionContext) {
    console.log('¡Extensión "copy-for-ai" activada!');
}
```

## Snippet: src/formatter.ts (5-15)
### Structure
- Function: formatOutput(options: FormatOptions)
### Imports
```typescript
// ... relevant imports for the snippet ...
```
### Code
```typescript
export function formatOutput(options: FormatOptions): string {
    switch (options.format) {
        // ... snippet code ...
    }
}
```

## File: src/formatter.ts
```typescript
export function formatOutput(options: FormatOptions): string {
    switch (options.format) {
        case OutputFormat.Markdown:
            return formatAsMarkdown(options);
        case OutputFormat.XML:
            return formatAsXML(options);
        default:
            return formatAsMarkdown(options);
    }
}
```
````

## Opciones de Configuración

Puedes personalizar el comportamiento de la extensión en la configuración de VSCode:

1. **copyForAI.includeStructureInfo** (predeterminado: true)
   - Si se debe incluir información de la estructura del código

2. **copyForAI.includeRelatedImports** (predeterminado: true)
   - Si se deben incluir declaraciones de importación relacionadas

3. **copyForAI.outputFormat** (predeterminado: "markdown")
   - El formato de salida para la información de contexto
   - Opciones: "markdown", "xml", "json", "custom"

4. **copyForAI.customFormatBefore** (predeterminado: "===== CODE CONTEXT START =====")
   - Marcador de inicio de formato personalizado

5. **copyForAI.customFormatAfter** (predeterminado: "===== CODE CONTEXT END =====")
   - Marcador de fin de formato personalizado

6. **copyForAI.includeComments** (predeterminado: true)
   - Si se deben incluir comentarios en el código

7. **copyForAI.tokenLimit** (predeterminado: 0)
   - Límite de tokens predeterminado (0 significa sin límite)

8. **copyForAI.contextExplorer.excludePatterns** (predeterminado: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/bin/**"])
   - Patrones de archivos a excluir en el Context Explorer
9. **copyForAI.contextExplorer.followGitignore** (predeterminado: true)
   - Si el Context Explorer debe seguir las reglas del archivo .gitignore en la raíz del espacio de trabajo.

## Instalación

Instalar desde el mercado de extensiones de VSCode:
1. Abre VSCode
2. Presiona `Ctrl+Shift+X` o `Cmd+Shift+X` para abrir la vista de extensiones
3. Busca "Copy For AI"
4. Haz clic en "Install"

## Instalación Manual

Si deseas instalar manualmente:
1. Descarga el archivo `.vsix`
2. En VSCode, presiona `Ctrl+Shift+X` o `Cmd+Shift+X` para abrir la vista de extensiones
3. Haz clic en el botón "..." en la esquina superior derecha
4. Elige "Install from VSIX..."
5. Selecciona el archivo `.vsix` descargado

## Lenguajes Soportados

La extensión soporta todos los lenguajes soportados por VSCode y proporciona análisis de contexto mejorado para los siguientes lenguajes:

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

## Desarrollo

### Configuración del Entorno de Desarrollo
```bash
# Clonar el repositorio
git clone <your-repo-url>
cd copy-for-ai

# Instalar dependencias
npm install
```

### Compilar
```bash
npm run compile
```

### Modo de Observación (para desarrollo)
```bash
npm run watch
```

### Probar la Extensión
```bash
# Método 1: Usando la tecla F5
# Abre el proyecto en VSCode, luego presiona F5 para iniciar una nueva ventana de VSCode para probar

# Método 2: Usando la línea de comandos
code --extensionDevelopmentPath=${PWD}
```

### Empaquetar la Extensión
```bash
# Asegúrate de tener vsce instalado
npm install -g @vscode/vsce

# Empaquetar la extensión en un archivo .vsix
vsce package
```
Esto generará un archivo `copy-for-ai-0.1.8.vsix` en el directorio raíz del proyecto (el número de versión puede variar).

## Licencia

MIT
