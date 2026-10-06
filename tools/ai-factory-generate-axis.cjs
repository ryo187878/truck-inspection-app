#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {AXES,AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const {selectEffectiveInheritedAxes}=require('./ai-factory-score-axes.cjs');

const TEXT_EXTENSIONS=new Set(['.js','.cjs','.mjs','.ts','.tsx','.jsx','.html','.htm','.sql']);

function walkTextFiles(root){
  const out=[];
  function walk(current){
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      if(['node_modules','.git','dist','build','coverage'].includes(entry.name)) continue;
      const full=path.join(current,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  }
  walk(root);
  return out.sort();
}

function loadProject(root){
  const abs=path.resolve(root);
  const files=walkTextFiles(abs).map(full=>({
    path:path.relative(abs,full).replace(/\\/g,'/'),
    content:fs.readFileSync(full,'utf8')
  }));
  return {root:abs,files};
}

function tokenize(value){
  return [...new Set(String(value||'')
    .toLowerCase()
    .replace(/[._/:-]+/g,' ')
    .split(/[^a-z0-9]+/)
    .filter(token=>token.length>=3))];
}

function jaccard(a,b){
  const A=new Set(a),B=new Set(b);
  if(A.size===0||B.size===0) return 0;
  let intersection=0;
  for(const token of A) if(B.has(token)) intersection++;
  return intersection/(A.size+B.size-intersection);
}

function existingAxisTokens(axis){
  return tokenize([axis.axisId,axis.label,...(axis.failurePatterns||[])].join(' '));
}

function noveltyAgainstRegistry(candidate){
  const candidateTokens=tokenize([candidate.axisId,candidate.label,candidate.riskStatement].join(' '));
  let best={axisId:null,similarity:0};
  for(const axis of AXES){
    const similarity=jaccard(candidateTokens,existingAxisTokens(axis));
    if(similarity>best.similarity) best={axisId:axis.axisId,similarity};
  }
  return {
    nearestAxisId:best.axisId,
    similarity:Number(best.similarity.toFixed(3)),
    noveltyScore:Number((1-best.similarity).toFixed(3))
  };
}

function parseTagAttributes(tag){
  const attrs={};
  for(const match of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)){
    attrs[match[1].toLowerCase()]=match[2];
  }
  return attrs;
}

function escapeRegExp(value){
  return String(value).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
}

function findFrontendLowerBoundFields(files){
  const findings=[];
  for(const file of files){
    if(!/\.html?$/i.test(file.path)) continue;
    for(const match of file.content.matchAll(/<input\b[^>]*>/gi)){
      const attrs=parseTagAttributes(match[0]);
      const field=attrs.name||attrs.id;
      if(!field) continue;
      if(attrs.type==='number' && attrs.min!==undefined && Number(attrs.min)>=0){
        findings.push({field,lowerBound:Number(attrs.min),path:file.path,fact:'numeric input '+field+' min='+attrs.min});
      }
    }
  }
  return findings;
}

function serverMentionsField(files,field){
  const re=new RegExp('\\b'+escapeRegExp(field)+'\\b');
  return files.some(file=>!/\.html?$/i.test(file.path) && re.test(file.content));
}

function hasLowerBoundGuard(files,field,lowerBound=0){
  const escaped=escapeRegExp(field);
  const patterns=[
    new RegExp(escaped+'\\s*<\\s*'+lowerBound,'i'),
    new RegExp(escaped+'\\s*<=\\s*'+(lowerBound-1),'i'),
    new RegExp(escaped+'\\s*<\\s*'+(lowerBound+1),'i'),
    new RegExp('Number\\.isFinite\\([^)]*'+escaped,'i')
  ];
  return files.some(file=>!/\.html?$/i.test(file.path) && patterns.some(re=>re.test(file.content)));
}

function detectBoundaryServerEnforcement(project){
  const findings=findFrontendLowerBoundFields(project.files);
  const uncovered=findings.filter(item=>serverMentionsField(project.files,item.field) && !hasLowerBoundGuard(project.files,item.field,item.lowerBound));
  if(!uncovered.length) return [];
  return [{
    axisId:'boundary.server-domain-enforcement',
    label:'クライアント制約のサーバー境界強制',
    riskStatement:'Client-side numeric domain constraints can be bypassed when the server accepts the same fields without equivalent lower-bound validation.',
    detector:'frontend-lower-bound-without-server-guard',
    provenance:uncovered.map(item=>({path:item.path,fact:item.fact})),
    proposedTests:[
      'Call the write API directly with values below the client-declared lower bound and require rejection.',
      'Verify persisted and aggregated values never violate the server-side numeric domain.'
    ]
  }];
}

