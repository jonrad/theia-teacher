import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { StatefulWidget, Widget, WidgetDescription, WidgetManager } from '@theia/core/lib/browser';
import { AbstractToolProvider } from './abstract-tool-provider';

export const GET_LAYOUT_TOOL_ID = 'get-layout';

@injectable()
export class LayoutTool extends AbstractToolProvider<void> {
    parameters = undefined;
    id = GET_LAYOUT_TOOL_ID;
    name = GET_LAYOUT_TOOL_ID;
    description = 'Get the current layout of the IDE';

    constructor(
        @inject(FrontendApplication)
        protected readonly frontendApplication: FrontendApplication,
        @inject(WidgetManager)
        protected readonly widgetManager: WidgetManager,
    ) {
        super();
    }

    public async handle() {
        const layout = this.frontendApplication.shell.getLayoutData()
        return this.deflate(layout);
    }

    protected isWidgetProperty(propertyName: string): boolean {
        return propertyName === 'widget';
    }

    protected isWidgetsProperty(propertyName: string): boolean {
        return propertyName === 'widgets';
    }

    private convertToDescription(widget: Widget): WidgetDescription | undefined {
        const desc = this.widgetManager.getDescription(widget);
        if (desc) {
            if (StatefulWidget.is(widget)) {
                const innerState = widget.storeState();
                return innerState ? {
                    constructionOptions: desc,
                    innerWidgetState: innerState
                } : undefined;
            } else {
                return {
                    constructionOptions: desc,
                    innerWidgetState: undefined
                };
            }
        }

        return undefined;
    }

    // Note: This is a slightly modified version of the deflate function from shell-layout-restorer
    protected deflate(data: object): string {
        return JSON.stringify(data, (property: string, value) => {
            if (this.isWidgetProperty(property)) {
                const description = this.convertToDescription(value as Widget);
                return description;
            } else if (this.isWidgetsProperty(property)) {
                const descriptions: WidgetDescription[] = [];
                for (const widget of (value as Widget[])) {
                    const description = this.convertToDescription(widget);
                    if (description) {
                        descriptions.push(description);
                    }
                }
                return descriptions;
            }
            return value;
        });
    }
}
