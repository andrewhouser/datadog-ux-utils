import { initComponentTelemetry, reportComponentMount } from '../dist/telemetry.mjs';

// Minimal usage to ensure tree-shaken size is constrained
initComponentTelemetry({ sampleRate: 0.01 });
reportComponentMount('Button', { variant: 'primary', route: '/' });
