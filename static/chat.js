/* Chat uses the same backend services as the forms. Confirmed writes refresh the page state. */
let chatSession=read('agriforesight-chat-session',null);if(!chatSession){chatSession=crypto.randomUUID();save('agriforesight-chat-session',chatSession);}let chatBusy=false;
function chatBubble(text,who){const bubble=el('article',text,'chat-bubble '+who);$('#chat-log').append(bubble);const scroller=document.querySelector('.assistant-scroll');scroller.scrollTop=scroller.scrollHeight;return bubble;}
async function sendChat(message,confirmationId=null){if(chatBusy)return;chatBusy=true;$('#chat-send').disabled=true;document.querySelectorAll('[data-chat]').forEach(b=>b.disabled=true);chatBubble(message,'user');const waiting=chatBubble('One moment…','assistant');try{if(message==='Update weather'){await api('/api/forecast',{});await refresh();message='Check weather';}const r=await api('/api/chat',{message,session:chatSession,confirmation_id:confirmationId});renderChatReply(waiting,r);if(r.navigate&&['farm','forecasts','planting','climate','journal','overview','learn'].includes(r.navigate)){tab(r.navigate);setAssistantOpen(false);}if(r.changed){for(const [name,value] of Object.entries(r.updated_fields||{})){if(['name','area','terrain','water','crop','previous_crop','crop_stage','planting_date','ph','previous_ph','nitrogen','phosphorus','potassium','sample_date','soil_method','ash'].includes(name)){const field=$('#farm-form').elements.namedItem(name);if(field){if(field.type==='checkbox')field.checked=value;else field.value=value??'';}}}await refresh();}const scroller=document.querySelector('.assistant-scroll');scroller.scrollTop=scroller.scrollHeight;}catch(e){waiting.textContent='Couldn’t finish that: '+e.message+' Your message is still below so you can try again.';$('#chat-message').value=message;}finally{chatBusy=false;$('#chat-send').disabled=false;document.querySelectorAll('[data-chat]').forEach(b=>b.disabled=false);}}
$('#chat-form').onsubmit=e=>{e.preventDefault();const message=$('#chat-message').value.trim();if(!message||chatBusy)return;$('#chat-message').value='';sendChat(message);};document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>sendChat(b.dataset.chat));

function setAssistantOpen(open){$('#assistant').hidden=!open;$('#chat-toggle').setAttribute('aria-expanded',String(open));if(open){$('#chat-message').focus({preventScroll:true});}else{$('#chat-toggle').focus({preventScroll:true});}}
$('#chat-toggle').onclick=()=>setAssistantOpen($('#assistant').hidden);
$('#chat-close').onclick=()=>setAssistantOpen(false);
$('#assistant').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();setAssistantOpen(false);}});

function renderChatReply(waiting,r){waiting.textContent=r.text;$('#chat-mode').textContent=r.mode==='AI-assisted'?'Chat uses recent messages and basic farm details with '+r.provider+'.':'Guided mode · try the buttons or a short phrase.';if(r.days)waiting.append(makeTable(['Day','Rain (mm)','Average °C'],r.days.map(d=>[d.date,num(d.rain),num(d.temp)])));if(r.sources){const details=el('details');details.append(el('summary','Where this comes from'));for(const source of r.sources){const p=el('p'),link=el('a',source.title);link.href=source.url;link.target='_blank';link.rel='noreferrer';p.append(link);details.append(p);}waiting.append(details);}const choices=el('div',undefined,'chat-choices');for(const choice of r.choices){const b=el('button',choice,'secondary');b.type='button';b.onclick=()=>sendChat(choice,r.confirmation_id);choices.append(b);}if(r.open_page){const b=el('button','Open full details','secondary');b.onclick=()=>tab(r.open_page);choices.append(b);}waiting.append(choices);if(r.target_field){const b=el('button','Show the farm field','secondary');b.onclick=()=>{tab('farm');const field=$('#farm-form').elements.namedItem(r.target_field);if(!field)return;field.classList.add('assistant-target');field.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>field.classList.remove('assistant-target'),4000);setAssistantOpen(false);field.focus({preventScroll:true});};choices.append(b);}}

async function restoreChat(){
    chatBusy=true;$('#chat-send').disabled=true;
    document.querySelectorAll('[data-chat]').forEach(b=>b.disabled=true);
    try{
        const response=await api('/api/chat/history?session='+encodeURIComponent(chatSession));
        if(response.messages.length){
            $('#chat-log').replaceChildren();
            response.messages.forEach((entry,index)=>{
                const bubble=chatBubble(entry.text,entry.role);
                if(entry.role==='assistant'){
                    renderChatReply(bubble,entry);
                    if(index!==response.messages.length-1)bubble.querySelectorAll('button').forEach(b=>b.disabled=true);
                }
            });
        }
    }catch(e){$('#chat-mode').textContent='Couldn’t load earlier messages. You can still send a message.';}
    finally{chatBusy=false;$('#chat-send').disabled=false;document.querySelectorAll('[data-chat]').forEach(b=>b.disabled=false);}
}
$('#chat-new').onclick=async()=>{
    if(chatBusy)return;
    chatBusy=true;$('#chat-new').disabled=true;$('#chat-send').disabled=true;
    try{
        await api('/api/chat/reset',{session:chatSession});
        $('#chat-log').replaceChildren();$('#chat-message').value='';
        chatBubble('What’s happening on your farm today?','assistant');
        $('#chat-message').focus();
    }catch(e){chatBubble('Couldn’t start a new chat. Please try again.','assistant');}
    finally{chatBusy=false;$('#chat-new').disabled=false;$('#chat-send').disabled=false;}
};
restoreChat();
