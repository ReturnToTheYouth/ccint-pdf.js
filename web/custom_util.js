// import { ArrowEditor } from "../src/display/editor/arrow.js";
import { AreaHighlightEditor } from "../src/display/editor/areaHighlight.js";
import { FreeTextEditor } from "../src/display/editor/freetext.js";
import { HighlightEditor } from "../src/display/editor/highlight.js";
import { InkEditor } from "../src/display/editor/ink.js";
import { StampEditor } from "../src/display/editor/stamp.js";
import { StrikethroughEditor } from "../src/display/editor/strikethrough.js";
import { UnderlineEditor } from "../src/display/editor/underline.js";
import { Util } from "../src/shared/util.js";

const getApplication = () => window.PDFViewerApplication;

function getUIManager() {
  return getApplication().pdfViewer._layerProperties.annotationEditorUIManager;
}

function getEditorManager() {
  return window.editorManager;
}

function getContainer() {
  return document.getElementById("viewerContainer");
}

function getMainContainer() {
  return document.getElementById("mainContainer");
}

function getViewer() {
  return document.getElementById("viewer");
}

function selectEditor(id) {
  const manager = getUIManager();
  let editor = null;
  if (!manager || !(editor = manager.getEditor(id))) {
    return;
  }
  manager.setSelected(editor, false);
}

class EditorDisplayController {
  renderPreparedLayerAnnotations(params, layerIndex) {
    for (const [key, value] of params) {
      // 两种情况下渲染
      // 一种是 没有传入 layerIndex 按照当前加载的页来渲染
      // 一种是传入了layerIndex，那么就只渲染传入的layerIndex
      if (
        (!layerIndex || value.pageIndex == layerIndex) &&
        value.hidden != true
      ) {
        this.show(key);
      }
    }
    const uiManager = getUIManager();
    const id = uiManager.waitToSelect;
    let editor = null;
    if (!id || (editor = uiManager.getEditor(id)) == null) {
      return;
    }
    uiManager.waitToSelect = null;
    uiManager.setSelected(editor);
  }

  jump(id) {
    const em = getEditorManager();
    let params;
    if ((params = em.map.get(id)) == null) {
      return null;
    }

    const index = params.pageIndex;
    const y = params.y;
    const height = params.height;
    const container = getContainer();
    const viewer = getViewer();
    const nodes = viewer.childNodes;
    if (viewer.childNodes.length <= index) {
      return null;
    }
    const page = nodes[index];

    // 通过这个值可以滚动到当页
    const offsetTop = page.offsetTop;
    const pageHeight = page.scrollHeight;

    // 元素相对于页面的y值
    const eleY = y * pageHeight;

    // 通过这个值可以将注解滚动到顶部，toolbar高度不会变
    // 并且保证 元素高度 一半在screen内，一半在screen外
    let destY = offsetTop + eleY + (height * pageHeight) / 2;

    // 把批注滚动到最高处之后，还要回滚半个屏幕（实际上是可见部分）
    // 这样批注就在正中央了
    const scrollBackHeight = container.clientHeight / 2;
    destY -= scrollBackHeight;
    if (destY < 0) {
      destY = 0;
    }
    container.scrollTo(0, destY);
    const editor = getUIManager().getEditor(id);
    if (editor) {
      selectEditor(id);
    } else {
      getUIManager().waitToSelect = id;
    }
    return destY;
  }

  show(id) {
    const inUIManager = this.isInUIManager(id);
    const inParamMap = this.isInParamMap(id);

    // 已经展示了就不展示
    if (inUIManager) {
      return;
    }
    // 如果没有参数 也不展示
    if (!inParamMap) {
      return;
    }
    this.doShow(id);
  }

  hide(id) {
    const inUIManager = this.isInUIManager(id);
    // 已经不显示的就不管了
    if (!inUIManager) {
      return;
    }

    const manager = getUIManager();
    const editor = manager.getEditor(id);
    editor.remove(true);
    const eManager = getEditorManager();
    const params = eManager.map.get(id);
    if (params != null) {
      params.hidden = true;
    }
  }

  remove(id, direct = false) {
    const inUIManager = this.isInUIManager(id);
    // 已经不显示的就不管了
    if (!inUIManager) {
      return;
    }
    // 应该要从params里也删除掉
    const manager = getUIManager();
    const editor = manager.getEditor(id);
    editor.remove(direct);
    const eManager = getEditorManager();
    const params = eManager.map.get(id);
    if (params != null) {
      params.hidden = true;
    }
  }

