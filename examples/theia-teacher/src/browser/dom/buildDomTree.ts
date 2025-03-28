/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable curly */
/* eslint-disable no-null/no-null */
// @ts-nocheck

// ==================== Interfaces ====================
interface DOMCache {
    boundingRects: WeakMap<Element, DOMRect>;
    computedStyles: WeakMap<Element, CSSStyleDeclaration>;
    clearCache: () => void;
}

interface DOMTreeArgs {
    doHighlightElements?: boolean;
    focusHighlightIndex?: number;
    viewportExpansion?: number;
}

interface NodeData {
    id?: string;
    tagName?: string;
    type?: string;
    text?: string;
    attributes: Record<string, string>;
    xpath: string;
    children: string[];
    isVisible?: boolean;
    isTopElement?: boolean;
    isInteractive?: boolean;
    isInViewport?: boolean;
    highlightIndex?: number;
    shadowRoot?: boolean;
}

// ==================== Constants ====================
const HIGHLIGHT_CONTAINER_ID = 'playwright-highlight-container';

// Global state
let highlightIndex = 0;
let viewportExpansion = 0;
let doHighlightElements = true;
let focusHighlightIndex = -1;
const ID = { current: 0 };
const DOM_HASH_MAP: Record<string, NodeData> = {};

// Cache mechanism
const DOM_CACHE: DOMCache = {
    boundingRects: new WeakMap(),
    computedStyles: new WeakMap(),
    clearCache: () => {
        DOM_CACHE.boundingRects = new WeakMap();
        DOM_CACHE.computedStyles = new WeakMap();
    }
};

// ==================== Cache Helper Functions ====================
function getCachedBoundingRect(element: Element): DOMRect | null {
    if (!element) return null;

    if (DOM_CACHE.boundingRects.has(element)) {
        return DOM_CACHE.boundingRects.get(element) || null;
    }

    const rect = element.getBoundingClientRect();

    if (rect) {
        DOM_CACHE.boundingRects.set(element, rect);
    }
    return rect;
}

function getCachedComputedStyle(element: Element): CSSStyleDeclaration | null {
    if (!element) return null;

    if (DOM_CACHE.computedStyles.has(element)) {
        return DOM_CACHE.computedStyles.get(element) || null;
    }

    const style = window.getComputedStyle(element);

    if (style) {
        DOM_CACHE.computedStyles.set(element, style);
    }
    return style;
}

// ==================== DOM Utility Functions ====================
function getEventListeners(
    el: Element
): Record<string, Array<{ listener: Function; useCapture: boolean }>> {
    try {
        return (window as any).getEventListeners?.(el) || {};
    } catch (e) {
        const listeners: Record<
            string,
            Array<{ listener: Function; useCapture: boolean }>
        > = {};
        const eventTypes = [
            "click",
            "mousedown",
            "mouseup",
            "touchstart",
            "touchend",
            "keydown",
            "keyup",
            "focus",
            "blur",
        ];

        for (const type of eventTypes) {
            const handler = (el as any)[`on${type}`];
            if (handler) {
                listeners[type] = [{ listener: handler, useCapture: false }];
            }
        }
        return listeners;
    }
}

function getXPathTree(element: Element, stopAtBoundary = true): string {
    const segments: string[] = [];
    let currentElement: Element | null = element;

    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
        if (
            stopAtBoundary &&
            (currentElement.parentNode instanceof ShadowRoot ||
                currentElement.parentNode instanceof HTMLIFrameElement)
        ) {
            break;
        }

        let index = 0;
        let sibling = currentElement.previousSibling;
        while (sibling) {
            if (
                sibling.nodeType === Node.ELEMENT_NODE &&
                sibling.nodeName === currentElement.nodeName
            ) {
                index++;
            }
            sibling = sibling.previousSibling;
        }

        const tagName = currentElement.nodeName.toLowerCase();
        const xpathIndex = index > 0 ? `[${index + 1}]` : "";
        segments.unshift(`${tagName}${xpathIndex}`);

        currentElement = currentElement.parentNode as Element;
    }

    return segments.join("/");
}

