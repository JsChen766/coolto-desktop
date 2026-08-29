export const frameHtml = `<!doctype html><button id="frame-button" role="button">Frame action</button>`;
export const pageTwoHtml = `<!doctype html><title>QA Page Two</title><main>Second page</main>`;
export const pageOneHtml = `<!doctype html><title>QA Page One</title>
<main><h1>Agent Engineer</h1>
<div role="option" aria-label="Interview invitation row"
 onclick="this.dataset.opened='true'">Recruiter — Interview invitation</div>
<article><span>recruiter@example.com</span><h2>Interview invitation</h2>
<time>Aug 22, 10:00</time><p>Your interview is scheduled for Monday at 10:00 HKT.</p></article>
<label for="editor">Editor</label><input id="editor">
<form onsubmit="event.preventDefault();document.getElementById('confirmation').textContent='Application received'">
  <button type="submit" title="Submit application">Submit</button>
</form><p id="confirmation"></p>
<button role="button" title="Hover target" onmouseover="this.dataset.hovered='true'">Hover</button>
<div draggable="true" title="Drag source">Drag</div>
<div data-drop-target title="Drop target" ondragover="event.preventDefault()"
 ondrop="event.preventDefault();this.dataset.dropped='true'">Drop</div>
<iframe src="/frame"></iframe><qa-shadow></qa-shadow></main>
<script>customElements.define('qa-shadow',class extends HTMLElement{connectedCallback(){
 const root=this.attachShadow({mode:'open'});root.innerHTML='<button id="shadow-button" role="button">Shadow action</button>';
}});</script>`;
