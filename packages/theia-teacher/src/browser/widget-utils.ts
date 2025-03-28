import { ViewContainerPart } from '@theia/core/lib/browser/view-container';
import { Widget } from '@theia/core/lib/browser/widgets';

export function isViewContainerPart(widget: Widget | null): widget is ViewContainerPart {
    if (!widget) {
        return false;
    }

    return widget.hasClass('part');
}
