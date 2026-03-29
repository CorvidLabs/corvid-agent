import{T as s,Ua as a,ab as h,ic as d,ra as p}from"./chunk-LF4EWAJA.js";var m=class l{appTooltip=d("");el=s(p);renderer=s(a);tooltipEl=null;showTimeout=null;listeners=[];ngAfterViewInit(){let t=this.el.nativeElement;this.listeners.push(this.renderer.listen(t,"mouseenter",()=>this.onEnter()),this.renderer.listen(t,"mouseleave",()=>this.onLeave()),this.renderer.listen(t,"focus",()=>this.onEnter()),this.renderer.listen(t,"blur",()=>this.onLeave()))}ngOnDestroy(){this.onLeave(),this.listeners.forEach(t=>t())}getTooltipText(){let t=this.appTooltip();if(t)return t;let e=this.el.nativeElement;return e.scrollWidth>e.clientWidth?e.textContent?.trim()??"":""}onEnter(){let t=this.getTooltipText();t&&(this.showTimeout=setTimeout(()=>{this.createTooltip(t)},400))}onLeave(){this.showTimeout&&(clearTimeout(this.showTimeout),this.showTimeout=null),this.removeTooltip()}createTooltip(t){this.removeTooltip();let e=this.renderer.createElement("div");e.textContent=t,e.setAttribute("role","tooltip"),e.style.cssText=`
            position: fixed;
            z-index: 10000;
            max-width: 320px;
            padding: 6px 10px;
            background: var(--bg-raised, #161822);
            color: var(--text-primary, #e0e0ec);
            border: 1px solid var(--border-bright, #2a2d48);
            border-radius: var(--radius-sm, 3px);
            font-size: 0.75rem;
            font-family: inherit;
            line-height: 1.6;
            pointer-events: none;
            white-space: pre-wrap;
            word-break: break-word;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            opacity: 0;
            transition: opacity 0.12s ease;
        `,document.body.appendChild(e),this.tooltipEl=e;let i=this.el.nativeElement.getBoundingClientRect(),o=e.getBoundingClientRect(),r=i.top-o.height-6,n=i.left+(i.width-o.width)/2;r<4&&(r=i.bottom+6),n=Math.max(4,Math.min(n,window.innerWidth-o.width-4)),e.style.top=`${r}px`,e.style.left=`${n}px`,requestAnimationFrame(()=>{this.tooltipEl&&(this.tooltipEl.style.opacity="1")})}removeTooltip(){this.tooltipEl&&(this.tooltipEl.remove(),this.tooltipEl=null)}static \u0275fac=function(e){return new(e||l)};static \u0275dir=h({type:l,selectors:[["","appTooltip",""]],inputs:{appTooltip:[1,"appTooltip"]}})};export{m as a};
