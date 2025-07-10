import {
  addOpacityToColor,
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
    return true;
  }

  get opacity() {
    return this.#opacity;
  }

  get color() {
    return this.#color;
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
      this.div.style.backgroundColor = addOpacityToColor(col, this.#opacity);
      this.#colorPicker?.updateColor(col);
    };
    const savedColor = this.#color;
    this.addCommands({
      cmd: setColor.bind(this, color),
      undo: setColor.bind(this, savedColor),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.AREA_HIGHLIGHT_COLOR,
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
      this.div.style.backgroundColor = addOpacityToColor(this.#color, opa);
    };
    const savedOpacity = this.#opacity;
    this.addCommands({
      cmd: setOpacity.bind(this, opacity),
      undo: setOpacity.bind(this, savedOpacity),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: true,
      type: AnnotationEditorParamsType.AREA_HIGHLIGHT_OPACITY,
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

    let width = offsetX - sourceX - this.sourceX;
    let height = offsetY - sourceY - this.sourceY;

    // 记录真正左上角点位的相对方向
    this.relativeX = width / this.parentDimensions[0];
    this.relativeY = height / this.parentDimensions[1];

    let left = this.sourceX;
    let top = this.sourceY;
    if (width < 0) {
      // width是负数，所以为加号，让其沿着负方向偏移
      left += width; // 向左拖动，left要跟着变
      width = Math.abs(width);
    }
    if (height < 0) {
      // height是负数，所以为加号，让其沿着负方向偏移
      top += height; // 向上拖动，top要跟着变
      height = Math.abs(height);
    }

    this.originWidth = width;
    this.originHeight = height;
    const parentWidth = this.div.parentNode.clientWidth;
    const parentHeight = this.div.parentNode.clientHeight;
    this.div.style.left = (left / parentWidth) * 100 + "%";
    this.div.style.top = (top / parentHeight) * 100 + "%";
    this.div.style.width = width + "px";
    this.div.style.height = height + "px";
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

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  postAttach() {
    this.adaptSize();
  }

  adaptive() {
    if (this.autoRender) {
      this.adaptSize();
    }
  }

  postConfirm() {
    const parentWidth = this.div.parentNode.clientWidth;
    const parentHeight = this.div.parentNode.clientHeight;
    this.width = (1.0 * this.originWidth) / parentWidth;
    this.height = (1.0 * this.originHeight) / parentHeight;
    this.adaptSize();
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
    this.div.style.backgroundColor = addOpacityToColor(
      this.#color,
      this.#opacity
    );
    this.div.style.border = "none";
    this.div.style.outline = "none";

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      this.div.setAttribute("annotation-id", this.annotationElementId);
    }

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
    const color = AnnotationEditor._colorManager.convert(
      this.isAttachedToDOM
        ? getComputedStyle(this.div).backgroundColor
        : this.color
    );

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
    return (
      this._hasBeenMoved ||
      serialized.color !== this.#color ||
      serialized.opacity !== this.#opacity
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
