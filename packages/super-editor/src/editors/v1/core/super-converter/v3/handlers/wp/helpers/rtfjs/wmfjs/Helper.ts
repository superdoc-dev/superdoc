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

export class WMFJSError extends Error {
  constructor(message: string) {
    super(message); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
  }
}

let isLoggingEnabled = true;

export function loggingEnabled(enabled: boolean): void {
  isLoggingEnabled = enabled;
}

export class Helper {
  public static GDI = {
    METAHEADER_SIZE: 18,
    BITMAPINFOHEADER_SIZE: 40,
    BITMAPCOREHEADER_SIZE: 12,
    MetafileType: {
      MEMORYMETAFILE: 1,
      DISKMETAFILE: 2,
    },
    MetafileVersion: {
      METAVERSION100: 0x100,
      METAVERSION300: 0x300,
    },
    RecordType: {
      META_EOF: 0x0000,
      META_REALIZEPALETTE: 0x0035,
      META_SETPALENTRIES: 0x0037,
      META_SETBKMODE: 0x0102,
      META_SETMAPMODE: 0x0103,
      META_SETROP2: 0x0104,
      META_SETRELABS: 0x0105,
      META_SETPOLYFILLMODE: 0x0106,
      META_SETSTRETCHBLTMODE: 0x0107,
      META_SETTEXTCHAREXTRA: 0x0108,
      META_RESTOREDC: 0x0127,
      META_RESIZEPALETTE: 0x0139,
      META_DIBCREATEPATTERNBRUSH: 0x0142,
      META_SETLAYOUT: 0x0149,
      META_SETBKCOLOR: 0x0201,
      META_SETTEXTCOLOR: 0x0209,
      META_OFFSETVIEWPORTORG: 0x0211,
      META_LINETO: 0x0213,
      META_MOVETO: 0x0214,
      META_OFFSETCLIPRGN: 0x0220,
      META_FILLREGION: 0x0228,
      META_SETMAPPERFLAGS: 0x0231,
      META_SELECTPALETTE: 0x0234,
      META_POLYGON: 0x0324,
      META_POLYLINE: 0x0325,
      META_SETTEXTJUSTIFICATION: 0x020a,
      META_SETWINDOWORG: 0x020b,
      META_SETWINDOWEXT: 0x020c,
      META_SETVIEWPORTORG: 0x020d,
      META_SETVIEWPORTEXT: 0x020e,
      META_OFFSETWINDOWORG: 0x020f,
      META_SCALEWINDOWEXT: 0x0410,
      META_SCALEVIEWPORTEXT: 0x0412,
      META_EXCLUDECLIPRECT: 0x0415,
      META_INTERSECTCLIPRECT: 0x0416,
      META_ELLIPSE: 0x0418,
      META_FLOODFILL: 0x0419,
      META_FRAMEREGION: 0x0429,
      META_ANIMATEPALETTE: 0x0436,
      META_TEXTOUT: 0x0521,
      META_POLYPOLYGON: 0x0538,
      META_EXTFLOODFILL: 0x0548,
      META_RECTANGLE: 0x041b,
      META_SETPIXEL: 0x041f,
      META_ROUNDRECT: 0x061c,
      META_PATBLT: 0x061d,
      META_SAVEDC: 0x001e,
      META_PIE: 0x081a,
      META_STRETCHBLT: 0x0b23,
      META_ESCAPE: 0x0626,
      META_INVERTREGION: 0x012a,
      META_PAINTREGION: 0x012b,
      META_SELECTCLIPREGION: 0x012c,
      META_SELECTOBJECT: 0x012d,
      META_SETTEXTALIGN: 0x012e,
      META_ARC: 0x0817,
      META_CHORD: 0x0830,
      META_BITBLT: 0x0922,
      META_EXTTEXTOUT: 0x0a32,
      META_SETDIBTODEV: 0x0d33,
      META_DIBBITBLT: 0x0940,
      META_DIBSTRETCHBLT: 0x0b41,
      META_STRETCHDIB: 0x0f43,
      META_DELETEOBJECT: 0x01f0,
      META_CREATEPALETTE: 0x00f7,
      META_CREATEPATTERNBRUSH: 0x01f9,
      META_CREATEPENINDIRECT: 0x02fa,
      META_CREATEFONTINDIRECT: 0x02fb,
      META_CREATEBRUSHINDIRECT: 0x02fc,
      META_CREATEREGION: 0x06ff,
    },
    MetafileEscapes: {
      NEWFRAME: 0x0001,
      ABORTDOC: 0x0002,
      NEXTBAND: 0x0003,
      SETCOLORTABLE: 0x0004,
      GETCOLORTABLE: 0x0005,
      FLUSHOUT: 0x0006,
      DRAFTMODE: 0x0007,
      QUERYESCSUPPORT: 0x0008,
      SETABORTPROC: 0x0009,
      STARTDOC: 0x000a,
      ENDDOC: 0x000b,
      GETPHYSPAGESIZE: 0x000c,
      GETPRINTINGOFFSET: 0x000d,
      GETSCALINGFACTOR: 0x000e,
      META_ESCAPE_ENHANCED_METAFILE: 0x000f,
      SETPENWIDTH: 0x0010,
      SETCOPYCOUNT: 0x0011,
      SETPAPERSOURCE: 0x0012,
      PASSTHROUGH: 0x0013,
      GETTECHNOLOGY: 0x0014,
      SETLINECAP: 0x0015,
      SETLINEJOIN: 0x0016,
      SETMITERLIMIT: 0x0017,
      BANDINFO: 0x0018,
      DRAWPATTERNRECT: 0x0019,
      GETVECTORPENSIZE: 0x001a,
      GETVECTORBRUSHSIZE: 0x001b,
      ENABLEDUPLEX: 0x001c,
      GETSETPAPERBINS: 0x001d,
      GETSETPRINTORIENT: 0x001e,
      ENUMPAPERBINS: 0x001f,
      SETDIBSCALING: 0x0020,
      EPSPRINTING: 0x0021,
      ENUMPAPERMETRICS: 0x0022,
      GETSETPAPERMETRICS: 0x0023,
      POSTSCRIPT_DATA: 0x0025,
      POSTSCRIPT_IGNORE: 0x0026,
      GETDEVICEUNITS: 0x002a,
      GETEXTENDEDTEXTMETRICS: 0x0100,
      GETPAIRKERNTABLE: 0x0102,
      EXTTEXTOUT: 0x0200,
      GETFACENAME: 0x0201,
      DOWNLOADFACE: 0x0202,
      METAFILE_DRIVER: 0x0801,
      QUERYDIBSUPPORT: 0x0c01,
      BEGIN_PATH: 0x1000,
      CLIP_TO_PATH: 0x1001,
      END_PATH: 0x1002,
      OPEN_CHANNEL: 0x100e,
      DOWNLOADHEADER: 0x100f,
      CLOSE_CHANNEL: 0x1010,
      POSTSCRIPT_PASSTHROUGH: 0x1013,
      ENCAPSULATED_POSTSCRIPT: 0x1014,
      POSTSCRIPT_IDENTIFY: 0x1015,
      POSTSCRIPT_INJECTION: 0x1016,
      CHECKJPEGFORMAT: 0x1017,
      CHECKPNGFORMAT: 0x1018,
      GET_PS_FEATURESETTING: 0x1019,
      MXDC_ESCAPE: 0x101a,
      SPCLPASSTHROUGH2: 0x11d8,
    },
    MapMode: {
      MM_TEXT: 1,
      MM_LOMETRIC: 2,
      MM_HIMETRIC: 3,
      MM_LOENGLISH: 4,
      MM_HIENGLISH: 5,
      MM_TWIPS: 6,
      MM_ISOTROPIC: 7,
      MM_ANISOTROPIC: 8,
    },
    StretchMode: {
      BLACKONWHITE: 1,
      WHITEONBLACK: 2,
      COLORONCOLOR: 3,
      HALFTONE: 4,
    },
    TextAlignmentMode: {
      TA_UPDATECP: 1,
      TA_RIGHT: 2,
      TA_CENTER: 6,
      TA_BOTTOM: 8,
      TA_BASELINE: 24,
      TA_RTLREADING: 256,
    },
    MixMode: {
      TRANSPARENT: 1,
      OPAQUE: 2,
    },
    VerticalTextAlignmentMode: {
      VTA_BOTTOM: 2,
      VTA_CENTER: 6,
      VTA_LEFT: 8,
      VTA_BASELINE: 24,
    },
    BrushStyle: {
      BS_SOLID: 0,
      BS_NULL: 1,
      BS_HATCHED: 2,
      BS_PATTERN: 3,
      BS_INDEXED: 4,
      BS_DIBPATTERN: 5,
      BS_DIBPATTERNPT: 6,
      BS_PATTERN8X8: 7,
      BS_DIBPATTERN8X8: 8,
      BS_MONOPATTERN: 9,
    },
    PenStyle: {
      PS_SOLID: 0,
      PS_DASH: 1,
      PS_DOT: 2,
      PS_DASHDOT: 3,
      PS_DASHDOTDOT: 4,
      PS_NULL: 5,
      PS_INSIDEFRAME: 6,
      PS_USERSTYLE: 7,
      PS_ALTERNATE: 8,
      PS_ENDCAP_SQUARE: 256,
      PS_ENDCAP_FLAT: 512,
      PS_JOIN_BEVEL: 4096,
      PS_JOIN_MITER: 8192,
    },
    PolyFillMode: {
      ALTERNATE: 1,
      WINDING: 2,
    },
    ColorUsage: {
      DIB_RGB_COLORS: 0,
      DIB_PAL_COLORS: 1,
      DIB_PAL_INDICES: 2,
    },
    PaletteEntryFlag: {
      PC_RESERVED: 1,
      PC_EXPLICIT: 2,
      PC_NOCOLLAPSE: 4,
    },
    BitmapCompression: {
      BI_RGB: 0,
      BI_RLE8: 1,
      BI_RLE4: 2,
      BI_BITFIELDS: 3,
      BI_JPEG: 4,
      BI_PNG: 5,
    },
  };
  public static _uniqueId = 0;

  public static log(message: string): void {
    if (isLoggingEnabled) {
      console.log(message);
    }
  }

  public static _makeUniqueId(prefix: string): string {
    return 'wmfjs_' + prefix + this._uniqueId++;
  }

  public static _writeUint32Val(uint8arr: Uint8Array, pos: number, val: number): void {
    uint8arr[pos++] = val & 0xff;
    uint8arr[pos++] = (val >>> 8) & 0xff;
    uint8arr[pos++] = (val >>> 16) & 0xff;
    uint8arr[pos++] = (val >>> 24) & 0xff;
  }

  public static _blobToBinary(blob: Uint8Array): string {
    let ret = '';
    const len = blob.length;
    for (let i = 0; i < len; i++) {
      ret += String.fromCharCode(blob[i]);
    }
    return ret;
  }
}