function getEffectiveScroll(element: Element): { scrollX: number; scrollY: number } {
    let currentEl: Element | null = element;
    let scrollX = 0;
    let scrollY = 0;

    while (currentEl && currentEl !== document.documentElement) {
        if ((currentEl as HTMLElement).scrollLeft || (currentEl as HTMLElement).scrollTop) {
            scrollX += (currentEl as HTMLElement).scrollLeft;
            scrollY += (currentEl as HTMLElement).scrollTop;
        }
        currentEl = currentEl.parentElement;
    }

    scrollX += window.scrollX;
    scrollY += window.scrollY;

    return { scrollX, scrollY };
}

// ==================== Visibility Check Functions ====================
function isTextNodeVisible(textNode: Text): boolean {
    try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            return false;
        }

        const isInViewport = !(
            rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion
        );

        const parentElement = textNode.parentElement;
        if (!parentElement) return false;

        try {
            return isInViewport && parentElement.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
            });
        } catch (e) {
            const style = window.getComputedStyle(parentElement);
            return isInViewport &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0';
        }
    } catch (e) {
        console.warn('Error checking text node visibility:', e);
        return false;
    }
}

function isElementVisible(element: Element): boolean {
    const style = getCachedComputedStyle(element);
    return (
        (element as HTMLElement).offsetWidth > 0 &&
        (element as HTMLElement).offsetHeight > 0 &&
        style?.visibility !== "hidden" &&
        style?.display !== "none"
    );
}

function quickVisibilityCheck(element: Element): boolean {
    return (element as HTMLElement).offsetWidth > 0 &&
        (element as HTMLElement).offsetHeight > 0 &&
        !element.hasAttribute("hidden") &&
        (element as HTMLElement).style.display !== "none" &&
        (element as HTMLElement).style.visibility !== "hidden";
}

function isInExpandedViewport(element: Element, expansion: number): boolean {
    if (expansion === -1) {
        return true;
    }

    const rect = getCachedBoundingRect(element);
    if (!rect) return false;

    return !(
        rect.bottom < -expansion ||
        rect.top > window.innerHeight + expansion ||
        rect.right < -expansion ||
        rect.left > window.innerWidth + expansion
    );
}

// ==================== Element Type Check Functions ====================
function isElementAccepted(element: Element): boolean {
    if (!element || !element.tagName) return false;

    if (element.classList.contains('theia-nohighlight')) {
        return false;
    }

    const alwaysAccept = new Set([
        "body", "div", "main", "article", "section", "nav", "header", "footer"
    ]);
    const tagName = element.tagName.toLowerCase();

    if (alwaysAccept.has(tagName)) return true;

    const leafElementDenyList = new Set([
        "svg",
        "script",
        "style",
        "link",
        "meta",
        "noscript",
        "template",
    ]);

    return !leafElementDenyList.has(tagName);
}

