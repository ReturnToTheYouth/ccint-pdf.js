/* Copyright 2026 Mozilla Foundation
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

import { PageViewport } from "../../src/display/display_utils.js";
import { PDFPageView } from "../../web/pdf_page_view.js";

describe("PDFPageView", function () {
  function createPageView(isEditing) {
    return new PDFPageView({
      id: 1,
      defaultViewport: new PageViewport({
        viewBox: [0, 0, 100, 100],
        userUnit: 1,
        scale: 1,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
      }),
      isEditing,
    });
  }

  it("does not reset when the editing state is unchanged", function () {
    const pageView = createPageView(/* isEditing = */ true);
    spyOn(pageView, "hasEditableAnnotations").and.returnValue(true);
    spyOn(pageView, "reset");

    expect(pageView.toggleEditingMode(true)).toEqual(false);
    expect(pageView.reset).not.toHaveBeenCalled();
  });

  it("returns true only when an editing-state change resets the page", function () {
    const pageView = createPageView(/* isEditing = */ false);
    const hasEditableAnnotations = spyOn(
      pageView,
      "hasEditableAnnotations"
    ).and.returnValue(false);
    spyOn(pageView, "reset");

    expect(pageView.toggleEditingMode(true)).toEqual(false);
    expect(pageView.reset).not.toHaveBeenCalled();

    hasEditableAnnotations.and.returnValue(true);
    expect(pageView.toggleEditingMode(false)).toEqual(true);
    expect(pageView.reset).toHaveBeenCalledTimes(1);
  });
});
