/* Copyright 2022 Mozilla Foundation
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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  shadow,
  Util,
} from "../../shared/util.js";
import { bindEvents, KeyboardManager } from "./tools.js";
import {
  FreeHighlightOutliner,
  HighlightOutliner,
} from "./drawers/highlight.js";
import {
  HighlightAnnotationElement,
  InkAnnotationElement,
} from "../annotation_layer.js";
import { noContextMenu, stopEvent } from "../display_utils.js";
import { AnnotationEditor } from "./editor.js";
import { ColorPicker } from "./color_picker.js";

/**
 * Basic draw editor in order to generate an Underline annotation.
 */
class UnderlineEditor extends AnnotationEditor {
  #anchorNode = null;

  #anchorOffset = 0;

  #boxes;

  // 画线的boxes
  #lineBoxes;

  #ids = null;

  #clipPathId = null;

  #colorPicker = null;

  #focusOutlines = null;

  #focusNode = null;

  #focusOffset = 0;

  #underlineDiv = null;

  #underlineOutlines = null;

  #lastPoint = null;

  #outlineId = null;

  #text = "";

  #opacity;

  #methodOfCreation = "";

  static _defaultColor = "#FF0000";

  static _defaultOpacity = 1;

  static _type = "underline";

  static _editorType = AnnotationEditorType.UNDERLINE;

