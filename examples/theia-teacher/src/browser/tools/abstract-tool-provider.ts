import { injectable } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest, ToolRequestParameters } from '@theia/ai-core/lib/common';

export const SHOW_WIDGET_TOOL_ID = 'show-widget';

@injectable()
export abstract class AbstractToolProvider<T> implements ToolProvider {
    abstract id: string;
    abstract name: string;
    abstract description: string;
    abstract parameters?: ToolRequestParameters;

    getTool(): ToolRequest {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            parameters: this.parameters,
            handler: this.handler.bind(this)
        };
    }

    public async handler(arg_string: string, ctx?: unknown) {
        try {
            const args = <T>JSON.parse(arg_string);
            return await this.handle(args, ctx);
        } catch (error) {
            console.error("Error handling tool request", error);
            return {
                error: error.message
            };
        }
    }

    abstract handle(args: T, ctx?: unknown): Promise<unknown>;
}
