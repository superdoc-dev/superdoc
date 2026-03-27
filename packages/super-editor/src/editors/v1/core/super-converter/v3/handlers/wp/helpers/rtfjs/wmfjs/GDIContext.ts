/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/*

The MIT License (MIT)

Copyright (c) 2015 Thomas Bluemel

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

import { SVG } from '../util';
import { DIBitmap } from './Bitmap';
import { Blob } from './Blob';
import { Helper, WMFJSError } from './Helper';
import { Obj, PointS, Rect } from './Primitives';
import { CreateSimpleRegion, Region } from './Region';
import { Brush, ColorRef, Font, Palette, Pen } from './Style';

interface ISelectedStyle {
  brush?: Brush;
  pen?: Pen;
  font?: Font;
  palette?: Palette;
  region?: Region;

  [key: string]: Obj | undefined;
}

class GDIContextState {
  public _svggroup: SVGElement;
  public _svgclipChanged: boolean;
  public _svgtextbkfilter: SVGFilterElement;
  public mapmode: number;
  public stretchmode: number;
  public textalign: number;
  public bkmode: number;
  public textcolor: ColorRef;
  public bkcolor: ColorRef;
  public polyfillmode: number;
  public wx: number;
  public wy: number;
  public ww: number;
  public wh: number;
  public vx: number;
  public vy: number;
  public vw: number;
  public vh: number;
  public x: number;
  public y: number;
  public clip: Region;
  public ownclip: boolean;
  public selected: ISelectedStyle;

  constructor(copy: GDIContextState, defObjects?: ISelectedStyle) {
    if (copy != null) {
      this._svggroup = copy._svggroup;
      this._svgclipChanged = copy._svgclipChanged;
      this._svgtextbkfilter = copy._svgtextbkfilter;
      this.mapmode = copy.mapmode;
      this.stretchmode = copy.stretchmode;
      this.textalign = copy.textalign;
      this.bkmode = copy.bkmode;
      this.textcolor = copy.textcolor.clone();
      this.bkcolor = copy.bkcolor.clone();
      this.polyfillmode = copy.polyfillmode;
      this.wx = copy.wx;
      this.wy = copy.wy;
      this.ww = copy.ww;
      this.wh = copy.wh;
      this.vx = copy.vx;
      this.vy = copy.vy;
      this.vw = copy.vw;
      this.vh = copy.vh;
      this.x = copy.x;
      this.y = copy.y;

      this.clip = copy.clip;
      this.ownclip = false;

      this.selected = {};
      for (const type in copy.selected) {
        this.selected[type] = copy.selected[type];
      }
    } else {
      this._svggroup = null;
      this._svgclipChanged = false;
      this._svgtextbkfilter = null;
      this.mapmode = Helper.GDI.MapMode.MM_ANISOTROPIC;
      this.stretchmode = Helper.GDI.StretchMode.COLORONCOLOR;
      this.textalign = 0; // TA_LEFT | TA_TOP | TA_NOUPDATECP
      this.bkmode = Helper.GDI.MixMode.OPAQUE;
      this.textcolor = new ColorRef(null, 0, 0, 0);
      this.bkcolor = new ColorRef(null, 255, 255, 255);
      this.polyfillmode = Helper.GDI.PolyFillMode.ALTERNATE;
      this.wx = 0;
      this.wy = 0;
      this.ww = 0;
      this.wh = 0;
      this.vx = 0;
      this.vy = 0;
      this.vw = 0;
      this.vh = 0;
      this.x = 0;
      this.y = 0;

      this.clip = null;
      this.ownclip = false;

      this.selected = {};
      for (const type in defObjects) {
        const defObj = defObjects[type];
        this.selected[type] = defObj != null ? defObj.clone() : null;
      }
    }
  }
}

export class GDIContext {
  private _svg: SVG;
  private _svgdefs: SVGDefsElement;
  private _svgPatterns: { [key: string]: Brush };
  private _svgClipPaths: { [key: string]: Region };
  private defObjects: ISelectedStyle;
  private state: GDIContextState;
  private statestack: GDIContextState[];
  private objects: { [key: string]: Obj };

  constructor(svg: SVG) {
    this._svg = svg;
    this._svgdefs = null;
    this._svgPatterns = {};
    this._svgClipPaths = {};

    this.defObjects = {
      brush: new Brush(null, null),
      pen: new Pen(null, Helper.GDI.PenStyle.PS_SOLID, new PointS(null, 1, 1), new ColorRef(null, 0, 0, 0), 0, 0),
      font: new Font(null, null),
      palette: null,
      region: null,
    };

    this.state = new GDIContextState(null, this.defObjects);
    this.statestack = [this.state];
    this.objects = {};
  }

  public setMapMode(mode: number): void {
    Helper.log('[gdi] setMapMode: mode=' + mode);
    this.state.mapmode = mode;
    this.state._svggroup = null;
  }

  public setWindowOrg(x: number, y: number): void {
    Helper.log('[gdi] setWindowOrg: x=' + x + ' y=' + y);
    this.state.wx = x;
    this.state.wy = y;
    this.state._svggroup = null;
  }

  public setWindowExt(x: number, y: number): void {
    Helper.log('[gdi] setWindowExt: x=' + x + ' y=' + y);
    this.state.ww = x;
    this.state.wh = y;
    this.state._svggroup = null;
  }

  public offsetWindowOrg(offX: number, offY: number): void {
    Helper.log('[gdi] offsetWindowOrg: offX=' + offX + ' offY=' + offY);
    this.state.wx += offX;
    this.state.wy += offY;
    this.state._svggroup = null;
  }

  public setViewportOrg(x: number, y: number): void {
    Helper.log('[gdi] setViewportOrg: x=' + x + ' y=' + y);
    this.state.vx = x;
    this.state.vy = y;
    this.state._svggroup = null;
  }

  public setViewportExt(x: number, y: number): void {
    Helper.log('[gdi] setViewportExt: x=' + x + ' y=' + y);
    this.state.vw = x;
    this.state.vh = y;
    this.state._svggroup = null;
  }

  public offsetViewportOrg(offX: number, offY: number): void {
    Helper.log('[gdi] offsetViewportOrg: offX=' + offX + ' offY=' + offY);
    this.state.vx += offX;
    this.state.vy += offY;
    this.state._svggroup = null;
  }

  public saveDC(): void {
    Helper.log('[gdi] saveDC');
    const prevstate = this.state;
    this.state = new GDIContextState(this.state);
    this.statestack.push(prevstate);
    this.state._svggroup = null;
  }

  public restoreDC(saved: number): void {
    Helper.log('[gdi] restoreDC: saved=' + saved);
    if (this.statestack.length > 1) {
      if (saved === -1) {
        this.state = this.statestack.pop();
      } else if (saved < -1) {
        throw new WMFJSError('restoreDC: relative restore not implemented');
      } else if (saved > 1) {
        throw new WMFJSError('restoreDC: absolute restore not implemented');
      }
    } else {
      throw new WMFJSError('No saved contexts');
    }

    this.state._svggroup = null;
  }

  public escape(func: number, blob: Blob, offset: number, count: number): void {
    Helper.log('[gdi] escape: func=' + func + ' offset=' + offset + ' count=' + count);
  }

  public setStretchBltMode(stretchMode: number): void {
    Helper.log('[gdi] setStretchBltMode: stretchMode=' + stretchMode);
  }

  public stretchDib(
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    dstX: number,
    dstY: number,
    dstW: number,
    dstH: number,
    rasterOp: number,
    colorUsage: number,
    dib: DIBitmap,
  ): void {
    Helper.log(
      '[gdi] stretchDib: srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        ' srcW=' +
        srcW +
        ' srcH=' +
        srcH +
        ' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' dstW=' +
        dstW +
        ' dstH=' +
        dstH +
        ' rasterOp=0x' +
        rasterOp.toString(16),
    );
    srcX = this._todevX(srcX);
    srcY = this._todevY(srcY);
    srcW = this._todevW(srcW);
    srcH = this._todevH(srcH);
    dstX = this._todevX(dstX);
    dstY = this._todevY(dstY);
    dstW = this._todevW(dstW);
    dstH = this._todevH(dstH);
    Helper.log(
      '[gdi] stretchDib: TRANSLATED: srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        ' srcW=' +
        srcW +
        ' srcH=' +
        srcH +
        ' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' dstW=' +
        dstW +
        ' dstH=' +
        dstH +
        ' rasterOp=0x' +
        rasterOp.toString(16) +
        ' colorUsage=0x' +
        colorUsage.toString(16),
    );
    this._pushGroup();
    this._svg.image(this.state._svggroup, dstX, dstY, dstW, dstH, dib.base64ref());
  }

  public dibBits(
    srcX: number,
    srcY: number,
    dstX: number,
    dstY: number,
    width: number,
    height: number,
    rasterOp: number,
    dib: DIBitmap,
  ): void {
    Helper.log(
      '[gdi] stretchDibBits: srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        ' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' width=' +
        width +
        ' height=' +
        height +
        ' rasterOp=0x' +
        rasterOp.toString(16),
    );
    srcX = this._todevX(srcX);
    srcY = this._todevY(srcY);
    dstX = this._todevX(dstX);
    dstY = this._todevY(dstY);
    width = this._todevW(width);
    height = this._todevH(height);
    Helper.log(
      '[gdi] dibBits: TRANSLATED:' +
        ' srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        +' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' width=' +
        width +
        ' height=' +
        height +
        ' rasterOp=0x' +
        rasterOp.toString(16),
    );
    this._pushGroup();
    this._svg.image(this.state._svggroup, dstX, dstY, width, height, dib.base64ref());
  }

  public stretchDibBits(
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    dstX: number,
    dstY: number,
    dstW: number,
    dstH: number,
    rasterOp: number,
    dib: DIBitmap,
  ): void {
    Helper.log(
      '[gdi] stretchDibBits: srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        ' srcW=' +
        srcW +
        ' srcH=' +
        srcH +
        ' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' dstW=' +
        dstW +
        ' dstH=' +
        dstH +
        ' rasterOp=0x' +
        rasterOp.toString(16),
    );
    srcX = this._todevX(srcX);
    srcY = this._todevY(srcY);
    srcW = this._todevW(srcW);
    srcH = this._todevH(srcH);
    dstX = this._todevX(dstX);
    dstY = this._todevY(dstY);
    dstW = this._todevW(dstW);
    dstH = this._todevH(dstH);
    Helper.log(
      '[gdi] stretchDibBits: TRANSLATED:' +
        ' srcX=' +
        srcX +
        ' srcY=' +
        srcY +
        ' srcW=' +
        srcW +
        ' srcH=' +
        srcH +
        ' dstX=' +
        dstX +
        ' dstY=' +
        dstY +
        ' dstW=' +
        dstW +
        ' dstH=' +
        dstH +
        ' rasterOp=0x' +
        rasterOp.toString(16),
    );
    this._pushGroup();
    this._svg.image(this.state._svggroup, dstX, dstY, dstW, dstH, dib.base64ref());
  }

  public rectangle(rect: Rect, rw: number, rh: number): void {
    Helper.log(
      '[gdi] rectangle: rect=' +
        rect.toString() +
        ' with pen ' +
        this.state.selected.pen.toString() +
        ' and brush ' +
        this.state.selected.brush.toString(),
    );
    const bottom = this._todevY(rect.bottom);
    const right = this._todevX(rect.right);
    const top = this._todevY(rect.top);
    const left = this._todevX(rect.left);
    rw = this._todevH(rw);
    rh = this._todevH(rh);
    Helper.log(
      '[gdi] rectangle: TRANSLATED: bottom=' +
        bottom +
        ' right=' +
        right +
        ' top=' +
        top +
        ' left=' +
        left +
        ' rh=' +
        rh +
        ' rw=' +
        rw,
    );
    this._pushGroup();

    const opts = this._applyOpts(null, true, true, false);
    this._svg.rect(this.state._svggroup, left, top, right - left, bottom - top, rw / 2, rh / 2, opts);
  }

  public textOut(x: number, y: number, text: string): void {
    Helper.log(
      '[gdi] textOut: x=' + x + ' y=' + y + ' text=' + text + ' with font ' + this.state.selected.font.toString(),
    );
    x = this._todevX(x);
    y = this._todevY(y);
    Helper.log('[gdi] textOut: TRANSLATED: x=' + x + ' y=' + y);
    this._pushGroup();

    const opts = this._applyOpts(null, false, false, true);
    if (this.state.selected.font.escapement !== 0) {
      opts.transform = 'rotate(' + [-this.state.selected.font.escapement / 10, x, y] + ')';
      opts.style = 'dominant-baseline: middle; text-anchor: start;';
    }
    if (this.state.bkmode === Helper.GDI.MixMode.OPAQUE) {
      if (this.state._svgtextbkfilter == null) {
        const filterId = Helper._makeUniqueId('f');
        const filter = this._svg.filter(this._getSvgDef(), filterId, 0, 0, 1, 1);
        this._svg.filters.flood(filter, null, '#' + this.state.bkcolor.toHex(), 1.0);
        this._svg.filters.composite(filter, null, null, 'SourceGraphic');
        this.state._svgtextbkfilter = filter;
      }

      opts.filter = 'url(#' + this.state._svgtextbkfilter.id + ')';
    }
    this._svg.text(this.state._svggroup, x, y, text, opts);
  }

  public extTextOut(x: number, y: number, text: string, fwOpts: number, rect: Rect, dx: number[]): void {
    Helper.log(
      '[gdi] extTextOut: x=' + x + ' y=' + y + ' text=' + text + ' with font ' + this.state.selected.font.toString(),
    );
    x = this._todevX(x);
    y = this._todevY(y);
    Helper.log('[gdi] extTextOut: TRANSLATED: x=' + x + ' y=' + y);
    this._pushGroup();

    const opts = this._applyOpts(null, false, false, true);
    if (this.state.selected.font.escapement !== 0) {
      opts.transform = 'rotate(' + [-this.state.selected.font.escapement / 10, x, y] + ')';
      opts.style = 'dominant-baseline: middle; text-anchor: start;';
    }
    if (this.state.bkmode === Helper.GDI.MixMode.OPAQUE) {
      if (this.state._svgtextbkfilter == null) {
        const filterId = Helper._makeUniqueId('f');
        const filter = this._svg.filter(this._getSvgDef(), filterId, 0, 0, 1, 1);
        this._svg.filters.flood(filter, null, '#' + this.state.bkcolor.toHex(), 1.0);
        this._svg.filters.composite(filter, null, null, 'SourceGraphic');
        this.state._svgtextbkfilter = filter;
      }

      opts.filter = 'url(#' + this.state._svgtextbkfilter.id + ')';
    }
    this._svg.text(this.state._svggroup, x, y, text, opts);
  }

  public lineTo(x: number, y: number): void {
    Helper.log('[gdi] lineTo: x=' + x + ' y=' + y + ' with pen ' + this.state.selected.pen.toString());
    const toX = this._todevX(x);
    const toY = this._todevY(y);
    const fromX = this._todevX(this.state.x);
    const fromY = this._todevY(this.state.y);

    // Update position
    this.state.x = x;
    this.state.y = y;

    Helper.log('[gdi] lineTo: TRANSLATED: toX=' + toX + ' toY=' + toY + ' fromX=' + fromX + ' fromY=' + fromY);
    this._pushGroup();

    const opts = this._applyOpts(null, true, false, false);
    this._svg.line(this.state._svggroup, fromX, fromY, toX, toY, opts);
  }

  public moveTo(x: number, y: number): void {
    Helper.log('[gdi] moveTo: x=' + x + ' y=' + y);
    this.state.x = x;
    this.state.y = y;
  }

  public polygon(points: PointS[], first: boolean): void {
    Helper.log(
      '[gdi] polygon: points=' +
        points +
        ' with pen ' +
        this.state.selected.pen.toString() +
        ' and brush ' +
        this.state.selected.brush.toString(),
    );
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      pts.push([this._todevX(point.x), this._todevY(point.y)]);
    }
    Helper.log('[gdi] polygon: TRANSLATED: pts=' + pts);
    if (first) {
      this._pushGroup();
    }
    const opts = {
      'fill-rule': this.state.polyfillmode === Helper.GDI.PolyFillMode.ALTERNATE ? 'evenodd' : 'nonzero',
    };
    this._applyOpts(opts, true, true, false);
    this._svg.polygon(this.state._svggroup, pts, opts);
  }

  public polyPolygon(polygons: PointS[][]): void {
    Helper.log(
      '[gdi] polyPolygon: polygons.length=' +
        polygons.length +
        ' with pen ' +
        this.state.selected.pen.toString() +
        ' and brush ' +
        this.state.selected.brush.toString(),
    );

    const cnt = polygons.length;
    for (let i = 0; i < cnt; i++) {
      this.polygon(polygons[i], i === 0);
    }
  }

  public polyline(points: PointS[]): void {
    Helper.log('[gdi] polyline: points=' + points + ' with pen ' + this.state.selected.pen.toString());
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      pts.push([this._todevX(point.x), this._todevY(point.y)]);
    }
    Helper.log('[gdi] polyline: TRANSLATED: pts=' + pts);
    this._pushGroup();
    const opts = this._applyOpts({ fill: 'none' }, true, false, false);
    this._svg.polyline(this.state._svggroup, pts, opts);
  }

  public ellipse(rect: Rect): void {
    Helper.log(
      '[gdi] ellipse: rect=' +
        rect.toString() +
        ' with pen ' +
        this.state.selected.pen.toString() +
        ' and brush ' +
        this.state.selected.brush.toString(),
    );
    const bottom = this._todevY(rect.bottom);
    const right = this._todevX(rect.right);
    const top = this._todevY(rect.top);
    const left = this._todevX(rect.left);
    Helper.log('[gdi] ellipse: TRANSLATED: bottom=' + bottom + ' right=' + right + ' top=' + top + ' left=' + left);
    this._pushGroup();
    const width2 = (right - left) / 2;
    const height2 = (bottom - top) / 2;
    const opts = this._applyOpts(null, true, true, false);
    this._svg.ellipse(this.state._svggroup, left + width2, top + height2, width2, height2, opts);
  }

  public excludeClipRect(rect: Rect): void {
    Helper.log('[gdi] excludeClipRect: rect=' + rect.toString());
    this._getClipRgn().subtract(rect);
  }

  public intersectClipRect(rect: Rect): void {
    Helper.log('[gdi] intersectClipRect: rect=' + rect.toString());
    this._getClipRgn().intersect(rect);
  }

  public offsetClipRgn(offX: number, offY: number): void {
    Helper.log('[gdi] offsetClipRgn: offX=' + offX + ' offY=' + offY);
    this._getClipRgn().offset(offX, offY);
  }

  public setTextAlign(textAlignmentMode: number): void {
    Helper.log('[gdi] setTextAlign: textAlignmentMode=0x' + textAlignmentMode.toString(16));
    this.state.textalign = textAlignmentMode;
  }

  public setBkMode(bkMode: number): void {
    Helper.log('[gdi] setBkMode: bkMode=0x' + bkMode.toString(16));
    this.state.bkmode = bkMode;
  }

  public setTextColor(textColor: ColorRef): void {
    Helper.log('[gdi] setTextColor: textColor=' + textColor.toString());
    this.state.textcolor = textColor;
  }

  public setBkColor(bkColor: ColorRef): void {
    Helper.log('[gdi] setBkColor: bkColor=' + bkColor.toString());
    this.state.bkcolor = bkColor;
    this.state._svgtextbkfilter = null;
  }

  public setPolyFillMode(polyFillMode: number): void {
    Helper.log('[gdi] setPolyFillMode: polyFillMode=' + polyFillMode);
    this.state.polyfillmode = polyFillMode;
  }

  public createBrush(brush: Brush): void {
    const idx = this._storeObject(brush);
    Helper.log('[gdi] createBrush: brush=' + brush.toString() + ' with handle ' + idx);
  }

  public createFont(font: Font): void {
    const idx = this._storeObject(font);
    Helper.log('[gdi] createFont: font=' + font.toString() + ' with handle ' + idx);
  }

  public createPen(pen: Pen): void {
    const idx = this._storeObject(pen);
    Helper.log('[gdi] createPen: pen=' + pen.toString() + ' width handle ' + idx);
  }

  public createPalette(palette: Palette): void {
    const idx = this._storeObject(palette);
    Helper.log('[gdi] createPalette: palette=' + palette.toString() + ' width handle ' + idx);
  }

  public createRegion(region: Region): void {
    const idx = this._storeObject(region);
    Helper.log('[gdi] createRegion: region=' + region.toString() + ' width handle ' + idx);
  }

  public createPatternBrush(patternBrush: Brush): void {
    const idx = this._storeObject(patternBrush);
    Helper.log('[gdi] createRegion: region=' + patternBrush.toString() + ' width handle ' + idx);
  }

  public selectObject(objIdx: number, checkType: string): void {
    const obj = this._getObject(objIdx);
    if (obj != null && (checkType == null || obj.type === checkType)) {
      this._selectObject(obj);
      Helper.log(
        '[gdi] selectObject: objIdx=' +
          objIdx +
          (obj ? ' selected ' + obj.type + ': ' + obj.toString() : '[invalid index]'),
      );
    } else {
      Helper.log(
        '[gdi] selectObject: objIdx=' + objIdx + (obj ? ' invalid object type: ' + obj.type : '[invalid index]'),
      );
    }
  }

  public deleteObject(objIdx: number): void {
    const ret = this._deleteObject(objIdx);
    Helper.log('[gdi] deleteObject: objIdx=' + objIdx + (ret ? ' deleted object' : '[invalid index]'));
  }

  private _pushGroup() {
    if (this.state._svggroup == null || this.state._svgclipChanged) {
      this.state._svgclipChanged = false;
      this.state._svgtextbkfilter = null;

      const settings: any = {
        viewBox: [this.state.vx, this.state.vy, this.state.vw, this.state.vh].join(' '),
        preserveAspectRatio: 'none',
      };
      if (this.state.clip != null) {
        Helper.log(
          '[gdi] new svg x=' +
            this.state.vx +
            ' y=' +
            this.state.vy +
            ' width=' +
            this.state.vw +
            ' height=' +
            this.state.vh +
            ' with clipping',
        );
        settings['clip-path'] = 'url(#' + this._getSvgClipPathForRegion(this.state.clip) + ')';
      } else {
        Helper.log(
          '[gdi] new svg x=' +
            this.state.vx +
            ' y=' +
            this.state.vy +
            ' width=' +
            this.state.vw +
            ' height=' +
            this.state.vh +
            ' without clipping',
        );
      }
      this.state._svggroup = this._svg.svg(
        this.state._svggroup,
        this.state.vx,
        this.state.vy,
        this.state.vw,
        this.state.vh,
        settings,
      );
    }
  }

  private _storeObject(obj: Obj) {
    let i = 0;
    while (this.objects[i.toString()] != null && i <= 65535) {
      i++;
    }
    if (i > 65535) {
      Helper.log('[gdi] Too many objects!');
      return -1;
    }

    this.objects[i.toString()] = obj;
    return i;
  }

  private _getObject(objIdx: number) {
    const obj = this.objects[objIdx.toString()];
    if (obj == null) {
      Helper.log('[gdi] No object with handle ' + objIdx);
    }
    return obj;
  }

  private _getSvgDef() {
    if (this._svgdefs == null) {
      this._svgdefs = this._svg.defs();
    }
    return this._svgdefs;
  }

  private _getSvgClipPathForRegion(region: Region) {
    for (const existingId in this._svgClipPaths) {
      const rgn = this._svgClipPaths[existingId];
      if (rgn === region) {
        return existingId;
      }
    }

    const id = Helper._makeUniqueId('c');
    const sclip = this._svg.clipPath(this._getSvgDef(), id, 'userSpaceOnUse');
    switch (region.complexity) {
      case 1:
        this._svg.rect(
          sclip,
          this._todevX(region.bounds.left),
          this._todevY(region.bounds.top),
          this._todevW(region.bounds.right - region.bounds.left),
          this._todevH(region.bounds.bottom - region.bounds.top),
          { fill: 'black', 'stroke-width': 0 },
        );
        break;
      case 2:
        for (let i = 0; i < region.scans.length; i++) {
          const scan = region.scans[i];
          for (let j = 0; j < scan.scanlines.length; j++) {
            const scanline = scan.scanlines[j];
            this._svg.rect(
              sclip,
              this._todevX(scanline.left),
              this._todevY(scan.top),
              this._todevW(scanline.right - scanline.left),
              this._todevH(scan.bottom - scan.top),
              { fill: 'black', 'stroke-width': 0 },
            );
          }
        }
        break;
    }
    this._svgClipPaths[id] = region;
    return id;
  }

  private _getSvgPatternForBrush(brush: Brush) {
    for (const existingId in this._svgPatterns) {
      const pat = this._svgPatterns[existingId];
      if (pat === brush) {
        return existingId;
      }
    }

    let width;
    let height;
    let img;
    switch (brush.style) {
      case Helper.GDI.BrushStyle.BS_PATTERN:
        width = brush.pattern.getWidth();
        height = brush.pattern.getHeight();
        break;
      case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
        width = brush.dibpatternpt.getWidth();
        height = brush.dibpatternpt.getHeight();
        img = brush.dibpatternpt.base64ref();
        break;
      default:
        throw new WMFJSError('Invalid brush style');
    }

    const id = Helper._makeUniqueId('p');
    const spat = this._svg.pattern(this._getSvgDef(), id, 0, 0, width, height, { patternUnits: 'userSpaceOnUse' });
    this._svg.image(spat, 0, 0, width, height, img);
    this._svgPatterns[id] = brush;
    return id;
  }

  private _selectObject(obj: Obj) {
    this.state.selected[obj.type] = obj;
    if (obj.type === 'region') {
      this.state._svgclipChanged = true;
    }
  }

  private _deleteObject(objIdx: number) {
    const obj = this.objects[objIdx.toString()];
    if (obj != null) {
      for (let i = 0; i < this.statestack.length; i++) {
        const state = this.statestack[i];
        if (state.selected[obj.type] === obj) {
          state.selected[obj.type] = this.defObjects[obj.type].clone();
        }
      }
      delete this.objects[objIdx.toString()];
      return true;
    }

    Helper.log('[gdi] Cannot delete object with invalid handle ' + objIdx);
    return false;
  }

  private _getClipRgn() {
    if (this.state.clip != null) {
      if (!this.state.ownclip) {
        this.state.clip = this.state.clip.clone();
      }
    } else {
      if (this.state.selected.region != null) {
        this.state.clip = this.state.selected.region.clone();
      } else {
        this.state.clip = CreateSimpleRegion(
          this.state.wx,
          this.state.wy,
          this.state.wx + this.state.ww,
          this.state.wy + this.state.wh,
        );
      }
    }
    this.state.ownclip = true;
    return this.state.clip;
  }

  private _todevX(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor((val - this.state.wx) * (this.state.vw / this.state.ww)) + this.state.vx;
  }

  private _todevY(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor((val - this.state.wy) * (this.state.vh / this.state.wh)) + this.state.vy;
  }

  private _todevW(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor(val * (this.state.vw / this.state.ww)) + this.state.vx;
  }

  private _todevH(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor(val * (this.state.vh / this.state.wh)) + this.state.vy;
  }

  private _tologicalX(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor((val - this.state.vx) / (this.state.vw / this.state.ww)) + this.state.wx;
  }

  private _tologicalY(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor((val - this.state.vy) / (this.state.vh / this.state.wh)) + this.state.wy;
  }

  private _tologicalW(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor(val / (this.state.vw / this.state.ww)) + this.state.wx;
  }

  private _tologicalH(val: number) {
    // http://wvware.sourceforge.net/caolan/mapmode.html
    // logical -> device
    return Math.floor(val / (this.state.vh / this.state.wh)) + this.state.wy;
  }

  private _applyOpts(opts: any, usePen: boolean, useBrush: boolean, useFont: boolean) {
    if (opts == null) {
      opts = {};
    }
    if (usePen) {
      const pen = this.state.selected.pen;
      if (pen.style !== Helper.GDI.PenStyle.PS_NULL) {
        opts.stroke = '#' + pen.color.toHex(); // TODO: pen style
        opts['stroke-width'] = this._todevW(pen.width.x); // TODO: is .y ever used?

        let dotWidth;
        if ((pen.linecap & Helper.GDI.PenStyle.PS_ENDCAP_SQUARE) !== 0) {
          opts['stroke-linecap'] = 'square';
          dotWidth = 1;
        } else if ((pen.linecap & Helper.GDI.PenStyle.PS_ENDCAP_FLAT) !== 0) {
          opts['stroke-linecap'] = 'butt';
          dotWidth = opts['stroke-width'];
        } else {
          opts['stroke-linecap'] = 'round';
          dotWidth = 1;
        }

        if ((pen.join & Helper.GDI.PenStyle.PS_JOIN_BEVEL) !== 0) {
          opts['stroke-linejoin'] = 'bevel';
        } else if ((pen.join & Helper.GDI.PenStyle.PS_JOIN_MITER) !== 0) {
          opts['stroke-linejoin'] = 'miter';
        } else {
          opts['stroke-linejoin'] = 'round';
        }

        const dashWidth = opts['stroke-width'] * 4;
        const dotSpacing = opts['stroke-width'] * 2;
        switch (pen.style) {
          case Helper.GDI.PenStyle.PS_DASH:
            opts['stroke-dasharray'] = [dashWidth, dotSpacing].toString();
            break;
          case Helper.GDI.PenStyle.PS_DOT:
            opts['stroke-dasharray'] = [dotWidth, dotSpacing].toString();
            break;
          case Helper.GDI.PenStyle.PS_DASHDOT:
            opts['stroke-dasharray'] = [dashWidth, dotSpacing, dotWidth, dotSpacing].toString();
            break;
          case Helper.GDI.PenStyle.PS_DASHDOTDOT:
            opts['stroke-dasharray'] = [dashWidth, dotSpacing, dotWidth, dotSpacing, dotWidth, dotSpacing].toString();
            break;
        }
      }
    }
    if (useBrush) {
      const brush = this.state.selected.brush;
      switch (brush.style) {
        case Helper.GDI.BrushStyle.BS_SOLID:
          opts.fill = '#' + brush.color.toHex();
          break;
        case Helper.GDI.BrushStyle.BS_PATTERN:
        case Helper.GDI.BrushStyle.BS_DIBPATTERNPT:
          opts.fill = 'url(#' + this._getSvgPatternForBrush(brush) + ')';
          break;
        case Helper.GDI.BrushStyle.BS_NULL:
          opts.fill = 'none';
          break;
        default:
          Helper.log('[gdi] unsupported brush style: ' + brush.style);
          opts.fill = 'none';
          break;
      }
    }
    if (useFont) {
      const font = this.state.selected.font;
      opts['font-family'] = font.facename;
      opts['font-size'] = this._todevH(Math.abs(font.height));
      opts.fill = '#' + this.state.textcolor.toHex();
    }
    return opts;
  }
}
