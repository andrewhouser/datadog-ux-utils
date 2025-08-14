import { NodePrivacyLevel } from '@datadog/browser-rum-core';
import type { SerializeOptions } from './serialization.types';
export declare function serializeAttributes(element: Element, nodePrivacyLevel: NodePrivacyLevel, options: SerializeOptions): Record<string, string | number | boolean>;
export declare function getCssRulesString(cssStyleSheet: CSSStyleSheet | undefined | null): string | null;
