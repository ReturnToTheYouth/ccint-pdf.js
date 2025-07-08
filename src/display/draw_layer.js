/* Copyright 2023 Mozilla Foundation
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

import { DOMSVGFactory } from "./svg_factory.js";
import { shadow } from "../shared/util.js";

/**
 * Manage the SVGs drawn on top of the page canvas.
 * It's important to have them directly on top of the canvas because we want to
 * be able to use mix-blend-mode for some of them.
 */
class DrawLayer {
  #parent = null;

  #mapping = new Map();

  #toUpdate = new Map();

  static #id = 0;

  constructor({ pageIndex }) {
    this.pageIndex = pageIndex;
  }

  setParent(parent) {
    if (!this.#parent) {
      this.#parent = parent;
      return;
    }

    if (this.#parent !== parent) {
      if (this.#mapping.size > 0) {
        for (const root of this.#mapping.values()) {
          root.remove();
          parent.append(root);
        }
      }
      this.#parent = parent;
    }
  }

  static get _svgFactory() {
    return shadow(this, "_svgFactory", new DOMSVGFactory());
  }

  static #setBox(element, [x, y, width, height]) {
    const { style } = element;
    style.top = `${100 * y}%`;
    style.left = `${100 * x}%`;
    style.width = `${100 * width}%`;
    style.height = `${100 * height}%`;
  }

  static #setBoxCopy(element, { x = 0, y = 0, width = 1, height = 1 } = {}) {
    const { style } = element;
    style.top = `${100 * y}%`;
    style.left = `${100 * x}%`;
    style.width = `${100 * width}%`;
    style.height = `${100 * height}%`;
  }

  #createSVG() {
    const svg = DrawLayer._svgFactory.create(1, 1, /* skipDimensions = */ true);
    this.#parent.append(svg);
    svg.setAttribute("aria-hidden", true);

    return svg;
  }

  #createSVGCopy(box) {
    const svg = DrawLayer._svgFactory.create(1, 1, /* skipDimensions = */ true);
    this.#parent.append(svg);
    svg.setAttribute("aria-hidden", true);
    DrawLayer.#setBoxCopy(svg, box);

    return svg;
  }

  #createClipPath(defs, pathId) {
    const clipPath = DrawLayer._svgFactory.createElement("clipPath");
    defs.append(clipPath);
    const clipPathId = `clip_${pathId}`;
    clipPath.setAttribute("id", clipPathId);
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    const clipPathUse = DrawLayer._svgFactory.createElement("use");
    clipPath.append(clipPathUse);
    clipPathUse.setAttribute("href", `#${pathId}`);
    clipPathUse.classList.add("clip");

    return clipPathId;
  }

  #updateProperties(element, properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (value === null) {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  draw(properties, isPathUpdatable = false, hasClip = false) {
    const id = DrawLayer.#id++;
    const root = this.#createSVG();

    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_p${this.pageIndex}_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("vector-effect", "non-scaling-stroke");

    if (isPathUpdatable) {
      this.#toUpdate.set(id, path);
    }

    // Create the clipping path for the editor div.
    const clipPathId = hasClip ? this.#createClipPath(defs, pathId) : null;

    const use = DrawLayer._svgFactory.createElement("use");
    root.append(use);
    use.setAttribute("href", `#${pathId}`);
    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return { id, clipPathId: `url(#${clipPathId})` };
  }

  drawOutline(properties, mustRemoveSelfIntersections) {
    // We cannot draw the outline directly in the SVG for highlights because
    // it composes with its parent with mix-blend-mode: multiply.
    // But the outline has a different mix-blend-mode, so we need to draw it in
    // its own SVG.
    const id = DrawLayer.#id++;
    const root = this.#createSVG();
    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_p${this.pageIndex}_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("vector-effect", "non-scaling-stroke");

    let maskId;
    if (mustRemoveSelfIntersections) {
      const mask = DrawLayer._svgFactory.createElement("mask");
      defs.append(mask);
      maskId = `mask_p${this.pageIndex}_${id}`;
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "objectBoundingBox");
      const rect = DrawLayer._svgFactory.createElement("rect");
      mask.append(rect);
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", "white");
      const use = DrawLayer._svgFactory.createElement("use");
      mask.append(use);
      use.setAttribute("href", `#${pathId}`);
      use.setAttribute("stroke", "none");
      use.setAttribute("fill", "black");
      use.setAttribute("fill-rule", "nonzero");
      use.classList.add("mask");
    }

    const use1 = DrawLayer._svgFactory.createElement("use");
    root.append(use1);
    use1.setAttribute("href", `#${pathId}`);
    if (maskId) {
      use1.setAttribute("mask", `url(#${maskId})`);
    }
    const use2 = use1.cloneNode();
    root.append(use2);
    use1.classList.add("mainOutline");
    use2.classList.add("secondaryOutline");

    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return id;
  }

  static drawLine(line, y, rotation = 0) {
    const percent = y * 100 + "%";
    // line.setAttribute("x1", "0");
    // line.setAttribute("y1", percent);
    // line.setAttribute("x2", "100%");
    // line.setAttribute("y2", percent);

    // 根据旋转角度调整线的方向和位置
    switch (rotation) {
      case 90:
        // 90度旋转：垂直线，从左边percent位置到右边
        line.setAttribute("x1", percent);
        line.setAttribute("y1", "0");
        line.setAttribute("x2", percent);
        line.setAttribute("y2", "100%");
        break;
      case 180:
        // 180度旋转：水平线，但在顶部
        line.setAttribute("x1", "0");
        line.setAttribute("y1", 100 - y * 100 + "%");
        line.setAttribute("x2", "100%");
        line.setAttribute("y2", 100 - y * 100 + "%");
        break;
      case 270:
        // 270度旋转：垂直线，从右边percent位置到左边
        line.setAttribute("x1", 100 - y * 100 + "%");
        line.setAttribute("y1", "0");
        line.setAttribute("x2", 100 - y * 100 + "%");
        line.setAttribute("y2", "100%");
        break;
      default:
        // 0度：默认水平线
        line.setAttribute("x1", "0");
        line.setAttribute("y1", percent);
        line.setAttribute("x2", "100%");
        line.setAttribute("y2", percent);
        break;
    }

    line.setAttribute("stroke-width", "2px");
    // stroke属性用currentColor
    line.setAttribute("stroke", "currentColor");
    // line.setAttribute("style", "stroke: #000;stroke-width: 2px;");
  }

  updateBox(id, box) {
    DrawLayer.#setBox(this.#mapping.get(id), box);
  }

  rotate(id, angle) {
    this.#mapping.get(id).setAttribute("data-main-rotation", angle);
  }

  // 它的作用是在页面上为高亮（或自由高亮）批注绘制外部轮廓（outline），并且用 SVG 实现了不同的混合模式和遮罩效果。
  highlightOutline(outlines) {
    // We cannot draw the outline directly in the SVG for highlights because
    // it composes with its parent with mix-blend-mode: multiply.
    // But the outline has a different mix-blend-mode, so we need to draw it in
    // its own SVG.
    const id = DrawLayer.#id++;
    const root = this.#createSVG(outlines.box);
    root.classList.add("highlightOutline");
    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_p${this.pageIndex}_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("d", outlines.toSVGPath());
    path.setAttribute("vector-effect", "non-scaling-stroke");

    let maskId;
    if (outlines.free) {
      root.classList.add("free");
      const mask = DrawLayer._svgFactory.createElement("mask");
      defs.append(mask);
      maskId = `mask_p${this.pageIndex}_${id}`;
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "objectBoundingBox");
      const rect = DrawLayer._svgFactory.createElement("rect");
      mask.append(rect);
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", "white");
      const use = DrawLayer._svgFactory.createElement("use");
      mask.append(use);
      use.setAttribute("href", `#${pathId}`);
      use.setAttribute("stroke", "none");
      use.setAttribute("fill", "black");
      use.setAttribute("fill-rule", "nonzero");
      use.classList.add("mask");
    }

    const use1 = DrawLayer._svgFactory.createElement("use");
    root.append(use1);
    use1.setAttribute("href", `#${pathId}`);
    if (maskId) {
      use1.setAttribute("mask", `url(#${maskId})`);
    }
    const use2 = use1.cloneNode();
    root.append(use2);
    use1.classList.add("mainOutline");
    use2.classList.add("secondaryOutline");

    this.#mapping.set(id, root);

    return id;
  }

  lineOutline(params) {
    // 和上面那个差不多，只不过要加个clipPath，把轮廓绘制出来
    const { outlines, box } = params;
    const id = DrawLayer.#id++;
    const root = this.#createSVGCopy(box);
    root.classList.add("highlightOutline");
    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_p${this.pageIndex}_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute(
      "d",
      DrawLayer.#extractPathFromHighlightOutlines(outlines)
    );
    path.setAttribute("vector-effect", "non-scaling-stroke");

    // 绘制clip-path 主要是为下划线和删除线 做服务
    const clipPath = DrawLayer._svgFactory.createElement("clipPath");
    defs.append(clipPath);
    const clipPathId = `clip_${pathId}`;
    clipPath.setAttribute("id", clipPathId);
    // 使用包含他的元素作为边界
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    const clipPathUse = DrawLayer._svgFactory.createElement("use");
    clipPath.append(clipPathUse);
    clipPathUse.setAttribute("href", `#${pathId}`);
    clipPathUse.classList.add("clip");

    const use1 = DrawLayer._svgFactory.createElement("use");
    root.append(use1);
    use1.setAttribute("href", `#${pathId}`);
    const use2 = use1.cloneNode();
    root.append(use2);
    use1.classList.add("mainOutline");
    use2.classList.add("secondaryOutline");

    this.#mapping.set(id, root);

    return { id, clipPathId: `url(#${clipPathId})` };
  }

  static #extractPathFromHighlightOutlines(polygons) {
    const buffer = [];
    for (const polygon of polygons) {
      let [prevX, prevY] = polygon;
      buffer.push(`M${prevX} ${prevY}`);
      for (let i = 2; i < polygon.length; i += 2) {
        const x = polygon[i];
        const y = polygon[i + 1];
        if (x === prevX) {
          buffer.push(`V${y}`);
          prevY = y;
        } else if (y === prevY) {
          buffer.push(`H${x}`);
          prevX = x;
        }
      }
      buffer.push("Z");
    }
    return buffer.join(" ");
  }

  // percent表示位置
  drawLine(boxes, percent, color = "#FF0000", rotation = 0) {
    // box index
    const ids = [];
    for (const bdx in boxes) {
      const box = boxes[bdx];
      const id = DrawLayer.#id++;
      const root = this.#createSVGCopy(box);
      root.classList.add("highlight");
      // 去除掉不需要的box
      root.removeAttribute("viewBox");

      // const defs = DrawLayer._svgFactory.createElement("defs");
      // root.append(defs);
      const line = DrawLayer._svgFactory.createElement("line");
      root.append(line);
      const lineId = `line_p${this.pageIndex}_${id}`;
      line.setAttribute("id", lineId);
      DrawLayer.drawLine(line, percent, rotation);
      // const use = DrawLayer._svgFactory.createElement("use");
      // root.append(use);
      // 默认为红色
      line.setAttribute("style", `color: ${color}`);
      // use.setAttribute("href", `#${lineId}`);
      ids.push(id);
      this.#mapping.set(id, root);
    }
    return ids;
  }

  finalizeDraw(id, properties) {
    this.#toUpdate.delete(id);
    this.updateProperties(id, properties);
  }

  // 修改stroke颜色、适配于下划线和删除线
  changeStrokeColor(id, color) {
    const root = this.#mapping.get(id);
    // 获取use标签子元素
    const use = root.lastChild;
    use.setAttribute("style", `color: ${color}`);
  }

  /**
   * @method updateProperties
   * @description 更新元素的属性
   * @param {Element | number} elementOrId 元素或元素ID
   * @param {Object} properties 属性对象
   * @returns {void}
   */
  updateProperties(elementOrId, properties) {
    if (!properties) {
      return;
    }
    // root: 根元素属性
    // bbox: 边界框属性
    // rootClass: 类名属性
    // path: 路径属性
    const { root, bbox, rootClass, path } = properties;
    const element =
      typeof elementOrId === "number"
        ? this.#mapping.get(elementOrId)
        : elementOrId;
    if (!element) {
      return;
    }
    if (root) {
      this.#updateProperties(element, root);
    }
    if (bbox) {
      if (Array.isArray(bbox)) {
        DrawLayer.#setBox(element, bbox);
      } else {
        DrawLayer.#setBoxCopy(element, bbox);
      }
    }
    // 更新类名
    if (rootClass) {
      const { classList } = element;
      for (const [className, value] of Object.entries(rootClass)) {
        classList.toggle(className, value);
      }
    }

    // 更新路径
    if (path) {
      const defs = element.firstChild;
      const pathElement = defs.firstChild;
      this.#updateProperties(pathElement, path);
    }
  }

  updateParent(id, layer) {
    if (layer === this) {
      return;
    }
    const root = this.#mapping.get(id);
    if (!root) {
      return;
    }
    layer.#parent.append(root);
    this.#mapping.delete(id);
    layer.#mapping.set(id, root);
  }

  addClass(id, className) {
    this.#mapping.get(id).classList.add(className);
  }

  removeClass(id, className) {
    this.#mapping.get(id).classList.remove(className);
  }

  remove(id) {
    this.#toUpdate.delete(id);
    if (this.#parent === null) {
      return;
    }
    this.#mapping.get(id).remove();
    this.#mapping.delete(id);
  }

  destroy() {
    this.#parent = null;
    for (const root of this.#mapping.values()) {
      root.remove();
    }
    this.#mapping.clear();
    this.#toUpdate.clear();
  }
}

export { DrawLayer };
