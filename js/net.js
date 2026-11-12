// Klient sieciowy: WebSocket z automatycznym ponownym łączeniem.
export async function netAvailable(){
  try{const r=await fetch('healthz',{cache:'no-store'});if(!r.ok)return false;const j=await r.json();return j.ok===true}catch{return false}
}
export function connectNet({onMsg,onStatus}){
  let ws,closed=false,tries=0,timer;
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+(location.pathname.replace(/[^/]*$/,'')||'/')+'ws';
  const opened=new Promise(res=>{
    const open=()=>{
      ws=new WebSocket(url);
      ws.onopen=()=>{tries=0;onStatus('open');res()};
      ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}onMsg(m)};
      ws.onclose=()=>{onStatus('closed');if(!closed)timer=setTimeout(open,Math.min(5000,400*2**tries++))};
      ws.onerror=()=>{try{ws.close()}catch{}};
    };
    open();
  });
  const ping=setInterval(()=>{if(ws?.readyState===1)ws.send('{"t":"ping"}')},20000);
  return {
    opened,
    send(o){if(ws?.readyState===1){ws.send(JSON.stringify(o));return true}return false},
    close(){closed=true;clearTimeout(timer);clearInterval(ping);try{ws.close()}catch{}}
  };
}
