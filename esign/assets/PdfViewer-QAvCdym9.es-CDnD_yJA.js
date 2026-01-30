import{_ as N,u as O,s as $,r as L,o as E,a as W,c as B,b as D,d as A,e as F,f as I,h as H,i as U,j as h,N as q,T as G,p as K,w as R,k as J,l as X,m as M,n as Y,q as T,t as V,v as Z,x as Q,y as ee,z as te,A as se,B as y,C as ne,D as j}from"./superdoc.es-ZfrVv8NU.js";import"./index-DBNPM7Um.js";function oe(n){const{opacityDisabled:e,heightTiny:s,heightSmall:t,heightMedium:o,heightLarge:r,heightHuge:p,primaryColor:d,fontSize:i}=n;return{fontSize:i,textColor:d,sizeTiny:s,sizeSmall:t,sizeMedium:o,sizeLarge:r,sizeHuge:p,color:d,opacitySpinning:e}}const ie={common:Y,self:oe},re=T([T("@keyframes spin-rotate",`
 from {
 transform: rotate(0);
 }
 to {
 transform: rotate(360deg);
 }
 `),y("spin-container",`
 position: relative;
 `,[y("spin-body",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 `,[ne()])]),y("spin-body",`
 display: inline-flex;
 align-items: center;
 justify-content: center;
 flex-direction: column;
 `),y("spin",`
 display: inline-flex;
 height: var(--n-size);
 width: var(--n-size);
 font-size: var(--n-size);
 color: var(--n-color);
 `,[j("rotate",`
 animation: spin-rotate 2s linear infinite;
 `)]),y("spin-description",`
 display: inline-block;
 font-size: var(--n-font-size);
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 margin-top: 8px;
 `),y("spin-content",`
 opacity: 1;
 transition: opacity .3s var(--n-bezier);
 pointer-events: all;
 `,[j("spinning",`
 user-select: none;
 -webkit-user-select: none;
 pointer-events: none;
 opacity: var(--n-opacity-spinning);
 `)])]),ae={small:20,medium:18,large:16},ce=Object.assign(Object.assign({},M.props),{contentClass:String,contentStyle:[Object,String],description:String,stroke:String,size:{type:[String,Number],default:"medium"},show:{type:Boolean,default:!0},strokeWidth:Number,rotate:{type:Boolean,default:!0},spinning:{type:Boolean,validator:()=>!0,default:void 0},delay:Number}),de=U({name:"Spin",props:ce,slots:Object,setup(n){K.env.NODE_ENV!=="production"&&R(()=>{n.spinning!==void 0&&J("spin","`spinning` is deprecated, please use `show` instead.")});const{mergedClsPrefixRef:e,inlineThemeDisabled:s}=X(n),t=M("Spin","-spin",re,ie,n,e),o=V(()=>{const{size:i}=n,{common:{cubicBezierEaseInOut:l},self:g}=t.value,{opacitySpinning:u,color:b,textColor:S}=g,m=typeof i=="number"?Z(i):g[Q("size",i)];return{"--n-bezier":l,"--n-opacity-spinning":u,"--n-size":m,"--n-color":b,"--n-text-color":S}}),r=s?ee("spin",V(()=>{const{size:i}=n;return typeof i=="number"?String(i):i[0]}),o,n):void 0,p=te(n,["spinning","show"]),d=L(!1);return R(i=>{let l;if(p.value){const{delay:g}=n;if(g){l=window.setTimeout(()=>{d.value=!0},g),i(()=>{clearTimeout(l)});return}}d.value=p.value}),{mergedClsPrefix:e,active:d,mergedStrokeWidth:V(()=>{const{strokeWidth:i}=n;if(i!==void 0)return i;const{size:l}=n;return ae[typeof l=="number"?"medium":l]}),cssVars:s?void 0:o,themeClass:r?.themeClass,onRender:r?.onRender}},render(){var n,e;const{$slots:s,mergedClsPrefix:t,description:o}=this,r=s.icon&&this.rotate,p=(o||s.description)&&h("div",{class:`${t}-spin-description`},o||((n=s.description)===null||n===void 0?void 0:n.call(s))),d=s.icon?h("div",{class:[`${t}-spin-body`,this.themeClass]},h("div",{class:[`${t}-spin`,r&&`${t}-spin--rotate`],style:s.default?"":this.cssVars},s.icon()),p):h("div",{class:[`${t}-spin-body`,this.themeClass]},h(q,{clsPrefix:t,style:s.default?"":this.cssVars,stroke:this.stroke,"stroke-width":this.mergedStrokeWidth,class:`${t}-spin`}),p);return(e=this.onRender)===null||e===void 0||e.call(this),s.default?h("div",{class:[`${t}-spin-container`,this.themeClass],style:this.cssVars},h("div",{class:[`${t}-spin-content`,this.active&&`${t}-spin-content--spinning`,this.contentClass],style:this.contentStyle},s),h(G,{name:"fade-in-transition"},{default:()=>this.active?d:null})):d}}),le=(n,e)=>{const s=e-n;return Array.from({length:s},(t,o)=>n+o)};class _{constructor(){if(Object.getPrototypeOf(this).constructor===_)throw new Error("Abstract class should not be instanciated")}}class pe extends _{constructor(e){super(),this.pdfLib=e.pdfLib,this.pdfViewer=e.pdfViewer,this.workerSrc=e.workerSrc,this.textLayerMode=e.textLayerMode??0,e.setWorker&&(this.workerSrc?this.pdfLib.GlobalWorkerOptions.workerSrc=e.workerSrc:this.pdfLib.GlobalWorkerOptions.workerSrc=he(this.pdfLib.version)),this.pdfPageViews=[]}async getDocument(e){return await this.pdfLib.getDocument(e).promise}async renderPages({documentId:e,pdfDocument:s,viewerContainer:t,emit:o=()=>{}}){try{this.pdfPageViews=[];const r=s.numPages,d=await ge(s,1,r),i=[];for(const[l,g]of d.entries()){const u=document.createElement("div");u.classList.add("pdf-page"),u.dataset.pageNumber=(l+1).toString(),u.id=`${e}-page-${l+1}`,i.push(u);const{width:b,height:S}=this.getOriginalPageSize(g),m=1,x=new this.pdfViewer.EventBus,c=new this.pdfViewer.PDFPageView({container:u,id:l+1,scale:m,defaultViewport:g.getViewport({scale:m}),eventBus:x,textLayerMode:this.textLayerMode});this.pdfPageViews.push(c);const f=u.getBoundingClientRect();f.originalWidth=b,f.originalHeight=S,c.setPdfPage(g),await c.draw(),o("page-loaded",e,l,f)}t.append(...i),o("ready",e,t)}catch(r){console.error("Error loading PDF:",r)}}getOriginalPageSize(e){const s=e.getViewport({scale:1}),t=s.width,o=s.height;return{width:t,height:o}}destroy(){this.pdfPageViews.forEach(e=>e.destroy()),this.pdfPageViews=[]}}class ue{static create(e){const s={pdfjs:()=>new pe(e),default:()=>{throw new Error("Unsupported adapter")}};return(s[e.adapter]??s.default)()}}const fe=n=>({...{adapter:"pdfjs"},...n});async function ge(n,e,s){const t=le(e,s+1).map(o=>n.getPage(o));return await Promise.all(t)}function he(n){return`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${n}/pdf.worker.min.mjs`}const me=n=>new Promise((e,s)=>{const t=new FileReader;t.onload=o=>e(o.target.result),t.onerror=s,t.readAsDataURL(n)}),we={key:0,class:"superdoc-pdf-viewer__loader"},ve={__name:"PdfViewer",props:{documentData:{type:Object,required:!0},config:{type:Object,required:!0}},emits:["page-loaded","ready","selection-change","bypass-selection"],setup(n,{emit:e}){const s=e,t=n,o=O(),{activeZoom:r}=$(o),p=L(null),d=L(!1),i=t.documentData.id,l=t.documentData.data,g=fe({pdfLib:t.config.pdfLib,pdfViewer:t.config.pdfViewer,workerSrc:t.config.workerSrc,setWorker:t.config.setWorker,textLayerMode:t.config.textLayerMode}),u=ue.create(g),b=async c=>{try{const f=await me(c),P=await u.getDocument(f);await u.renderPages({documentId:i,pdfDocument:P,viewerContainer:p.value,emit:s}),d.value=!0}catch{}};function S(c){const f=window.getSelection();if(f.rangeCount===0)return null;const w=f.getRangeAt(0).getClientRects();if(w.length===0)return null;const k=w[0];let a={top:k.top,left:k.left,bottom:k.bottom,right:k.right};for(let z=1;z<w.length;z++){const v=w[z];v.width===0||v.height===0||(a.top=Math.min(a.top,v.top),a.left=Math.min(a.left,v.left),a.bottom=Math.max(a.bottom,v.bottom),a.right=Math.max(a.right,v.right))}const C=c.getBoundingClientRect();return p.value.getBoundingClientRect(),a.top=(a.top-C.top)/(r.value/100)+c.scrollTop,a.left=(a.left-C.left)/(r.value/100)+c.scrollLeft,a.bottom=(a.bottom-C.top)/(r.value/100)+c.scrollTop,a.right=(a.right-C.left)/(r.value/100)+c.scrollLeft,a}const m=c=>{const{target:f}=c;f.tagName!=="SPAN"&&s("bypass-selection",c)},x=c=>{if(window.getSelection().toString().length>0){const P=S(p.value),w=se({selectionBounds:P,documentId:i});s("selection-change",w)}};return E(async()=>{await b(l)}),W(()=>{u.destroy()}),(c,f)=>(D(),B("div",{class:"superdoc-pdf-viewer-container",onMousedown:m,onMouseup:x},[A("div",{class:"superdoc-pdf-viewer",ref_key:"viewer",ref:p,id:"viewerId"},null,512),d.value?F("",!0):(D(),B("div",we,[I(H(de),{class:"superdoc-pdf-viewer__spin",size:"large"})]))],32))}},Se=N(ve,[["__scopeId","data-v-84719682"]]);export{Se as default};
