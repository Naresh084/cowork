// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
