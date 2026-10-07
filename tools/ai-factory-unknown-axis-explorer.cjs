'use strict';

const {AXES}=require('./ai-factory-axis-registry.cjs');

function tokenize(value){
  return [...new Set(String(value||'').toLowerCase().replace(/[._/:-]+/g,' ').split(/[^a-z0-9]+/).filter(x=>x.length>=3))];
}
function jaccard(a,b){
  const A=new Set(a),B=new Set(b);
  if(!A.size||!B.size) return 0;
  let n=0; for(const x of A) if(B.has(x)) n++;
  return n/(A.size+B.size-n);
}
function novelty(candidate){
  const ct=tokenize([candidate.axisId,candidate.label,candidate.riskStatement].join(' '));
  let best={axisId:null,similarity:0};
  for(const axis of AXES){
    const at=tokenize([axis.axisId,axis.label,...(axis.failurePatterns||[])].join(' '));
    const s=jaccard(ct,at);
    if(s>best.similarity) best={axisId:axis.axisId,similarity:s};
  }
  return {nearestAxisId:best.axisId,similarity:+best.similarity.toFixed(3),noveltyScore:+(1-best.similarity).toFixed(3)};
}

function hasAllowlistGuard(text,name){
  const n=name.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  return new RegExp('(?:allowed|allowlist)[\\s\\S]{0,180}(?:includes|has)\\s*\\([^)]*'+n,'i').test(text);
}
function isParameterized(text){
  return /(?:query|run|execute)\s*\(\s*['"`][\s\S]*?\?[\s\S]*?['"`]\s*,\s*\[/i.test(text);
}
function findExternalNames(text){
  const out=new Set();
  const re=/(?:req\.(?:query|body|params)|ctx\.input)\.([A-Za-z_$][\w$]*)/g;
  for(const m of text.matchAll(re)) out.add(m[1]);
  return [...out];
}
function reachesStructuralSink(text,name){
  const n=name.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
  // Track a simple local alias from an external boundary, then require that alias
  // to be concatenated/interpolated into query structure or ordering/limiting APIs.
  const aliasRe=new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:req\\.(?:query|body|params)|ctx\\.input)\\.'+n+'\\b','g');
  const aliases=[name];
  for(const m of text.matchAll(aliasRe)) aliases.push(m[1]);
  return aliases.some(alias=>{
    const a=alias.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
    const concat=new RegExp("(?:query|run|execute)\\s*\\([\\s\\S]{0,240}\\+\\s*"+a+'\\b','i');
    const template=new RegExp('(?:query|run|execute)\\s*\\([\\s\\S]{0,240}\\$\\{\\s*'+a+'\\s*\\}','i');
    const structuralApi=new RegExp('(?:orderBy|limit|offset|groupBy|sortBy)\\s*\\(\\s*'+a+'\\s*\\)','i');
    return concat.test(text)||template.test(text)||structuralApi.test(text);
  });
}

function findCrossFileFindings(project){
  const findings=[];
  const files=project?.files||[];
  for(const source of files){
    const sourceText=String(source.content||'');
    for(const name of findExternalNames(sourceText)){
      const n=name.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      const aliasMatch=sourceText.match(new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:req\\.(?:query|body|params)|ctx\\.input)\\.'+n+'\\b'));
      const valueName=aliasMatch?aliasMatch[1]:name;
      const v=valueName.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      const callRe=new RegExp('([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)+)\\s*\\(\\s*'+v+'\\s*(?:,|\\))','g');
      for(const call of sourceText.matchAll(callRe)){
        const method=call[1].split('.').pop();
        for(const sink of files){
          if(sink===source) continue;
          const sinkText=String(sink.content||'');
          const defRe=new RegExp('(?:\\.'+method+'\\s*=|'+method+'\\s*=|function\\s+'+method+')\\s*(?:\\([^)]*\\b'+v+'\\b|\\([^)]*\\))','i');
          const genericDef=new RegExp('\\.'+method+'\\s*=\\s*\\(\\s*([A-Za-z_$][\\w$]*)','i');
          const dm=sinkText.match(genericDef);
          if(!defRe.test(sinkText) && !dm) continue;
          const param=dm?dm[1]:valueName;
          if(isParameterized(sinkText)) continue;
          if(hasAllowlistGuard(sinkText,param)) continue;
          if(reachesStructuralSink(sinkText,param)){
            findings.push({path:sink.path,input:name,sourcePath:source.path,fact:'external input crosses a file/function boundary and reaches structural data-operation sink without observed allowlist'});
          }
        }
      }
    }
  }
  return findings;
}

function exploreUnknownAxes(project){
  const findings=findCrossFileFindings(project);
  for(const file of project?.files||[]){
    const text=String(file.content||'');
    if(isParameterized(text)) continue;
    for(const name of findExternalNames(text)){
      if(hasAllowlistGuard(text,name)) continue;
      if(reachesStructuralSink(text,name)) findings.push({path:file.path,input:name,fact:'external input reaches structural data-operation sink without observed allowlist'});
    }
  }
  if(!findings.length) return {candidates:[]};

  const candidate={
    axisId:'boundary.structural-input-separation',
    label:'外部入力とデータ操作構造の分離',
    riskStatement:'Externally controlled values can alter the structure of a data operation when they reach structural sinks without an observed allowlist or equivalent structural guard.',
    detector:'external-input-to-structural-sink-without-guard',
    provenance:findings,
    proposedTests:[
      'Exercise representative structural inputs and require unapproved structure-changing values to be rejected or normalized before the sink.',
      'Exercise approved normal values and verify the guard does not block valid data operations.'
    ]
  };
  const n=novelty(candidate);
  const issues=[];
  if(AXES.some(a=>a.axisId===candidate.axisId)) issues.push('axis-id-already-exists');
  if(n.noveltyScore<0.55) issues.push('insufficient-novelty');
  if(!candidate.provenance.length) issues.push('missing-provenance');
  if(candidate.proposedTests.length<2) issues.push('missing-proposed-tests');
  return {candidates:[{...candidate,novelty:n,meta:{pass:issues.length===0,issues}}]};
}

function sourceText(){
  const fs=require('node:fs');
  return fs.readFileSync(__filename,'utf8');
}

module.exports={exploreUnknownAxes,sourceText,tokenize,jaccard};
