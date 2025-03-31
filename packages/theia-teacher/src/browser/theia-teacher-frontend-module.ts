import { injectable, inject, interfaces } from '@theia/core/shared/inversify';
import { ContainerModule } from '@theia/core/shared/inversify';
import { Agent, ToolProvider } from '@theia/ai-core/lib/common';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandRegistry, UntitledResourceResolver } from '@theia/core';
import { ChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { GET_LAYOUT_TOOL_ID, LayoutTool } from './tools/layout-tool';
import { TeacherAgent } from './agents/teacher-agent';
import { QuickInputService } from '@theia/core/lib/browser/quick-input';
import { addOneTimeListener } from './html-utils';
import { DOMElementNode, DomService, ALL_ATTRIBUTES } from './dom/domService';
import { HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID, HighlightByHighlightIndexTool } from './tools/highlight-by-index-tool';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { EditorWidget } from '@theia/editor/lib/browser';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ApplicationShell, Widget } from '@theia/core/lib/browser';

export const COMMAND_CATEGORY = 'Theia Teacher';

@injectable()
export class AiToolsFrontendApplicationContribution implements FrontendApplicationContribution {
    constructor(
        @inject(CommandRegistry)
        private readonly commandRegistry: CommandRegistry,
        @inject(QuickInputService)
        private readonly quickInputService: QuickInputService,
        @inject(DomService)
        private readonly domService: DomService,
        @inject(OpenerService)
        private readonly openerService: OpenerService,
        @inject(UntitledResourceResolver)
        private readonly untitledResourceResolver: UntitledResourceResolver,
        @inject(WidgetManager)
        private readonly widgetManager: WidgetManager,
        @inject(ApplicationShell)
        private readonly shell: ApplicationShell,
    ) {
    }

    onStart(): void {
        this.commandRegistry.registerCommand({
            id: 'jon-experiment',
            label: 'Jon Experiment',
            category: COMMAND_CATEGORY,
        }, {
            execute: async () => {
            }
        });

        this.commandRegistry.registerCommand({
            id: 'debug-layout',
            label: 'Debug Layout',
            category: COMMAND_CATEGORY,
        }, {
            execute: async () => {
                const layout = await this.executeGetLayout();
                (layout as any).uniqueAttributes =
                    Array.from(new Set(layout.highlightable.flatMap(entry => entry.attributes ? Object.keys(entry.attributes) : [])));
                const untitledUri = this.untitledResourceResolver.createUntitledURI('.json');
                this.untitledResourceResolver.resolve(untitledUri);
                const widget = (await open(this.openerService, untitledUri)) as EditorWidget;
                await widget.editor.replaceText({
                    source: 'theia-teacher',
                    replaceOperations: [{
                        text: JSON.stringify(layout, null, 2),
                        range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 0 }
                        }
                    }]
                });
            }
        });

        this.commandRegistry.registerCommand({
            id: 'debug-layout-highlight-all',
            label: 'Debug Layout - Highlight All',
            category: COMMAND_CATEGORY,
        }, {
            execute: async () => {
                await this.executeGetLayout(true);
            }
        });
        this.commandRegistry.registerCommand({
            id: GET_LAYOUT_TOOL_ID,
            label: 'Get Layout',
            category: COMMAND_CATEGORY,
        }, {
            execute: this.executeGetLayout.bind(this)
        });

        this.commandRegistry.registerCommand({
            id: HIGHLIGHT_BY_HIGHLIGHT_INDEX_TOOL_ID,
            label: 'Highlight by Highlight Index',
            category: COMMAND_CATEGORY,
        }, {
            execute: this.executeHighlightByHighlightIndex.bind(this)
        });
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

        addOneTimeListener(domNode, 'click', async () => {
            domNode.classList.remove('pulse-element');
            const chatWidget = await this.widgetManager.getWidget<MyChatViewWidget>(ChatViewWidget.ID);
            if (chatWidget) {
                if (!chatWidget.query) {
                    console.error('chatWidget.query is undefined. This is likely to a conflicting extension');
                    return;
                }
                chatWidget.query(`@teacher-agent User has clicked on the highlighted element, index ${highlightIndex}. Please provide any further directions`);
            }
        });

        return {
            success: true,
            details: 'Element highlighted'
        };
    }

    async executeGetLayout(highlightElements: boolean = false) {
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

        const { selectorMap } = await this.domService.getClickableElements(
            highlightElements,
            -1,
            0,
            ['margin']
        );

        const filteredAttributeKeys = new Set([
            'role',
            'class',
            'id',
            'title',
            'aria-label',
            'data-node-id',
        ]);

        console.error('shell', this.shell);
        const entries = Object.values(selectorMap)
            .map(value => (value as DOMElementNode).toDOMOutput(ALL_ATTRIBUTES))
            .filter(entry => entry !== undefined)
            .map(entry => {
                let widgetText = '';
                let parentWidget: Widget | undefined = undefined;
                if (this.shell.layout && entry.element) {
                    for (const widget of this.shell.layout) {
                        if (widget.node.contains(entry.element)) {
                            parentWidget = widget;
                            break;
                        }
                    }

                    while (parentWidget) {
                        const label = parentWidget.title.label || parentWidget.title.caption || parentWidget.id;
                        if (label.trim() !== '') {
                            widgetText = widgetText ? `${widgetText} > ${label}` : label;
                        }

                        if (parentWidget.children) {
                            let found = false;
                            for (const child of parentWidget.children()) {
                                if (child.node.contains(entry.element)) {
                                    parentWidget = child;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                }

                const result = {
                    highlightIndex: entry.highlightIndex,
                    attributes: entry.type === 'element' && entry.attributes ? {
                        ...Object.fromEntries(
                            Object.entries(entry.attributes).filter(([key]) => filteredAttributeKeys.has(key))
                        ),
                        widget: widgetText === '' ? undefined : widgetText,
                    } : undefined,
                    text: entry.text && entry.text.length > 0 ? entry.text : undefined,
                }

                return result;
            });

        const layout = {
            highlightable: entries
        };

        console.error('layout', JSON.stringify(layout).length, layout);

        return layout;
    }
}

export class MyChatViewWidget extends ChatViewWidget {
    public query(query: string): Promise<void> {
        return this.onQuery(query);
    }
}

export default new ContainerModule((bind, unbind) => {
    // TODO: verify if this is needed or if we can use bindContribution
    function bindTools(tools: interfaces.ServiceIdentifier<ToolProvider>[]) {
        for (const tool of tools) {
            bind(tool).toSelf().inSingletonScope();
            bind(ToolProvider).toService(tool);
        }
    }

    unbind(ChatViewWidget);
    bind(ChatViewWidget).to(MyChatViewWidget);

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
