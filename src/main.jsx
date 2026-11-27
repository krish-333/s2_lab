import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Bluetooth, Camera, Wifi, Terminal, Battery, Glasses, Radio, Plug, Unplug, RefreshCw, ChevronDown, ChevronRight, Copy, Download, ShieldAlert, Activity, Search, Zap, CircleHelp, Smartphone, Cable, FileText, SlidersHorizontal, Sparkles} from 'lucide-react';
import './style.css';

const UUIDS = {
  battery:'battery_service',
  deviceInfo:'device_information',
  // These are protocol leads from a separately reverse-engineered smart-glasses project.
  // They are NOT confirmed for every S2 Max revision.
  candidateService:'0000aa12-0000-1000-8000-00805f9b34fb',
  candidateWrite:'0000aa13-0000-1000-8000-00805f9b34fb',
  candidateNotify:'0000aa14-0000-1000-8000-00805f9b34fb',
  candidateMedia:'0000aa15-0000-1000-8000-00805f9b34fb',
  candidateOta:'0000ae00-0000-1000-8000-00805f9b34fb'
};
const COMMON=[0x1800,0x1801,0x180a,0x180f,0xfff0,0xffe0,0xfee0,0xfee7,0xae00,0xae30,0xff00,0xfd00,0xfe59,0xaa12,'6e400001-b5a3-f393-e0a9-e50e24dcca9e','6e40fff0-b5a3-f393-e0a9-e50e24dcca9e','7905f431-b5ce-4e99-a40f-4b1e122d00d0','de5bf728-d711-4e47-af26-65e3012a5dc7'];
const parseUuids=s=>s.split(/[\s,]+/).filter(Boolean).map(x=>/^[0-9a-f]{4}$/i.test(x)?parseInt(x,16):x.toLowerCase());
const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const NAV=[['overview',Activity,'Home'],['bluetooth',Bluetooth,'Bluetooth'],['camera',Camera,'Camera'],['wifi',Wifi,'Wi-Fi'],['terminal',Terminal,'Console']];
const u8=b=>b instanceof DataView?new Uint8Array(b.buffer,b.byteOffset,b.byteLength):new Uint8Array(b);
const ascii=b=>[...u8(b)].map(x=>x>=32&&x<127?String.fromCharCode(x):'.').join('');
const short = s => s?.length > 26 ? `${s.slice(0,13)}…${s.slice(-8)}` : s;
const hex = bytes => [...u8(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(' ').toUpperCase();
const parseHex = s => {
  const clean=s.replace(/0x/gi,'').replace(/[^a-fA-F0-9]/g,'');
  if(!clean || clean.length%2) throw new Error('Enter an even number of hexadecimal digits.');
  return new Uint8Array(clean.match(/.{2}/g).map(x=>parseInt(x,16)));
};
function App(){
 const [device,setDevice]=useState(null), [server,setServer]=useState(null), [services,setServices]=useState([]);
 const [selected,setSelected]=useState(null), [chars,setChars]=useState([]), [logs,setLogs]=useState([]);
 const [busy,setBusy]=useState(false), [hexInput,setHexInput]=useState(''), [writeTarget,setWriteTarget]=useState('');
 const [battery,setBattery]=useState(null), [tab,setTab]=useState('overview'), [filter,setFilter]=useState('');
 const logRef=useRef(null);
 const [allChars,setAllChars]=useState([]), [extra,setExtra]=useState(()=>store.get('s2-extra','')), [presets,setPresets]=useState(()=>store.get('s2-presets',[])), [listening,setListening]=useState({});
 const [photo,setPhoto]=useState(null), [prompt,setPrompt]=useState('What am I looking at? Be concise.'), [pw,setPw]=useState(()=>store.get('s2-pw','')), [answer,setAnswer]=useState(''), [asking,setAsking]=useState(false);
 const subs=useRef({});
 const bmpRef=useRef(null), [rot,setRot]=useState(0), [fit,setFit]=useState('original'), [hist,setHist]=useState(()=>store.get('s2-hist',[]));
 const [deep,setDeep]=useState(false), [adv,setAdv]=useState(null);
 const connected=!!server?.connected;
 const log=(kind,msg,detail='')=>setLogs(v=>[{id:Date.now()+Math.random(),time:new Date().toLocaleTimeString(),kind,msg,detail},...v].slice(0,250));
 useEffect(()=>{if(logRef.current)logRef.current.scrollTop=0},[logs]);
 useEffect(()=>{if(!device)return; const gone=()=>{setServer(null);setServices([]);setChars([]);setAllChars([]);setSelected(null);subs.current={};setListening({});log('warn','Glasses disconnected');}; device.addEventListener('gattserverdisconnected',gone); return ()=>device.removeEventListener('gattserverdisconnected',gone)},[device]);
 const supported=typeof navigator!=='undefined' && !!navigator.bluetooth;
 async function connect(){
  if(!supported){log('error','Web Bluetooth unavailable','Open this site in Chrome on Android or desktop Chromium over HTTPS.');return}
  setBusy(true);
  try{
   store.set('s2-extra',extra);log('info','Opening Bluetooth device picker');
   const d=await navigator.bluetooth.requestDevice({
    acceptAllDevices:true,
    optionalServices:[...new Set([UUIDS.battery,UUIDS.deviceInfo,...COMMON,...parseUuids(extra),...(deep?Array.from({length:65535},(_,i)=>i+1):[])])]
   });
   setDevice(d); log('success',`Selected ${d.name||'unnamed device'}`,d.id);
   const s=await d.gatt.connect(); setServer(s); log('success','GATT connection established');
   await discover(s);
  }catch(e){log('error',e.message||String(e));if(deep&&!/cancel|chosen|not found/i.test(e.message||''))log('warn','Deep scan may be too large for this browser','Untick Deep scan and connect again.')}
  finally{setBusy(false)}
 }
 async function discover(s=server){
  if(!s?.connected)return;
  setBusy(true);
  try{
   const found=await s.getPrimaryServices();
   setServices(found); log('success',`Discovered ${found.length} GATT service(s)`);
   const all=[];for(const sv of found){try{for(const c of await sv.getCharacteristics())all.push(c)}catch{}}setAllChars(all);
   if(!found.length)log('warn','No services exposed','Add the glasses’ service UUIDs under Bluetooth explorer > Extra service UUIDs (the nRF Connect app shows them), then reconnect.');
   const rd=all.filter(c=>c.properties.read), nf=all.filter(c=>c.properties.notify||c.properties.indicate);
   if(all.length)log('info',`Auto-reading ${rd.length} and listening to ${nf.length} characteristic(s)`,'Now press the glasses’ button or take a photo and watch the log.');
   for(const c of rd)await readChar(c);
   for(const c of nf)await subscribe(c);
   const b=found.find(x=>x.uuid===UUIDS.battery);
   if(b){try{const c=await b.getCharacteristic('battery_level');const v=await c.readValue();setBattery(v.getUint8(0));log('success',`Battery: ${v.getUint8(0)}%`)}catch(e){log('warn','Could not read battery',e.message)}}
   if(found.length){await chooseService(found[0],s)}
  }catch(e){log('error','Service discovery failed',e.message)}
  finally{setBusy(false)}
 }
 async function chooseService(s,sv=server){
  setSelected(s);setChars([]);
  try{const c=await s.getCharacteristics();setChars(c);log('info',`Loaded ${c.length} characteristic(s)`,s.uuid)}
  catch(e){log('error','Could not enumerate characteristics',e.message)}
 }
 async function readChar(c){
  try{const v=await c.readValue();const value=hex(v);log('read','Characteristic read',`${c.uuid} · ${value||'(empty)'} · ${ascii(v)}`);return value}
  catch(e){log('error','Read failed',e.message)}
 }
 async function subscribe(c){
  try{
   if(subs.current[c.uuid]){await c.stopNotifications();c.removeEventListener('characteristicvaluechanged',subs.current[c.uuid]);delete subs.current[c.uuid];setListening(v=>({...v,[c.uuid]:false}));log('info','Stopped listening',c.uuid);return}
   const h=ev=>{const v=ev.target.value;log('notify','Notification received',`${c.uuid} · ${hex(v)} · ${ascii(v)}`)};
   c.addEventListener('characteristicvaluechanged',h);await c.startNotifications();subs.current[c.uuid]=h;setListening(v=>({...v,[c.uuid]:true}));log('success','Listening',c.uuid)}
  catch(e){log('error','Notification subscription failed',e.message)}
 }
 async function write(target=writeTarget,text=hexInput){
  const c=allChars.find(x=>x.uuid===target); if(!c){log('error','Pick a writable characteristic first');return}
  try{const bytes=parseHex(text); if(c.properties.write)await c.writeValueWithResponse(bytes);else if(c.properties.writeWithoutResponse)await c.writeValueWithoutResponse(bytes);else throw new Error('This characteristic does not support writing');log('write','Bytes sent',`${c.uuid} · ${hex(bytes)}`)}
  catch(e){log('error','Write failed',e.message)}
 }
 function savePreset(){const name=prompt('Preset name');if(!name||!writeTarget||!hexInput.trim())return;const p=[...presets,{name,uuid:writeTarget,hex:hexInput}];setPresets(p);store.set('s2-presets',p)}
 function delPreset(i){const p=presets.filter((_,j)=>j!==i);setPresets(p);store.set('s2-presets',p)}
 async function sniff(){
  if(!supported){log('error','Web Bluetooth unavailable');return}
  try{
   const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true});
   if(!d.watchAdvertisements){log('warn','Advertisement sniffing is off in this browser','Open chrome://flags/#enable-experimental-web-platform-features, enable it, restart Chrome, try again.');return}
   const ac=new AbortController();
   d.addEventListener('advertisementreceived',ev=>setAdv({name:d.name||'(unnamed)',rssi:ev.rssi,uuids:[...ev.uuids],mf:[...ev.manufacturerData.entries()].map(([k,v])=>'0x'+k.toString(16)+': '+hex(v)),sd:[...ev.serviceData.entries()].map(([k,v])=>k+': '+hex(v))}));
   await d.watchAdvertisements({signal:ac.signal});log('info','Listening for advertisements for 15 seconds',d.name||d.id);
   setTimeout(()=>{ac.abort();log('info','Stopped listening for advertisements')},15000);
  }catch(e){log('error','Sniff failed',e.message)}
 }
 async function copyReport(){
  const pr=['read','write','writeWithoutResponse','notify','indicate'];
  const t=[`Device: ${device?.name||'-'}`,`Services: ${services.map(x=>x.uuid).join(', ')||'none'}`,...allChars.map(c=>`${c.service.uuid} / ${c.uuid} [${pr.filter(k=>c.properties[k]).join(',')}]`),'','LOG',...[...logs].reverse().map(l=>`${l.time} ${l.kind} ${l.msg} ${l.detail}`)].join('\n');
  try{await navigator.clipboard.writeText(t);log('success','Report copied to clipboard')}catch{log('error','Clipboard blocked','Use Save log in the Console tab instead.')}
 }
 function renderPhoto(b=bmpRef.current,r=rot,f=fit){
  if(!b)return;
  const sw=r%180?b.height:b.width, sh=r%180?b.width:b.height;
  const rc=document.createElement('canvas');rc.width=sw;rc.height=sh;const x=rc.getContext('2d');x.translate(sw/2,sh/2);x.rotate(r*Math.PI/180);x.drawImage(b,-b.width/2,-b.height/2);
  const ar={original:sw/sh,portrait:9/16,landscape:16/9,square:1}[f];let cw=sw,ch=sh;
  if(f!=='original'){if(sw/sh>ar)cw=Math.round(sh*ar);else ch=Math.round(sw/ar)}
  const k=Math.min(1,1280/Math.max(cw,ch));const oc=document.createElement('canvas');oc.width=Math.round(cw*k);oc.height=Math.round(ch*k);
  oc.getContext('2d').drawImage(rc,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,oc.width,oc.height);setPhoto(oc.toDataURL('image/jpeg',.85));
 }
 async function pickPhoto(e){const f=e.target.files[0];if(!f)return;bmpRef.current=await createImageBitmap(f);setRot(0);setFit('original');setAnswer('');renderPhoto(bmpRef.current,0,'original')}
 function turn(d){const r=(rot+d+360)%360;setRot(r);renderPhoto(undefined,r,fit)}
 function pickFit(f){setFit(f);renderPhoto(undefined,rot,f)}
 function speak(){try{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(answer))}catch{}}
 async function ask(){setAsking(true);setAnswer('');store.set('s2-pw',pw);try{const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json','x-app-password':pw},body:JSON.stringify({image:photo.split(',')[1],prompt})});const d=await r.json();const t=d.text||d.error||'No answer';setAnswer(t);if(d.text){const h=[{time:new Date().toLocaleString(),q:prompt,a:t},...hist].slice(0,10);setHist(h);store.set('s2-hist',h)}}catch(e){setAnswer('Request failed: '+e.message)}finally{setAsking(false)}}
 async function disconnect(){try{device?.gatt?.disconnect()}catch{} setServer(null);setServices([]);setChars([]);setAllChars([]);setSelected(null);subs.current={};setListening({});log('info','Disconnected')}
 const visibleServices=services.filter(s=>s.uuid.includes(filter.toLowerCase()));
 const exportLog=()=>{const blob=new Blob([logs.slice().reverse().map(x=>`${x.time} [${x.kind}] ${x.msg} ${x.detail}`).join('\n')],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='s2-lab-session.txt';a.click();URL.revokeObjectURL(a.href)};
 return <div className="app">
  <aside className="sidebar">
   <div className="brand"><div className="brandIcon"><Glasses size={21}/></div><div><b>S2 LAB</b><small>HARDWARE WORKBENCH</small></div></div>
   <div className="sideLabel">WORKSPACE</div>
   {[['overview',Activity,'Overview'],['bluetooth',Bluetooth,'Bluetooth explorer'],['camera',Camera,'Camera & media'],['wifi',Wifi,'Wi-Fi transfer'],['terminal',Terminal,'Command console']].map(([id,I,label])=><button key={id} className={`nav ${tab===id?'active':''}`} onClick={()=>setTab(id)}><I size={17}/>{label}{id==='bluetooth'&&connected&&<i className="dot"/>}</button>)}
   <div className="sideBottom"><div className="sideLabel">DEVICE</div><div className="deviceMini"><span className={`statusDot ${connected?'on':''}`}/><div><b>{device?.name||'No device connected'}</b><small>{connected?'GATT connected':'Waiting for connection'}</small></div></div><div className="sideFoot">S2 LAB <span>v0.1.0</span></div></div>
  </aside>
  <main className="main">
   <header className="topbar"><div className="crumb">Workbench <span>/</span> {tab[0].toUpperCase()+tab.slice(1)}</div><div className="topRight"><span className="secure"><span className="dotGreen"/> LIVE SESSION</span><button className="connectBtn" onClick={connected?disconnect:connect} disabled={busy}>{busy?<RefreshCw className="spin" size={15}/>:connected?<Unplug size={15}/>:<Bluetooth size={15}/>} {connected?'Disconnect':'Connect glasses'}</button></div></header>
   <div className="content">
    <div className="pageHead"><div><div className="eyebrow">SMART GLASSES / REVERSE ENGINEERING</div><h1>{tab==='overview'?'Your glasses. Your rules.':tab==='bluetooth'?'Bluetooth explorer':tab==='camera'?'Camera & media':tab==='wifi'?'Wi-Fi transfer':'Command console'}</h1><p>{tab==='overview'?'A private lab to inspect, understand and experiment with your S2 Max.':tab==='bluetooth'?'Discover the services and characteristics exposed by your glasses.':tab==='camera'?'Map the camera controls and media transfer path.':tab==='wifi'?'Investigate the glasses’ local network and media server.':'Inspect device traffic and carefully test raw GATT writes.'}</p></div><div className={`connectionPill ${connected?'live':''}`}><span className="dotGreen"/>{connected?'DEVICE ONLINE':'DEVICE OFFLINE'}</div></div>
    {tab==='overview'&&<><section className="hero"><div className="heroText"><div className="heroTag"><Zap size={13}/> EXPERIMENTAL DEVICE LAB</div><h2>Go beyond the<br/><em>companion app.</em></h2><p>Connect directly to the glasses, inspect their Bluetooth interface and uncover what the hardware can do.</p><button className="primary" onClick={connected?()=>setTab('bluetooth'):connect} disabled={busy}>{connected?'Explore Bluetooth':'Connect your S2 Max'} <ChevronRight size={16}/></button></div><div className="heroArt"><div className="orbit o1"/><div className="orbit o2"/><div className="glassesDrawing"><Glasses size={142} strokeWidth={1}/></div><div className="scanLine"/></div><div className="heroIndex">01 <span> / 04</span></div></section>
    <div className="sectionTitle"><div><h3>Hardware overview</h3><p>Live readings appear after connection.</p></div><span className="muted mono">S2 MAX · UNKNOWN REVISION</span></div>
    <div className="statGrid"><div className="stat"><div className="statIcon"><Bluetooth/></div><small>BLUETOOTH</small><b>{connected?'Connected':'Not connected'}</b><span>{device?.name||'Awaiting device'}</span></div><div className="stat"><div className="statIcon"><Battery/></div><small>BATTERY</small><b>{battery===null?'—':`${battery}%`}</b><span>{battery===null?'Not yet read':'Reported by device'}</span></div><div className="stat"><div className="statIcon"><Radio/></div><small>GATT SERVICES</small><b>{services.length||'—'}</b><span>{connected?'Services discovered':'Awaiting scan'}</span></div><div className="stat"><div className="statIcon"><Camera/></div><small>CAMERA</small><b>Unmapped</b><span>Protocol discovery needed</span></div></div>
    <div className="sectionTitle"><div><h3>Exploration modules</h3><p>Start with discovery before sending commands.</p></div></div><div className="moduleGrid">{[['bluetooth',Bluetooth,'Bluetooth explorer','Inspect services, characteristics and notifications.'],['camera',Camera,'Camera & media','Map photo, video and file-transfer commands.'],['wifi',Wifi,'Wi-Fi transfer','Look for a camera-hosted network and media API.'],['terminal',Terminal,'Command console','Capture traffic and test known-safe payloads.']].map(([id,I,t,d])=><button className="module" onClick={()=>setTab(id)} key={id}><div className="moduleIcon"><I/></div><div><b>{t}</b><p>{d}</p></div><ChevronRight size={17}/></button>)}</div></>}
    {tab==='bluetooth'&&<><div className="panel"><div className="panelHead"><div><h3><Bluetooth size={17}/> GATT device explorer</h3><p>Read-only discovery first. No undocumented commands are sent automatically.</p></div><button className="subBtn" onClick={()=>discover()} disabled={!connected||busy}><RefreshCw size={14}/> Refresh</button></div><div className="consoleForm extraBox"><label>EXTRA SERVICE UUIDS (USED AT NEXT CONNECT)</label><input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="e.g. 6e400001-b5a3-f393-e0a9-e50e24dcca9e, fff0"/><small>Chrome hides every service not listed here. These tools find them for you.</small><div className="btnRow" style={{marginTop:10}}><button className="subBtn" onClick={sniff}>Sniff advertised UUIDs</button><label className="chk"><input type="checkbox" checked={deep} onChange={e=>setDeep(e.target.checked)}/> Deep scan all 16-bit services</label><button className="subBtn" onClick={copyReport}>Copy report</button></div>{adv&&<div className="answer"><b>{adv.name}</b> · signal {adv.rssi} dBm{'\n'}Advertised services: {adv.uuids.join(', ')||'none'}{'\n'}Manufacturer data: {adv.mf.join(' | ')||'none'}{'\n'}Service data: {adv.sd.join(' | ')||'none'}{adv.uuids.length>0&&<div style={{marginTop:10}}><button className="subBtn" onClick={()=>setExtra(v=>[v,...adv.uuids].filter(Boolean).join(', '))}>Add these UUIDs, then reconnect</button></div>}</div>}</div>{!connected?<div className="empty"><Bluetooth size={30}/><b>Connect your glasses to begin</b><span>Use Chrome on Android, turn on the glasses, then connect.</span><button className="primary" onClick={connect} disabled={busy}>Scan for devices <ChevronRight size={15}/></button></div>:<div className="explorer"><div className="serviceList"><div className="listHead">SERVICES <span>{services.length}</span></div><input className="search" placeholder="Filter UUID…" value={filter} onChange={e=>setFilter(e.target.value)}/>{visibleServices.map(s=><button className={`service ${selected?.uuid===s.uuid?'chosen':''}`} key={s.uuid} onClick={()=>chooseService(s)}><ChevronRight size={14}/><span>{s.uuid}</span></button>)}</div><div className="charList"><div className="listHead">CHARACTERISTICS <span>{chars.length}</span></div>{selected&&<div className="selectedUuid">SERVICE / {selected.uuid}</div>}{chars.map(c=><div className="char" key={c.uuid}><div className="charTop"><b>{short(c.uuid)}</b><div className="props">{['read','write','writeWithoutResponse','notify','indicate'].filter(p=>c.properties[p]).map(p=><i key={p}>{p==='writeWithoutResponse'?'write NR':p}</i>)}</div></div><div className="charActions">{c.properties.read&&<button onClick={()=>readChar(c)}>Read</button>}{(c.properties.notify||c.properties.indicate)&&<button onClick={()=>subscribe(c)}>{listening[c.uuid]?'Stop listening':'Listen'}</button>}{(c.properties.write||c.properties.writeWithoutResponse)&&<button onClick={()=>{setWriteTarget(c.uuid);setTab('terminal')}}>Use in console</button>}</div></div>)}{!selected&&<div className="empty small">Select a service to inspect its characteristics.</div>}</div></div>}</div><div className="notice"><ShieldAlert size={17}/><div><b>Protocol note</b><span>UUIDs beginning AA12–AA15 are a research lead from a different smart-glasses reverse-engineering project, not a confirmed S2 Max specification. Your device's discovered services take priority.</span></div></div></>}
    {tab==='camera'&&<><div className="twoPanels"><div className="panel"><div className="panelHead"><div><h3><Camera size={17}/> Camera controls</h3><p>Controls are not mapped yet. Until the Bluetooth command is found, use Rotate and Portrait in Photo lab.</p></div><span className="tag">NOT MAPPED</span></div><div className="empty"><Camera size={30}/><b>Waiting for camera protocol</b><span>First discover BLE services. Then we can identify the shutter, recording and media-transfer commands from observed app traffic.</span><button className="subBtn" onClick={()=>setTab('bluetooth')}>Open Bluetooth explorer <ChevronRight size={14}/></button></div></div><div className="panel"><div className="panelHead"><div><h3><FileText size={17}/> Media transfer</h3><p>Potentially a separate Wi-Fi workflow.</p></div></div><div className="infoRows"><div><span>Photo capture</span><b>Unverified</b></div><div><span>Video recording</span><b>Unverified</b></div><div><span>Local file listing</span><b>Unverified</b></div><div><span>Live preview</span><b>Unverified</b></div></div></div></div>
    <div className="panel" style={{marginTop:18}}><div className="panelHead"><div><h3><Sparkles size={17}/> Photo lab</h3><p>Import a photo from the glasses with RDGlass, pick it here and ask Gemini about it.</p></div></div><div className="consoleForm"><label>PHOTO (FROM GALLERY OR CAMERA)</label><input type="file" accept="image/*" onChange={pickPhoto}/><input type="file" accept="image/*" capture="environment" onChange={pickPhoto}/>{photo&&<><div className="presets" style={{margin:'0 0 10px'}}><button className="subBtn" onClick={()=>turn(-90)}>Rotate left</button><button className="subBtn" onClick={()=>turn(90)}>Rotate right</button>{[['original','Original'],['portrait','Portrait 9:16'],['landscape','Landscape 16:9'],['square','Square']].map(([k,l])=><button key={k} className={'subBtn'+(fit===k?' on':'')} onClick={()=>pickFit(k)}>{l}</button>)}</div><img className="preview" src={photo} alt="Selected photo"/></>}<label>QUESTION</label><div className="presets" style={{margin:'0 0 10px'}}>{[['Describe','What am I looking at? Be concise.'],['Read text','Read all the text in this photo exactly, then summarise it.'],['Translate','Translate any text in this photo to English.'],['Identify','Identify the main object and tell me what it is used for.'],['Next step','What should I do next, based on what is in this photo?']].map(([l,q])=><button key={l} className="subBtn" onClick={()=>setPrompt(q)}>{l}</button>)}</div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)}/><label>APP PASSWORD (IF SET IN VERCEL)</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)}/><button className="primary" onClick={ask} disabled={!photo||asking}>{asking?'Thinking…':'Ask Gemini'} <Sparkles size={14}/></button>{answer&&<><div className="answer">{answer}</div><div className="btnRow" style={{marginTop:10}}><button className="subBtn" onClick={speak}>Read aloud</button><button className="subBtn" onClick={()=>navigator.clipboard.writeText(answer)}>Copy</button></div></>}{hist.length>0&&<div style={{marginTop:18}}><label>RECENT ANSWERS</label>{hist.map((h,i)=><details key={i} className="hist"><summary>{h.q.slice(0,60)} · {h.time}</summary><div className="answer">{h.a}</div></details>)}<button className="subBtn" onClick={()=>{setHist([]);store.set('s2-hist',[])}}>Clear history</button></div>}</div></div></>}
    {tab==='wifi'&&<div className="panel"><div className="panelHead"><div><h3><Wifi size={17}/> Local Wi-Fi investigation</h3><p>Some S2 Max variants may hand off media transfer to Wi-Fi.</p></div><span className="tag">EXPERIMENTAL</span></div><div className="notice inPanel"><ShieldAlert size={17}/><div><b>How this will work</b><span>We first need to learn whether your glasses create a Wi-Fi hotspot or join your phone's network. A browser cannot silently switch your phone's Wi-Fi network; this step may require Android system settings.</span></div></div><div className="infoRows"><div><span>BLE Wi-Fi handoff command</span><b>Not identified</b></div><div><span>Glasses IP address</span><b>Unknown</b></div><div><span>Media HTTP endpoint</span><b>Unknown</b></div></div></div>}
    {tab==='terminal'&&<><div className="notice"><ShieldAlert size={17}/><div><b>Experimental writes can change device state.</b><span>Only send bytes after we identify the correct characteristic and payload. Avoid firmware/OTA characteristics and unknown reset commands.</span></div></div><div className="panel consolePanel"><div className="panelHead"><div><h3><Terminal size={17}/> Raw GATT console</h3><p>Manual hex writes and event log.</p></div><button className="subBtn" onClick={exportLog}><Download size={14}/> Export log</button></div><div className="consoleForm"><label>WRITE CHARACTERISTIC</label><select value={writeTarget} onChange={e=>setWriteTarget(e.target.value)}><option value="">Choose a writable characteristic</option>{allChars.filter(c=>c.properties.write||c.properties.writeWithoutResponse).map(c=><option key={c.uuid} value={c.uuid}>{c.uuid}</option>)}</select><label>PAYLOAD (HEX BYTES)</label><input value={hexInput} onChange={e=>setHexInput(e.target.value)} placeholder="e.g. 01 02 0A FF"/><div className="btnRow"><button className="dangerBtn" onClick={()=>write()} disabled={!connected||!writeTarget||!hexInput.trim()}>Send raw bytes <Zap size={14}/></button><button className="subBtn" onClick={savePreset} disabled={!writeTarget||!hexInput.trim()}>Save preset</button></div><div className="presets">{presets.map((p,i)=><span className="chip" key={i}><button onClick={()=>write(p.uuid,p.hex)} disabled={!connected}>{p.name}</button><button onClick={()=>delPreset(i)} aria-label="Delete preset">×</button></span>)}</div></div><div className="logHead"><b>SESSION LOG</b><button onClick={()=>setLogs([])}>Clear log</button></div><div className="logs" ref={logRef}>{logs.length?logs.map(l=><div className="logRow" key={l.id}><time>{l.time}</time><span className={`logKind ${l.kind}`}>{l.kind}</span><div><b>{l.msg}</b>{l.detail&&<small>{l.detail}</small>}</div></div>):<div className="empty small">No events yet. Connect the glasses to start capturing the session.</div>}</div></div></>}
    <footer><span>S2 LAB / BUILT FOR DISCOVERY</span><span>Bluetooth traffic stays in this browser. A photo goes to your own Vercel function only when you tap Ask Gemini.</span></footer>
   </div>
  </main>
  <nav className="mobnav">{NAV.map(([id,I,l])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><I size={18}/>{l}</button>)}</nav>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
