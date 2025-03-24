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
import { ViewContainerPart, Widget, WidgetManager } from '@theia/core/lib/browser';
import { HighlighterFactory, WidgetHighlighter, ViewContainerPartHighlighter, Highlighter } from './highlighter';
import { isViewContainerPart } from './widget-utils';
import { interfaces } from 'inversify';
import { QuickInputService } from '@theia/core/lib/browser/quick-input';
import { cloneVisibleElements } from './html-utils';
@injectable()
export class AiToolsFrontendApplicationContribution implements FrontendApplicationContribution {
    constructor(
        @inject(CommandRegistry)
        private readonly commandRegistry: CommandRegistry,
        @inject(QuickInputService)
        private readonly quickInputService: QuickInputService,
        @inject(HighlighterFactory)
        private readonly highlighterFactory: HighlighterFactory,
        @inject(WidgetManager)
        private readonly widgetManager: WidgetManager,
    ) {
    }

    onStart(): void {
        this.commandRegistry.registerCommand({
            id: 'jon-experiment',
            label: 'Jon Experiment',
        }, {
            execute: async () => {
                const result = await this.commandRegistry.executeCommand('highlight-widget', 'search-in-workspace');
                console.error(`Experiment result`, result)
            }
        });

        this.commandRegistry.registerCommand({
            id: 'highlight-widget',
            label: 'Highlight Widget',
        }, {
            execute: async (factoryId?: string, options?: object) => {

                if (!factoryId) {
                    const result = await this.quickInputService.input({
                        prompt: 'Enter the factoryId of the widget to highlight',
                        placeHolder: 'files'
                    })

                    if (!result) {
                        return;
                    }

                    factoryId = result;

                }

                const widget = await this.widgetManager.getWidget(factoryId, options);

                // If the widget is not found, return an error
                if (!widget) {
                    return {
                        error: `Widget with factoryId ${factoryId} and options ${JSON.stringify(options)} not found`
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

                // If the widget is already visible, highlight it for a little while to get the user's attention and then stop
                if (widget.isVisible) {
                    const pulser = await this.pulseWidget(widget);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await pulser.stop();

                    return {
                        message: `Widget ${factoryId} is now visible`,
                        directions: 'Please provide further directions based on the widget you see.',
                        widgetHtml: cloneVisibleElements(widget.node).outerHTML
                    }
                }

                // TODO: Handle widget is already active
                // TODO: Handle child widgets
                await this.pulseAndWaitForUser(widget);

                return {
                    message: `Widget ${factoryId} is now active`,
                    directions: 'Please provide further directions based on the widget you see.',
                    // Widget HTML helps the LLM understand the context of the widget
                    widgetHtml: cloneVisibleElements(widget.node).outerHTML
                };
            }
        });
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

        // Once the widget is active, we unpulse it and unsubscribe from the event
        const disposable = pulser.onSelected(() => {
            pulser.stop();
            disposable.dispose();
        });

        pulser.start();

        return pulser;
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
