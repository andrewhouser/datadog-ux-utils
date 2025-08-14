import type { RumConfiguration } from '@datadog/browser-rum-core';
import type { BrowserIncrementalSnapshotRecord } from '../../types';
import type { ElementsScrollPositions } from './elementsScrollPositions';
export type ShadowRootCallBack = (shadowRoot: ShadowRoot) => void;
export interface ShadowRootsController {
    addShadowRoot: ShadowRootCallBack;
    removeShadowRoot: ShadowRootCallBack;
    stop: () => void;
    flush: () => void;
}
export declare const initShadowRootsController: (configuration: RumConfiguration, callback: (record: BrowserIncrementalSnapshotRecord) => void, elementsScrollPositions: ElementsScrollPositions) => ShadowRootsController;
