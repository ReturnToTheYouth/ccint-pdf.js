import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  assert,
  LINE_FACTOR,
  shadow,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { bindEvents, getLeftTopCoord, KeyboardManager } from "./tools.js";
import { SquareAnnotationElement } from "../annotation_layer.js";
import { ColorPicker } from "./color_picker.js";

/**
 * Basic area highlight editor in order to create a AreaHighlight annotation.
 */
class AreaHighlightEditor extends AnnotationEditor {
  #color;

  #opacity;

  #colorPicker = null;

  #drawId = null;

  static _internalPadding = 0;

  static _defaultColor = "#F7D04A";

  static _defaultOpacity = 0.3;

  static get _keyboardManager() {
    const proto = AreaHighlightEditor.prototype;

    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [
          // Commit the text in case the user use ctrl+s to save the document.
          // The event must bubble in order to be caught by the viewer.
          // See bug 1831574.
          ["ctrl+s", "mac+meta+s", "ctrl+p", "mac+meta+p"],
          proto.commitOrRemove,
          { bubbles: true },
        ],
        [
          ["ctrl+Enter", "mac+meta+Enter", "Escape", "mac+Escape"],
          proto.commitOrRemove,
        ],
      ])
    );
  }

  static _type = "areaHighlight";

  static _editorType = AnnotationEditorType.AREAHIGHLIGHT;

  constructor(params) {
    super({ ...params, name: "areaHighlightEditor" });
    // 不允许拖拽
    // this._isDraggable = true;
    this.#color =
      params.color ||
      AreaHighlightEditor._defaultColor ||
      AnnotationEditor._defaultLineColor;
    this.#opacity = params.opacity || AreaHighlightEditor._defaultOpacity;
    // 自动渲染 不同于手动渲染
    if (params.fromCommand) {
      this.fromCommand = true;
      this.x = params.x;
      this.y = params.y;
      this.width = params.width;
      this.height = params.height;
    } else {
      // 落笔的位置
      this.sourceX = params.x;
      this.sourceY = params.y;
    }
    // 记录真实坐上角点位的相对方向
    this.relativeX = 0;
    this.relativeY = 0;
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    const style = getComputedStyle(document.documentElement);

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      const lineHeight = parseFloat(
        style.getPropertyValue("--freetext-line-height")
      );
      assert(
        lineHeight === LINE_FACTOR,
        "Update the CSS variable to agree with the constant."
      );
    }

    this._internalPadding = parseFloat(
      style.getPropertyValue("--freetext-padding")
    );
  }

  /** @inheritdoc */
  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR:
        AreaHighlightEditor._defaultColor = value;
        break;
      case AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY:
        AreaHighlightEditor._defaultOpacity = value;
        break;
    }
  }

  get isResizable() {
    return false;
  }

  get opacity() {
    return this.#opacity;
  }

  get color() {
    return this.#color;
  }

  static #rotateBbox([x, y, width, height], angle) {
    switch (angle) {
      case 90:
        return [1 - y - height, x, height, width];
      case 180:
        return [1 - x - width, 1 - y - height, width, height];
      case 270:
        return [y, 1 - x - width, height, width];
    }
    return [x, y, width, height];
  }

  #getDrawBbox(bbox = [this.x, this.y, this.width, this.height]) {
    return AreaHighlightEditor.#rotateBbox(bbox, this.pageRotation);
  }

  #addToDrawLayer(parent = this.parent, bbox) {
    if (this.#drawId !== null || !parent) {
      return;
    }
    bbox ||= [this.x, this.y, this.width, this.height];
    if (
      bbox.some(value => !Number.isFinite(value)) ||
      bbox[2] <= 0 ||
      bbox[3] <= 0
    ) {
      return;
    }

    ({ id: this.#drawId } = parent.drawLayer.draw({
      bbox: this.#getDrawBbox(bbox),
      root: {
        viewBox: "0 0 1 1",
        fill: this.#color,
        "fill-opacity": this.#opacity,
      },
      rootClass: {
        areaHighlight: true,
      },
      path: {
        d: "M0 0 H1 V1 H0 Z",
      },
    }));
  }

  #syncDrawLayer(bbox = [this.x, this.y, this.width, this.height]) {
    if (!this.parent) {
      return;
    }
    if (
      bbox.some(value => !Number.isFinite(value)) ||
      bbox[2] <= 0 ||
      bbox[3] <= 0
    ) {
      this.#cleanDrawLayer();
      return;
    }
    this.#addToDrawLayer(this.parent, bbox);
    if (this.#drawId === null) {
      return;
    }
    this.parent.drawLayer.updateProperties(this.#drawId, {
      bbox: this.#getDrawBbox(bbox),
      root: {
        fill: this.#color,
        "fill-opacity": this.#opacity,
      },
    });
  }

  #cleanDrawLayer(parent = this.parent) {
    if (this.#drawId === null) {
      return;
    }
    parent?.drawLayer.remove(this.#drawId);
    this.#drawId = null;
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR:
        this.#updateColor(value);
        break;
      case AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY:
        this.#updateOpacity(value);
        break;
    }
  }

  /** @inheritdoc */
  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR,
        AreaHighlightEditor._defaultColor || AnnotationEditor._defaultLineColor,
      ],
      [
        AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY,
        AreaHighlightEditor._defaultOpacity,
      ],
    ];
  }

  /** @inheritdoc */
  get propertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR, this.#color],
      [AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY, this.#opacity],
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

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const setColor = col => {
      this.#color = col;
      this.#syncDrawLayer();
      this.#colorPicker?.updateColor(col);
    };
    const savedColor = this.#color;
    this.addCommands({
      cmd: setColor.bind(this, color),
      undo: setColor.bind(this, savedColor),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: `${AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR}:${this.id}`,
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

  #updateOpacity(opacity) {
    const setOpacity = opa => {
      this.#opacity = opa;
      this.#syncDrawLayer();
    };
    const savedOpacity = this.#opacity;
    this.addCommands({
      cmd: setOpacity.bind(this, opacity),
      undo: setOpacity.bind(this, savedOpacity),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: `${AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY}:${this.id}`,
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

  /**
   * Helper to translate the editor with the keyboard when it's empty.
   * @param {number} x in page units.
   * @param {number} y in page units.
   */
  _translateEmpty(x, y) {
    this._uiManager.translateSelectedEditors(x, y, /* noCommit = */ true);
  }

  select() {
    this.div.classList.add("noBorderAreaHighlightEditor");
    super.select();
  }

  selectWithoutToolbar() {
    this.div.classList.add("noBorderAreaHighlightEditor");
    super.selectWithoutToolbar();
  }

  unselect() {
    this.div.classList.remove("noBorderAreaHighlightEditor");
    super.unselect();
  }

  // 监听pointermove事件，计算鼠标位置
  pointerLocationChange(event) {
    const sourceX = this.parentOffset.x;
    const sourceY = this.parentOffset.y;

    const coord = getLeftTopCoord(event.target);
    const offsetX = coord.x + event.offsetX;
    const offsetY = coord.y + event.offsetY;

    const rawWidth = offsetX - sourceX - this.sourceX;
    const rawHeight = offsetY - sourceY - this.sourceY;

    // 记录真正左上角点位的相对方向
    const parentWidth = this.div.parentNode.clientWidth;
    const parentHeight = this.div.parentNode.clientHeight;
    this.relativeX = rawWidth / parentWidth;
    this.relativeY = rawHeight / parentHeight;

    const left = Math.max(
      0,
      Math.min(parentWidth, Math.min(this.sourceX, this.sourceX + rawWidth))
    );
    const top = Math.max(
      0,
      Math.min(parentHeight, Math.min(this.sourceY, this.sourceY + rawHeight))
    );
    const right = Math.max(
      0,
      Math.min(parentWidth, Math.max(this.sourceX, this.sourceX + rawWidth))
    );
    const bottom = Math.max(
      0,
      Math.min(parentHeight, Math.max(this.sourceY, this.sourceY + rawHeight))
    );
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    this.x = left / parentWidth;
    this.y = top / parentHeight;
    this.width = width / parentWidth;
    this.height = height / parentHeight;
    this.originWidth = width;
    this.originHeight = height;

    this.div.style.left = `${100 * this.x}%`;
    this.div.style.top = `${100 * this.y}%`;
    this.div.style.width = `${width}px`;
    this.div.style.height = `${height}px`;
    this.#syncDrawLayer();
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
    this.#syncDrawLayer();
    this.rotate(this.pageRotation);

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  /** @inheritdoc */
  setParent(parent) {
    let mustBeSelected = false;
    const oldParent = this.parent;
    if (oldParent && oldParent !== parent) {
      this.#cleanDrawLayer(oldParent);
    }
    if (parent) {
      mustBeSelected =
        !oldParent && this.div?.classList.contains("selectedEditor");
    }
    super.setParent(parent);
    if (!parent) {
      return;
    }
    this.#syncDrawLayer();
    this.show(this._isVisible);
    if (mustBeSelected) {
      this.select();
    }
  }

  /** @inheritdoc */
  show(visible = this._isVisible) {
    super.show(visible);
    this.parent?.drawLayer.updateProperties(this.#drawId, {
      rootClass: {
        hidden: !visible,
      },
    });
  }

  /** @inheritdoc */
  rotate(_angle) {
    this.#syncDrawLayer();
  }

  postAttach() {
    this.adaptSize();
    this.#syncDrawLayer();
  }

  adaptive() {
    if (this.autoRender) {
      this.adaptSize();
    }
  }

  postConfirm() {
    if ([this.x, this.y, this.width, this.height].every(Number.isFinite)) {
      this.adaptSize();
      this.#syncDrawLayer();
      return;
    }
    const parentWidth = this.div.parentNode.clientWidth;
    const parentHeight = this.div.parentNode.clientHeight;

    // 计算最终的left和top位置
    let finalLeft = this.sourceX;
    let finalTop = this.sourceY;
    let finalWidth = this.originWidth;
    let finalHeight = this.originHeight;

    // 处理负宽度的情况（向左拖动）
    if (this.originWidth < 0) {
      finalLeft = this.sourceX + this.originWidth;
      finalWidth = Math.abs(this.originWidth);
    }

    // 处理负高度的情况（向上拖动）
    if (this.originHeight < 0) {
      finalTop = this.sourceY + this.originHeight;
      finalHeight = Math.abs(this.originHeight);
    }

    // 确保区域高亮在页面边界内
    if (finalLeft < 0) {
      finalWidth += finalLeft; // 减少宽度以补偿负的left值
      finalLeft = 0;
    }
    if (finalTop < 0) {
      finalHeight += finalTop; // 减少高度以补偿负的top值
      finalTop = 0;
    }
    if (finalLeft + finalWidth > parentWidth) {
      finalWidth = parentWidth - finalLeft; // 限制宽度不超过页面右边界
    }
    if (finalTop + finalHeight > parentHeight) {
      finalHeight = parentHeight - finalTop; // 限制高度不超过页面下边界
    }

    // 确保宽度和高度不为负数
    finalWidth = Math.max(0, finalWidth);
    finalHeight = Math.max(0, finalHeight);

    // 设置相对坐标（相对于父容器的比例）
    this.x = finalLeft / parentWidth;
    this.y = finalTop / parentHeight;
    this.width = finalWidth / parentWidth;
    this.height = finalHeight / parentHeight;

    this.adaptSize();
    this.#syncDrawLayer();
    // 添加了editor之后取消自动选中
    // this.parent.setSelected(this);
  }

  adaptSize() {
    const pWidth = this.div.parentNode.style.width;
    const pHeight = this.div.parentNode.style.height;
    // hack式写法，说实话不太好，但是此处也好改
    let sWidth;
    let sHeight;
    if (pWidth.includes("var(--total-scale-factor)")) {
      sWidth = pWidth.replace(
        "var(--total-scale-factor)",
        "var(--total-scale-factor)*" + this.width
      );
      sHeight = pHeight.replace(
        "var(--total-scale-factor)",
        "var(--total-scale-factor)*" + this.height
      );
    } else if (pWidth.includes("calc(")) {
      sWidth = pWidth.replace("calc(", "calc(" + this.width + "*");
      sHeight = pHeight.replace("calc(", "calc(" + this.height + "*");
    } else {
      throw new Error("无法确定框选的缩放");
    }

    // 确保区域高亮不超过页面边界
    const parentWidth = this.div.parentNode.clientWidth;
    const parentHeight = this.div.parentNode.clientHeight;

    // 解析计算出的宽度和高度，确保不超过页面边界
    const computedWidth = parseFloat(sWidth);
    const computedHeight = parseFloat(sHeight);

    if (!isNaN(computedWidth) && computedWidth > parentWidth) {
      sWidth = parentWidth + "px";
    }
    if (!isNaN(computedHeight) && computedHeight > parentHeight) {
      sHeight = parentHeight + "px";
    }

    this.div.style.height = sHeight;
    this.div.style.width = sWidth;
  }

  /** @inheritdoc */
  focusin(event) {
    if (!this._focusEventsAllowed) {
      return;
    }
    super.focusin(event);
    // if (event.target !== this.editorDiv) {
    //   this.editorDiv.focus();
    // }
  }

  /** @inheritdoc */
  onceAdded(focus) {
    if (this.width) {
      // The editor was created in using ctrl+c.
      return;
    }
    if (!this.annotationElementId) {
      this.parent.addUndoableEditor(this);
    }
    if (focus) {
      this.div.focus();
    }
  }

  /** @inheritdoc */
  isEmpty() {
    return false;
  }

  /** @inheritdoc */
  remove() {
    this.isEditing = false;
    this.#cleanDrawLayer();
    // if (this.parent) {
    //   this.parent.setEditingState(true);
    //   this.parent.div.classList.add("areaHighlightEditing");
    // }
    super.remove();
  }

  /**
   * Commit this editor.
   * @returns {undefined}
   */
  commit() {
    if (!this.isInEditMode()) {
      return;
    }

    super.commit();
  }

  /** @inheritdoc */
  shouldGetKeyboardEvents() {
    return this.isInEditMode();
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
  render() {
    if (this.div) {
      return this.div;
    }
    super.render();
    this.originWidth = 0;
    this.originHeight = 0;
    this.div.style.width = "0px";
    this.div.style.height = "0px";
    this.div.style.position = "absolute";
    this.div.style.backgroundColor = "transparent";
    this.div.style.border = "none";
    this.div.style.outline = "none";

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      this.div.setAttribute("annotation-id", this.annotationElementId);
    }

    this.#syncDrawLayer();

    return this.div;
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof SquareAnnotationElement) {
      const {
        data: { color, opacity, rect, id, popupRef, rotation },
        parent: {
          page: { pageNumber },
        },
      } = data;
      // textContent is supposed to be an array of strings containing each line
      // of text. However, it can be null or empty.
      // 检查是否有有效的区域
      if (!rect || rect.length !== 4) {
        return null;
      }
      initialData = data = {
        annotationType: AnnotationEditorType.AREAHIGHLIGHT,
        color: Array.from(color),
        opacity,
        rotation,
        pageIndex: pageNumber - 1,
        rect: rect.slice(0),
        id,
        deleted: false,
        popupRef,
      };
    }
    const editor = await super.deserialize(data, parent, uiManager);
    editor.#color = Util.makeHexColor(...data.color);
    editor.#opacity = data.opacity || AreaHighlightEditor._defaultOpacity;
    editor.annotationElementId = data.id || null;
    editor._initialData = initialData;
    editor.#syncDrawLayer();

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return {
        pageIndex: this.pageIndex,
        id: this.annotationElementId,
        deleted: true,
      };
    }

    const rect = this.getRect(0, 0);
    const color = AnnotationEditor._colorManager.convert(this.#color);

    const serialized = {
      annotationType: AnnotationEditorType.AREAHIGHLIGHT,
      color,
      opacity: this.#opacity,
      pageIndex: this.pageIndex,
      rect,
      structTreeParentId: this._structTreeParentId,
    };

    if (isForCopying) {
      // 复制时不需要添加id，因为粘贴的编辑器不应该与现有注释关联
      return serialized;
    }

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;

    return serialized;
  }

  #hasElementChanged(serialized) {
    if (!this._initialData) {
      return true;
    }
    const { color, opacity } = this._initialData;
    return (
      this._hasBeenMoved ||
      serialized.color.some((component, index) => component !== color[index]) ||
      serialized.opacity !== opacity
    );
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

export { AreaHighlightEditor };
