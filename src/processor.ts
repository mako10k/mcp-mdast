import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import { select, selectAll } from "unist-util-select";
import { u } from "unist-builder";
import type { Root, Content, Heading, Paragraph, Link, Image } from "mdast";
import { ResourceManager } from "./resource-manager.js";
import { InputResolver, InputSpec } from "./input-resolver.js";
import { OutputHandler, OutputSpec, OutputResult } from "./output-handler.js";

export type Operation = "select" | "insert" | "update" | "remove" | "replace";
export type Position = "before" | "after" | "prepend" | "append" | "replace";
export type TransformType = "wrap" | "unwrap" | "rename" | "clone";

export interface QueryResult {
  success: boolean;
  result?: string;
  selected?: Array<{
    type: string;
    position: { line: number; column: number } | null;
    content: string;
    metadata: any;
  }>;
  error?: string;
}

export interface TransformConfig {
  type: TransformType;
  selector: string;
  wrapper?: string;
  newType?: string;
  targetSelector?: string;
  depth?: number; // For heading depth changes in rename operation
}

export interface TransformResult {
  success: boolean;
  result?: string;
  applied: number;
  error?: string;
}

export interface AnalysisResult {
  structure?: any;
  stats?: {
    wordCount: number;
    headingCount: Record<number, number>;
    linkCount: number;
    imageCount: number;
    codeBlockCount: number;
  };
  links?: Array<{ url: string; title: string | null; line: number }>;
  headings?: Array<{ depth: number; text: string; line: number }>;
  toc?: string;
}

export class MDProcessor {
  private parser = unified().use(remarkParse);
  private stringifier = unified().use(remarkStringify);
  private resourceManager: ResourceManager;
  private inputResolver: InputResolver;
  private outputHandler: OutputHandler;

  constructor() {
    this.resourceManager = new ResourceManager();
    this.inputResolver = new InputResolver(this.resourceManager);
    this.outputHandler = new OutputHandler(this.resourceManager);
  }

  /**
   * Initialize resource manager
   */
  async initialize(): Promise<void> {
    await this.resourceManager.initialize();
    await this.resourceManager.cleanup();
  }

  /**
   * Markdownを解析してMDASTに変換
   */
  private parse(markdown: string): Root {
    return this.parser.parse(markdown) as Root;
  }

  /**
   * MDASTをMarkdownに変換
   */
  private stringify(tree: Root): string {
    return this.stringifier.stringify(tree);
  }

  /**
   * ノードからテキストコンテンツを抽出
   */
  private extractText(node: Content): string {
    let text = "";
    visit(node, (n: any): void => {
      if (n.type === "text") {
        text += n.value;
      }
    });
    return text;
  }

