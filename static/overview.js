/* Figma Farm Overview only. Existing forms and other screens stay intact. */
// Keep layout helpers local: names such as `top` also belong to the browser.
(() => {
const overview=$('#overview');
const asset=name=>'/static/overview-assets/'+name;
const ovImage=(name,alt='')=>{const img=el('img');img.src=asset(name);img.alt=alt;return img;};
const oldOverview=el('details',undefined,'ov-details');oldOverview.append(el('summary','More farm details and actions'));
while(overview.firstChild)oldOverview.append(overview.firstChild);
overview.append(oldOverview);
const top=el('div',undefined,'ov-top');const title=el('div',undefined,'ov-title');title.append($('#farm-title'));const coords=el('small');coords.id='ov-coordinates';title.append(coords);top.append(title);
const edit=el('button','Edit farm','ov-edit');edit.onclick=()=>tab('farm');top.append(edit);
const periodButton=el('button','Choose past dates','secondary');periodButton.onclick=()=>{$('#period-panel').open=true;$('#period-panel').scrollIntoView({behavior:'smooth'});};top.append(periodButton);
const stats=oldOverview.querySelector('.stats');stats.classList.add('ov-stats');
['imgDroplet.svg','imgGroup5.svg','imgGroup4.svg'].forEach((name,i)=>stats.children[i].prepend(ovImage(name)));

const place=el('article');place.append(ovImage('imgGroup6.svg'),el('span','Location'));const placeValue=el('strong');placeValue.id='ov-place';place.append(placeValue);stats.append(place);
const grid=el('div',undefined,'ov-grid');const cropsBox=el('div',undefined,'ov-crops');cropsBox.append(el('h2','CROPS'));const cropItems=el('div',undefined,'ov-crop-items');
for(const [label,img] of [['Corn','imgCornOnTheCobCandyCornWaxyCornVegetableSweetCornCornD44A0F87083399Fbd391129Aac3812Ff1.png'],['Rice','imgWheatStrawCerealWheatPng3Fa65A6925Da6197682E7D4Acf6De1Ba1.png']]){const b=el('button',undefined,'ov-crop');b.append(ovImage(img),el('span',label));b.onclick=()=>tab('planting');cropItems.append(b);}
const current=el('button',undefined,'ov-crop');current.id='ov-current-crop';current.onclick=()=>tab('farm');cropItems.append(current);const add=el('button','＋ Edit crop','ov-crop');add.onclick=()=>tab('farm');cropItems.append(add);cropsBox.append(cropItems);
const summary=el('div',undefined,'ov-summary');oldOverview.append($('#farm-summary'));summary.append(el('h2','Your farm at a glance'),$('#farm-summary'));const shortcuts=el('div',undefined,'ov-shortcuts');for(const [label,page] of [['Edit farm details','farm'],['Write a field note','journal'],['Check the forecast','forecasts']]){const b=el('button',label,'secondary');b.onclick=()=>tab(page);shortcuts.append(b);}summary.append(shortcuts);
const tip=el('div',undefined,'ov-tip');const tipCopy=el('div',undefined,'ov-tip-copy');tipCopy.append(el('h2','A suggestion for your farm'));const tipText=el('p');tipText.id='ov-tip-text';tipCopy.append(tipText);const details=el('button','See details','secondary');details.onclick=()=>{oldOverview.open=true;$('#recommendations').scrollIntoView({behavior:'smooth'});};tipCopy.append(details);const tipBackdrop=ovImage('imgRectangle.svg');tipBackdrop.className='ov-tip-backdrop';tip.append(tipBackdrop,tipCopy,ovImage('imgFarmerImg.png','Farmer holding vegetables'));
function chartCard(heading,id){const card=el('div',undefined,'ov-chart');card.append(el('h2',heading));const source=el('p',undefined,'source');source.classList.add('ov-chart-source');card.append(source);const plotBox=el('div',undefined,'plot');plotBox.id=id;card.append(plotBox);const b=el('button','View records','secondary');b.onclick=()=>tab('climate');card.append(b);return card;}
grid.append(cropsBox,summary,tip,chartCard('Past rainfall','ov-rain'),chartCard('Past temperature','ov-temp'));
overview.prepend(top,stats,grid);
function renderOverviewDesign(){if(!state)return;const farm=state.farm;$('#farm-title').textContent=farm.name;coords.textContent=Number(farm.latitude).toFixed(4)+'° N · '+Number(farm.longitude).toFixed(4)+'° E';placeValue.textContent=farm.municipality;current.replaceChildren(el('small','Currently growing'),el('strong',farm.crop));current.title='Edit your current crop';current.onclick=()=>tab('farm');current.setAttribute('aria-label','Current crop: '+farm.crop+'. Edit crop');
const days=visibleHistory();const rain=days.filter(d=>Number.isFinite(d.rain));const temp=days.filter(d=>Number.isFinite(d.temp));$('#rain-label').textContent='Past rainfall';$('#rain-stat').textContent=rain.length?num(rain.reduce((s,d)=>s+d.rain,0))+' mm':'—';$('#rain-caption').textContent='Total over '+rain.length+' recorded days';stats.children[0].title=$('#rain-caption').textContent;$('#temp-label').textContent='Past temperature';$('#temp-stat').textContent=temp.length?num(temp.reduce((s,d)=>s+d.temp,0)/temp.length)+' °C':'—';$('#temp-caption').textContent='Average over '+temp.length+' recorded days';stats.children[1].title=$('#temp-caption').textContent;
const label=days.length?days[0].date+' to '+days.at(-1).date+' · '+state.climate.source:'No saved readings for these dates';overview.querySelectorAll('.ov-chart-source').forEach(n=>n.textContent=label);
plot('#ov-rain',[{name:'Past rainfall',color:'#527fff',points:days.map(d=>({date:d.date,value:d.rain}))}],'Rain mm/day');plot('#ov-temp',[{name:'Past temperature',color:'#ef6b36',points:days.map(d=>({date:d.date,value:d.temp}))}],'Mean temperature °C');
const first=$('#recommendations article');tipText.textContent=first?(first.querySelector('h3')?.textContent||'')+' — '+(first.querySelector('p')?.textContent||''):'Add your farm details and weather records to see suggested actions.';
}
const overviewRenderOriginal=render;render=function(){overviewRenderOriginal();renderOverviewDesign();};

const navAssets={overview:'imgGroup3.svg',farm:'imgGroup1.svg',forecasts:'imgCloudSunny.svg',planting:'imgGroup2.svg',journal:'imgEdit.svg',learn:'imgGroup.svg'};
for(const [page,name] of Object.entries(navAssets)){const button=document.querySelector('[data-tab="'+page+'"]');if(button){const icon=ovImage(name);icon.className='ov-nav-icon';button.prepend(icon);}}
const figmaBrand=el('div',undefined,'ov-brand');figmaBrand.append(ovImage('imgOl341U1Ht27Ph8Cntfnthquq0L1.png'),el('strong','AgriForesight'));document.querySelector('aside').prepend(figmaBrand);

// Match the 1440 × 1024 Figma canvas on desktop; keep the mobile reflow below 750px.
let overviewZoom=1;
function sizeOverview(){document.documentElement.style.setProperty('--overview-text-scale',String(overviewZoom));}
window.addEventListener('resize',sizeOverview);sizeOverview();
const zoomControls=el('div',undefined,'ov-zoom');
for(const [name,label,action] of [['imgMinus.svg','Zoom out',()=>{overviewZoom=Math.max(.75,overviewZoom-.1);sizeOverview();}],['imgPlus.svg','Zoom in',()=>{overviewZoom=Math.min(1.5,overviewZoom+.1);sizeOverview();}],['imgMaximize.svg','Fit dashboard',()=>{overviewZoom=1;sizeOverview();}]]){const b=el('button');b.title=label;b.setAttribute('aria-label',label);b.append(ovImage(name));b.onclick=action;zoomControls.append(b);}overview.append(zoomControls);
current.replaceChildren(el('small','Currently growing'),el('strong','Loading…'));
add.onclick=()=>tab('planting');
add.replaceChildren(el('span','+','ov-add-symbol'),el('span','Crop plans'));cropItems.children[1].querySelector('span').textContent='Rice Grain';
periodButton.remove();
for(const card of grid.querySelectorAll('.ov-chart')){const record=card.querySelector('button');record.textContent='Records';const dates=el('button','Dates','secondary');dates.onclick=()=>{document.body.classList.add('ov-dates-open');$('#period-panel').open=true;$('#period-panel').scrollIntoView({behavior:'smooth'});};const controls=el('div',undefined,'ov-chart-controls');controls.append(dates,record);card.append(controls);}
const labels={overview:'Dashboard',farm:'My Farm',forecasts:'Forecast',planting:'Crop Plans',journal:'Field Journal',learn:'Methods and Resources'};
for(const [page,label] of Object.entries(labels)){const b=document.querySelector('[data-tab="'+page+'"]');const caption=el('span',label,'ov-nav-caption');b.append(caption);}

if(state)renderOverviewDesign();
})();
