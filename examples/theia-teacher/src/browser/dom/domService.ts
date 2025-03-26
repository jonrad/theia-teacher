import { injectable } from '@theia/core/shared/inversify';
import { buildDomTree } from './buildDomTree';

const logger = console; // Replace with your preferred logging system

interface ViewportInfo {
    width: number;
    height: number;
}

export const ALL_ATTRIBUTES = 'all';

export interface DOMTextOutput {
    type: 'text';
    text: string;
}

export interface DOMNodeOutput {
    type: 'element';
    tagName?: string;
    highlightIndex?: number;
    attributes?: Record<string, string>;
    text?: string;
    children?: DOMOutput[];
}

export type DOMOutput = DOMNodeOutput | DOMTextOutput;

@injectable()
export class DomService {
    private lastSelectorMap: SelectorMap | undefined;

    constructor() {
    }

    public getLastSelectorMap(): SelectorMap | undefined {
        return this.lastSelectorMap;
    }

    // region - Clickable elements
    async getClickableElements(
        highlightElements: boolean = true,
        focusElement: number = -1,
        viewportExpansion: number = 0
    ): Promise<DOMState> {
        const [elementTree, selectorMap] = await this._buildDomTree(
            highlightElements,
            focusElement,
            viewportExpansion
        );
        this.lastSelectorMap = selectorMap;
        return { elementTree, selectorMap };
    }

    private async _buildDomTree(
        highlightElements: boolean,
        focusElement: number,
        viewportExpansion: number
    ): Promise<[DOMElementNode, SelectorMap]> {
        const args = {
            doHighlightElements: highlightElements,
            focusHighlightIndex: focusElement,
            viewportExpansion: viewportExpansion,
        };

        try {
            const evalPage = await buildDomTree(args);
            return await this._constructDomTree(evalPage);
        } catch (e) {
            logger.error(`Error evaluating JavaScript: ${e}`);
            throw e;
        }
    }

    private async _constructDomTree(
        evalPage: any
    ): Promise<[DOMElementNode, SelectorMap]> {
        const jsNodeMap = evalPage.map;
        const jsRootId = evalPage.rootId;

        const selectorMap: SelectorMap = {};
        const nodeMap: Record<string, DOMBaseNode> = {};

        for (const [id, nodeData] of Object.entries(jsNodeMap)) {
            const [node, childrenIds] = this._parseNode(nodeData as any);
            if (!node) {
                continue;
            }

            nodeMap[id] = node;

            if (node instanceof DOMElementNode && node.highlightIndex !== undefined) {
                selectorMap[node.highlightIndex] = node;
            }

            // NOTE: We know that we are building the tree bottom up
            //       and all children are already processed.
            if (node instanceof DOMElementNode) {
                for (const childId of childrenIds) {
                    if (!(childId in nodeMap)) {
                        continue;
                    }

                    const childNode = nodeMap[childId];
                    childNode.parent = node;
                    node.children.push(childNode);
                }
            }
        }

        const htmlToDict = nodeMap[String(jsRootId)];

        // Clear references to help with garbage collection
        // (TypeScript doesn't have a direct equivalent of Python's gc.collect())

        if (!htmlToDict || !(htmlToDict instanceof DOMElementNode)) {
            throw new Error('Failed to parse HTML to dictionary');
        }

        return [htmlToDict, selectorMap];
    }

    private _parseNode(
        nodeData: any
    ): [DOMBaseNode | undefined, number[]] {
        if (!nodeData) {
            return [undefined, []];
        }

        // Process text nodes immediately
        if (nodeData.type === 'TEXT_NODE') {
            const textNode = new DOMTextNode(nodeData.isVisible, nodeData.text, undefined);
            return [textNode, []];
        }

        // Process coordinates if they exist for element nodes
        let viewportInfo: ViewportInfo | undefined;

        if ('viewport' in nodeData) {
            viewportInfo = {
                width: nodeData.viewport.width,
                height: nodeData.viewport.height,
            };
        }

        const elementNode = new DOMElementNode({
            isVisible: nodeData.isVisible,
            tagName: nodeData.tagName,
            xpath: nodeData.xpath,
            attributes: nodeData.attributes || {},
            children: [],
            isInteractive: nodeData.isInteractive,
            isTopElement: nodeData.isTopElement,
            isInViewport: nodeData.isInViewport,
            highlightIndex: nodeData.highlightIndex,
            shadowRoot: nodeData.shadowRoot,
            parent: undefined,
            viewportInfo: viewportInfo ?? undefined,
            viewportCoordinates: undefined,
            pageCoordinates: undefined,
        });

        const childrenIds = nodeData.children || [];

        return [elementNode, childrenIds];
    }
}

