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
  addOpacityToColor,
  AnnotationEditorParamsType,
  AnnotationEditorType,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { ColorPicker } from "./color_picker.js";
import { StrikeOutAnnotationElement } from "../annotation_layer.js";
// eslint-disable-next-line sort-imports
import { bindEvents } from "./tools.js";
import { StrikethroughOutliner } from "./drawers/strikethroughdraw.js";

/**
 * 下划线
 */
class StrikethroughEditor extends AnnotationEditor {
  #boxes;

  // 画线的boxes
  #lineBoxes;

  #clipPathId = null;

  #focusOutlines = null;

  #strikethroughDiv = null;

  #strikethroughOutlines = null;

  #ids = null;

  #lastPoint = null;

  #outlineId = null;

  #colorPicker = null;

  // 透明度
  #opacity = 1;

  color = "#FF0000";

  #methodOfCreation = "";

  #text = "";

  #anchorNode = null;

  #anchorOffset = 0;

  #focusNode = null;

  #focusOffset = 0;

  static _l10nPromise;

  static _defaultColor = "#F74A4A";

  static _defaultOpacity = 1;

  static _type = "strikethrough";

  static _editorType = AnnotationEditorType.STRIKETHROUGH;

  constructor(params) {
    super({ ...params, name: "strikethroughEditor" });
    // 这个是用来计算的
    this.#boxes = params.boxes;
    // 这个是用来绘图的
    this.#lineBoxes = AnnotationEditor.deduplicate(params.boxes);
    this._isDraggable = false;
    this.selectedText = params.selectedText;
    this.#methodOfCreation = params.methodOfCreation || "";
    this.#text = params.text || "";
    this.color = params.color || StrikethroughEditor._defaultColor;
    this.#opacity = params.opacity || StrikethroughEditor._defaultOpacity;

    if (this.#boxes) {
      this.#anchorNode = params.anchorNode;
      this.#anchorOffset = params.anchorOffset;
      this.#focusNode = params.focusNode;
      this.#focusOffset = params.focusOffset;
      this.#createOutlines();
      this.#addToDrawLayer();
      this.rotate(this.rotation);
    }
  }

  #createOutlines() {
    // 为了计算box的outline
    const outlinerForBox = new StrikethroughOutliner(
      this.#boxes,
      /* borderWidth = */ 0
    );
    const box = outlinerForBox.getBox();
    this.x = box.x;
    this.y = box.y;
    this.width = box.width;
    this.height = box.height;

    this.#strikethroughOutlines = outlinerForBox.getOutlines();

    const outlinerForOutline = new StrikethroughOutliner(
      this.#boxes,
      /* borderWidth = */ 0.0025,
      /* innerMargin = */ 0.001,
      this._uiManager.direction === "ltr"
    );
    this.#focusOutlines = outlinerForOutline.getOutlines();

