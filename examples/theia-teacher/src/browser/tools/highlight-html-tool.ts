import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { AbstractToolProvider } from './abstract-tool-provider';
import { CommandRegistry } from '@theia/core';

import '../../../src/browser/style/pulse.css';

export const HIGHLIGHT_HTML_ELEMENT_TOOL_ID = 'highlight-html-element';

interface HighlightHtmlElementToolArgs {
    parentWidgetFactoryId: string;
    parentWidgetOptions: object;
    cssSelector: string;
}

@injectable()
export class HighlightHtmlElementTool extends AbstractToolProvider<HighlightHtmlElementToolArgs> {
    id = HIGHLIGHT_HTML_ELEMENT_TOOL_ID;
    name = HIGHLIGHT_HTML_ELEMENT_TOOL_ID;
    description = "Highlight an HTML element in the IDE, based on the layout's factoryId and options. After this is called, the element will be highlighted.";
    parameters = <ToolRequestParameters>{
        type: 'object',
        properties: {
            parentWidgetFactoryId: { type: 'string' },
            parentWidgetOptions: { type: 'object' },
            cssSelector: { type: 'string' },
        },
        required: ['parentWidgetFactoryId', 'cssSelector']
    };

    constructor(
        @inject(CommandRegistry)
        protected readonly commandRegistry: CommandRegistry,
    ) {
        super();
    }

    public async handle(args: HighlightHtmlElementToolArgs, ctx?: unknown) {
        this.commandRegistry.executeCommand('highlight-html-element', args.parentWidgetFactoryId, args.parentWidgetOptions, args.cssSelector);
    }
}
