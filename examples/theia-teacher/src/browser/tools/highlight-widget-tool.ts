import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { AbstractToolProvider } from './abstract-tool-provider';
import { CommandRegistry } from '@theia/core/lib/common';

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
        @inject(CommandRegistry)
        protected readonly commandRegistry: CommandRegistry,
    ) {
        super();
    }

    public handle(args: { factoryId: string, options?: object }, ctx?: unknown) {
        return this.commandRegistry.executeCommand('highlight-widget', args.factoryId, args.options);
    }
}
