import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { AbstractToolProvider } from './abstract-tool-provider';
import { cloneVisibleElements, addOneTimeListener } from '../html-utils';

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
    }

    constructor(
        @inject(FrontendApplication)
        protected readonly frontendApplication: FrontendApplication,
        @inject(ApplicationShell)
        protected readonly shell: ApplicationShell,
        @inject(WidgetManager)
        protected readonly widgetManager: WidgetManager,
    ) {
        super();
    }

    public async handle(args: HighlightHtmlElementToolArgs, ctx?: unknown) {
        const widget = await this.widgetManager.getWidget(args.parentWidgetFactoryId, args.parentWidgetOptions);
        if (!widget) {
            return {
                error: `Widget with factoryId ${args.parentWidgetFactoryId} and options ${JSON.stringify(args.parentWidgetOptions)} not found`
            }
        }

        const node = widget.node.querySelector(args.cssSelector) as HTMLElement;
        if (!node) {
            return {
                error: `Node with cssSelector ${args.cssSelector} not found`
            }
        }

        addOneTimeListener(node, 'click', () => {
            node.classList.remove('pulse-element');
        });


        node.classList.add('pulse-element');

        return {
            success: true,
            nodeHtml: cloneVisibleElements(node).outerHTML
        }
    }
}
