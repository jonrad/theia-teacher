import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { ApplicationShell, Widget, WidgetManager } from '@theia/core/lib/browser';
import '../../../src/browser/style/pulse.css';

export const SHOW_WIDGET_TOOL_ID = 'show-widget';

@injectable()
export class ShowWidgetTool implements ToolProvider {
    id = SHOW_WIDGET_TOOL_ID;
    name = SHOW_WIDGET_TOOL_ID;
    description = "Show a widget in the IDE, based on the layout's factoryId and options. After this is called, the widget will be expanded = true.";

    constructor(
        @inject(FrontendApplication)
        protected readonly frontendApplication: FrontendApplication,
        @inject(ApplicationShell)
        protected readonly shell: ApplicationShell,
        @inject(WidgetManager)
        protected readonly widgetManager: WidgetManager,
    ) {
    }

    getTool(): ToolRequest {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            parameters: {
                type: 'object',
                properties: {
                    factoryId: { type: 'string' },
                    options: { type: 'object' }
                },
                required: ['factoryId'],
            },
            handler: this.handler.bind(this)
        };
    }

    public async handler(arg_string: string, ctx?: unknown) {
        const args = JSON.parse(arg_string);
        const widget = await this.widgetManager.getWidget(args.factoryId, args.options);
        if (!widget) {
            return {
                error: `Widget with factoryId ${args.factoryId} and options ${JSON.stringify(args.options)} not found`
            }
        }

        this.pulseWidget(widget);

        return new Promise<void>((resolve, reject) => {
            const disposable = this.shell.onDidChangeActiveWidget(event => {
                if (event.newValue === widget) {
                    disposable.dispose();
                    console.error("Widget is active");
                    resolve();
                }
            });
        });
    }

    isPulsing(widget: Widget) {
        return widget.title.className.includes(' pulse-element');
    }

    pulseWidget(widget: Widget) {
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

    unpulseWidget(widget: Widget) {
        widget.title.className = widget.title.className.replace(' pulse-element', '');
    }
}