function findConsumptionFields(files){
  const results=[];
  for(const file of files){
    const regex=/\b([a-zA-Z_]\w*)\s*-\s*COALESCE\s*\(\s*SUM\s*\(\s*(?:[a-zA-Z_]\w*\.)?([a-zA-Z_]\w*)\s*\)/g;
    for(const match of file.content.matchAll(regex)){
      results.push({resourceField:match[1],consumptionField:match[2],path:file.path,fact:match[1]+' subtracts SUM('+match[2]+')'});
    }
  }
  return results;
}

function hasPositiveGuard(files,field){
  const escaped=escapeRegExp(field);
  const patterns=[
    new RegExp(escaped+'\\s*<\\s*1','i'),
    new RegExp(escaped+'\\s*<=\\s*0','i'),
    new RegExp('0\\s*>=\\s*'+escaped,'i'),
    new RegExp('1\\s*>\\s*'+escaped,'i')
  ];
  return files.some(file=>patterns.some(re=>re.test(file.content)));
}

function detectConsumptionSignInvariant(project){
  const findings=findConsumptionFields(project.files).filter(item=>!hasPositiveGuard(project.files,item.consumptionField));
  if(!findings.length) return [];
  return [{
    axisId:'resource.consumption-sign-invariant',
    label:'資源消費量の正数不変条件',
    riskStatement:'A quantity that is subtracted from finite resource capacity can increase available capacity when zero or negative values are accepted.',
    detector:'resource-subtraction-without-positive-guard',
    provenance:findings.map(item=>({path:item.path,fact:item.fact})),
    proposedTests:[
      'Submit zero and negative consumption quantities and require rejection before persistence.',
      'Verify successful consumption can never increase the reported available resource.'
    ]
  }];
}

function getInheritedAxes(){
  const candidates=[
    'axis.effectiveness-scoring','impact.test-selection','promotion.shared-dna',
    'auth.context-isolation','change.diff-purity','dispatch.branch-normalization'
  ].filter(id=>AXIS_BY_ID.has(id));
  return selectEffectiveInheritedAxes(candidates,undefined,{minCount:1,maxCount:3}).selected;
}

function metaValidateCandidate(candidate,{generation=71}={}){
  const novelty=noveltyAgainstRegistry(candidate);
  const issues=[];
  if(AXIS_BY_ID.has(candidate.axisId)) issues.push('axis-id-already-exists');
  if(novelty.noveltyScore<0.55) issues.push('insufficient-novelty');
  if(!candidate.provenance?.length) issues.push('missing-provenance');
  if(!candidate.proposedTests?.length) issues.push('missing-proposed-tests');
  if(!candidate.riskStatement) issues.push('missing-risk-statement');
  return {
    ...candidate,
    generationIntroduced:generation,
    inheritedFrom:getInheritedAxes(),
    novelty,
    meta:{pass:issues.length===0,issues}
  };
}

function dedupeCandidates(candidates){
  const seen=new Set();
  const out=[];
  for(const candidate of candidates){
    if(seen.has(candidate.axisId)) continue;
    seen.add(candidate.axisId);
    out.push(candidate);
  }
  return out;
}

function generateAxisCandidates(projectRoot,{generation=71}={}){
  const registry=validateRegistry();
  if(!registry.pass) throw new Error('Invalid axis registry: '+registry.issues.join(', '));
  const project=loadProject(projectRoot);
  const raw=dedupeCandidates([
    ...detectBoundaryServerEnforcement(project),
    ...detectConsumptionSignInvariant(project)
  ]);
  return {projectRoot:path.resolve(projectRoot),generation,candidates:raw.map(candidate=>metaValidateCandidate(candidate,{generation}))};
}

function promoteCandidateToAxis(candidate,evidence,{generation=candidate.generationIntroduced+10}={}){
  if(!candidate?.meta?.pass) throw new Error('Candidate meta validation has not passed');
  if(!evidence || evidence.confirmed!==true) throw new Error('Confirmed Evidence is required');
  if(evidence.issueDetected!==true) throw new Error('Issue-detection Evidence is required');
  if(!evidence.evidenceId) throw new Error('Evidence ID is required');
  return {
    axisId:candidate.axisId,
    label:candidate.label,
    generationIntroduced:generation,
    inheritedFrom:['axis.candidate-generation',...candidate.inheritedFrom].filter((v,i,a)=>a.indexOf(v)===i),
    changedPaths:[],
    failurePatterns:tokenize(candidate.axisId+' '+candidate.riskStatement),
    testTargets:[],
    evidenceId:evidence.evidenceId,
    generatedBy:'axis.candidate-generation'
  };
}

function formatResult(result){
  const lines=['AI FACTORY VALIDATION AXIS CANDIDATE GENERATOR','Generation: '+result.generation,'Candidates: '+result.candidates.length];
  for(const candidate of result.candidates){
    lines.push('- '+candidate.axisId+' meta='+(candidate.meta.pass?'PASS':'STOP')+' novelty='+candidate.novelty.noveltyScore.toFixed(3)+' inherited='+candidate.inheritedFrom.join(','));
  }
  return lines.join('\n');
}

if(require.main===module){
  const root=process.argv[2];
  if(!root){
    console.error('Usage: node tools/ai-factory-generate-axis.cjs <project-root> [--json]');
    process.exitCode=2;
  }else{
    try{
      const result=generateAxisCandidates(root);
      console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):formatResult(result));
    }catch(error){
      console.error(error.message);
      process.exitCode=2;
    }
  }
}

module.exports={
  walkTextFiles,loadProject,tokenize,jaccard,noveltyAgainstRegistry,
  findFrontendLowerBoundFields,detectBoundaryServerEnforcement,
  findConsumptionFields,detectConsumptionSignInvariant,
  getInheritedAxes,metaValidateCandidate,dedupeCandidates,
  generateAxisCandidates,promoteCandidateToAxis,formatResult
};
