import { Widget } from '@theia/core/lib/browser/widgets';
import { ViewContainerPart } from '@theia/core/lib/browser/view-container';
import { injectable, inject } from 'inversify';
import { Emitter, Event, DisposableCollection } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

import '../../src/browser/style/pulse.css';
const CSS_PULSE_CLASS = 'pulse-element';

export interface Highlighter {
    onSelected: Event<void>;
    start(): void;
    stop(): void;
    isHighlighted(): boolean;
}

export const HighlighterFactory = Symbol('HighlighterFactory');
export type HighlighterFactory = (widget: Widget) => Promise<Highlighter>;

// Highlights a widget that contains a visible title (widget.title)
@injectable()
export class WidgetHighlighter implements Highlighter {
    protected readonly disposables: DisposableCollection = new DisposableCollection();

    protected readonly _onSelected = new Emitter<void>();
    onSelected: Event<void> = this._onSelected.event;

    constructor(
        @inject(Widget)
        private readonly widget: Widget,
        @inject(ApplicationShell)
        protected readonly shell: ApplicationShell,
    ) {
    }

    start(): void {
        this.widget.title.className += ` ${CSS_PULSE_CLASS}`;
        this.disposables.push(this.shell.onDidChangeActiveWidget(event => {
            if (event.newValue === this.widget) {
                this._onSelected.fire();
            }
        }));
    }

    stop(): void {
        this.widget.title.className = this.widget.title.className.replace(` ${CSS_PULSE_CLASS}`, '');
        this.disposables.dispose();
    }

    isHighlighted(): boolean {
        return this.widget.title.className.includes(CSS_PULSE_CLASS);
    }
}

// Highlights a view container part that has a visible headerElement
@injectable()
export class ViewContainerPartHighlighter implements Highlighter {
    protected readonly disposables: DisposableCollection = new DisposableCollection();

    protected readonly _onSelected = new Emitter<void>();
    onSelected: Event<void> = this._onSelected.event;

    constructor(
        @inject(ViewContainerPart)
        private readonly viewContainerPart: ViewContainerPart
    ) {
        this.disposables.push(this.viewContainerPart.onCollapsed((collapsed) => {
            if (!collapsed) {
                this._onSelected.fire();
            }
        }));
    }

    start(): void {
        this.viewContainerPart.headerElement.classList.add(CSS_PULSE_CLASS);
    }

    stop(): void {
        this.viewContainerPart.headerElement.classList.remove(CSS_PULSE_CLASS);
    }

    isHighlighted(): boolean {
        return this.viewContainerPart.headerElement.classList.contains(CSS_PULSE_CLASS);
    }
}
