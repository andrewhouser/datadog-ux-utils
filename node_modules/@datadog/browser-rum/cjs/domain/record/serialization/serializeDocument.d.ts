import type { RumConfiguration } from '@datadog/browser-rum-core';
import type { SerializedNodeWithId } from '../../../types';
import type { SerializationContext } from './serialization.types';
export declare function serializeDocument(document: Document, configuration: RumConfiguration, serializationContext: SerializationContext): SerializedNodeWithId;
