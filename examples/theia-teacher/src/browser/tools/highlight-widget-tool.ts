import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { ApplicationShell, Widget, WidgetManager } from '@theia/core/lib/browser';
import { AbstractToolProvider } from './abstract-tool-provider';

import '../../../src/browser/style/pulse.css';
import { cloneVisibleElements } from '../html-utils';

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
        @inject(ApplicationShell)
        protected readonly shell: ApplicationShell,
        @inject(WidgetManager)
        protected readonly widgetManager: WidgetManager,
    ) {
        super();
    }

    public async handle(args: { factoryId: string, options?: object }, ctx?: unknown) {
        const widget = await this.widgetManager.getWidget(args.factoryId, args.options);
        if (!widget) {
            return {
                error: `Widget with factoryId ${args.factoryId} and options ${JSON.stringify(args.options)} not found`
            }
        }

        // TODO: Handle widget is already active
        // TODO: Handle child widgets
        this.pulseWidget(widget);
        //
        // Wait for the user to click on the widget before returning a response
        // TODO: Not sure I like this approach, but it's working for now
        // Alternatively, we can just highlight and return immediately
        return new Promise((resolve) => {
            const disposable = this.shell.onDidChangeActiveWidget(event => {
                if (event.newValue === widget) {
                    disposable.dispose();
                    resolve({
                        message: `Widget ${args.factoryId} is now active`,
                        directions: 'Please provide further directions based on the widget you see.',
                        widgetHtml: cloneVisibleElements(widget.node).outerHTML
                    });
                }
            });
        });
    }

    protected isPulsing(widget: Widget) {
        return widget.title.className.includes(' pulse-element');
    }

    protected pulseWidget(widget: Widget) {
        if (this.isPulsing(widget)) {
            return;
        }

        widget.title.className += ' pulse-element';

        // Once the widget is active, we unpulse it and unsubscribe from the event
        const disposable = this.shell.onDidChangeActiveWidget(event => {
            if (event.newValue === widget) {
                this.unpulseWidget(widget);
                disposable.dispose();
            }
        });
    }

    protected unpulseWidget(widget: Widget) {
        widget.title.className = widget.title.className.replace(' pulse-element', '');
    }
}