interface CoordinateSet {
    // Assuming these are the properties based on imports
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ViewportInfo {
    // Assuming properties based on imports
    width: number;
    height: number;
}

interface HashedDomElement {
    // Placeholder for the hashed element type
    hash: string;
}

export class DOMBaseNode {
    isVisible: boolean;
    parent: DOMElementNode | undefined;

    constructor(isVisible: boolean, parent: DOMElementNode | undefined = undefined) {
        this.isVisible = isVisible;
        this.parent = parent;
    }
}

export class DOMTextNode extends DOMBaseNode {
    text: string;
    type: string = 'TEXT_NODE';

    constructor(isVisible: boolean, text: string, parent: DOMElementNode | undefined = undefined) {
        super(isVisible, parent);
        this.text = text;
    }

    hasParentWithHighlightIndex(): boolean {
        let current = this.parent;
        while (current !== undefined) {
            // stop if the element has a highlight index (will be handled separately)
            if (current.highlightIndex !== undefined) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    isParentInViewport(): boolean {
        if (this.parent === undefined) {
            return false;
        }
        return this.parent.isInViewport;
    }

    isParentTopElement(): boolean {
        if (this.parent === undefined) {
            return false;
        }
        return this.parent.isTopElement;
    }
}

export class DOMElementNode extends DOMBaseNode {
    tagName: string;
    xpath: string;
    attributes: Record<string, string>;
    children: DOMBaseNode[];
    isInteractive: boolean;
    isTopElement: boolean;
    isInViewport: boolean;
    shadowRoot: boolean;
    highlightIndex: number | undefined;
    viewportCoordinates: CoordinateSet | undefined;
    pageCoordinates: CoordinateSet | undefined;
    viewportInfo: ViewportInfo | undefined;
    private hashCache: HashedDomElement | undefined = undefined;

    constructor(args: {
        isVisible: boolean,
        tagName: string,
        xpath: string,
        attributes: Record<string, string>,
        children: DOMBaseNode[],
        isInteractive: boolean,
        isTopElement: boolean,
        isInViewport: boolean,
        shadowRoot: boolean,
        highlightIndex: number | undefined,
        viewportCoordinates: CoordinateSet | undefined,
        pageCoordinates: CoordinateSet | undefined,
        viewportInfo: ViewportInfo | undefined,
        parent: DOMElementNode | undefined
    }) {
        super(args.isVisible, args.parent);
        this.tagName = args.tagName;
        this.xpath = args.xpath;
        this.attributes = args.attributes;
        this.children = args.children;
        this.isInteractive = args.isInteractive;
        this.isTopElement = args.isTopElement;
        this.isInViewport = args.isInViewport;
        this.shadowRoot = args.shadowRoot;
        this.highlightIndex = args.highlightIndex;
        this.viewportCoordinates = args.viewportCoordinates;
        this.pageCoordinates = args.pageCoordinates;
        this.viewportInfo = args.viewportInfo;
    }

    override toString(): string {
        let tagStr = `<${this.tagName}`;

        // Add attributes
        for (const [key, value] of Object.entries(this.attributes)) {
            tagStr += ` ${key}="${value}"`;
        }
        tagStr += '>';

        // Add extra info
        const extras: string[] = [];
        if (this.isInteractive) {
            extras.push('interactive');
        }
        if (this.isTopElement) {
            extras.push('top');
        }
        if (this.shadowRoot) {
            extras.push('shadow-root');
        }
        if (this.highlightIndex !== undefined) {
            extras.push(`highlight:${this.highlightIndex}`);
        }
        if (this.isInViewport) {
            extras.push('in-viewport');
        }

        if (extras.length > 0) {
            tagStr += ` [${extras.join(", ")}]`;
        }

        // Add children
        if (this.children.length > 0) {
            tagStr += '\n';
            for (const child of this.children) {
                // Indent child nodes
                tagStr += child.toString().split('\n').map(line => '  ' + line).join('\n') + '\n';
            }
        }

        return tagStr;
    }

    get hash(): HashedDomElement {
        if (this.hashCache === undefined) {
            // This would need to be implemented based on the HistoryTreeProcessor logic
            this.hashCache = this.computeHash();
        }
        return this.hashCache;
    }

    private computeHash(): HashedDomElement {
        // Placeholder for hash computation logic
        return { hash: `hash-${this.tagName}-${Date.now()}` };
    }

    getAllTextTillNextClickableElement(maxDepth: number = -1): string {
        const textParts: string[] = [];

        const collectText = (node: DOMBaseNode, currentDepth: number): void => {
            if (maxDepth !== -1 && currentDepth > maxDepth) {
                return;
            }

            // Skip this branch if we hit a highlighted element (except for the current node)
            if (node instanceof DOMElementNode && node !== this && node.highlightIndex !== undefined) {
                return;
            }

            if (node instanceof DOMTextNode) {
                textParts.push(node.text);
            } else if (node instanceof DOMElementNode) {
                for (const child of node.children) {
                    collectText(child, currentDepth + 1);
                }
            }
        };

        collectText(this, 0);
        return textParts.join('\n').trim();
    }

    clickableElementsToString(includeAttributes: string[] | typeof ALL_ATTRIBUTES | undefined = undefined): DOMOutput {
        const processNode = (node: DOMBaseNode, depth: number): DOMOutput | undefined => {
            if (node instanceof DOMElementNode) {
                // Add element with highlightIndex
                let nodeOutput: DOMNodeOutput | undefined = undefined;
                if (node.highlightIndex !== undefined) {
                    let attributes: Record<string, string> = {};
                    const text = node.getAllTextTillNextClickableElement();

                    if (includeAttributes !== undefined) {
                        if (includeAttributes === ALL_ATTRIBUTES) {
                            attributes = { ...node.attributes };
                        } else {
                            attributes = Object.fromEntries(
                                Object.entries(node.attributes)
                                    .filter(([key]) => includeAttributes.includes(key))
                            );
                        }
                    }

                    // Filter out attributes where value equals tagName
                    attributes = Object.fromEntries(
                        Object.entries(attributes)
                            .filter(([_, value]) => value !== node.tagName)
                    );

                    nodeOutput = {
                        type: 'element',
                        tagName: node.tagName,
                        highlightIndex: node.highlightIndex,
                        attributes,
                        text
                    };

                    if (text) {
                        nodeOutput.text = text;
                    }
                } else {
                    nodeOutput = {
                        type: 'element',
                        tagName: node.tagName,
                    }
                }

                nodeOutput.children = node.children.map(child => processNode(child, depth + 1)).filter((child): child is DOMNodeOutput => child !== undefined);
                return nodeOutput;
            } else if (node instanceof DOMTextNode) {
                // Add text only if it doesn't have a highlighted parent
                if (!node.hasParentWithHighlightIndex() && node.isVisible) {
                    return {
                        type: 'text',
                        text: node.text
                    };
                }
            }
        };

        const result = processNode(this, 0);
        if (result === undefined) {
            throw new Error('No clickable elements found');
        }
        return result;
    }

    getFileUploadElement(checkSiblings: boolean = true): DOMElementNode | undefined {
        // Check if current element is a file input
        if (this.tagName === 'input' && this.attributes['type'] === 'file') {
            return this;
        }

        // Check children
        for (const child of this.children) {
            if (child instanceof DOMElementNode) {
                const result = child.getFileUploadElement(false);
                if (result) {
                    return result;
                }
            }
        }

        // Check siblings only for the initial call
        if (checkSiblings && this.parent) {
            for (const sibling of this.parent.children) {
                if (sibling !== this && sibling instanceof DOMElementNode) {
                    const result = sibling.getFileUploadElement(false);
                    if (result) {
                        return result;
                    }
                }
            }
        }

        return undefined;
    }
}

export interface SelectorMap {
    [key: number]: DOMElementNode;
}

export class DOMState {
    elementTree: DOMElementNode;
    selectorMap: SelectorMap;

    constructor(elementTree: DOMElementNode, selectorMap: SelectorMap) {
        this.elementTree = elementTree;
        this.selectorMap = selectorMap;
    }
}
