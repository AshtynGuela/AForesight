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
const current=el('button',undefined,'ov-crop');current.id='ov-current-crop';current.onclick=()=>tab('farm');cropItems.append(current);const add=el('button','ï¼‹ Edit crop','ov-crop');add.onclick=()=>tab('farm');cropItems.append(add);cropsBox.append(cropItems);
const summary=el('div',undefined,'ov-summary');oldOverview.append($('#farm-summary'));summary.append(el('h2','Your farm at a glance'),$('#farm-summary'));const shortcuts=el('div',undefined,'ov-shortcuts');for(const [label,page] of [['Edit farm details','farm'],['Write a field note','journal'],['Check the forecast','forecasts']]){const b=el('button',label,'secondary');b.onclick=()=>tab(page);shortcuts.append(b);}summary.append(shortcuts);
const tip=el('div',undefined,'ov-tip');const tipCopy=el('div',undefined,'ov-tip-copy');tipCopy.append(el('h2','A suggestion for your farm'));const tipText=el('p');tipText.id='ov-tip-text';tipCopy.append(tipText);const details=el('button','See details','secondary');details.onclick=()=>{oldOverview.open=true;$('#recommendations').scrollIntoView({behavior:'smooth'});};tipCopy.append(details);const tipBackdrop=ovImage('imgRectangle.svg');tipBackdrop.className='ov-tip-backdrop';tip.append(tipBackdrop,tipCopy,ovImage('imgFarmerImg.png','Farmer holding vegetables'));
function chartCard(heading,id){const card=el('div',undefined,'ov-chart');card.append(el('h2',heading));const source=el('p',undefined,'source');source.classList.add('ov-chart-source');card.append(source);const plotBox=el('div',undefined,'plot');plotBox.id=id;card.append(plotBox);const b=el('button','View records','secondary');b.onclick=()=>tab('climate');card.append(b);return card;}
grid.append(cropsBox,summary,tip,chartCard('Past rainfall','ov-rain'),chartCard('Past temperature','ov-temp'));
overview.prepend(top,stats,grid);
// Larger date ranges use averages of recorded days, never treat missing days as zero.
const shortDate=date=>new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
function renderWeatherChart(selector,days,field){
  const host=$(selector);host.replaceChildren();
  const valid=days.filter(d=>Number.isFinite(d[field])&&(field!=='rain'||d[field]>=0));
  if(!valid.length){host.append(el('p','No readings for these dates. Choose other dates or add weather records.'));return;}
  const rain=field==='rain',unit=rain?'mm/day':'°C';
  const period=state.analysis_period;
  const start=period?.start||days[0].date,end=period?.end||days.at(-1).date;
  const count=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
  const step=count>120?30:count>45?7:1;
  const bins=[];
  for(let i=0;i<count;i+=step){const from=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);const to=new Date(Date.parse(start)+Math.min(i+step-1,count-1)*86400000).toISOString().slice(0,10);const rows=valid.filter(d=>d.date>=from&&d.date<=to);bins.push({from,to,n:rows.length,value:rows.length?rows.reduce((sum,d)=>sum+d[field],0)/rows.length:null});}
  const average=valid.reduce((sum,d)=>sum+d[field],0)/valid.length;
  const summary=el('div',undefined,'ov-weather-summary');
  summary.append(el('strong',num(average)+' '+unit),el('span',rain?'Average rain per recorded day':'Average daily temperature'));
  if(rain){const r=rainfallSummary(days,start,end);summary.append(el('p',`Longest dry spell: ${r.longest} ${r.longest===1?'day':'days'} in a row with less than 1 mm of rain.`));}
  else {const warmest=valid.reduce((a,b)=>a.temp>=b.temp?a:b);summary.append(el('p',`Warmest daily average: ${num(warmest.temp)} °C on ${shortDate(warmest.date)}.`));}
  host.append(summary,el('p',`${valid.length} of ${count} days recorded. ${step===1?'Daily readings':step+'-day groups: average of recorded days'}. Missing readings are left blank.`,'ov-chart-explanation'));
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 560 240');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${rain?'Rainfall bars':'Temperature line'} from ${start} to ${end}, ${unit}. Read the values below.`);
  const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
  const values=bins.filter(b=>b.value!==null).map(b=>b.value);const low=rain?0:Math.floor(Math.min(...values)-1),high=rain?Math.max(1,Math.ceil(Math.max(...values))):Math.ceil(Math.max(...values)+1);
  const x=i=>56+(i+.5)*484/bins.length,y=v=>194-(v-low)/(high-low)*154;
  for(let i=0;i<=4;i++){const v=low+(high-low)*i/4;add('line',{x1:56,x2:540,y1:y(v),y2:y(v),stroke:'#b6bdad','stroke-dasharray':'3 4'});add('text',{x:48,y:y(v)+5,'text-anchor':'end'},num(v));}
  add('text',{x:56,y:20},rain?'Rain (mm per day)':'Daily average (°C)');
  let previous=null;
  bins.forEach((b,i)=>{if(b.value===null){previous=null;return;}let mark;
    if(rain)mark=add('rect',{x:x(i)-Math.max(2,484/bins.length*.65)/2,y:y(b.value),width:Math.max(2,484/bins.length*.65),height:Math.max(1,194-y(b.value)),rx:2,fill:'#376eb2'});
    else {if(previous!==null)add('line',{x1:x(previous),y1:y(bins[previous].value),x2:x(i),y2:y(b.value),stroke:'#bd4b24','stroke-width':3});mark=add('circle',{cx:x(i),cy:y(b.value),r:3.5,fill:'#bd4b24'});previous=i;}
    const title=document.createElementNS(ns,'title');title.textContent=`${b.from} to ${b.to}: ${num(b.value)} ${unit} (${b.n} days recorded)`;mark.append(title);
  });
  [...new Set([0,Math.floor((bins.length-1)/2),bins.length-1])].forEach(i=>add('text',{x:x(i),y:222,'text-anchor':i===0?'start':i===bins.length-1?'end':'middle'},shortDate(bins[i].from)));
  host.append(svg);
  const readings=el('details',undefined,'ov-readings');readings.append(el('summary','Read the values'),makeTable(['Date / period',rain?'Rain (mm/day)':'Daily average (°C)','Days recorded'],bins.map(b=>[b.from===b.to?b.from:b.from+' to '+b.to,b.value===null?'No reading':num(b.value),b.n])));host.append(readings);
}
function renderOverviewDesign(){if(!state)return;const farm=state.farm;$('#farm-title').textContent=farm.name;coords.textContent=Number(farm.latitude).toFixed(4)+' N  '+Number(farm.longitude).toFixed(4)+' E';placeValue.textContent=farm.municipality;current.replaceChildren(el('small','Currently growing'),el('strong',farm.crop));current.title='Edit your current crop';current.onclick=()=>tab('farm');current.setAttribute('aria-label','Current crop: '+farm.crop+'. Edit crop');
const days=[...visibleHistory()].sort((a,b)=>a.date.localeCompare(b.date));const rain=days.filter(d=>Number.isFinite(d.rain)&&d.rain>=0);const temp=days.filter(d=>Number.isFinite(d.temp));$('#rain-label').textContent='Average daily rainfall';$('#rain-stat').textContent=rain.length?num(rain.reduce((s,d)=>s+d.rain,0)/rain.length)+' mm/day':'â€”';$('#rain-caption').textContent='Daily average across '+rain.length+' recorded days';stats.children[0].title=$('#rain-caption').textContent;$('#temp-label').textContent='Past temperature';$('#temp-stat').textContent=temp.length?num(temp.reduce((s,d)=>s+d.temp,0)/temp.length)+' °C':'â€”';$('#temp-caption').textContent='Average over '+temp.length+' recorded days';stats.children[1].title=$('#temp-caption').textContent;
const label=days.length?days[0].date+' to '+days.at(-1).date:'No saved readings for these dates';overview.querySelectorAll('.ov-chart-source').forEach(n=>n.textContent=label);
renderWeatherChart('#ov-rain',days,'rain');renderWeatherChart('#ov-temp',days,'temp');
if(!farm.sample_date)$('#soil-status').textContent='No sample data yet';
const first=$('#recommendations article');tipText.textContent=first?(first.querySelector('h3')?.textContent||'')+' â€” '+(first.querySelector('p')?.textContent||''):'Add your farm details and weather records to see suggested actions.';
}
const overviewRenderOriginal=render;render=function(){overviewRenderOriginal();renderOverviewDesign();};

