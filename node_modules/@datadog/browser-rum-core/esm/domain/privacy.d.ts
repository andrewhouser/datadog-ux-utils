export declare const NodePrivacyLevel: {
    readonly IGNORE: "ignore";
    readonly HIDDEN: "hidden";
    readonly ALLOW: "allow";
    readonly MASK: "mask";
    readonly MASK_USER_INPUT: "mask-user-input";
};
export type NodePrivacyLevel = (typeof NodePrivacyLevel)[keyof typeof NodePrivacyLevel];
export declare const PRIVACY_ATTR_NAME = "data-dd-privacy";
export declare const PRIVACY_ATTR_VALUE_ALLOW = "allow";
export declare const PRIVACY_ATTR_VALUE_MASK = "mask";
export declare const PRIVACY_ATTR_VALUE_MASK_USER_INPUT = "mask-user-input";
export declare const PRIVACY_ATTR_VALUE_HIDDEN = "hidden";
export declare const PRIVACY_CLASS_PREFIX = "dd-privacy-";
export declare const CENSORED_STRING_MARK = "***";
export declare const CENSORED_IMG_MARK = "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
export declare const FORM_PRIVATE_TAG_NAMES: {
    [tagName: string]: true;
};
export type NodePrivacyLevelCache = Map<Node, NodePrivacyLevel>;
/**
 * Get node privacy level by iterating over its ancestors. When the direct parent privacy level is
 * know, it is best to use something like:
 *
 * derivePrivacyLevelGivenParent(getNodeSelfPrivacyLevel(node), parentNodePrivacyLevel)
 */
export declare function getNodePrivacyLevel(node: Node, defaultPrivacyLevel: NodePrivacyLevel, cache?: NodePrivacyLevelCache): NodePrivacyLevel;
/**
 * Reduces the next privacy level based on self + parent privacy levels
 */
export declare function reducePrivacyLevel(childPrivacyLevel: NodePrivacyLevel | undefined, parentNodePrivacyLevel: NodePrivacyLevel): NodePrivacyLevel;
/**
 * Determines the node's own privacy level without checking for ancestors.
 */
export declare function getNodeSelfPrivacyLevel(node: Node): NodePrivacyLevel | undefined;
/**
 * Helper aiming to unify `mask` and `mask-user-input` privacy levels:
 *
 * In the `mask` case, it is trivial: we should mask the element.
 *
 * In the `mask-user-input` case, we should mask the element only if it is a "form" element or the
 * direct parent is a form element for text nodes).
 *
 * Other `shouldMaskNode` cases are edge cases that should not matter too much (ex: should we mask a
 * node if it is ignored or hidden? it doesn't matter since it won't be serialized).
 */
export declare function shouldMaskNode(node: Node, privacyLevel: NodePrivacyLevel): boolean;
/**
 * Text censoring non-destructively maintains whitespace characters in order to preserve text shape
 * during replay.
 */
export declare const censorText: (text: string) => string;
export declare function getTextContent(textNode: Node, ignoreWhiteSpace: boolean, parentNodePrivacyLevel: NodePrivacyLevel): string | undefined;
/**
 * TODO: Preserve CSS element order, and record the presence of the tag, just don't render
 * We don't need this logic on the recorder side.
 * For security related meta's, customer can mask themmanually given they
 * are easy to identify in the HEAD tag.
 */
export declare function shouldIgnoreElement(element: Element): boolean;
export declare function getPrivacySelector(privacyLevel: string): string;