  doShow(id) {
    const um = getUIManager();
    const em = getEditorManager();

    // 没有则创建
    const source = em.map.get(id);
    const pageIndex = source.pageIndex;
    const layer = um.getLayer(pageIndex);

    if (!layer) {
      return;
    }

    // 可见状态
    source.hidden = false;

    const params = Object.assign({}, source);
    // 是否
    params.fromCommand = true;
    params.uiManager = um;
    params.parent = layer;

    let editor = null;

    switch (params.name) {
      case "highlightEditor":
        editor = new HighlightEditor(params);
        layer.add(editor);
        break;
      case "underlineEditor":
        editor = new UnderlineEditor(params);
        layer.add(editor);
        break;
      case "strikethroughEditor":
        editor = new StrikethroughEditor(params);
        layer.add(editor);
        break;
      case "areaHighlightEditor":
        editor = new AreaHighlightEditor(params);
        layer.add(editor);
        break;
      case "freeTextEditor":
        this.showFreeTextEditor(params, layer);
        break;
      case "inkEditor":
        this.showInkEditor(params, layer);
        break;
      // case "arrowEditor":
      //   editor = new ArrowEditor(params);
      //   layer.add(editor);
      //   break;
      case "stampEditor":
        this.showStampEditor(params);
        break;
    }
  }

  showFreeTextEditor(params) {
    const manager = getUIManager();
    const editor = new FreeTextEditor(params);
    manager.doAddEditorToLayer(editor);
    editor.renderContent(params.content);
    editor.disableEditMode();
  }

  showStampEditor(params) {
    const manager = getUIManager();
    const editor = new StampEditor(params);
    manager.doAddEditorToLayer(editor);
  }

  showInkEditor(params, layer) {
    const editor = this.constructInk(params);
    editor.thickness = params.thickness;
    editor.color = Util.makeHexColor(...params.color);
    editor.opacity = params.opacity;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const width = editor.width * pageWidth;
    const height = editor.height * pageHeight;
    const scaleFactor = editor.parentScale;
    const padding = params.thickness / 2;

    editor.setRealWidthHeight(width, height);

    const { rect, rotation } = params;
    const paths = clonePaths(params.paths);

    for (let { bezier } of paths) {
      bezier = InkEditor.doFromPDFCoordinates(bezier, rect, rotation);
      const path = [];
      editor.paths.push(path);
      let p0 = scaleFactor * (bezier[0] - padding);
      let p1 = scaleFactor * (bezier[1] - padding);
      for (let i = 2, ii = bezier.length; i < ii; i += 6) {
        const p10 = scaleFactor * (bezier[i] - padding);
        const p11 = scaleFactor * (bezier[i + 1] - padding);
        const p20 = scaleFactor * (bezier[i + 2] - padding);
        const p21 = scaleFactor * (bezier[i + 3] - padding);
        const p30 = scaleFactor * (bezier[i + 4] - padding);
        const p31 = scaleFactor * (bezier[i + 5] - padding);
        path.push([
          [p0, p1],
          [p10, p11],
          [p20, p21],
          [p30, p31],
        ]);
        p0 = p30;
        p1 = p31;
      }
      const path2D = InkEditor.doBuildPath2D(path);
      editor.bezierPath2D.push(path2D);
    }

    editor.setBaseWidthHeight(width, height);

    layer.add(editor);
    return editor;
  }

  constructInk(params) {
    const editor = new InkEditor(params);
    editor.rotation = params.rotation;

    const [pageWidth, pageHeight] = editor.pageDimensions;
    const [x, y, width, height] = editor.getRectInCurrentCoords(
      params.rect,
      pageHeight
    );
    editor.x = x / pageWidth;
    editor.y = y / pageHeight;
    editor.width = width / pageWidth;
    editor.height = height / pageHeight;

    return editor;
  }

  isInUIManager(id) {
    const manager = getUIManager();
    const editor = manager.getEditor(id);
    return editor != null;
  }

  isInParamMap(id) {
    const eManager = getEditorManager();
    const params = eManager.map.get(id);
    return params != null;
  }
}

function clonePaths(paths) {
  const ret = [];
  for (const path of paths) {
    const { bezier, points } = path;
    const np = {
      bezier: [],
      points: [],
    };
    for (const bi of bezier) {
      np.bezier.push(bi);
    }
    for (const pi of points) {
      np.points.push(pi);
    }
    ret.push(np);
  }
  return ret;
}