  static get _keyboardManager() {
    const proto = UnderlineEditor.prototype;
    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [["ArrowLeft", "mac+ArrowLeft"], proto._moveCaret, { args: [0] }],
        [["ArrowRight", "mac+ArrowRight"], proto._moveCaret, { args: [1] }],
        [["ArrowUp", "mac+ArrowUp"], proto._moveCaret, { args: [2] }],
        [["ArrowDown", "mac+ArrowDown"], proto._moveCaret, { args: [3] }],
      ])
    );
  }

  constructor(params) {
    super({ ...params, name: "underlineEditor" });
    this.color = params.color || UnderlineEditor._defaultColor;
    this.#opacity = params.opacity || UnderlineEditor._defaultOpacity;
    this.#boxes = params.boxes || null;
    // 这个是用来绘图的
    this.#lineBoxes = AnnotationEditor.deduplicate(params.boxes);
    this.#methodOfCreation = params.methodOfCreation || "";
    this.#text = params.text || "";
    this._isDraggable = false;
    this.defaultL10nId = "pdfjs-editor-underline-editor";

    if (this.#boxes) {
      this.#anchorNode = params.anchorNode;
      this.#anchorOffset = params.anchorOffset;
      this.#focusNode = params.focusNode;
      this.#focusOffset = params.focusOffset;
      this.#createOutlines();
      this.#addToDrawLayer();
    }
  }

  /** @inheritdoc */
  get telemetryInitialData() {
    return {
      action: "added",
      type: "underline",
      color: this.color || UnderlineEditor._defaultColor,
      methodOfCreation: this.#methodOfCreation,
    };
  }

  /** @inheritdoc */
  get telemetryFinalData() {
    return {
      type: "underline",
      color: this.color || UnderlineEditor._defaultColor,
    };
  }

  static computeTelemetryFinalData(data) {
    // We want to know how many colors have been used.
    return { numberOfColors: data.get("color").size };
  }

  #createOutlines() {
    const outliner = new HighlightOutliner(this.#boxes, /* borderWidth = */ 0);
    this.#underlineOutlines = outliner.getOutlines();
    [this.x, this.y, this.width, this.height] = this.#underlineOutlines.box;

    const outlinerForOutline = new HighlightOutliner(
      this.#boxes,
      /* borderWidth = */ 0.0025,
      /* innerMargin = */ 0.001,
      this._uiManager.direction === "ltr"
    );
    this.#focusOutlines = outlinerForOutline.getOutlines();

    // The last point is in the pages coordinate system.
    const { lastPoint } = this.#focusOutlines;
    this.#lastPoint = [
      (lastPoint[0] - this.x) / this.width,
      (lastPoint[1] - this.y) / this.height,
    ];
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n);
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {}

  /** @inheritdoc */
  translateInPage(x, y) {}

  /** @inheritdoc */
  get toolbarPosition() {
    return this.#lastPoint;
  }

  getBoxes() {
    return this.#boxes;
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.UNDERLINE_COLOR:
        this.#updateColor(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.UNDERLINE_COLOR,
        UnderlineEditor._defaultColor,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.UNDERLINE_COLOR,
        this.color || UnderlineEditor._defaultColor,
      ],
    ];
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const setColor = col => {
      this.color = col;
      for (const id of this.#ids) {
        this.parent?.drawLayer.changeStrokeColor(id, col);
      }
      this.#colorPicker?.updateColor(col);
    };
    const savedColor = this.color;
    this.addCommands({
      cmd: setColor.bind(this, color),
      undo: setColor.bind(this, savedColor),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.UNDERLINE_COLOR,
      overwriteIfSameType: true,
      keepUndo: true,
    });

    this._reportTelemetry(
      {
        action: "color_changed",
        color,
      },
      /* mustWait = */ true
    );
  }

  /** @inheritdoc */
  async addEditToolbar() {
    const toolbar = await super.addEditToolbar();
    if (!toolbar) {
      return null;
    }
    if (this._uiManager.highlightColors) {
      this.#colorPicker = new ColorPicker({ editor: this });
      toolbar.addColorPicker(this.#colorPicker);
    }
    return toolbar;
  }

  /** @inheritdoc */
  disableEditing() {
    super.disableEditing();
    this.div.classList.toggle("disabled", true);
  }

  /** @inheritdoc */
  enableEditing() {
    super.enableEditing();
    this.div.classList.toggle("disabled", false);
  }

  /** @inheritdoc */
  fixAndSetPosition() {
    return super.fixAndSetPosition(this.#getRotation());
  }

  /** @inheritdoc */
  getBaseTranslation() {
    // The editor itself doesn't have any CSS border (we're drawing one
    // ourselves in using SVG).
    return [0, 0];
  }

  /** @inheritdoc */
  getRect(tx, ty) {
    return super.getRect(tx, ty, this.#getRotation());
  }

  /** @inheritdoc */
  onceAdded(focus) {
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
    }
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  remove() {
    this.#cleanDrawLayer();
    this._reportTelemetry({
      action: "deleted",
    });
    super.remove();
  }

  /** @inheritdoc */
  rebuild() {
    if (!this.parent) {
      return;
    }
    super.rebuild();
    if (this.div === null) {
      return;
    }

    this.#addToDrawLayer();

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilding it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  setParent(parent) {
    let mustBeSelected = false;
    if (this.parent && !parent) {
      this.#cleanDrawLayer();
    } else if (parent) {
      this.#addToDrawLayer(parent);
      // If mustBeSelected is true it means that this editor was selected
      // when its parent has been destroyed, hence we must select it again.
      mustBeSelected =
        !this.parent && this.div?.classList.contains("selectedEditor");
    }
    super.setParent(parent);
    this.show(this._isVisible);
    if (mustBeSelected) {
      // We select it after the parent has been set.
      this.select();
    }
  }

  #cleanDrawLayer() {
    if (this.#ids === null || !this.parent) {
      return;
    }
    for (const id of this.#ids) {
      this.parent.drawLayer.remove(id);
    }
    this.#ids = null;
    this.parent.drawLayer.remove(this.#outlineId);
    this.#outlineId = null;
  }

  #addToDrawLayer(parent = this.parent) {
    if (this.#ids !== null) {
      return;
    }
    // 第一个是画本体
    this.#ids = parent.drawLayer.drawLine(this.#lineBoxes, 0.85);
    this.#outlineId = parent.drawLayer.drawOutline(
      {
        rootClass: {
          highlightOutline: true,
          free: false,
        },
        bbox: this.#focusOutlines.box,
        path: {
          d: this.#focusOutlines.toSVGPath(),
        },
      },
      /* mustRemoveSelfIntersections = */ false
    );

    if (this.#underlineDiv) {
      this.#underlineDiv.style.clipPath = this.#clipPathId;
    }
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    const underlineDiv = (this.#underlineDiv = document.createElement("div"));
    div.append(underlineDiv);
    underlineDiv.className = "internal";
    underlineDiv.style.clipPath = this.#clipPathId;
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);

    bindEvents(this, this.#underlineDiv, ["pointerover", "pointerleave"]);
    this.enableEditing();

    return div;
  }

  pointerover() {
    if (!this.isSelected) {
      this.parent?.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hovered: true,
        },
      });
    }
  }

  pointerleave() {
    if (!this.isSelected) {
      this.parent?.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hovered: false,
        },
      });
    }
  }

  _moveCaret(direction) {
    this.parent.unselect(this);
    switch (direction) {
      case 0 /* left */:
      case 2 /* up */:
        this.#setCaret(/* start = */ true);
        break;
      case 1 /* right */:
      case 3 /* down */:
        this.#setCaret(/* start = */ false);
        break;
    }
  }

  #setCaret(start) {
    if (!this.#anchorNode) {
      return;
    }
    const selection = window.getSelection();
    if (start) {
      selection.setPosition(this.#anchorNode, this.#anchorOffset);
    } else {
      selection.setPosition(this.#focusNode, this.#focusOffset);
    }
  }

  /** @inheritdoc */
  select() {
    super.select();
    if (!this.#outlineId) {
      return;
    }
    this.parent?.drawLayer.updateProperties(this.#outlineId, {
      rootClass: {
        hovered: false,
        selected: true,
      },
    });
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    if (!this.#outlineId) {
      return;
    }
    this.parent?.drawLayer.updateProperties(this.#outlineId, {
      rootClass: {
        selected: false,
      },
    });

    this.#setCaret(/* start = */ false);
  }

  /** @inheritdoc */
  get _mustFixPosition() {
    return true;
  }

  /** @inheritdoc */
  show(visible = this._isVisible) {
    super.show(visible);
    if (this.parent) {
      for (const id of this.#ids) {
        this.parent.drawLayer.updateProperties(id, {
          rootClass: {
            hidden: !visible,
          },
        });
      }
      this.parent.drawLayer.updateProperties(this.#outlineId, {
        rootClass: {
          hidden: !visible,
        },
      });
    }
  }

  #getRotation() {
    // Highlight annotations are always drawn horizontally but if
    // a free highlight annotation can be rotated.
    return 0;
  }

  #serializeBoxes() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const [pageX, pageY] = this.pageTranslation;
    const boxes = this.#boxes;
    const quadPoints = new Float32Array(boxes.length * 8);
    let i = 0;
    for (const { x, y, width, height } of boxes) {
      const sx = x * pageWidth + pageX;
      const sy = (1 - y) * pageHeight + pageY;
      // Serializes the rectangle in the Adobe Acrobat format.
      // The rectangle's coordinates (b = bottom, t = top, L = left, R = right)
      // are ordered as follows: tL, tR, bL, bR (bL origin).
      quadPoints[i] = quadPoints[i + 4] = sx;
      quadPoints[i + 1] = quadPoints[i + 3] = sy;
      quadPoints[i + 2] = quadPoints[i + 6] = sx + width * pageWidth;
      quadPoints[i + 5] = quadPoints[i + 7] = sy - height * pageHeight;
      i += 8;
    }
    return quadPoints;
  }

  #serializeOutlines(rect) {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;
    const tx = this.x * pageWidth;
    const ty = (1 - this.y - this.height) * pageHeight;
    const outlines = [];
    for (const outline of this.#underlineOutlines.outlines) {
      const points = new Array(outline.length);
      for (let i = 0; i < outline.length; i += 2) {
        points[i] = tx + outline[i] * width;
        points[i + 1] = ty + (1 - outline[i + 1]) * height;
      }
      outlines.push(points);
    }
    return outlines;
  }

  /** @inheritdoc */
  static deserialize(data, parent, uiManager) {
    const editor = super.deserialize(data, parent, uiManager);

    const { rect, color, quadPoints } = data;
    editor.color = Util.makeHexColor(...color);

    const [pageWidth, pageHeight] = editor.pageDimensions;
    editor.width = (rect[2] - rect[0]) / pageWidth;
    editor.height = (rect[3] - rect[1]) / pageHeight;
    const boxes = (editor.#boxes = []);
    for (let i = 0; i < quadPoints.length; i += 8) {
      boxes.push({
        x: quadPoints[4] / pageWidth,
        y: 1 - quadPoints[i + 5] / pageHeight,
        width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
        height: (quadPoints[i + 5] - quadPoints[i + 1]) / pageHeight,
      });
    }
    editor.#createOutlines();

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    // It doesn't make sense to copy/paste a underline annotation.
    if (this.isEmpty() || isForCopying) {
      return null;
    }

    const rect = this.getRect(0, 0);

    return {
      annotationType: AnnotationEditorType.UNDERLINE,
      quadPoints: this.#serializeBoxes(),
      outlines: this.#serializeOutlines(),
      pageIndex: this.pageIndex,
      rect,
      rotation: 0,
      structTreeParentId: this._structTreeParentId,
    };
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    annotation.updateEdited({
      rect: this.getRect(0, 0),
    });

    return null;
  }

  static canCreateNewEmptyEditor() {
    return false;
  }
}

export { UnderlineEditor };
