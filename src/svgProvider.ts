'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import fs = require('fs');
import { Configuration } from './configuration';


export abstract class BaseContentProvider {

    public constructor(protected context: vscode.ExtensionContext) { }
    private static readonly svgRegexp = /<svg.*<\/svg>/s;
    private static readonly noSvgErrorNessage = `Active editor doesn't show a SVG document - no properties to preview.`;
    public static checkNoSvg(document: vscode.TextDocument, displayMessage: boolean = true) {
        if (!document) {
            vscode.window.showWarningMessage(BaseContentProvider.noSvgErrorNessage);
            return true;
        }
        let isSvg = document.getText().match(BaseContentProvider.svgRegexp);
        if (!isSvg && displayMessage) {
            vscode.window.showWarningMessage(BaseContentProvider.noSvgErrorNessage);
        }
        return !isSvg;
    }
    get localResourceRoots(): vscode.Uri[] {
        return [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))];
    }
    public abstract async provideTextDocumentContent(sourceUri: vscode.Uri, state: any): Promise<string>;


    protected getPath(file: string): vscode.Uri {
        const onDiskPath = vscode.Uri.file(
            path.join(this.context.extensionPath, file)
        );
        return onDiskPath.with({ scheme: 'vscode-resource' });
    }
}

export class SvgDocumentContentProvider extends BaseContentProvider {

    private snippet(properties: string, state: any): string {
        const showTransGrid = Configuration.showTransGrid();
        const transparencycolor = Configuration.transparencyColor();
        let transparencyGridCss = '';
        if (showTransGrid) {
            if (transparencycolor != null && transparencycolor !== "") {
                transparencyGridCss = `
<style type="text/css">
.svgv-bg img {
    background: `+ transparencycolor + `;
    transform-origin: top left;
}
</style>`;
            } else {
                transparencyGridCss = `<link rel="stylesheet" href="${this.getPath('media/background.css')}" type="text/css"></style>`;
            }
        }
        let matches: RegExpExecArray;
        let css: string[] = new Array();
        while (matches = SvgDocumentContentProvider.stylesheetRegex.exec(properties)) {
            css.push(matches[1]);
        }
        properties = SvgDocumentContentProvider.addNamespace(properties);
        let html = `<!DOCTYPE html><html><head>
<meta id="vscode-svg-preview-data" data-state="${JSON.stringify(state || {}).replace(/"/g, '&quot;')}">
${transparencyGridCss}
<script src="${this.getPath('media/preview.js')}"></script>
<link rel="stylesheet" href="${this.getPath('media/preview.css')}" type="text/css"></style>
</head><body>
        ${this.buttonHtml()}
        <div class="svgv-bg"><img id="svgimg" src="data:image/svg+xml,${encodeURIComponent(this.insertCss(properties, css))}"></div>
        </body></html>`;
        return html;
    }
    public static addNamespace(properties: string) {
        if (Configuration.enableAutoInsertNamespace()
            && properties.indexOf('xmlns="http://www.w3.org/2000/svg"') < 0) {
            properties = properties.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        return properties;
    }

    public async provideTextDocumentContent(sourceUri: vscode.Uri, state: any): Promise<string> {
        const document = await vscode.workspace.openTextDocument(sourceUri);
        this.resourceDir = path.dirname(sourceUri.fsPath);
        return this.snippet(document.getText(), state);
    }

    private buttonHtml(): string {
        return vscode.workspace.getConfiguration('svgviewer').get('showzoominout') ?
            `<div class="svgv-zoom-container">
            <button class="svgv-btn" type="button" title="Zoom in" id="zoom_in">+</button>
            <button class="svgv-btn" type="button" title="Zoom out" id="zoom_out">-</button>
            <button class="svgv-btn" type="button" title="Reset Zoom" id="zoom_reset">Reset</button>
            </div>` : '';
    }

    private insertCss(svg: string, css: string[]): string {

        if (css == null || css.length == 0) return svg;

        let defsEndIndex = svg.toLowerCase().indexOf('</defs>');
        if (defsEndIndex === -1) {
            let svgEndIndex = svg.toLowerCase().indexOf('</svg>');
            return svg.slice(0, svgEndIndex)
                + `<defs>${this.loadCss(css)}</defs>`
                + svg.slice(svgEndIndex, svg.length);
        }
        return svg.slice(0, defsEndIndex)
            + this.loadCss(css)
            + svg.slice(defsEndIndex, svg.length);
    }

    private loadCss(css: string[]): string {
        let result = "";
        css.forEach(x => {
            result += `<style type="text/css"><![CDATA[${fs.readFileSync(this.getWorkspacePath(x))}]]></style>`;
        });
        return result;
    }

    private getWorkspacePath(file: string): string {
        return path.join(this.resourceDir, file);
    }

    private resourceDir: string;

    private static readonly stylesheetRegex: RegExp = /<\?\s*xml-stylesheet\s+.*href="(.+?)".*\s*\?>/gi;

}
