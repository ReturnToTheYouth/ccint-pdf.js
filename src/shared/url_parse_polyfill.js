/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Polyfill for URL.parse() method for compatibility with older browsers
 *
 * URL.parse() was introduced in newer browsers and may not be available
 * in older browser versions. This polyfill provides fallback functionality
 * using the URL constructor.
 *
 * @param {string} url - The URL to parse
 * @param {string} [base] - The base URL for relative URLs
 * @returns {URL | null} Parsed URL object or null if invalid
 */
function parseURL(url, base) {
  // Check if URL.parse is available (modern browsers)
  if (typeof URL !== "undefined" && typeof URL.parse === "function") {
    try {
      return URL.parse(url, base);
    } catch {
      return null;
    }
  }

  // Fallback for older browsers using URL constructor
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

/**
 * Polyfill for AbortSignal.any() method for compatibility with older browsers
 *
 * AbortSignal.any() was introduced in browsers around 2023 and may not be
 * available in older browser versions. This polyfill provides fallback
 * functionality for compatibility.
 *
 * Browser support for AbortSignal.any():
 * - Chrome: 116+ (September 2023)
 * - Firefox: 115+ (July 2023)
 * - Safari: 16.4+ (March 2023)
 * - Edge: 116+ (September 2023)
 */
function ensureAbortSignalAny() {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.any !== "function"
  ) {
    AbortSignal.any = function (iterable) {
      const ac = new AbortController();
      const { signal } = ac;

      // Convert iterable to array if it's not already
      const signals = Array.from(iterable);

      // Return immediately if any of the signals are already aborted
      for (const s of signals) {
        if (s.aborted) {
          ac.abort(s.reason);
          return signal;
        }
      }

      // Register "abort" listeners for all signals
      for (const s of signals) {
        s.addEventListener(
          "abort",
          () => {
            ac.abort(s.reason);
          },
          { signal } // Automatically remove the listener when the returned signal is aborted
        );
      }

      return signal;
    };
  }
}

export { ensureAbortSignalAny, parseURL };
