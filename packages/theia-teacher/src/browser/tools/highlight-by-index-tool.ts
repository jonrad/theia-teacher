import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolRequestParameters } from '@theia/ai-core/lib/common';
import { AbstractToolProvider } from './abstract-tool-provider';
import { CommandRegistry } from '@theia/core/lib/common';

import '../../../src/browser/style/pulse.css';

export const HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID = 'highlight-by-highlight-index';

@injectable()
export class HighlightByHighlightIndexTool extends AbstractToolProvider<{ highlightIndex: number }> {
    id = HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID;
    name = HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID;
    description = 'Highlight an element by its highlightIndex';
    parameters = <ToolRequestParameters>{
        type: 'object',
        properties: {
            highlightIndex: { type: 'number' },
        },
    };

    constructor(
        @inject(CommandRegistry)
        protected readonly commandRegistry: CommandRegistry,
    ) {
        super();
    }

    public handle(args: { highlightIndex: number }, ctx?: unknown) {
        return this.commandRegistry.executeCommand('highlight-by-highlight-index', args.highlightIndex);
    }
}