  /**
   * Query with extended I/O support
   */
  async queryExtended(
    input: InputSpec | string,
    operation: Operation,
    selector?: string,
    content?: string,
    position?: Position,
    index?: number,
    output?: OutputSpec
  ): Promise<OutputResult | QueryResult> {
    try {
      // Resolve input
      let markdown: string;
      let sourceMeta: any = {};

      if (typeof input === "string") {
        markdown = input;
        sourceMeta = { source: { type: "text" } };
      } else if (input.source === "mdast") {
        // Special handling for MDAST resources
        const resource = await this.inputResolver.getResourceMetadata(input);
        if (resource) {
          // For select operations, work directly on MDAST
          if (operation === "select") {
            const result = this.selectNodesFromTree(resource.mdast, selector, index);
            return result;
          }

          // For other operations, convert to markdown
          markdown = this.stringify(resource.mdast);
          sourceMeta = {
            source: { type: "mdast", value: input.uri },
            operations: resource.metadata.operations || [],
          };
        } else {
          throw new Error(`Resource not found: ${input.uri}`);
        }
      } else {
        markdown = await this.inputResolver.resolve(input);
        const sourceType = input.source;
        const sourceValue = input.path || input.url || input.value;
        sourceMeta = { source: { type: sourceType, value: sourceValue } };
      }

      // Execute operation
      const result = await this.query(markdown, operation, selector, content, position, index);

      if (!result.success) {
        return result;
      }

      // Handle output
      if (output) {
        // For select operation, save the original tree
        if (operation === "select") {
          const tree = this.parse(markdown);
          const metadata = {
            ...sourceMeta,
            operations: [
              ...(sourceMeta.operations || []),
              {
                timestamp: new Date().toISOString(),
                tool: "mdast-query",
                operation,
                selector,
              },
            ],
          };
          return this.outputHandler.handle(markdown, tree, output, metadata);
        }

        // For other operations, use the modified result
        const tree = this.parse(result.result!);
        const metadata = {
          ...sourceMeta,
          operations: [
            ...(sourceMeta.operations || []),
            {
              timestamp: new Date().toISOString(),
              tool: "mdast-query",
              operation,
            },
          ],
        };
        return this.outputHandler.handle(result.result!, tree, output, metadata);
      }
      
      // For select operation without output spec, return as-is
      if (operation === "select") {
        return result;
      }

      // No output specified for non-select operations, return the result
      return result;
    } catch (error) {
      return {
        type: "text",
        content: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  private selectNodesFromTree(tree: Root, selector?: string, index?: number): QueryResult {
    if (!selector) {
      return { success: false, error: "Selector is required for select operation" };
    }

    try {
      const nodes = selectAll(selector, tree) as Content[];
      const targetNodes = index !== undefined ? [nodes[index]] : nodes;

      const selected = targetNodes
        .filter((node) => node !== undefined)
        .map((node: any) => ({
          type: node.type,
          position: node.position
            ? { line: node.position.start.line, column: node.position.start.column }
            : null,
          content: this.extractText(node),
          metadata: this.getNodeMetadata(node),
        }));

      return { success: true, selected };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Transform with extended I/O support
   */
  async transformExtended(
    input: InputSpec | string,
    transforms: TransformConfig[],
    output?: OutputSpec
  ): Promise<OutputResult | TransformResult> {
    try {
      // Resolve input
      let markdown: string;
      let sourceMeta: any = {};

      if (typeof input === "string") {
        markdown = input;
        sourceMeta = { source: { type: "text" } };
      } else if (input.source === "mdast") {
        // Special handling for MDAST resources
        const resource = await this.inputResolver.getResourceMetadata(input);
        if (resource) {
          // Convert to markdown
          markdown = this.stringify(resource.mdast);
          sourceMeta = {
            source: { type: "mdast", value: input.uri },
            operations: resource.metadata.operations || [],
          };
        } else {
          throw new Error(`Resource not found: ${input.uri}`);
        }
      } else {
        markdown = await this.inputResolver.resolve(input);
        const sourceType = input.source;
        const sourceValue = input.path || input.url || input.value;
        sourceMeta = { source: { type: sourceType, value: sourceValue } };
      }

      // Execute transforms
      const result = await this.transform(markdown, transforms);

      if (!result.success) {
        return result;
      }

      // Handle output
      const tree = this.parse(result.result!);
      const metadata = {
        ...sourceMeta,
        operations: [
          ...(sourceMeta.operations || []),
          {
            timestamp: new Date().toISOString(),
            tool: "mdast-transform",
            operation: "transform",
          },
        ],
      };

      return this.outputHandler.handle(result.result!, tree, output, metadata);
    } catch (error) {
      return {
        type: "text",
        content: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  /**
   * Analyze with extended I/O support (read-only, no output variants)
   */
  async analyzeExtended(
    input: InputSpec | string,
    analysis: string[]
  ): Promise<AnalysisResult> {
    try {
      // Resolve input
      let markdown: string;

      if (typeof input === "string") {
        markdown = input;
      } else {
        markdown = await this.inputResolver.resolve(input);
      }

      // Execute analysis
      return this.analyze(markdown, analysis);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      } as any;
    }
  }

  /**
   * Get resource manager (for MCP resource API)
   */
  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  /**
   * 統合クエリ操作
   */
  async query(
    markdown: string,
    operation: Operation,
    selector?: string,
    content?: string,
    position?: Position,
    index?: number
  ): Promise<QueryResult> {
    try {
      const tree = this.parse(markdown);

      switch (operation) {
        case "select":
          return this.selectNodes(tree, selector);
        case "insert":
          return this.insertNodes(tree, selector, content, position, index);
        case "update":
          return this.updateNodes(tree, selector, content, index);
        case "remove":
          return this.removeNodes(tree, selector, index);
        case "replace":
          return this.replaceNodes(tree, selector, content, index);
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * ノードの選択
   */
  private selectNodes(tree: Root, selector?: string): QueryResult {
    if (!selector) {
      return {
        success: false,
        error: "Selector is required for select operation",
      };
    }

    const nodes = selectAll(selector, tree) as Content[];
    const selected = nodes.map((node) => ({
      type: node.type,
      position: node.position
        ? { line: node.position.start.line, column: node.position.start.column }
        : null,
      content: this.extractText(node),
      metadata: this.getNodeMetadata(node),
    }));

    return {
      success: true,
      selected,
    };
  }

  /**
   * ノードのメタデータ取得
   */
  private getNodeMetadata(node: Content): any {
    const metadata: any = {};

    if (node.type === "heading") {
      metadata.depth = (node as Heading).depth;
    } else if (node.type === "link") {
      metadata.url = (node as Link).url;
      metadata.title = (node as Link).title;
    } else if (node.type === "image") {
      metadata.url = (node as Image).url;
      metadata.alt = (node as Image).alt;
      metadata.title = (node as Image).title;
    } else if (node.type === "code") {
      metadata.lang = (node as any).lang;
      metadata.meta = (node as any).meta;
    }

    return metadata;
  }

  /**
   * ノードの挿入
   */
  private insertNodes(
    tree: Root,
    selector?: string,
    content?: string,
    position?: Position,
    index?: number
  ): QueryResult {
    if (!selector) {
      return { success: false, error: "Selector is required for insert operation" };
    }
    if (!content) {
      return { success: false, error: "Content is required for insert operation" };
    }
    if (!position) {
      return { success: false, error: "Position is required for insert operation" };
    }

    const nodes = selectAll(selector, tree) as Content[];
    if (nodes.length === 0) {
      return { success: false, error: `No nodes found matching selector: ${selector}` };
    }

    const targetNode = index !== undefined ? nodes[index] : nodes[0];
    if (!targetNode) {
      return { success: false, error: `No node at index: ${index}` };
    }

    const newContent = this.parse(content);
    const newNodes = newContent.children;

    let inserted = false;
    visit(tree, (node: any, idx: any, parent: any): any => {
      if (!inserted && node === targetNode) {
        // append/prepend operations don't require parent (they modify node.children directly)
        if (position === "prepend" && "children" in node) {
          node.children.unshift(...newNodes);
          inserted = true;
          return "skip";
        } else if (position === "append" && "children" in node) {
          node.children.push(...newNodes);
          inserted = true;
          return "skip";
        }
        // before/after operations require parent (they modify parent.children)
        else if (parent && idx !== null && idx !== undefined) {
          if (position === "before") {
            parent.children.splice(idx, 0, ...newNodes);
            inserted = true;
            return "skip";
          } else if (position === "after") {
            parent.children.splice(idx + 1, 0, ...newNodes);
            inserted = true;
            return "skip";
          }
        }
      }
    });

    if (!inserted) {
      return { success: false, error: "Failed to insert content" };
    }

    return {
      success: true,
      result: this.stringify(tree),
    };
  }

  /**
   * ノードの更新
   */
  private updateNodes(
    tree: Root,
    selector?: string,
    content?: string,
    index?: number
  ): QueryResult {
    if (!selector) {
      return { success: false, error: "Selector is required for update operation" };
    }
    if (!content) {
      return { success: false, error: "Content is required for update operation" };
    }

    const nodes = selectAll(selector, tree) as Content[];
    if (nodes.length === 0) {
      return { success: false, error: `No nodes found matching selector: ${selector}` };
    }

    const targetNode = index !== undefined ? nodes[index] : nodes[0];
    if (!targetNode) {
      return { success: false, error: `No node at index: ${index}` };
    }

    const newContent = this.parse(content);
    const newNodes = newContent.children;

    let updated = false;
    visit(tree, (node: any, idx: any, parent: any): any => {
      if (node === targetNode && parent && idx !== null && idx !== undefined) {
        parent.children.splice(idx, 1, ...newNodes);
        updated = true;
        return "skip";
      }
    });

    if (!updated) {
      return { success: false, error: "Failed to update content" };
    }

    return {
      success: true,
      result: this.stringify(tree),
    };
  }

  /**
   * ノードの削除
   */
  private removeNodes(tree: Root, selector?: string, index?: number): QueryResult {
    if (!selector) {
      return { success: false, error: "Selector is required for remove operation" };
    }

    const nodes = selectAll(selector, tree) as Content[];
    if (nodes.length === 0) {
      return { success: false, error: `No nodes found matching selector: ${selector}` };
    }

    const targetNode = index !== undefined ? nodes[index] : nodes[0];
    if (!targetNode) {
      return { success: false, error: `No node at index: ${index}` };
    }

    let removed = false;
    visit(tree, (node: any, idx: any, parent: any): any => {
      if (node === targetNode && parent && idx !== null && idx !== undefined) {
        parent.children.splice(idx, 1);
        removed = true;
        return "skip";
      }
    });

    if (!removed) {
      return { success: false, error: "Failed to remove node" };
    }

    return {
      success: true,
      result: this.stringify(tree),
    };
  }

  /**
   * ノードの置換
   */
  private replaceNodes(
    tree: Root,
    selector?: string,
    content?: string,
    index?: number
  ): QueryResult {
    return this.updateNodes(tree, selector, content, index);
  }

  /**
   * 変換の適用
   */
  async transform(markdown: string, transforms: TransformConfig[]): Promise<TransformResult> {
    try {
      let tree = this.parse(markdown);
      let applied = 0;

      for (const transform of transforms) {
        const result = this.applyTransform(tree, transform);
        if (result.success) {
          tree = result.tree!;
          applied++;
        }
      }

      return {
        success: true,
        result: this.stringify(tree),
        applied,
      };
    } catch (error) {
      return {
        success: false,
        applied: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 単一の変換を適用
   */
  private applyTransform(
    tree: Root,
    transform: TransformConfig
  ): { success: boolean; tree?: Root } {
    const nodes = selectAll(transform.selector, tree) as Content[];
    if (nodes.length === 0) {
      return { success: false };
    }

    switch (transform.type) {
      case "wrap":
        return this.wrapNodes(tree, nodes, transform.wrapper);
      case "unwrap":
        return this.unwrapNodes(tree, nodes);
      case "rename":
        return this.renameNodes(tree, nodes, transform.newType, transform.depth);
      case "clone":
        return this.cloneNodes(tree, nodes, transform.targetSelector);
      default:
        return { success: false };
    }
  }

  /**
   * ノードをラップ
   */
  private wrapNodes(tree: Root, nodes: Content[], wrapper?: string): { success: boolean; tree?: Root } {
    if (!wrapper) {
      return { success: false };
    }

    visit(tree, (node: any, idx: any, parent: any): void => {
      if (nodes.includes(node) && parent && idx !== null && idx !== undefined) {
        const wrapperNode: any = { type: wrapper, children: [node] };
        parent.children[idx] = wrapperNode;
      }
    });

    return { success: true, tree };
  }

  /**
   * ノードをアンラップ
   */
  private unwrapNodes(tree: Root, nodes: Content[]): { success: boolean; tree?: Root } {
    visit(tree, (node: any, idx: any, parent: any): void => {
      if (nodes.includes(node) && parent && idx !== null && idx !== undefined && "children" in node) {
        parent.children.splice(idx, 1, ...node.children);
      }
    });

    return { success: true, tree };
  }

  /**
   * ノードをリネーム
   */
  private renameNodes(
    tree: Root,
    nodes: Content[],
    newType?: string,
    depth?: number
  ): { success: boolean; tree?: Root } {
    if (!newType) {
      return { success: false };
    }

    visit(tree, (node: any): void => {
      if (nodes.includes(node)) {
        node.type = newType;
        // If depth is specified and node is a heading, update its depth
        if (depth !== undefined && node.type === "heading") {
          node.depth = depth;
        }
      }
    });

    return { success: true, tree };
  }

  /**
   * ノードをクローン
   */
  private cloneNodes(tree: Root, nodes: Content[], targetSelector?: string): { success: boolean; tree?: Root } {
    if (!targetSelector) {
      return { success: false };
    }

    const targets = selectAll(targetSelector, tree) as Content[];
    if (targets.length === 0) {
      return { success: false };
    }

    const target = targets[0];
    visit(tree, (node: any, idx: any, parent: any): any => {
      if (node === target && parent && idx !== null && idx !== undefined) {
        const clones = nodes.map((n) => JSON.parse(JSON.stringify(n)));
        parent.children.splice(idx + 1, 0, ...clones);
        return "skip";
      }
    });

    return { success: true, tree };
  }

  /**
   * 分析
   */
  async analyze(markdown: string, analysis: string[]): Promise<AnalysisResult> {
    const tree = this.parse(markdown);
    const result: AnalysisResult = {};

    for (const type of analysis) {
      switch (type) {
        case "structure":
          result.structure = this.analyzeStructure(tree);
          break;
        case "stats":
          result.stats = this.analyzeStats(tree);
          break;
        case "links":
          result.links = this.analyzeLinks(tree);
          break;
        case "headings":
          result.headings = this.analyzeHeadings(tree);
          break;
        case "toc":
          result.toc = this.generateTOC(tree);
          break;
      }
    }

    return result;
  }

  /**
   * 構造分析
   */
  private analyzeStructure(tree: Root): any {
    const structure: any = {
      type: tree.type,
      childCount: tree.children.length,
      children: [],
    };

    tree.children.forEach((child: any) => {
      structure.children.push({
        type: child.type,
        hasChildren: "children" in child,
      });
    });

    return structure;
  }

  /**
   * 統計分析
   */
  private analyzeStats(tree: Root): AnalysisResult["stats"] {
    let wordCount = 0;
    const headingCount: Record<number, number> = {};
    let linkCount = 0;
    let imageCount = 0;
    let codeBlockCount = 0;

    visit(tree, (node: any): void => {
      if (node.type === "text") {
        wordCount += node.value.split(/\s+/).filter((w: string) => w.length > 0).length;
      } else if (node.type === "heading") {
        const depth = node.depth;
        headingCount[depth] = (headingCount[depth] || 0) + 1;
      } else if (node.type === "link") {
        linkCount++;
      } else if (node.type === "image") {
        imageCount++;
      } else if (node.type === "code") {
        codeBlockCount++;
      }
    });

    return {
      wordCount,
      headingCount,
      linkCount,
      imageCount,
      codeBlockCount,
    };
  }

  /**
   * リンク分析
   */
  private analyzeLinks(tree: Root): AnalysisResult["links"] {
    const links: AnalysisResult["links"] = [];

    visit(tree, (node: any): void => {
      if (node.type === "link") {
        links.push({
          url: node.url,
          title: node.title || null,
          line: node.position?.start.line || 0,
        });
      }
    });

    return links;
  }

  /**
   * 見出し分析
   */
  private analyzeHeadings(tree: Root): AnalysisResult["headings"] {
    const headings: AnalysisResult["headings"] = [];

    visit(tree, (node: any): void => {
      if (node.type === "heading") {
        headings.push({
          depth: node.depth,
          text: this.extractText(node),
          line: node.position?.start.line || 0,
        });
      }
    });

    return headings;
  }

  /**
   * 目次生成
   */
  private generateTOC(tree: Root): string {
    const headings = this.analyzeHeadings(tree);
    const tocLines: string[] = [];

    if (headings) {
      headings.forEach((heading): void => {
        const indent = "  ".repeat(heading.depth - 1);
        const link = heading.text.toLowerCase().replace(/\s+/g, "-");
        tocLines.push(`${indent}- [${heading.text}](#${link})`);
      });
    }

    return tocLines.join("\n");
  }
}
