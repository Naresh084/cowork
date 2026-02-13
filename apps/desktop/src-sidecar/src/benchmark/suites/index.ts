import { twinTrackCoreSuite } from './twin-track-core.js';
import {
  browserOperatorResilienceSuite,
  researchWideDepthSuite,
} from './research-browser-depth.js';

export const BENCHMARK_SUITES = [
  twinTrackCoreSuite,
  researchWideDepthSuite,
  browserOperatorResilienceSuite,
];
