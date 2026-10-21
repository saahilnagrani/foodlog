// Syntax-check every inline <script> in index.html. Run before pushing:
//   node tools/check_js.js
// One unescaped apostrophe in a quoted string blanks the whole app.
const fs=require('fs'), vm=require('vm');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let bad=0;
[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m,i)=>{
  try{ new vm.Script(m[1]); }catch(e){ bad++; console.error('index.html script '+i+': '+e.message+'\n'+e.stack.split('\n').slice(1,3).join('\n')); }
});
if(bad) process.exit(1); else console.log('index.html scripts: OK');
