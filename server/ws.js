// Minimalny serwer WebSocket (RFC 6455) bez zależności zewnętrznych.
import crypto from 'node:crypto';
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE=64*1024;

export function acceptUpgrade(req,socket,{onMessage,onClose,allowOrigin}){
  const key=req.headers['sec-websocket-key'];
  const origin=req.headers.origin;
  if(!key||String(req.headers.upgrade).toLowerCase()!=='websocket'||(allowOrigin&&origin&&!allowOrigin(origin))){
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return null;
  }
  const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let buf=Buffer.alloc(0),frag=[],fragLen=0,closed=false;
  const conn={
    alive:true,
    send(obj){if(closed)return;try{socket.write(frame(0x1,Buffer.from(JSON.stringify(obj))))}catch{}},
    ping(){if(!closed)try{socket.write(frame(0x9,Buffer.alloc(0)))}catch{}},
    close(code=1000){if(closed)return;closed=true;try{const b=Buffer.alloc(2);b.writeUInt16BE(code);socket.end(frame(0x8,b))}catch{}},
    get closed(){return closed}
  };
  const finish=()=>{if(closed&&conn._notified)return;closed=true;if(!conn._notified){conn._notified=true;onClose?.(conn)}};
  socket.on('data',chunk=>{
    buf=Buffer.concat([buf,chunk]);
    if(buf.length>MAX_MESSAGE*2){conn.close(1009);socket.destroy();return}
    for(;;){
      const f=parse(buf);
      if(f===null)break;
      if(f==='bad'){conn.close(1002);socket.destroy();return}
      buf=buf.subarray(f.used);
      if(f.op===0x8){conn.close();return}
      if(f.op===0x9){try{socket.write(frame(0xA,f.payload))}catch{}continue}
      if(f.op===0xA){conn.alive=true;continue}
      if(f.op===0x1||f.op===0x0||f.op===0x2){
        if(f.op!==0x0&&frag.length)frag=[],fragLen=0;
        frag.push(f.payload);fragLen+=f.payload.length;
        if(fragLen>MAX_MESSAGE){conn.close(1009);socket.destroy();return}
        if(f.fin){const msg=Buffer.concat(frag).toString('utf8');frag=[];fragLen=0;conn.alive=true;try{onMessage(conn,msg)}catch(e){console.error('ws handler',e)}}
      }
    }
  });
  socket.on('close',finish);socket.on('end',finish);socket.on('error',()=>{finish();socket.destroy()});
  return conn;
}

function frame(op,payload){
  const n=payload.length;let h;
  if(n<126)h=Buffer.from([0x80|op,n]);
  else if(n<65536){h=Buffer.alloc(4);h[0]=0x80|op;h[1]=126;h.writeUInt16BE(n,2)}
  else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}
  return Buffer.concat([h,payload]);
}
function parse(b){
  if(b.length<2)return null;
  const fin=!!(b[0]&0x80),op=b[0]&0x0f,masked=!!(b[1]&0x80);let len=b[1]&0x7f,off=2;
  if(b[0]&0x70)return 'bad';
  if(!masked)return 'bad';
  if(len===126){if(b.length<4)return null;len=b.readUInt16BE(2);off=4}
  else if(len===127){if(b.length<10)return null;const big=b.readBigUInt64BE(2);if(big>BigInt(MAX_MESSAGE*2))return 'bad';len=Number(big);off=10}
  if(len>MAX_MESSAGE*2)return 'bad';
  if(b.length<off+4+len)return null;
  const mask=b.subarray(off,off+4),payload=Buffer.from(b.subarray(off+4,off+4+len));
  for(let i=0;i<len;i++)payload[i]^=mask[i&3];
  return {fin,op,payload,used:off+4+len};
}
