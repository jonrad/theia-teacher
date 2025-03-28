import { injectable, inject } from '@theia/core/shared/inversify';
import { AbstractToolProvider } from './abstract-tool-provider';
import { CommandRegistry } from '@theia/core';

export const GET_LAYOUT_TOOL_ID = 'get-layout';

@injectable()
export class LayoutTool extends AbstractToolProvider<void> {
    parameters = undefined;
    id = GET_LAYOUT_TOOL_ID;
    name = GET_LAYOUT_TOOL_ID;
    description = 'Get the current layout of the IDE';

    constructor(
        @inject(CommandRegistry)
        protected readonly commandRegistry: CommandRegistry,
    ) {
        super();
    }

    public async handle() {
        return this.commandRegistry.executeCommand(GET_LAYOUT_TOOL_ID);
    }
}