function isInteractiveElement(element: Element): boolean {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    const interactiveElements = new Set([
        "a", "button", "details", "embed", "input", "menu", "menuitem",
        "object", "select", "textarea", "canvas", "summary", "dialog",
        "banner"
    ]);

    const interactiveRoles = new Set([
        'button-icon', 'dialog', 'button-text-icon-only', 'treeitem', 'alert', 'grid', 'progressbar', 'radio', 'checkbox', 'menuitem', 'option', 'switch', 'dropdown',
        'scrollbar', 'combobox', 'a-button-text', 'button', 'region', 'textbox', 'tabpanel', 'tab', 'click', 'button-text', 'spinbutton', 'a-button-inner', 'link', 'menu',
        'slider', 'listbox', 'a-dropdown-button', 'button-icon-only', 'searchbox', 'menuitemradio', 'tooltip', 'tree', 'menuitemcheckbox'
    ]);

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    const ariaRole = element.getAttribute("aria-role");
    const tabIndex = element.getAttribute("tabindex");

    const hasAddressInputClass = element.classList && (
        element.classList.contains("address-input__container__input") ||
        element.classList.contains("nav-btn") ||
        element.classList.contains("pull-left")
    );

    if (element.classList) {
        if (element.classList.contains('theia-highlight') || element.classList.contains('lm-TabBar-tab')) {
            return true;
        }
    }

    if ((element.classList && element.classList.contains('dropdown-toggle')) ||
        element.getAttribute('data-toggle') === 'dropdown' ||
        element.getAttribute('aria-haspopup') === 'true'
    ) {
        return true;
    }

    const hasInteractiveRole =
        hasAddressInputClass ||
        interactiveElements.has(tagName) ||
        interactiveRoles.has(role || '') ||
        interactiveRoles.has(ariaRole || '') ||
        (tabIndex !== null &&
            tabIndex !== "-1" &&
            element.parentElement?.tagName.toLowerCase() !== "body") ||
        element.getAttribute("data-action") === "a-dropdown-select" ||
        element.getAttribute("data-action") === "a-dropdown-button";

    if (hasInteractiveRole) return true;

    const hasClickHandler =
        (element as HTMLElement).onclick !== null ||
        element.getAttribute("onclick") !== null ||
        element.hasAttribute("ng-click") ||
        element.hasAttribute("@click") ||
        element.hasAttribute("v-on:click");

    const listeners = getEventListeners(element);
    const hasClickListeners =
        listeners &&
        (listeners.click?.length > 0 ||
            listeners.mousedown?.length > 0 ||
            listeners.mouseup?.length > 0 ||
            listeners.touchstart?.length > 0 ||
            listeners.touchend?.length > 0);

    const hasAriaProps =
        element.hasAttribute("aria-expanded") ||
        element.hasAttribute("aria-pressed") ||
        element.hasAttribute("aria-selected") ||
        element.hasAttribute("aria-checked");

    const isContentEditable = element.getAttribute("contenteditable") === "true" ||
        (element as HTMLElement).isContentEditable ||
        element.id === "tinymce" ||
        element.classList.contains("mce-content-body") ||
        (element.tagName.toLowerCase() === "body" && element.getAttribute("data-id")?.startsWith("mce_")) || false;

    const isDraggable =
        (element as HTMLElement).draggable || element.getAttribute("draggable") === "true";

    return (
        hasAriaProps ||
        hasClickHandler ||
        hasClickListeners ||
        isDraggable ||
        isContentEditable
    );
}

function isInteractiveCandidate(element: Element): boolean {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const tagName = element.tagName.toLowerCase();
    const interactiveElements = new Set([
        "a", "button", "input", "select", "textarea", "details", "summary"
    ]);

    if (interactiveElements.has(tagName)) return true;

    const hasQuickInteractiveAttr = element.hasAttribute("onclick") ||
        element.hasAttribute("role") ||
        element.hasAttribute("tabindex") ||
        element.hasAttribute("aria-") ||
        element.hasAttribute("data-action") ||
        element.getAttribute("contenteditable") === "true";
    return hasQuickInteractiveAttr;
}

function isTopElement(element: Element): boolean {
    const rect = getCachedBoundingRect(element);
    if (!rect) return false;

    const isInViewport = (
        rect.left < window.innerWidth &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0
    );

    if (!isInViewport) {
        return true;
    }

    const doc = element.ownerDocument;

    if (doc !== window.document) {
        return true;
    }

    const shadowRoot = element.getRootNode();
    if (shadowRoot instanceof ShadowRoot) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        try {
            const topEl = shadowRoot.elementFromPoint(centerX, centerY);
            if (!topEl) return false;

            let current: Element | null = topEl;
            while (current && current !== shadowRoot.host) {
                if (current === element) return true;
                current = current.parentElement;
            }
            return false;
        } catch (e) {
            return true;
        }
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    try {
        const topEl = document.elementFromPoint(centerX, centerY);
        if (!topEl) return false;

        let current: Element | null = topEl;
        while (current && current !== document.documentElement) {
            if (current === element) return true;
            current = current.parentElement;
        }
        return false;
    } catch (e) {
        return true;
    }
}

