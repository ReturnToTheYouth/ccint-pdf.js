import {
  controller,
  createMarkingOperation,
  ParameterConverter,
} from "./custom_util.js";

function getApplication() {
  return window.PDFViewerApplication;
}

function getEventBus() {
  return getApplication().eventBus;
}

function saveAnnotationToDiscFunc() {
  return window.saveAnnotationToDisc;
}

// 给所有editor加上一个bizId，表示是业务id

class EditorLifecycleInterceptor {
  // editor展示在页面上之后，要做的事
  postEditorShow(params) {
    const func = saveAnnotationToDiscFunc();
    func("add", params);
  }

  // editor在页面上经过变化之后，要做的事
  postEditorModify(params) {
    const func = saveAnnotationToDiscFunc();
    func("modi", params);
  }

  // editor在页面上消失之前要做的事
  postEditorRemove(params) {
    const func = saveAnnotationToDiscFunc();
    func("del", params);
  }
}

const interceptor = new EditorLifecycleInterceptor();

const converter = new ParameterConverter();

class EditorManager {
  map = new Map();

  // 矫正id开始的位置
  initEditorParameters(params, uiManger) {
    if (params == null || params.length == 0) {
      return;
    }
    let maxId = -1;
    for (const param of params) {
      if (!param.id) {
        continue;
      }
      this.map.set(param.id, param);
      const number = parseInt(param.id.replace("pdfjs_internal_editor_", ""));
      if (isNaN(number)) {
        continue;
      }
      if (number > maxId) {
        maxId = number;
      }
    }
    uiManger.setId(maxId + 1);
  }

  createEditorParameters(editor) {
    const exist = this.map.get(editor.id);
    if (exist) {
      return null;
    }
    const params = converter.convertToParams(editor);
    if (!params) {
      console.log("转换失败，editor无法转换为相应参数");
      return null;
    }
    // createMarkingOperation(params.id);
    this.map.set(editor.id, params);
    return params;
  }

  modifyEditorParameters(editor) {
    const params = converter.convertToParams(editor);
    if (editor.id != params.id) {
      console.log("id不一致，修改失败");
      return null;
    }
    if (!params) {
      console.log("转换失败，editor无法转换为相应参数");
      return null;
    }
    this.map.set(editor.id, params);
    return params;
  }

  removeEditorParameters(editor) {
    let params;
    if (!editor || !editor.id || !(params = this.map.get(editor.id))) {
      return null;
    }
    this.map.delete(editor.id);
    interceptor.postEditorRemove(params);
    return params;
  }
}

const editorManager = new EditorManager();
window.editorManager = editorManager;

// editor对象一实例化，批注就加上的类型
const CREATE_AFTER_CONSTRUCT = [
  "highlightEditor",
  "underlineEditor",
  "strikethroughEditor",
  "freeTextEditor",
];

// editor对象创建完，但要经过一轮操作才结束的
const CREATE_AFTER_INITIALIZE = [
  "areaHighlightEditor",
  "inkEditor",
  "arrowEditor",
  "stampEditor",
];

/**
 * 页面上的editor要分情况，有的是editor创建了，图形就显示了，
 * 有的创建了之后等鼠标松手了，才创建，因此这里处理那些点击即创建的
 *
 */
const postConstruct = editor => {
  if (editor && CREATE_AFTER_CONSTRUCT.indexOf(editor.name) != -1) {
    const params = editorManager.createEditorParameters(editor);
    interceptor.postEditorShow(params, editor);
  }
};

/**
 * 有的editor对象初始化完了之后，再经过一轮操作，才记录的，就在这里处罚
 */
const postInitialize = editor => {
  if (editor && CREATE_AFTER_INITIALIZE.indexOf(editor.name) != -1) {
    const params = editorManager.createEditorParameters(editor);
    interceptor.postEditorShow(params, editor);
  }
};

const postModifyConfirm = editor => {
  const params = editorManager.modifyEditorParameters(editor);
  interceptor.postEditorModify(params, editor);
};

const postDestory = e => {
  editorManager.removeEditorParameters(e);
};

let afterDocumentLoadedExecuted = false;

const initCustom = () => {
  getEventBus().on("annotationeditoruimanager", function () {
    const properties = getApplication().pdfViewer._layerProperties;
    const manager = properties.annotationEditorUIManager;

    manager.hook.postConstruct = postConstruct;
    manager.hook.postModifyConfirm = postModifyConfirm;
    manager.hook.postDestory = postDestory;
    manager.hook.postInitialize = postInitialize;

    const params = window.initPdfDocumentAnnos();
    // 保存到editorManager里面去
    editorManager.initEditorParameters(params, manager);
    controller.renderPreparedLayerAnnotations(editorManager.map);
  });

  getEventBus().on("annotationeditorlayerrendered", function (e) {
    // 这个代码只执行一次
    if (!afterDocumentLoadedExecuted) {
      afterDocumentLoadedExecuted = true;
      if (window.afterDocumentLoaded) {
        window.afterDocumentLoaded();
      }
    }
    // pageNumber要转换成layer的下标，要减1
    controller.renderPreparedLayerAnnotations(
      editorManager.map,
      e.pageNumber - 1
    );
  });
};
export { initCustom };