class ParameterConverter {
  // 将editor的基本参数抽取出来
  convertToParams(editor) {
    const name = editor.name;
    switch (name) {
      case "areaHighlightEditor":
        return this.fromAreaHighlight(editor);
      case "inkEditor":
        return this.fromInk(editor);
      case "highlightEditor":
        return this.fromHighlight(editor);
      case "freeTextEditor":
        return this.fromFreeText(editor);
      case "underlineEditor":
      case "strikethroughEditor":
        return this.fromLine(editor);
      case "arrowEditor":
        return this.fromArrow(editor);
      case "stampEditor":
        return this.fromStamp(editor);
      default:
        return null;
    }
  }

  fromStamp(editor) {
    const params = this.fromCommon(editor);
    params.imgBase64 = editor.imgBase64;
    return params;
  }

  fromHighlight(editor) {
    const params = this.fromCommon(editor);
    params.selectedText = editor.selectedText;
    params.boxes = this.cloneBoxes(editor.getBoxes());
    return params;
  }

  fromAreaHighlight(editor) {
    const params = this.fromCommon(editor);
    params.relativeX = editor.relativeX;
    params.relativeY = editor.relativeY;
    return params;
  }

  fromArrow(editor) {
    const params = this.fromCommon(editor);
    const rect = editor.rawRect();
    params.x = rect.x;
    params.y = rect.y;
    params.height = rect.height;
    params.width = rect.width;
    params.arrowType = editor.arrowType;
    return params;
  }

  fromInk(editor) {
    const params = this.fromCommon(editor);
    const seria = editor.serialize();
    if (!seria) {
      return params;
    }
    params.color = seria.color;
    params.thickness = seria.thickness;
    params.opacity = seria.opacity;
    params.paths = clonePaths(seria.paths);
    params.rect = seria.rect;
    params.rotation = seria.rotation;

    return params;
  }

  fromFreeText(editor) {
    const params = this.fromCommon(editor);
    params.name = "freeTextEditor";
    params.x = editor.x;
    params.y = editor.y;
    params.content = editor.getContent();
    params.color = editor.getColor();
    params.fontSize = editor.getFontSize();
    return params;
  }

  fromLine(editor) {
    const params = this.fromCommon(editor);
    params.selectedText = editor.selectedText;
    params.boxes = this.cloneBoxes(editor.getBoxes());
    return params;
  }

  fromCommon(editor) {
    const params = {};
    params.pageIndex = editor.pageIndex;
    params.id = editor.id;
    params.x = editor.x;
    params.y = editor.y;
    params.width = editor.width;
    params.height = editor.height;
    params.isCentered = editor._initialOptions?.isCentered;
    params.name = editor.name;
    return params;
  }

  cloneBoxes(boxes) {
    if (!boxes) {
      return [];
    }
    const ret = [];
    for (const p of boxes) {
      ret.push({
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      });
    }
    return ret;
  }
}

let markingIndex = 1;

const controller = new EditorDisplayController();

window.annotationEditorController = controller;

function createMarkingOperation(id) {
  const list = document.getElementById("operationList");
  const wrapper = document.createElement("div");

  list.append(wrapper);
  const name = document.createElement("a");
  name.innerText = "标注" + markingIndex++;
  const select = document.createElement("a");
  select.innerText = "选中";
  select.setAttribute("href", "#");
  select.style.marginLeft = "10px";
  select.onclick = () => {
    selectEditor(id);
  };

  const showEle = document.createElement("a");
  showEle.innerText = "展示";
  showEle.setAttribute("href", "#");
  showEle.style.marginLeft = "10px";
  showEle.onclick = () => {
    controller.show(id);
  };

  const hideEle = document.createElement("a");
  hideEle.innerText = "隐藏";
  hideEle.setAttribute("href", "#");
  hideEle.style.marginLeft = "10px";
  hideEle.onclick = () => {
    controller.remove(id, true);
  };

  const jumpEle = document.createElement("a");
  jumpEle.innerText = "跳转";
  jumpEle.setAttribute("href", "#");
  jumpEle.style.marginLeft = "10px";
  jumpEle.onclick = () => {
    controller.jump(id);
  };

  wrapper.append(name);
  wrapper.append(select);
  wrapper.append(showEle);
  wrapper.append(hideEle);
  wrapper.append(jumpEle);
}

export { controller, createMarkingOperation, ParameterConverter };