// ==================== Highlighting Functions ====================
function highlightElement(element: Element, index: number, parentIframe: HTMLIFrameElement | null): number {
    if (!element) return index;

    let container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (!container) {
        container = document.createElement("div");
        container.id = HIGHLIGHT_CONTAINER_ID;
        container.style.position = "fixed";
        container.style.pointerEvents = "none";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.zIndex = "2147483647";
        document.body.appendChild(container);
    }

    const rect = element.getBoundingClientRect();
    if (!rect) return index;

    const colors = [
        "#FF0000", "#00FF00", "#0000FF", "#FFA500", "#800080",
        "#008080", "#FF69B4", "#4B0082", "#FF4500", "#2E8B57",
        "#DC143C", "#4682B4",
    ];
    const colorIndex = index % colors.length;
    const baseColor = colors[colorIndex];
    const backgroundColor = baseColor + "1A";

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.border = `2px solid ${baseColor}`;
    overlay.style.backgroundColor = backgroundColor;
    overlay.style.pointerEvents = "none";
    overlay.style.boxSizing = "border-box";

    const iframeOffset = { x: 0, y: 0 };

    if (parentIframe) {
        const iframeRect = parentIframe.getBoundingClientRect();
        iframeOffset.x = iframeRect.left;
        iframeOffset.y = iframeRect.top;
    }

    const top = rect.top + iframeOffset.y;
    const left = rect.left + iframeOffset.x;

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const label = document.createElement("div");
    label.className = "playwright-highlight-label";
    label.style.position = "fixed";
    label.style.background = baseColor;
    label.style.color = "white";
    label.style.padding = "1px 4px";
    label.style.borderRadius = "4px";
    label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`;
    label.textContent = String(index);

    const labelWidth = 20;
    const labelHeight = 16;

    let labelTop = top + 2;
    let labelLeft = left + rect.width - labelWidth - 2;

    if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
        labelTop = top - labelHeight - 2;
        labelLeft = left + rect.width - labelWidth;
    }

    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;

    container.appendChild(overlay);
    container.appendChild(label);

    const updatePositions = () => {
        const newRect = element.getBoundingClientRect();
        const newIframeOffset = { x: 0, y: 0 };

        if (parentIframe) {
            const iframeRect = parentIframe.getBoundingClientRect();
            newIframeOffset.x = iframeRect.left;
            newIframeOffset.y = iframeRect.top;
        }

        const newTop = newRect.top + newIframeOffset.y;
        const newLeft = newRect.left + newIframeOffset.x;

        overlay.style.top = `${newTop}px`;
        overlay.style.left = `${newLeft}px`;
        overlay.style.width = `${newRect.width}px`;
        overlay.style.height = `${newRect.height}px`;

        let newLabelTop = newTop + 2;
        let newLabelLeft = newLeft + newRect.width - labelWidth - 2;

        if (newRect.width < labelWidth + 4 || newRect.height < labelHeight + 4) {
            newLabelTop = newTop - labelHeight - 2;
            newLabelLeft = newLeft + newRect.width - labelWidth;
        }

        label.style.top = `${newLabelTop}px`;
        label.style.left = `${newLabelLeft}px`;
    };

    window.addEventListener('scroll', updatePositions);
    window.addEventListener('resize', updatePositions);

    return index + 1;
}

// ==================== Core DOM Tree Functions ====================
function createDomTreeNode(node: Node, parentIframe: HTMLIFrameElement | null = null): string | null {
    if (!node || (node as Element).id === HIGHLIGHT_CONTAINER_ID) {
        return null;
    }

    if (node === document.body) {
        const nodeData: NodeData = {
            tagName: 'body',
            attributes: {},
            xpath: '/body',
            children: [],
        };

        for (const child of Array.from(node.childNodes)) {
            const domElement = createDomTreeNode(child, parentIframe);
            if (domElement) nodeData.children.push(domElement);
        }

        const id = `${ID.current++}`;
        DOM_HASH_MAP[id] = nodeData;
        return id;
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent?.trim() || '';
        if (!textContent) {
            return null;
        }

        const parentElement = node.parentElement;
        if (!parentElement || parentElement.tagName.toLowerCase() === 'script') {
            return null;
        }

        const id = `${ID.current++}`;
        DOM_HASH_MAP[id] = {
            type: "TEXT_NODE",
            text: textContent,
            isVisible: isTextNodeVisible(node as Text),
            attributes: {},
            xpath: '',
            children: []
        };
        return id;
    }

    const element = node as Element;

    if (!isElementAccepted(element)) {
        return null;
    }

    if (viewportExpansion !== -1) {
        const rect = getCachedBoundingRect(element);
        const style = getCachedComputedStyle(element);

        const isFixedOrSticky = style && (style.position === 'fixed' || style.position === 'sticky');
        const hasSize = (element as HTMLElement).offsetWidth > 0 || (element as HTMLElement).offsetHeight > 0;

        if (!rect || (!isFixedOrSticky && !hasSize && (
            rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion
        ))) {
            return null;
        }
    }

    const nodeData: NodeData = {
        id: element.id,
        tagName: element.tagName.toLowerCase(),
        attributes: {},
        xpath: getXPathTree(element, true),
        children: [],
    };

    if (isInteractiveElement(element) || element.tagName.toLowerCase() === 'iframe' || element.tagName.toLowerCase() === 'body') {
        const attributeNames = element.getAttributeNames?.() || [];
        for (const name of attributeNames) {
            nodeData.attributes[name] = element.getAttribute(name) || '';
        }
    }

    nodeData.isVisible = isElementVisible(element);
    if (nodeData.isVisible) {
        nodeData.isTopElement = isTopElement(element);
        if (nodeData.isTopElement) {
            nodeData.isInteractive = isInteractiveElement(element);
            if (nodeData.isInteractive) {
                nodeData.isInViewport = true;
                nodeData.highlightIndex = highlightIndex++;

                if (doHighlightElements) {
                    if (focusHighlightIndex >= 0) {
                        if (focusHighlightIndex === nodeData.highlightIndex) {
                            highlightElement(element, nodeData.highlightIndex, parentIframe);
                        }
                    } else {
                        highlightElement(element, nodeData.highlightIndex, parentIframe);
                    }
                }
            }
        }
    }

    if (element.tagName) {
        const tagName = element.tagName.toLowerCase();

        if (tagName === "iframe") {
            try {
                const iframeDoc = (element as HTMLIFrameElement).contentDocument || (element as HTMLIFrameElement).contentWindow?.document;
                if (iframeDoc) {
                    for (const child of Array.from(iframeDoc.childNodes)) {
                        const domElement = createDomTreeNode(child, element as HTMLIFrameElement);
                        if (domElement) nodeData.children.push(domElement);
                    }
                }
            } catch (e) {
                console.warn("Unable to access iframe:", e);
            }
        }
        else if (
            (element as HTMLElement).isContentEditable ||
            element.getAttribute("contenteditable") === "true" ||
            element.id === "tinymce" ||
            element.classList.contains("mce-content-body") ||
            (tagName === "body" && element.getAttribute("data-id")?.startsWith("mce_"))
        ) {
            for (const child of Array.from(element.childNodes)) {
                const domElement = createDomTreeNode(child, parentIframe);
                if (domElement) nodeData.children.push(domElement);
            }
        }
        else if (element.shadowRoot) {
            nodeData.shadowRoot = true;
            for (const child of Array.from(element.shadowRoot.childNodes)) {
                const domElement = createDomTreeNode(child, parentIframe);
                if (domElement) nodeData.children.push(domElement);
            }
        }
        else {
            for (const child of Array.from(element.childNodes)) {
                const domElement = createDomTreeNode(child, parentIframe);
                if (domElement) nodeData.children.push(domElement);
            }
        }
    }

    if (nodeData.tagName === 'a' && nodeData.children.length === 0 && !nodeData.attributes['href']) {
        return null;
    }

    const id = `${ID.current++}`;
    DOM_HASH_MAP[id] = nodeData;
    return id;
}

// ==================== Public API ====================
export function buildDomTree(args: DOMTreeArgs = {}): { rootId: string | null; map: Record<string, NodeData> } {
    highlightIndex = 0;
    ID.current = 0;
    DOM_CACHE.clearCache();

    doHighlightElements = args.doHighlightElements ?? true;
    focusHighlightIndex = args.focusHighlightIndex ?? -1;
    viewportExpansion = args.viewportExpansion ?? 0;

    const container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
    if (container) {
        container.remove();
    }

    const rootId = createDomTreeNode(document.body);
    return { rootId, map: DOM_HASH_MAP };
}
