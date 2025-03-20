import { injectable, inject } from '@theia/core/shared/inversify';
import { ContainerModule } from '@theia/core/shared/inversify';
import { Agent, ToolProvider } from '@theia/ai-core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandRegistry } from '@theia/core';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { LayoutTool } from './tools/layout-tool';
import { TeacherAgent } from './agents/teacher-agent';
import { HighlightHtmlElementTool } from './tools/highlight-html-tool';
import { HighlightWidgetTool } from './tools/highlight-widget-tool';
import { ViewContainerPart, Widget } from '@theia/core/lib/browser';
import { HighlighterFactory, WidgetHighlighter, ViewContainerPartHighlighter, Highlighter } from './highlighter';
import { isViewContainerPart } from './widget-utils';
import { interfaces } from 'inversify';
@injectable()
export class AiToolsFrontendApplicationContribution implements FrontendApplicationContribution {
    constructor(
        @inject(CommandRegistry)
        private readonly commandRegistry: CommandRegistry,
    ) {
    }

    onStart(): void {
        this.commandRegistry.registerCommand({
            id: 'jon-experiment',
            label: 'Jon Experiment',
        }, {
            execute: async () => {
                console.error("This is where I do my experimentation");
            }
        });
    }
}

export default new ContainerModule((bind, unbind, isBound, rebind, unbindAsync, onActivation) => {
    bind(WidgetHighlighter).toSelf();
    bind(ViewContainerPartHighlighter).toSelf();

    bind(HighlighterFactory).toProvider((context: interfaces.Context) => {
        return async (widget: Widget): Promise<Highlighter> => {
            const child = context.container.createChild();
            if (isViewContainerPart(widget.parent)) {
                child.bind(ViewContainerPart).toConstantValue(widget.parent);
                return child.get(ViewContainerPartHighlighter);
            }

            child.bind(Widget).toConstantValue(widget);
            return child.get(WidgetHighlighter);
        }
    });

    // TODO: verify if this is needed or if we can use bindContribution
    function bindTools(tools: any[]) {
        for (const tool of tools) {
            bind(tool).toSelf().inSingletonScope();
            bind(ToolProvider).toService(tool);
        }
    }

    bindTools([
        LayoutTool,
        HighlightWidgetTool,
        HighlightHtmlElementTool,
    ]);

    bind(AiToolsFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AiToolsFrontendApplicationContribution);

    bind(TeacherAgent).toSelf().inSingletonScope();
    bind(Agent).toService(TeacherAgent);
    bind(ChatAgent).toService(TeacherAgent);
});
