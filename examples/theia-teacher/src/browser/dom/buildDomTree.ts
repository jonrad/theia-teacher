// @ts-nocheck
export const buildDomTree = (
    args = {
        doHighlightElements: true,
        focusHighlightIndex: -1,
        viewportExpansion: 0,
    }
) => {
    const { doHighlightElements, focusHighlightIndex, viewportExpansion } = args;
    let highlightIndex = 0; // Reset highlight index

    // Add caching mechanisms at the top level
    const DOM_CACHE = {
        boundingRects: new WeakMap(),
        computedStyles: new WeakMap(),
        clearCache: () => {
            DOM_CACHE.boundingRects = new WeakMap();
            DOM_CACHE.computedStyles = new WeakMap();
        }
    };

    // Clear the cache before starting
    DOM_CACHE.clearCache();

    // Cache helper functions
    function getCachedBoundingRect(element) {
        if (!element) return null;

        if (DOM_CACHE.boundingRects.has(element)) {
            return DOM_CACHE.boundingRects.get(element);
        }

        const rect = element.getBoundingClientRect();

        if (rect) {
            DOM_CACHE.boundingRects.set(element, rect);
        }
        return rect;
    }

    function getCachedComputedStyle(element) {
        if (!element) return null;

        if (DOM_CACHE.computedStyles.has(element)) {
            return DOM_CACHE.computedStyles.get(element);
        }

        const style = window.getComputedStyle(element);

        if (style) {
            DOM_CACHE.computedStyles.set(element, style);
        }
        return style;
    }

    /**
     * Hash map of DOM nodes indexed by their highlight index.
     *
     * @type {Object<string, any>}
     */
    const DOM_HASH_MAP = {};

    const ID = { current: 0 };

    const HIGHLIGHT_CONTAINER_ID = "playwright-highlight-container";

    /**
     * Highlights an element in the DOM and returns the index of the next element.
     */
    function highlightElement(element, index, parentIframe = null) {
        if (!element) return index;

        // Create or get highlight container
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

        // Get element position
        const rect = element.getBoundingClientRect();

        if (!rect) return index;

        // Generate a color based on the index
        const colors = [
            "#FF0000",
            "#00FF00",
            "#0000FF",
            "#FFA500",
            "#800080",
            "#008080",
            "#FF69B4",
            "#4B0082",
            "#FF4500",
            "#2E8B57",
            "#DC143C",
            "#4682B4",
        ];
        const colorIndex = index % colors.length;
        const baseColor = colors[colorIndex];
        const backgroundColor = baseColor + "1A"; // 10% opacity version of the color

        // Create highlight overlay
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.border = `2px solid ${baseColor}`;
        overlay.style.backgroundColor = backgroundColor;
        overlay.style.pointerEvents = "none";
        overlay.style.boxSizing = "border-box";

        // Get element position
        let iframeOffset = { x: 0, y: 0 };

        // If element is in an iframe, calculate iframe offset
        if (parentIframe) {
            const iframeRect = parentIframe.getBoundingClientRect();
            iframeOffset.x = iframeRect.left;
            iframeOffset.y = iframeRect.top;
        }

        // Calculate position
        const top = rect.top + iframeOffset.y;
        const left = rect.left + iframeOffset.x;

        overlay.style.top = `${top}px`;
        overlay.style.left = `${left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        // Create and position label
        const label = document.createElement("div");
        label.className = "playwright-highlight-label";
        label.style.position = "fixed";
        label.style.background = baseColor;
        label.style.color = "white";
        label.style.padding = "1px 4px";
        label.style.borderRadius = "4px";
        label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`;
        label.textContent = index;

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

        // Add to container
        container.appendChild(overlay);
        container.appendChild(label);

        // Update positions on scroll
        const updatePositions = () => {
            const newRect = element.getBoundingClientRect();
            let newIframeOffset = { x: 0, y: 0 };

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

    /**
     * Returns an XPath tree string for an element.
     */
    function getXPathTree(element, stopAtBoundary = true) {
        const segments = [];
        let currentElement = element;

        while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
            // Stop if we hit a shadow root or iframe
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

            currentElement = currentElement.parentNode;
        }

        return segments.join("/");
    }

    /**
     * Checks if a text node is visible.
     */
    function isTextNodeVisible(textNode) {
        try {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const rect = range.getBoundingClientRect();

            // Simple size check
            if (rect.width === 0 || rect.height === 0) {
                return false;
            }

            // Simple viewport check without scroll calculations
            const isInViewport = !(
                rect.bottom < -viewportExpansion ||
                rect.top > window.innerHeight + viewportExpansion ||
                rect.right < -viewportExpansion ||
                rect.left > window.innerWidth + viewportExpansion
            );

            // Check parent visibility
            const parentElement = textNode.parentElement;
            if (!parentElement) return false;

            try {
                return isInViewport && parentElement.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                });
            } catch (e) {
                // Fallback if checkVisibility is not supported
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

    // Helper function to check if element is accepted
    function isElementAccepted(element) {
        if (!element || !element.tagName) return false;

        // Always accept body and common container elements
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

    /**
     * Checks if an element is visible.
     */
    function isElementVisible(element) {
        const style = getCachedComputedStyle(element);
        return (
            element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
        );
    }

    /**
     * Checks if an element is interactive.
     */
    function isInteractiveElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        // Base interactive elements and roles
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

        // Add check for specific class
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

        // Added enhancement to capture dropdown interactive elements
        if ((element.classList && element.classList.contains('dropdown-toggle')) ||
            element.getAttribute('data-toggle') === 'dropdown' ||
            element.getAttribute('aria-haspopup') === 'true'
        ) {
            return true;
        }

        // Basic role/attribute checks
        const hasInteractiveRole =
            hasAddressInputClass ||
            interactiveElements.has(tagName) ||
            interactiveRoles.has(role) ||
            interactiveRoles.has(ariaRole) ||
            (tabIndex !== null &&
                tabIndex !== "-1" &&
                element.parentElement?.tagName.toLowerCase() !== "body") ||
            element.getAttribute("data-action") === "a-dropdown-select" ||
            element.getAttribute("data-action") === "a-dropdown-button";

        if (hasInteractiveRole) return true;

        // Check for event listeners
        const hasClickHandler =
            element.onclick !== null ||
            element.getAttribute("onclick") !== null ||
            element.hasAttribute("ng-click") ||
            element.hasAttribute("@click") ||
            element.hasAttribute("v-on:click");

        // Helper function to safely get event listeners
        function getEventListeners(el) {
            try {
                return window.getEventListeners?.(el) || {};
            } catch (e) {
                const listeners = {};
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
                    const handler = el[`on${type}`];
                    if (handler) {
                        listeners[type] = [{ listener: handler, useCapture: false }];
                    }
                }
                return listeners;
            }
        }

        // Check for click-related events
        const listeners = getEventListeners(element);
        const hasClickListeners =
            listeners &&
            (listeners.click?.length > 0 ||
                listeners.mousedown?.length > 0 ||
                listeners.mouseup?.length > 0 ||
                listeners.touchstart?.length > 0 ||
                listeners.touchend?.length > 0);

        // Check for ARIA properties
        const hasAriaProps =
            element.hasAttribute("aria-expanded") ||
            element.hasAttribute("aria-pressed") ||
            element.hasAttribute("aria-selected") ||
            element.hasAttribute("aria-checked");

        const isContentEditable = element.getAttribute("contenteditable") === "true" ||
            element.isContentEditable ||
            element.id === "tinymce" ||
            element.classList.contains("mce-content-body") ||
            (element.tagName.toLowerCase() === "body" && element.getAttribute("data-id")?.startsWith("mce_"));

        // Check if element is draggable
        const isDraggable =
            element.draggable || element.getAttribute("draggable") === "true";

        return (
            hasAriaProps ||
            hasClickHandler ||
            hasClickListeners ||
            isDraggable ||
            isContentEditable
        );
    }

    /**
     * Checks if an element is the topmost element at its position.
     */
    function isTopElement(element) {
        const rect = getCachedBoundingRect(element);

        // If element is not in viewport, consider it top
        const isInViewport = (
            rect.left < window.innerWidth &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0
        );

        if (!isInViewport) {
            return true;
        }

        // Find the correct document context and root element
        let doc = element.ownerDocument;

        // If we're in an iframe, elements are considered top by default
        if (doc !== window.document) {
            return true;
        }

        // For shadow DOM, we need to check within its own root context
        const shadowRoot = element.getRootNode();
        if (shadowRoot instanceof ShadowRoot) {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            try {
                const topEl = shadowRoot.elementFromPoint(centerX, centerY);
                if (!topEl) return false;

                let current = topEl;
                while (current && current !== shadowRoot) {
                    if (current === element) return true;
                    current = current.parentElement;
                }
                return false;
            } catch (e) {
                return true;
            }
        }

        // For elements in viewport, check if they're topmost
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        try {
            const topEl = document.elementFromPoint(centerX, centerY);
            if (!topEl) return false;

            let current = topEl;
            while (current && current !== document.documentElement) {
                if (current === element) return true;
                current = current.parentElement;
            }
            return false;
        } catch (e) {
            return true;
        }
    }

    /**
     * Checks if an element is within the expanded viewport.
     */
    function isInExpandedViewport(element, viewportExpansion) {
        if (viewportExpansion === -1) {
            return true;
        }

        const rect = getCachedBoundingRect(element);

        // Simple viewport check without scroll calculations
        return !(
            rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion
        );
    }

    // Add this new helper function
    function getEffectiveScroll(element) {
        let currentEl = element;
        let scrollX = 0;
        let scrollY = 0;

        while (currentEl && currentEl !== document.documentElement) {
            if (currentEl.scrollLeft || currentEl.scrollTop) {
                scrollX += currentEl.scrollLeft;
                scrollY += currentEl.scrollTop;
            }
            currentEl = currentEl.parentElement;
        }

        scrollX += window.scrollX;
        scrollY += window.scrollY;

        return { scrollX, scrollY };
    }

    // Add these helper functions at the top level
    function isInteractiveCandidate(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

        const tagName = element.tagName.toLowerCase();

        // Fast-path for common interactive elements
        const interactiveElements = new Set([
            "a", "button", "input", "select", "textarea", "details", "summary"
        ]);

        if (interactiveElements.has(tagName)) return true;

        // Quick attribute checks without getting full lists
        const hasQuickInteractiveAttr = element.hasAttribute("onclick") ||
            element.hasAttribute("role") ||
            element.hasAttribute("tabindex") ||
            element.hasAttribute("aria-") ||
            element.hasAttribute("data-action") ||
            element.getAttribute("contenteditable") == "true";
        return hasQuickInteractiveAttr;
    }

    function quickVisibilityCheck(element) {
        // Fast initial check before expensive getComputedStyle
        return element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            !element.hasAttribute("hidden") &&
            element.style.display !== "none" &&
            element.style.visibility !== "hidden";
    }

    /**
     * Creates a node data object for a given node and its descendants.
     */
    function buildDomTree(node, parentIframe = null) {
        if (!node || node.id === HIGHLIGHT_CONTAINER_ID) {
            return null;
        }

        // Special handling for root node (body)
        if (node === document.body) {
            const nodeData = {
                tagName: 'body',
                attributes: {},
                xpath: '/body',
                children: [],
            };

            // Process children of body
            for (const child of node.childNodes) {
                const domElement = buildDomTree(child, parentIframe);
                if (domElement) nodeData.children.push(domElement);
            }

            const id = `${ID.current++}`;
            DOM_HASH_MAP[id] = nodeData;
            return id;
        }

        // Early bailout for non-element nodes except text
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
            return null;
        }

        // Process text nodes
        if (node.nodeType === Node.TEXT_NODE) {
            const textContent = node.textContent.trim();
            if (!textContent) {
                return null;
            }

            // Only check visibility for text nodes that might be visible
            const parentElement = node.parentElement;
            if (!parentElement || parentElement.tagName.toLowerCase() === 'script') {
                return null;
            }

            const id = `${ID.current++}`;
            DOM_HASH_MAP[id] = {
                type: "TEXT_NODE",
                text: textContent,
                isVisible: isTextNodeVisible(node),
            };
            return id;
        }

        // Quick checks for element nodes
        if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
            return null;
        }

        // Early viewport check - only filter out elements clearly outside viewport
        if (viewportExpansion !== -1) {
            const rect = getCachedBoundingRect(node);
            const style = getCachedComputedStyle(node);

            // Skip viewport check for fixed/sticky elements as they may appear anywhere
            const isFixedOrSticky = style && (style.position === 'fixed' || style.position === 'sticky');

            // Check if element has actual dimensions
            const hasSize = node.offsetWidth > 0 || node.offsetHeight > 0;

            if (!rect || (!isFixedOrSticky && !hasSize && (
                rect.bottom < -viewportExpansion ||
                rect.top > window.innerHeight + viewportExpansion ||
                rect.right < -viewportExpansion ||
                rect.left > window.innerWidth + viewportExpansion
            ))) {
                return null;
            }
        }

        // Process element node
        const nodeData = {
            id: node.id,
            tagName: node.tagName.toLowerCase(),
            attributes: {},
            xpath: getXPathTree(node, true),
            children: [],
        };

        // Get attributes for interactive elements or potential text containers
        if (isInteractiveElement(node) || node.tagName.toLowerCase() === 'iframe' || node.tagName.toLowerCase() === 'body') {
            const attributeNames = node.getAttributeNames?.() || [];
            for (const name of attributeNames) {
                nodeData.attributes[name] = node.getAttribute(name);
            }
        }

        // Check interactivity
        if (node.nodeType === Node.ELEMENT_NODE) {
            nodeData.isVisible = isElementVisible(node);
            if (nodeData.isVisible) {
                nodeData.isTopElement = isTopElement(node);
                if (nodeData.isTopElement) {
                    nodeData.isInteractive = isInteractiveElement(node);
                    if (nodeData.isInteractive) {
                        nodeData.isInViewport = true;
                        nodeData.highlightIndex = highlightIndex++;

                        if (doHighlightElements) {
                            if (focusHighlightIndex >= 0) {
                                if (focusHighlightIndex === nodeData.highlightIndex) {
                                    highlightElement(node, nodeData.highlightIndex, parentIframe);
                                }
                            } else {
                                highlightElement(node, nodeData.highlightIndex, parentIframe);
                            }
                        }
                    }
                }
            }
        }

        // Process children, with special handling for iframes and rich text editors
        if (node.tagName) {
            const tagName = node.tagName.toLowerCase();

            // Handle iframes
            if (tagName === "iframe") {
                try {
                    const iframeDoc = node.contentDocument || node.contentWindow?.document;
                    if (iframeDoc) {
                        for (const child of iframeDoc.childNodes) {
                            const domElement = buildDomTree(child, node);
                            if (domElement) nodeData.children.push(domElement);
                        }
                    }
                } catch (e) {
                    console.warn("Unable to access iframe:", e);
                }
            }
            // Handle rich text editors and contenteditable elements
            else if (
                node.isContentEditable ||
                node.getAttribute("contenteditable") === "true" ||
                node.id === "tinymce" ||
                node.classList.contains("mce-content-body") ||
                (tagName === "body" && node.getAttribute("data-id")?.startsWith("mce_"))
            ) {
                // Process all child nodes to capture formatted text
                for (const child of node.childNodes) {
                    const domElement = buildDomTree(child, parentIframe);
                    if (domElement) nodeData.children.push(domElement);
                }
            }
            // Handle shadow DOM
            else if (node.shadowRoot) {
                nodeData.shadowRoot = true;
                for (const child of node.shadowRoot.childNodes) {
                    const domElement = buildDomTree(child, parentIframe);
                    if (domElement) nodeData.children.push(domElement);
                }
            }
            // Handle regular elements
            else {
                for (const child of node.childNodes) {
                    const domElement = buildDomTree(child, parentIframe);
                    if (domElement) nodeData.children.push(domElement);
                }
            }
        }

        // Skip empty anchor tags
        if (nodeData.tagName === 'a' && nodeData.children.length === 0 && !nodeData.attributes.href) {
            return null;
        }

        const id = `${ID.current++}`;
        DOM_HASH_MAP[id] = nodeData;
        return id;
    }

    const rootId = buildDomTree(document.body);

    return { rootId, map: DOM_HASH_MAP };
};
