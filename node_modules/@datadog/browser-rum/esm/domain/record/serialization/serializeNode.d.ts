import type { DocumentNode, SerializedNodeWithId } from '../../../types';
import type { SerializeOptions } from './serialization.types';
export declare function serializeNodeWithId(node: Node, options: SerializeOptions): SerializedNodeWithId | null;
export declare function generateNextId(): number;
export declare function serializeChildNodes(node: Node, options: SerializeOptions): SerializedNodeWithId[];
export declare function serializeDocumentNode(document: Document, options: SerializeOptions): DocumentNode;
