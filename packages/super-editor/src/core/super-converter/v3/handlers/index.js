// @ts-check
import { translator as mc_AlternateContent_translator } from './mc/altermateContent/alternate-content-translator.js';
import { translator as sd_pageReference_translator } from './sd/pageReference/pageReference-translator.js';
import { translator as sd_tableOfContents_translator } from './sd/tableOfContents/tableOfContents-translator.js';
import { translator as sd_index_translator } from './sd/index/index-translator.js';
import { translator as sd_indexEntry_translator } from './sd/indexEntry/indexEntry-translator.js';
import { translator as sd_autoPageNumber_translator } from './sd/autoPageNumber/autoPageNumber-translator.js';
import { translator as sd_totalPageNumber_translator } from './sd/totalPageNumber/totalPageNumber-translator.js';
import { translator as w_adjustRightInd_translator } from './w/adjustRightInd/adjustRightInd-translator.js';
import { translator as w_autoSpaceDE_translator } from './w/autoSpaceDE/autoSpaceDE-translator.js';
import { translator as w_autoSpaceDN_translator } from './w/autoSpaceDN/autoSpaceDN-translator.js';
import { translator as w_b_translator } from './w/b/b-translator.js';
import { translator as w_bdr_translator } from './w/bdr/bdr-translator.js';
import { translator as w_bar_translator } from './w/bar/bar-translator.js';
import { translator as w_bCs_translator } from './w/bCs/bCs-translator.js';
import { translator as w_bidiVisual_translator } from './w/bidiVisual/bidiVisual-translator.js';
import { translator as w_bookmarkEnd_translator } from './w/bookmark-end/bookmark-end-translator.js';
import { translator as w_bookmarkStart_translator } from './w/bookmark-start/bookmark-start-translator.js';
import { translator as w_bottom_translator } from './w/bottom/bottom-translator.js';
import { translator as w_br_translator } from './w/br/br-translator.js';
import { translator as w_cantSplit_translator } from './w/cantSplit/cantSplit-translator.js';
import { translator as w_caps_translator } from './w/caps/caps-translator.js';
import { translator as w_cnfStyle_translator } from './w/cnfStyle/cnfStyle-translator.js';
import { translator as w_color_translator } from './w/color/color-translator.js';
import {
  commentRangeStartTranslator as w_commentRangeStart_translator,
  commentRangeEndTranslator as w_commentRangeEnd_translator,
} from './w/commentRange/comment-range-translator.js';
import { translator as w_footnoteReference_translator } from './w/footnoteReference/footnoteReference-translator.js';
import { translator as w_contextualSpacing } from './w/contextualSpacing/contextualSpacing-translator.js';
import { translator as w_cs } from './w/cs/cs-translator.js';
import { translator as w_del_translator } from './w/del/del-translator.js';
import { translator as w_divId_translator } from './w/divId/divId-translator.js';
import { translator as w_drawing_translator } from './w/drawing/drawing-translator.js';
import { translator as w_dstrike_translator } from './w/dstrike/dstrike-translator.js';
import { translator as w_eastAsianLayout_translator } from './w/eastAsianLayout/eastAsianLayout-translator.js';
import { translator as w_effect_translator } from './w/effect/effect-translator.js';
import { translator as w_em_translator } from './w/em/em-translator.js';
import { translator as w_emboss_translator } from './w/emboss/emboss-translator.js';
import { translator as w_end_translator } from './w/end/end-translator.js';
import { translator as w_framePr_translator } from './w/framePr/framePr-translator.js';
import { translator as w_fitText_translator } from './w/fitText/fitText-translator.js';
import { translator as w_gridAfter_translator } from './w/gridAfter/gridAfter-translator.js';
import { translator as w_gridBefore_translator } from './w/gridBefore/gridBefore-translator.js';
import { translator as w_gridCol_translator } from './w/gridCol/gridCol-translator.js';
import { translator as w_gridSpan_translator } from './w/gridSpan/gridSpan-translator.js';
import { translator as w_header_translator } from './w/header/header-translator.js';
import { translator as w_headers_translator } from './w/headers/headers-translator.js';
import { translator as w_hidden_translator } from './w/hidden/hidden-translator.js';
import { translator as w_hideMark_translator } from './w/hideMark/hideMark-translator.js';
import { translator as w_highlight_translator } from './w/highlight/highlight-translator.js';
import { translator as w_hyperlink_translator } from './w/hyperlink/hyperlink-translator.js';
import { translator as w_i_translator } from './w/i/i-translator.js';
import { translator as w_iCs_translator } from './w/iCs/iCs-translator.js';
import { translator as w_ilvl_translator } from './w/ilvl/ilvl-translator.js';
import { translator as w_imprint_translator } from './w/imprint/imprint-translator.js';
import { translator as w_ind_translator } from './w/ind/ind-translator.js';
import { translator as w_ins_translator } from './w/ins/ins-translator.js';
import { translator as w_insideH_translator } from './w/insideH/insideH-translator.js';
import { translator as w_insideV_translator } from './w/insideV/insideV-translator.js';
import { translator as w_jc_translator } from './w/jc/jc-translator.js';
import { translator as w_keepLines_translator } from './w/keepLines/keepLines-translator.js';
import { translator as w_keepNext_translator } from './w/keepNext/keepNext-translator.js';
import { translator as w_kern_translator } from './w/kern/kern-translator.js';
import { translator as w_kinsoku_translator } from './w/kinsoku/kinsoku-translator.js';
import { translator as w_lang_translator } from './w/lang/lang-translator.js';
import { translator as w_mirrorIndents_translator } from './w/mirrorIndents/mirrorIndents-translator.js';
import { translator as w_left_translator } from './w/left/left-translator.js';
import { translator as w_noProof_translator } from './w/noProof/noProof-translator.js';
import { translator as w_noWrap_translator } from './w/noWrap/noWrap-translator.js';
import { translator as w_numId_translator } from './w/numId/numId-translator.js';
import { translator as w_numPr_translator } from './w/numPr/numPr-translator.js';
import { translator as w_oMath_translator } from './w/oMath/oMath-translator.js';
import { translator as w_outline_translator } from './w/outline/outline-translator.js';
import { translator as w_outlineLvl_translator } from './w/outlineLvl/outlineLvl-translator.js';
import { translator as w_overflowPunct } from './w/overflowPunct/overflowPunct-translator.js';
import { translator as w_p_translator } from './w/p/p-translator.js';
import { translator as w_pageBreakBefore_translator } from './w/pageBreakBefore/pageBreakBefore-translator.js';
import { translator as w_pBdr_translator } from './w/pBdr/pBdr-translator.js';
import { translator as w_position_translator } from './w/position/position-translator.js';
import { translator as w_pPr_translator } from './w/pPr/pPr-translator.js';
import { translator as w_pStyle_translator } from './w/pStyle/pStyle-translator.js';
import { translator as w_permEnd_translator } from './w/perm-end/perm-end-translator.js';
import { translator as w_permStart_translator } from './w/perm-start/perm-start-translator.js';
import { translator as w_r_translator } from './w/r/r-translator.js';
import { translator as w_rFonts_translator } from './w/rFonts/rFonts-translator.js';
import { translator as w_rPr_translator } from './w/rpr/rpr-translator.js';
import { translator as w_rStyle_translator } from './w/rStyle/rstyle-translator.js';
import { translator as w_rtl_translator } from './w/rtl/rtl-translator.js';
import { translator as w_right_translator } from './w/right/right-translator.js';
import { translator as w_sdt_translator } from './w/sdt/sdt-translator.js';
import { translator as w_shadow_translator } from './w/shadow/shadow-translator.js';
import { translator as w_shd_translator } from './w/shd/shd-translator.js';
import { translator as w_smallCaps_translator } from './w/smallCaps/smallCaps-translator.js';
import { translator as w_snapToGrid_translator } from './w/snapToGrid/snapToGrid-translator.js';
import { translator as w_start_translator } from './w/start/start-translator.js';
import { translator as w_strike_translator } from './w/strike/strike-translator.js';
import { translator as w_spacing_translator } from './w/spacing/spacing-translator.js';
import { translator as w_suppressAutoHyphens_translator } from './w/suppressAutoHyphens/suppressAutoHyphens-translator.js';
import { translator as w_suppressLineNumbers_translator } from './w/suppressLineNumbers/suppressLineNumbers-translator.js';
import { translator as w_suppressOverlap_translator } from './w/suppressOverlap/suppressOverlap-translator.js';
import { translator as w_sz_translator } from './w/sz/sz-translator.js';
import { translator as w_szCs_translator } from './w/szcs/szcs-translator.js';
import { translator as w_t_translator } from './w/t/t-translator.js';
import { translator as w_tab_translator } from './w/tab/tab-translator.js';
import { translator as w_tabs_translator } from './w/tabs/tabs-translator.js';
import { translator as w_tbl_translator } from './w/tbl/tbl-translator.js';
import { translator as w_tblBorders_translator } from './w/tblBorders/tblBorders-translator.js';
import { translator as w_tblCaption_translator } from './w/tblCaption/tblCaption-translator.js';
import { translator as w_tblCellMar_translator } from './w/tblCellMar/tblCellMar-translator.js';
import { translator as w_tblCellSpacing_translator } from './w/tblCellSpacing/tblCellSpacing-translator.js';
import { translator as w_tblDescription_translator } from './w/tblDescription/tblDescription-translator.js';
import { translator as w_tblGrid_translator } from './w/tblGrid/tblGrid-translator.js';
import { translator as w_tblHeader_translator } from './w/tblHeader/tblHeader-translator.js';
import { translator as w_tblInd_translator } from './w/tblInd/tblInd-translator.js';
import { translator as w_tblLayout_translator } from './w/tblLayout/tblLayout-translator.js';
import { translator as w_tblLook_translator } from './w/tblLook/tblLook-translator.js';
import { translator as w_tblOverlap_translator } from './w/tblOverlap/tblOverlap-translator.js';
import { translator as w_tblPr_translator } from './w/tblPr/tblPr-translator.js';
import { translator as w_tblStyle_translator } from './w/tblStyle/tblStyle-translator.js';
import { translator as w_tblStyleColBandSize_translator } from './w/tblStyleColBandSize/tblStyleColBandSize-translator.js';
import { translator as w_tblStyleRowBandSize_translator } from './w/tblStyleRowBandSize/tblStyleRowBandSize-translator.js';
import { translator as w_tblW_translator } from './w/tblW/tblW-translator.js';
import { translator as w_tblpPr_translator } from './w/tblpPr/tblpPr-translator.js';
import { translator as w_tc_translator } from './w/tc/tc-translator.js';
import { translator as w_top_translator } from './w/top/top-translator.js';
import { translator as w_tr_translator } from './w/tr/tr-translator.js';
import { translator as w_trHeight_translator } from './w/trHeight/trHeight-translator.js';
import { translator as w_trPr_translator } from './w/trPr/trPr-translator.js';
import { translator as w_u_translator } from './w/u/u-translator.js';
import { translator as w_w_translator } from './w/w/w-translator.js';
import { translator as w_wAfter_translator } from './w/wAfter/wAfter-translator.js';
import { translator as w_wBefore_translator } from './w/wBefore/wBefore-translator.js';
import { translator as w_vMerge_translator } from './w/vMerge/vMerge-translator.js';
import { translator as w_vAlign_translator } from './w/vAlign/vAlign-translator.js';
import { translator as w_vertAlign_translator } from './w/vertAlign/vertAlign-translator.js';
import { translator as w_specVanish_translator } from './w/specVanish/specVanish-translator.js';
import { translator as w_tcFitText_translator } from './w/tcFitText/tcFitText-translator.js';
import { translator as w_tcW_translator } from './w/tcW/tcW-translator.js';
import { translator as w_textDirection_translator } from './w/textDirection/textDirection-translator.js';
import { translator as w_tl2br_translator } from './w/tl2br/tl2br-translator.js';
import { translator as w_tr2bl_translator } from './w/tr2bl/tr2bl-translator.js';
import { translator as w_tcBorders_translator } from './w/tcBorders/tcBorders-translator.js';
import { translator as w_tcMar_translator } from './w/tcMar/tcMar-translator.js';
import { translator as w_tcPr_translator } from './w/tcPr/tcPr-translator.js';
import { translator as w_textAlignment_translator } from './w/textAlignment/textAlignment-translator.js';
import { translator as w_textBoxTightWrap_translator } from './w/textboxTightWrap/textboxTightWrap-translator.js';
import { translator as w_topLinePunct_translator } from './w/topLinePunct/topLinePunct-translator.js';
import { translator as w_vanish_translator } from './w/vanish/vanish-translator.js';
import { translator as w_webHidden_translator } from './w/webHidden/webHidden-translator.js';
import { translator as w_widowControl_translator } from './w/widowControl/widowControl-translator.js';
import { translator as w_wordWrap_translator } from './w/wordWrap/wordWrap-translator.js';
import { translator as wp_anchor_translator } from './wp/anchor/anchor-translator.js';
import { translator as wp_inline_translator } from './wp/inline/inline-translator.js';

