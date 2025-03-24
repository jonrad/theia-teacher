import { Widget } from '@theia/core/lib/browser/widgets';
import { ViewContainerPart } from '@theia/core/lib/browser/view-container';
import { injectable, inject } from 'inversify';
import { Emitter, Event, DisposableCollection, Disposable } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

import '../../src/browser/style/pulse.css';
const CSS_PULSE_CLASS = 'pulse-element';

export interface Highlighter {
    onSelected: Event<void>;
    start(): void;
    stop(): void;
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
}

// Highlights a view container part that has a visible headerElement
@injectable()
export class ViewContainerPartHighlighter implements Highlighter {
    protected readonly disposables: DisposableCollection = new DisposableCollection();
    protected stopDisposable: Disposable | undefined;

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
        if (this.stopDisposable) {
            this.stop();
        }

        const container = this.viewContainerPart.viewContainer;
        const parts = container?.getParts();

        // view-container uses a different title node if there's only one part.
        // I haven't figured out how to highlight that one yet, so we'll just highlight the whole container for the time being
        // TODO: Highlight the single part title instead
        if (container && parts && parts.length === 1) {
            this.viewContainerPart.addClass(CSS_PULSE_CLASS);
            this.stopDisposable = Disposable.create(() => {
                this.viewContainerPart.removeClass(CSS_PULSE_CLASS);
            });
        } else {
            const headerElement = this.viewContainerPart.headerElement;
            headerElement.classList.add(CSS_PULSE_CLASS);
            this.stopDisposable = Disposable.create(() => {
                headerElement.classList.remove(CSS_PULSE_CLASS);
            });
        }
    }

    stop(): void {
        this.stopDisposable?.dispose();
    }
}