const navAssets={overview:'imgGroup3.svg',farm:'imgGroup1.svg',forecasts:'imgCloudSunny.svg',planting:'imgGroup2.svg',journal:'imgEdit.svg',learn:'imgGroup.svg'};
for(const [page,name] of Object.entries(navAssets)){const button=document.querySelector('[data-tab="'+page+'"]');if(button){const icon=ovImage(name);icon.className='ov-nav-icon';button.prepend(icon);}}
const figmaBrand=el('div',undefined,'ov-brand');figmaBrand.append(ovImage('imgOl341U1Ht27Ph8Cntfnthquq0L1.png'),el('strong','AgriForesight'));document.querySelector('aside').prepend(figmaBrand);

// Match the 1440 Ã— 1024 Figma canvas on desktop; keep the mobile reflow below 750px.
let overviewZoom=1;
function sizeOverview(){document.documentElement.style.setProperty('--overview-text-scale',String(overviewZoom));}
window.addEventListener('resize',sizeOverview);sizeOverview();
const zoomControls=el('div',undefined,'ov-zoom');
for(const [name,label,action] of [['imgMinus.svg','Zoom out',()=>{overviewZoom=Math.max(.75,overviewZoom-.1);sizeOverview();}],['imgPlus.svg','Zoom in',()=>{overviewZoom=Math.min(1.5,overviewZoom+.1);sizeOverview();}],['imgMaximize.svg','Fit dashboard',()=>{overviewZoom=1;sizeOverview();}]]){const b=el('button');b.title=label;b.setAttribute('aria-label',label);b.append(ovImage(name));b.onclick=action;zoomControls.append(b);}overview.append(zoomControls);
current.replaceChildren(el('small','Currently growing'),el('strong','Loadingâ€¦'));
add.onclick=()=>tab('planting');
add.replaceChildren(el('span','+','ov-add-symbol'),el('span','Crop plans'));cropItems.children[1].querySelector('span').textContent='Rice Grain';
periodButton.remove();
for(const card of grid.querySelectorAll('.ov-chart')){const record=card.querySelector('button');record.textContent='Records';const dates=el('button','Dates','secondary');dates.onclick=()=>{document.body.classList.add('ov-dates-open');$('#period-panel').open=true;$('#period-panel').scrollIntoView({behavior:'smooth'});};const controls=el('div',undefined,'ov-chart-controls');controls.append(dates,record);card.append(controls);}
const labels={overview:'Dashboard',farm:'My Farm',forecasts:'Forecast',planting:'Crop Plans',journal:'Field Journal',learn:'Methods and Resources'};
for(const [page,label] of Object.entries(labels)){const b=document.querySelector('[data-tab="'+page+'"]');const caption=el('span',label,'ov-nav-caption');b.append(caption);}

if(state)renderOverviewDesign();
})();