/**
 * @typedef {Object} RegisteredHandlers
 */

const translatorList = Array.from(
  new Set([
    mc_AlternateContent_translator,
    sd_pageReference_translator,
    sd_tableOfContents_translator,
    sd_index_translator,
    sd_indexEntry_translator,
    sd_autoPageNumber_translator,
    sd_totalPageNumber_translator,
    w_adjustRightInd_translator,
    w_autoSpaceDE_translator,
    w_autoSpaceDN_translator,
    w_b_translator,
    w_bar_translator,
    w_bCs_translator,
    w_bdr_translator,
    w_bidiVisual_translator,
    w_bookmarkEnd_translator,
    w_bookmarkStart_translator,
    w_bottom_translator,
    w_br_translator,
    w_cantSplit_translator,
    w_caps_translator,
    w_cnfStyle_translator,
    w_color_translator,
    w_contextualSpacing,
    w_cs,
    w_del_translator,
    w_divId_translator,
    w_drawing_translator,
    w_dstrike_translator,
    w_eastAsianLayout_translator,
    w_effect_translator,
    w_em_translator,
    w_emboss_translator,
    w_end_translator,
    w_footnoteReference_translator,
    w_fitText_translator,
    w_framePr_translator,
    w_gridAfter_translator,
    w_gridBefore_translator,
    w_gridCol_translator,
    w_gridSpan_translator,
    w_header_translator,
    w_headers_translator,
    w_hidden_translator,
    w_hideMark_translator,
    w_highlight_translator,
    w_hyperlink_translator,
    w_i_translator,
    w_iCs_translator,
    w_ilvl_translator,
    w_ind_translator,
    w_imprint_translator,
    w_ins_translator,
    w_insideH_translator,
    w_insideV_translator,
    w_jc_translator,
    w_keepLines_translator,
    w_keepNext_translator,
    w_kern_translator,
    w_kinsoku_translator,
    w_lang_translator,
    w_left_translator,
    w_mirrorIndents_translator,
    w_noProof_translator,
    w_noWrap_translator,
    w_numId_translator,
    w_numPr_translator,
    w_outline_translator,
    w_outlineLvl_translator,
    w_overflowPunct,
    w_oMath_translator,
    w_p_translator,
    w_pageBreakBefore_translator,
    w_pBdr_translator,
    w_position_translator,
    w_pPr_translator,
    w_pStyle_translator,
    w_permStart_translator,
    w_permEnd_translator,
    w_r_translator,
    w_rFonts_translator,
    w_rPr_translator,
    w_rStyle_translator,
    w_rtl_translator,
    w_right_translator,
    w_sdt_translator,
    w_shadow_translator,
    w_shd_translator,
    w_smallCaps_translator,
    w_snapToGrid_translator,
    w_spacing_translator,
    w_suppressAutoHyphens_translator,
    w_suppressLineNumbers_translator,
    w_suppressOverlap_translator,
    w_specVanish_translator,
    w_start_translator,
    w_strike_translator,
    w_sz_translator,
    w_szCs_translator,
    w_t_translator,
    w_tab_translator,
    w_tabs_translator,
    w_tbl_translator,
    w_tblBorders_translator,
    w_tblCaption_translator,
    w_tblCellMar_translator,
    w_tblCellSpacing_translator,
    w_tblDescription_translator,
    w_tblGrid_translator,
    w_tblHeader_translator,
    w_tblInd_translator,
    w_tblLayout_translator,
    w_tblLook_translator,
    w_tblOverlap_translator,
    w_tblPr_translator,
    w_tblStyle_translator,
    w_tblStyleColBandSize_translator,
    w_tblStyleRowBandSize_translator,
    w_tblW_translator,
    w_tblpPr_translator,
    w_tc_translator,
    w_tcBorders_translator,
    w_tcFitText_translator,
    w_tcMar_translator,
    w_tcPr_translator,
    w_tcW_translator,
    w_textDirection_translator,
    w_tl2br_translator,
    w_tr_translator,
    w_tr2bl_translator,
    w_trHeight_translator,
    w_trPr_translator,
    w_textAlignment_translator,
    w_textBoxTightWrap_translator,
    w_topLinePunct_translator,
    w_top_translator,
    w_u_translator,
    w_vAlign_translator,
    w_vanish_translator,
    w_vertAlign_translator,
    w_vMerge_translator,
    w_w_translator,
    w_wAfter_translator,
    w_wBefore_translator,
    w_webHidden_translator,
    w_widowControl_translator,
    w_wordWrap_translator,
    wp_anchor_translator,
    wp_inline_translator,
    w_commentRangeStart_translator,
    w_commentRangeEnd_translator,
  ]),
);

const additionalHandlers = Object.freeze(
  translatorList.reduce((acc, translator) => {
    if (typeof translator === 'function') return acc;
    const key = translator?.xmlName;
    if (!key) return acc;
    acc[key] = translator;
    return acc;
  }, {}),
);

const baseHandlers = {
  ...additionalHandlers,
};

/** @type {RegisteredHandlers} */
export const registeredHandlers = Object.freeze(baseHandlers);
