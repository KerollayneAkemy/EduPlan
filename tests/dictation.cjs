const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync('static/app.js','utf8');
const code=source.slice(source.indexOf('function microphone(){'),source.indexOf('async function init(){'));
function setup({supported=true,secure=true,throws=false,stopThrows=false}={}){
 const nodes={},listeners={},timers=new Map();let recognition,nextTimer=0;
 const $=id=>nodes[id]??=( {value:'Texto inicial.',textContent:'',hidden:true,disabled:false,readOnly:false,
  classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},focus(){}} );
 class Speech{constructor(){recognition=this;}start(){if(throws)throw Error('blocked');this.started=true;}stop(){if(stopThrows)throw Error('stop failed');this.stopped=true;}abort(){this.aborted=true;}}
 vm.runInNewContext(code+';microphone();',{$,busy:false,on:(id,event,fn)=>listeners[id]=fn,window:{isSecureContext:secure,SpeechRecognition:supported?Speech:undefined},setTimeout:(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout:id=>timers.delete(id)});
 return {$,listeners,get recognition(){return recognition;},expire(ms){for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}}};
}
let t=setup({supported:false});assert.match(t.$('mic-label').textContent,/indisponível/);t.listeners.mic();assert.match(t.$('dictation-status').textContent,/navegador/);
t=setup({secure:false});assert.match(t.$('dictation-status').textContent,/HTTPS/);
t=setup();t.listeners.mic();assert.equal(t.recognition.lang,'pt-BR');assert.equal(t.$('send').disabled,true);assert.equal(t.$('mic-label').textContent,'Cancelar');
t.recognition.onstart();t.recognition.onresult({results:[[{transcript:'Atividade de frações.'}]]});assert.equal(t.$('message').value,'Texto inicial. Atividade de frações.');
t.listeners.mic();assert.equal(t.recognition.stopped,true);t.recognition.onend();assert.equal(t.$('message').readOnly,false);assert.equal(t.$('send').disabled,false);assert.match(t.$('dictation-status').textContent,/Revise e edite/);
t.listeners.mic();t.recognition.onerror({error:'not-allowed'});t.recognition.onend();assert.match(t.$('dictation-status').textContent,/recusado/);assert.equal(t.$('message').value,'Texto inicial. Atividade de frações.');
t=setup({throws:true});t.listeners.mic();assert.equal(t.$('send').disabled,false);assert.equal(t.$('mic-label').textContent,'Ditar');assert.match(t.$('dictation-status').textContent,/Não foi possível iniciar/);
// Browser never sends onend: the stop deadline must unlock the composer.
t=setup();t.listeners.mic();t.recognition.onstart();const old=t.recognition;
old.onresult({results:[[{transcript:'Texto ditado.'}]]});t.listeners.mic();
assert.equal(t.$('mic-label').textContent,'Finalizando…');t.expire(1500);
assert.equal(old.aborted,true);assert.equal(t.$('mic-label').textContent,'Ditar');assert.equal(t.$('mic').disabled,false);assert.equal(t.$('message').readOnly,false);
t.$('message').value='Edição do professor.';old.onresult({results:[[{transcript:'Evento atrasado'}]]});old.onend();assert.equal(t.$('message').value,'Edição do professor.');
// Restart gets a fresh recognition session; an old end event cannot stop it.
t.listeners.mic();const fresh=t.recognition;assert.notEqual(fresh,old);fresh.onstart();old.onend();assert.equal(t.$('mic-label').textContent,'Parar');
fresh.onresult({results:[[{transcript:'Nova frase.'}]]});assert.equal(t.$('message').value,'Edição do professor. Nova frase.');
// Cancel while waiting for permission, startup deadline and stop exceptions.
t=setup();t.listeners.mic();t.listeners.mic();assert.equal(t.recognition.aborted,true);assert.equal(t.$('mic-label').textContent,'Ditar');t.recognition.onstart();assert.equal(t.$('mic-label').textContent,'Ditar');
t=setup();t.listeners.mic();t.expire(12000);assert.equal(t.$('send').disabled,false);assert.match(t.$('dictation-status').textContent,/não iniciou/);
t=setup({stopThrows:true});t.listeners.mic();t.recognition.onstart();t.listeners.mic();assert.equal(t.$('mic-label').textContent,'Ditar');assert.equal(t.$('send').disabled,false);
console.log('Ditado verificado: parada sem onend, eventos atrasados, reinício, cancelamento, timeouts, exceções, transcrição e permissões. Eventos controlados; sem áudio real.');
