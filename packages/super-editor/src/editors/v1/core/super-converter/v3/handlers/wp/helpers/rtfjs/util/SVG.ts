/* eslint-disable @typescript-eslint/no-explicit-any */
/*

The MIT License (MIT)

Copyright (c) 2020 Ynse Hoornenborg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

export class SVGFilters {
  public flood(filter: SVGFilterElement, resultId: string, color: string, opacity: number, _settings?: unknown): void {
    const floodElement = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
    if (resultId) {
      floodElement.setAttribute('id', resultId);
    }
    floodElement.setAttribute('flood-color', color);
    floodElement.setAttribute('flood-opacity', opacity.toString());
    filter.appendChild(floodElement);
  }

  public composite(
    filter: SVGFilterElement,
    resultId: string,
    in1: string,
    in2: string,
    _k1?: number,
    _k2?: number,
    _k3?: number,
    _k4?: number,
    _settings?: unknown,
  ): void {
    const compositeElement = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
    if (resultId) {
      compositeElement.setAttribute('id', resultId);
    }
    compositeElement.setAttribute('in', in1);
    compositeElement.setAttribute('in2', in2);
    filter.appendChild(compositeElement);
  }
}

export class SVGPathBuilder {
  private _path = '';

  public move(x: number, y: number): void {
    this._path += ` M ${x} ${y}`;
  }

  public path(): string {
    return this._path.substr(1);
  }

  public line(pts: number[][]): void {
    pts.forEach((point) => {
      this._path += ` L ${point[0]} ${point[1]}`;
    });
  }

  public curveC(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this._path += ` C ${x1} ${y1}, ${x2} ${y2}, ${x} ${y}`;
  }

  public close(): void {
    this._path += ` Z`;
  }
}

export class SVG {
  public filters = new SVGFilters();
  private _svg: SVGElement;
  private _defs: SVGDefsElement | undefined = undefined;

  constructor(svg: SVGElement) {
    this._svg = svg;
  }

  public svg(parent: Element, x: number, y: number, width: number, height: number, settings?: any): SVGElement {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('x', x.toString());
    svgElement.setAttribute('y', y.toString());
    svgElement.setAttribute('width', width.toString());
    svgElement.setAttribute('height', height.toString());
    this._appendSettings(settings, svgElement);

    if (parent != null) {
      parent.appendChild(svgElement);
    } else {
      this._svg.appendChild(svgElement);
    }

    return svgElement;
  }

  public image(
    parent: Element,
    x: number,
    y: number,
    width: number,
    height: number,
    url: string,
    settings?: any,
  ): SVGImageElement {
    const imageElement = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    imageElement.setAttribute('x', x.toString());
    imageElement.setAttribute('y', y.toString());
    imageElement.setAttribute('width', width.toString());
    imageElement.setAttribute('height', height.toString());
    imageElement.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    this._appendSettings(settings, imageElement);
    parent.appendChild(imageElement);
    return imageElement;
  }

  public rect(
    parent: Element,
    x: number,
    y: number,
    width: number,
    height: number,
    rx?: number,
    ry?: number,
    settings?: any,
  ): SVGRectElement;
  public rect(parent: Element, x: number, y: number, width: number, height: number, settings?: any): SVGRectElement;
  public rect(
    parent: Element,
    x: number,
    y: number,
    width: number,
    height: number,
    rx?: number | any,
    ry?: number,
    settings?: any,
  ): SVGRectElement {
    const rectElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectElement.setAttribute('x', x.toString());
    rectElement.setAttribute('y', y.toString());
    rectElement.setAttribute('width', width.toString());
    rectElement.setAttribute('height', height.toString());
    if (rx !== undefined) {
      if (rx instanceof Number) {
        rectElement.setAttribute('rx', rx.toString());
      } else if (rx instanceof Object) {
        this._appendSettings(rx, rectElement);
      }
    }
    if (ry !== undefined) {
      rectElement.setAttribute('ry', ry.toString());
    }
    this._appendSettings(settings, rectElement);
    parent.appendChild(rectElement);
    return rectElement;
  }

  public line(parent: Element, x1: number, y1: number, x2: number, y2: number, settings?: any): SVGLineElement {
    const lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineElement.setAttribute('x1', x1.toString());
    lineElement.setAttribute('y1', y1.toString());
    lineElement.setAttribute('x2', x2.toString());
    lineElement.setAttribute('y2', y2.toString());
    this._appendSettings(settings, lineElement);
    parent.appendChild(lineElement);
    return lineElement;
  }

  public polygon(parent: Element, points: number[][], settings?: any): SVGPolygonElement {
    const polygonElement = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygonElement.setAttribute('points', points.map((point) => point.join(',')).join(' '));
    this._appendSettings(settings, polygonElement);
    parent.appendChild(polygonElement);
    return polygonElement;
  }

  public polyline(parent: Element, points: number[][], settings?: any): SVGPolylineElement {
    const polylineElement = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polylineElement.setAttribute('points', points.map((point) => point.join(',')).join(' '));
    this._appendSettings(settings, polylineElement);
    parent.appendChild(polylineElement);
    return polylineElement;
  }

  public ellipse(parent: Element, cx: number, cy: number, rx: number, ry: number, settings?: any): SVGEllipseElement {
    const ellipseElement = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipseElement.setAttribute('cx', cx.toString());
    ellipseElement.setAttribute('cy', cy.toString());
    ellipseElement.setAttribute('rx', rx.toString());
    ellipseElement.setAttribute('ry', ry.toString());
    this._appendSettings(settings, ellipseElement);
    parent.appendChild(ellipseElement);
    return ellipseElement;
  }

  public path(parent: SVGElement, builder: SVGPathBuilder, settings?: any): SVGPathElement {
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', builder.path());
    this._appendSettings(settings, pathElement);
    parent.appendChild(pathElement);
    return pathElement;
  }

  public text(parent: Element, x: number, y: number, value: string, settings?: any): SVGTextElement {
    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.setAttribute('x', x.toString());
    textElement.setAttribute('y', y.toString());
    this._appendSettings(settings, textElement);
    const textNode = document.createTextNode(value);
    textElement.appendChild(textNode);
    parent.appendChild(textElement);
    return textElement;
  }

  public filter(
    parent: Element,
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    settings?: any,
  ): SVGFilterElement {
    const filterElement = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filterElement.setAttribute('x', x.toString());
    filterElement.setAttribute('y', y.toString());
    filterElement.setAttribute('width', width.toString());
    filterElement.setAttribute('height', height.toString());
    this._appendSettings(settings, filterElement);
    parent.appendChild(filterElement);
    return filterElement;
  }

  public pattern(
    parent: Element,
    resultId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    settings?: any,
  ): SVGPatternElement {
    const patternElement = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    if (resultId) {
      patternElement.setAttribute('id', resultId);
    }
    patternElement.setAttribute('x', x.toString());
    patternElement.setAttribute('y', y.toString());
    patternElement.setAttribute('width', width.toString());
    patternElement.setAttribute('height', height.toString());
    this._appendSettings(settings, patternElement);
    parent.appendChild(patternElement);
    return patternElement;
  }

  public defs(): SVGDefsElement {
    if (this._defs === undefined) {
      const defsElement = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      this._svg.appendChild(defsElement);
      this._defs = defsElement;
    }
    return this._defs;
  }

  public clipPath(parent: Element, resultId: string, units?: string, settings?: any): SVGClipPathElement {
    const clipElement = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    if (resultId) {
      clipElement.setAttribute('id', resultId);
    }
    if (units === undefined) {
      units = 'userSpaceOnUse';
    }
    clipElement.setAttribute('clipPathUnits', units);
    this._appendSettings(settings, clipElement);
    parent.appendChild(clipElement);
    return clipElement;
  }

  public createPath(): SVGPathBuilder {
    return new SVGPathBuilder();
  }

  private _appendSettings(settings: any | undefined, element: Element): void {
    if (settings !== undefined) {
      Object.keys(settings).forEach((key) => {
        element.setAttribute(key, settings[key]);
      });
    }
  }
}
