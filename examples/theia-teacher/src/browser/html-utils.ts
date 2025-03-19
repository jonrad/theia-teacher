import { isVisible } from 'dom-helpers';
import { Disposable } from '@theia/core/lib/common/disposable';

// Clone the node deeply and remove all hidden nodes
export function cloneVisibleElements(originalElement: HTMLElement): HTMLElement {
    // Clone the node deeply
    const clonedElement = originalElement.cloneNode(true) as HTMLElement;

    function removeHiddenNodes(original: HTMLElement, clone: HTMLElement) {
        const originalChildren = Array.from(original.children) as HTMLElement[];
        const clonedChildren = Array.from(clone.children) as HTMLElement[];

        clonedChildren.forEach((clonedChild, index) => {
            const originalChild = originalChildren[index];

            if (originalChild && !isVisible(originalChild)) {
                clonedChild.remove(); // Remove from cloned tree if invisible
            } else {
                removeHiddenNodes(originalChild, clonedChild as HTMLElement); // Recur for nested elements
            }
        });
    }

    removeHiddenNodes(originalElement, clonedElement);
    return clonedElement;
}

export function addListenerAsDisposable<K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): Disposable {
    node.addEventListener(type, listener, options);

    return Disposable.create(() => {
        node.removeEventListener(type, listener, options);
    });
}

export function addOneTimeListener<K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): Disposable {

    let disposable: Disposable | undefined = undefined;

    const listenerWrapper = (ev: HTMLElementEventMap[K]) => {
        listener(ev);
        disposable?.dispose();
    }

    disposable = Disposable.create(() => {
        node.removeEventListener(type, listenerWrapper, options);
    });

    node.addEventListener(type, listenerWrapper, options);

    return disposable;
}
