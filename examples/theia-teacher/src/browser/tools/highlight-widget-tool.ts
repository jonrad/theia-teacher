import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { Widget, WidgetManager } from '@theia/core/lib/browser';
import { AbstractToolProvider } from './abstract-tool-provider';
import { cloneVisibleElements } from '../html-utils';
import { Highlighter, HighlighterFactory } from '../highlighter';
export const HIGHLIGHT_WIDGET_TOOL_ID = 'highlight-widget';

@injectable()
export class HighlightWidgetTool extends AbstractToolProvider<{ factoryId: string, options?: object }> {
    id = HIGHLIGHT_WIDGET_TOOL_ID;
    name = HIGHLIGHT_WIDGET_TOOL_ID;
    description = "Highlight a widget in the IDE, based on the layout's factoryId and options. After this is called, the widget will be highlighted.";
    parameters = <ToolRequestParameters>{
        type: 'object',
        properties: {
            factoryId: { type: 'string' },
            options: { type: 'object' }
        },
    }

    constructor(
        @inject(FrontendApplication)
        protected readonly frontendApplication: FrontendApplication,
        @inject(WidgetManager)
        protected readonly widgetManager: WidgetManager,
        @inject(HighlighterFactory)
        protected readonly highlighterFactory: HighlighterFactory,
    ) {
        super();
    }

    public async handle(args: { factoryId: string, options?: object }, ctx?: unknown) {
        const widget = await this.widgetManager.getWidget(args.factoryId, args.options);

        // If the widget is not found, return an error
        if (!widget) {
            return {
                error: `Widget with factoryId ${args.factoryId} and options ${JSON.stringify(args.options)} not found`
            }
        }

        // If the widget is already visible, highlight it for a little while to get the user's attention and then stop
        if (widget.isVisible) {
            const pulser = await this.pulseWidget(widget);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await pulser.stop();

            return {
                message: `Widget ${args.factoryId} is now visible`,
                directions: 'Please provide further directions based on the widget you see.',
                widgetHtml: cloneVisibleElements(widget.node).outerHTML
            }
        }

        // If the parent widget is not visible, we need to go up the tree and highlight all the steps until we get to our widget
        // until we get the widget itself visible
        while (widget.parent && !widget.parent.isVisible) {
            let parent = widget.parent;
            while (parent.parent && !parent.parent.isVisible) {
                parent = parent.parent;
            }
            await this.pulseAndWaitForUser(parent);
        }

        // TODO: Handle widget is already active
        // TODO: Handle child widgets
        await this.pulseAndWaitForUser(widget);

        return {
            message: `Widget ${args.factoryId} is now active`,
            directions: 'Please provide further directions based on the widget you see.',
            // Widget HTML helps the LLM understand the context of the widget
            widgetHtml: cloneVisibleElements(widget.node).outerHTML
        };
    }

    // Wait for the user to click on the widget before returning a response
    // Alternatively, we can just highlight and return immediately
    // TODO: Not sure I like the llm waiting for the user to click on the widget, rather than highlighting and returning immediately
    protected async pulseAndWaitForUser(widget: Widget): Promise<void> {
        const pulser = await this.highlighterFactory(widget);

        const promise = new Promise<void>((resolve) => {
            const disposable = pulser.onSelected(() => {
                pulser.stop();
                disposable.dispose();
                resolve();
            })
        });

        pulser.start();

        return promise;
    }

    // Pulse and immediately return the highlighter. It's up to the caller to call stop
    protected async pulseWidget(widget: Widget): Promise<Highlighter> {
        const pulser = await this.highlighterFactory(widget);

        if (pulser.isHighlighted()) {
            return pulser;
        }

        // Once the widget is active, we unpulse it and unsubscribe from the event
        const disposable = pulser.onSelected(() => {
            pulser.stop();
            disposable.dispose();
        });

        pulser.start();

        return pulser;
    }
}