    // last-point不好复用是因为在box被我改过了
    const lastPoint = this.#focusOutlines.lastPoint;
    this.#lastPoint = [
      (lastPoint[0] - this.x) / this.width,
      (lastPoint[1] - this.y) / this.height,
    ];
  }

  static initialize(l10n) {
    AnnotationEditor.initialize(l10n);
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.STRIKETHROUGH_COLOR:
        StrikethroughEditor._defaultColor = value;
        break;
      case AnnotationEditorParamsType.STRIKETHROUGH_OPACITY:
        StrikethroughEditor._defaultOpacity = value;
        break;
    }
  }

  /** @inheritdoc */
  get toolbarPosition() {
    return this.#lastPoint;
  }

  get opacity() {
    return this.#opacity;
  }

  getBoxes() {
    return this.#boxes;
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.STRIKETHROUGH_COLOR:
        this.#updateColor(value);
        break;
      case AnnotationEditorParamsType.STRIKETHROUGH_OPACITY:
        this.#updateOpacity(value);
        break;
    }
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const setColor = col => {
      this.color = col;
      const { drawLayer } = this.parent;
      for (const id of this.#ids) {
        drawLayer.changeStrokeColor(id, addOpacityToColor(col, this.#opacity));
      }
      this.#colorPicker?.updateColor(col);
    };
    const savedColor = this.color;
    this.addCommands({
      cmd: setColor.bind(this, color),
      undo: setColor.bind(this, savedColor),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.STRIKETHROUGH_COLOR,
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

  /**
   * Update the opacity and make this action undoable.
   * @param {number} opacity
   */
  #updateOpacity(opacity) {
    const setOpacity = opa => {
      this.#opacity = opa;
      const { drawLayer } = this.parent;
      for (const id of this.#ids) {
        drawLayer.changeStrokeColor(id, addOpacityToColor(this.color, opa));
      }
    };
    const savedOpacity = this.#opacity;
    this.addCommands({
      cmd: setOpacity.bind(this, opacity),
      undo: setOpacity.bind(this, savedOpacity),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.STRIKETHROUGH_OPACITY,
      overwriteIfSameType: true,
      keepUndo: true,
    });

    this._reportTelemetry(
      {
        action: "opacity_changed",
        opacity,
      },
      /* mustWait = */ true
    );
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.STRIKETHROUGH_COLOR,
        StrikethroughEditor._defaultColor,
      ],
      [
        AnnotationEditorParamsType.STRIKETHROUGH_OPACITY,
        StrikethroughEditor._defaultOpacity,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.STRIKETHROUGH_COLOR,
        this.color || StrikethroughEditor._defaultColor,
      ],
      [
        AnnotationEditorParamsType.STRIKETHROUGH_OPACITY,
        this.#opacity || StrikethroughEditor._defaultOpacity,
      ],
    ];
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
  remove(forHide = false) {
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
    this.rotate(this.pageRotation);

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
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
    this.#ids = parent.drawLayer.drawLine(
      this.#lineBoxes,
      0.55,
      addOpacityToColor(this.color, this.#opacity)
    );

    // 第二个是画轮廓 画轮廓的要留着，画本体的要改掉
    const ret = parent.drawLayer.lineOutline(this.#focusOutlines);
    // const box = this.#focusOutlines.box;
    // const floatBox = new Float32Array([box.x, box.y, box.width, box.height]);
    // const ret = parent.drawLayer.drawOutline(
    //   {
    //     rootClass: {
    //       highlightOutline: true,
    //       free: false,
    //     },
    //     bbox: floatBox,
    //     path: {
    //       d: this.#focusOutlines.toSVGPath(),
    //     },
    //   },
    //   /* mustRemoveSelfIntersections = */ false
    // );
    this.#outlineId = ret.id;
    this.#clipPathId = ret.clipPathId;
    if (this.#strikethroughDiv) {
      this.#strikethroughDiv.style.clipPath = this.#clipPathId;
    }
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    const div = super.render();
    const strikethroughDiv = (this.#strikethroughDiv =
      document.createElement("div"));
    div.append(strikethroughDiv);
    strikethroughDiv.className = "internal";
    strikethroughDiv.style.clipPath = this.#clipPathId;
    const [parentWidth, parentHeight] = this.parentDimensions;
    this.setDims(this.width * parentWidth, this.height * parentHeight);

    bindEvents(this, this.#strikethroughDiv, ["pointerover", "pointerleave"]);
    this.enableEditing();

    return div;
  }

  pointerover() {
    this.parent.drawLayer.addClass(this.#outlineId, "hovered");
  }

  pointerleave() {
    this.parent.drawLayer.removeClass(this.#outlineId, "hovered");
  }

  /** @inheritdoc */
  select() {
    super.select();
    this.parent?.drawLayer.removeClass(this.#outlineId, "hovered");
    this.parent?.drawLayer.addClass(this.#outlineId, "selected");
  }

  selectWithoutToolbar() {
    super.selectWithoutToolbar();
    this.parent?.drawLayer.removeClass(this.#outlineId, "hovered");
    this.parent?.drawLayer.addClass(this.#outlineId, "selected");
  }

  /** @inheritdoc */
  unselect() {
    super.unselect();
    if (!this.#outlineId) {
      return;
    }
    this.parent?.drawLayer.removeClass(this.#outlineId, "selected");
  }

  #serializeBoxes() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const boxes = this.#boxes;
    const quadPoints = new Array(boxes.length * 8);
    let i = 0;
    for (const { x, y, width, height } of boxes) {
      const sx = x * pageWidth;
      const sy = (1 - y - height) * pageHeight;
      // The specifications say that the rectangle should start from the bottom
      // left corner and go counter-clockwise.
      // But when opening the file in Adobe Acrobat it appears that this isn't
      // correct hence the 4th and 6th numbers are just swapped.
      quadPoints[i] = quadPoints[i + 4] = sx;
      quadPoints[i + 1] = quadPoints[i + 3] = sy;
      quadPoints[i + 2] = quadPoints[i + 6] = sx + width * pageWidth;
      quadPoints[i + 5] = quadPoints[i + 7] = sy + height * pageHeight;
      i += 8;
    }
    return quadPoints;
  }

  #serializeOutlines() {
    const [pageWidth, pageHeight] = this.pageDimensions;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;
    const tx = this.x * pageWidth;
    const ty = (1 - this.y - this.height) * pageHeight;
    const outlines = [];
    for (const outline of this.#strikethroughOutlines.outlines) {
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
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof StrikeOutAnnotationElement) {
      const {
        data: { quadPoints, rect, rotation, id, color, opacity, popupRef },
        parent: {
          page: { pageNumber },
        },
      } = data;
      initialData = data = {
        annotationType: AnnotationEditorType.STRIKETHROUGH,
        color: Array.from(color),
        opacity,
        quadPoints,
        boxes: null,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        rotation,
        id,
        deleted: false,
        popupRef,
      };
    }

    const { color, quadPoints, opacity } = data;
    const editor = await super.deserialize(data, parent, uiManager);

    editor.color = Util.makeHexColor(...color);
    editor.#opacity = opacity || StrikethroughEditor._defaultOpacity;
    editor.annotationElementId = data.id || null;
    editor._initialData = initialData;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const [pageX, pageY] = editor.pageTranslation;

    if (quadPoints) {
      const boxes = (editor.#boxes = []);
      for (let i = 0; i < quadPoints.length; i += 8) {
        boxes.push({
          x: (quadPoints[i] - pageX) / pageWidth,
          y: 1 - (quadPoints[i + 1] - pageY) / pageHeight,
          width: (quadPoints[i + 2] - quadPoints[i]) / pageWidth,
          height: (quadPoints[i + 1] - quadPoints[i + 5]) / pageHeight,
        });
      }
      editor.#lineBoxes = AnnotationEditor.deduplicate(boxes);
      editor.#createOutlines();
      editor.#addToDrawLayer();
      editor.rotate(editor.pageRotation);
    }

    return editor;
  }

  #getRotation() {
    // Highlight annotations are always drawn horizontally but if
    // a free highlight annotation can be rotated.
    return 0;
  }

  static #rotateBbox({ x, y, width, height }, angle) {
    switch (angle) {
      case 90:
        return {
          x: 1 - y - height,
          y: x,
          width: height,
          height: width,
        };
      case 180:
        return {
          x: 1 - x - width,
          y: 1 - y - height,
          width,
          height,
        };
      case 270:
        return {
          x: y,
          y: 1 - x - width,
          width: height,
          height: width,
        };
    }
    return {
      x,
      y,
      width,
      height,
    };
  }

  // /** @inheritdoc */
  // rotate(angle) {
  //   const { drawLayer } = this.parent;
  //   // drawLayer.rotate(this.#id, angle);
  //   drawLayer.rotate(this.#outlineId, angle);
  //   // eslint-disable-next-line max-len
  //   // drawLayer.updateBox(this.#id, StrikethroughEditor.#rotateBbox(this, angle));
  //   drawLayer.updateBox(
  //     this.#outlineId,
  //     StrikethroughEditor.#rotateBbox(this.#focusOutlines.box, angle)
  //   );
  // }

  // static #rotateBbox([x, y, width, height], angle) {
  //   switch (angle) {
  //     case 90:
  //       return [1 - y - height, x, height, width];
  //     case 180:
  //       return [1 - x - width, 1 - y - height, width, height];
  //     case 270:
  //       return [y, 1 - x - width, height, width];
  //   }
  //   return [x, y, width, height];
  // }

  /** @inheritdoc */
  rotate(angle) {
    // We need to rotate the svgs because of the coordinates system.
    const { drawLayer } = this.parent;

    // 更新聚焦框的位置
    drawLayer.updateProperties(this.#outlineId, {
      bbox: StrikethroughEditor.#rotateBbox(this.#focusOutlines.box, angle),
      root: {
        "data-main-rotation": angle,
      },
    });

    // 更新线条位置
    for (const index in this.#ids) {
      // 获取box的rotate的包围盒属性
      const id = this.#ids[index];
      const box = this.#lineBoxes[index];
      const rotateBbox = StrikethroughEditor.#rotateBbox(box, angle);

      drawLayer.updateProperties(id, {
        bbox: rotateBbox,
        lines: drawLayer.rotateDrawLine(0.55, angle),
      });
    }
  }

  #hasElementChanged(serialized) {
    const { color, opacity } = this._initialData;
    return (
      serialized.color.some((c, i) => c !== color[i]) ||
      serialized.opacity !== opacity
    );
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    // It doesn't make sense to copy/paste a strikethrough annotation.
    if (this.isEmpty() || isForCopying) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }
    const rect = this.getRect(0, 0);
    const color = AnnotationEditor._colorManager.convert(this.color);

    const serialized = {
      annotationType: AnnotationEditorType.STRIKETHROUGH,
      color,
      opacity: this.#opacity,
      quadPoints: this.#serializeBoxes(),
      outlines: this.#serializeOutlines(),
      pageIndex: this.pageIndex,
      rect,
      rotation: this.#getRotation(),
      structTreeParentId: this._structTreeParentId,
    };

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }
    serialized.id = this.annotationElementId;
    return serialized;
  }

  static canCreateNewEmptyEditor() {
    return false;
  }
}

export { StrikethroughEditor };
