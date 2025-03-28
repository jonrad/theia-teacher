import { injectable, inject, interfaces } from '@theia/core/shared/inversify';
import { ContainerModule } from '@theia/core/shared/inversify';
import { Agent, ToolProvider } from '@theia/ai-core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandRegistry } from '@theia/core';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { GET_LAYOUT_TOOL_ID, LayoutTool } from './tools/layout-tool';
import { TeacherAgent } from './agents/teacher-agent';
import { ViewContainerPart, Widget, WidgetManager } from '@theia/core/lib/browser';
import { HighlighterFactory, WidgetHighlighter, ViewContainerPartHighlighter, Highlighter } from './highlighter';
import { isViewContainerPart } from './widget-utils';
import { QuickInputService } from '@theia/core/lib/browser/quick-input';
import { addOneTimeListener, cloneVisibleElements } from './html-utils';
import { DOMElementNode, DomService, ALL_ATTRIBUTES } from './dom/domService';
import { HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID, HighlightByHighlightIndexTool } from './tools/highlight-by-index-tool';
import { HIGHLIGHT_WIDGET_TOOL_ID } from './tools/highlight-widget-tool';
import { HIGHLIGHT_HTML_ELEMENT_TOOL_ID } from './tools/highlight-html-tool';

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
        @inject(DomService)
        private readonly domService: DomService,
    ) {
    }

    onStart(): void {
        this.commandRegistry.registerCommand({
            id: 'jon-experiment',
            label: 'Jon Experiment',
        }, {
            execute: async () => {
                console.error('Hello World');
            }
        });

        this.commandRegistry.registerCommand({
            id: GET_LAYOUT_TOOL_ID,
            label: 'Get Layout',
        }, {
            execute: this.executeGetLayout.bind(this)
        });

        this.commandRegistry.registerCommand({
            id: HIGHLIGHT_WIDGET_TOOL_ID,
            label: 'Highlight Widget',
        }, {
            execute: this.executeHighlightWidget.bind(this)
        });

        this.commandRegistry.registerCommand({
            id: HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID,
            label: 'Highlight by Highlight Index',
        }, {
            execute: this.executeHighlightByHighlightIndex.bind(this)
        });

        this.commandRegistry.registerCommand({
            id: HIGHLIGHT_HTML_ELEMENT_TOOL_ID,
            label: 'Highlight HTML Element',
        }, {
            execute: this.executeHighlightHtmlElement.bind(this)
        });
    }

    protected getFactoryId() {
        return this.quickInputService.input({
            prompt: 'Enter the factoryId of the widget to highlight',
            placeHolder: 'files'
        });
    }

    // TODO: Decide if we want to keep this tool
    async executeHighlightHtmlElement(factoryId?: string, options?: object, cssSelector?: string) {
        if (!factoryId) {
            factoryId = await this.getFactoryId();

            if (!factoryId) {
                return;
            }
        }

        const widget = await this.widgetManager.getWidget(factoryId, options);
        if (!widget) {
            return {
                error: `Widget with factoryId ${factoryId} and options ${JSON.stringify(options)} not found`
            };
        }

        if (!cssSelector) {
            cssSelector = await this.quickInputService.input({
                prompt: 'Enter the cssSelector of the element to highlight',
            });

            if (!cssSelector) {
                return;
            }
        }

        const node = widget.node.querySelector(cssSelector) as HTMLElement;
        if (!node) {
            return {
                error: `Node with cssSelector ${cssSelector} not found`
            };
        }

        addOneTimeListener(node, 'click', () => {
            node.classList.remove('pulse-element');
        });

        node.classList.add('pulse-element');

        return {
            success: true,
            nodeHtml: cloneVisibleElements(node).outerHTML
        };
    }

    async executeHighlightByHighlightIndex(highlightIndex: number | undefined) {
        if (!highlightIndex) {
            const highlightIndexValue = await this.quickInputService.input({
                prompt: 'Enter the highlightIndex of the element to highlight',
            });

            if (!highlightIndexValue) {
                return;
            }

            highlightIndex = parseInt(highlightIndexValue);
        }

        const selectorMap = this.domService.getLastSelectorMap();
        if (!selectorMap) {
            throw new Error('Please run the Get Layout tool first');
        }

        const element = selectorMap[highlightIndex];
        if (!element) {
            throw new Error(`Element with highlightIndex ${highlightIndex} not found. This likely means the layout tool needs to be rerun`);
        }

        const xpath = element.xpath;
        const domNode = document.evaluate(
            xpath,
            document,
            undefined,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            undefined
        ).singleNodeValue as HTMLElement;
        if (!domNode) {
            throw new Error(`Element with xpath ${xpath} not found. This likely means the layout tool needs to be rerun`);
        }

        domNode.classList.add('pulse-element');

        return new Promise(resolve => {
            addOneTimeListener(domNode, 'click', () => {
                domNode.classList.remove('pulse-element');
                resolve({
                    success: true,
                    directions: 'User has clicked on the element, please provide further directions based on any changes to the layout.'
                });
            });
        });
    }

    async executeGetLayout() {
        /*
        // TODO: This isn't working
        const chatWidget = await this.widgetManager.getWidget('chat-tree-widget');
        if (chatWidget) {
            chatWidget.addClass('theia-nohighlight');
        } else {
            console.error('chatWidget not found');
        }
        */
        const chatTreeContainer = document.getElementById('chat-tree-widget-treeContainer');
        if (chatTreeContainer) {
            chatTreeContainer.classList.add('theia-nohighlight');
        } else {
            console.error('chatTreeContainer not found');
        }

        const { selectorMap } = await this.domService.getClickableElements(false);
        console.error('selectorMap', selectorMap);
        const entries = Object.values(selectorMap)
            .map(value => (value as DOMElementNode).clickableElementsToString(ALL_ATTRIBUTES))
            .filter(entry => entry !== undefined)
            .map(entry => ({
                    ...entry,
                    children: undefined
                }));

        const layout = {
            highlightable: entries
        };

        console.error('layout', JSON.stringify(layout).length, layout);

        return layout;
    }

    // TODO: Decide if we want to keep this tool
    async executeHighlightWidget(factoryId?: string, options?: object) {
        if (!factoryId) {
            factoryId = await this.getFactoryId();

            if (!factoryId) {
                return;
            }
        }

        const widget = await this.widgetManager.getWidget(factoryId, options);

        // If the widget is not found, return an error
        if (!widget) {
            return {
                error: `Widget with factoryId ${factoryId} and options ${JSON.stringify(options)} not found`
            };
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
            pulser.stop();

            return {
                message: `Widget ${factoryId} is now visible`,
                directions: 'Please provide further directions based on the widget you see.',
                widgetHtml: cloneVisibleElements(widget.node).outerHTML
            };
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

    // Wait for the user to click on the widget before returning a response
    // Alternatively, we can just highlight and return immediately
    // TODO: Not sure I like the llm waiting for the user to click on the widget, rather than highlighting and returning immediately
    protected async pulseAndWaitForUser(widget: Widget): Promise<void> {
        const pulser = await this.highlighterFactory(widget);

        const promise = new Promise<void>(resolve => {
            const disposable = pulser.onSelected(() => {
                pulser.stop();
                disposable.dispose();
                resolve();
            });
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

export default new ContainerModule(bind => {
    bind(WidgetHighlighter).toSelf();
    bind(ViewContainerPartHighlighter).toSelf();

    bind(HighlighterFactory).toProvider((context: interfaces.Context) => async (widget: Widget): Promise<Highlighter> => {
            const child = context.container.createChild();
            if (isViewContainerPart(widget.parent)) {
                child.bind(ViewContainerPart).toConstantValue(widget.parent);
                return child.get(ViewContainerPartHighlighter);
            }

            child.bind(Widget).toConstantValue(widget);
            return child.get(WidgetHighlighter);
        });

    // TODO: verify if this is needed or if we can use bindContribution
    function bindTools(tools: interfaces.ServiceIdentifier<ToolProvider>[]) {
        for (const tool of tools) {
            bind(tool).toSelf().inSingletonScope();
            bind(ToolProvider).toService(tool);
        }
    }

    bindTools([
        LayoutTool,
        HighlightByHighlightIndexTool,
    ]);

    bind(AiToolsFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AiToolsFrontendApplicationContribution);

    bind(TeacherAgent).toSelf().inSingletonScope();
    bind(Agent).toService(TeacherAgent);
    bind(ChatAgent).toService(TeacherAgent);

    bind(DomService).toSelf().inSingletonScope();
});
