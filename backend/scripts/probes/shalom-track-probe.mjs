import crypto from "node:crypto";
const BASE="https://shalom.com.pe", UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const key=crypto.randomBytes(32).toString("base64");
const dec=b=>{const r=Buffer.from(b,"base64");const d=crypto.createDecipheriv("aes-256-cbc",Buffer.from(key,"base64"),r.subarray(0,16));return Buffer.concat([d.update(r.subarray(16)),d.final()]).toString()};
const h={"User-Agent":UA,"X-Requested-With":"XMLHttpRequest",Origin:BASE,Referer:BASE+"/rastrea"};
const {csrf}=await (await fetch(BASE+"/api/local/session",{headers:{...h,"X-Session-Key":key}})).json();
async function post(path,body,extra={}){const r=await fetch(BASE+"/api/v1/web/"+path,{method:"POST",headers:{...h,"Content-Type":"application/json","X-Proxy-Token":csrf,"X-Session-Key":key,...extra},body:JSON.stringify(body)});let j=await r.json().catch(()=>null);if(j?.encrypted)j=dec(j.data);return [r.status,JSON.stringify(j).slice(0,250)]}
console.log("buscar sin auth/sin captcha", await post("rastrea/buscar",{numero:"12345678",codigo:"AB12",ose_id:"",recaptcha_token:""}));
console.log("buscar captcha falso", await post("rastrea/buscar",{numero:"12345678",codigo:"AB12",ose_id:"",recaptcha_token:"x"},{"X-Auth-Token":"null"}));
console.log("estados sin auth", await post("rastrea/estados",{ose_id:"1"}));
