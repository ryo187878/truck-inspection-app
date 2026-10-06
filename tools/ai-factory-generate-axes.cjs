#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {AXES}=require('./ai-factory-axis-registry.cjs');
const {RISK_ONTOLOGY}=require('./ai-factory-risk-ontology.cjs');
const {selectEffectiveInheritedAxes}=require('./ai-factory-score-axes.cjs');

const TEXT_EXTENSIONS=new Set(['.js','.cjs','.mjs','.ts','.tsx','.jsx','.html','.htm','.md','.sql','.json','.yml','.yaml','.rb','.py','.java','.cs','.php','.vue','.svelte']);
const IGNORE_DIRS=new Set(['.git','node_modules','vendor','dist','build','.next','coverage','tmp','log','storage']);
const MAX_FILE_BYTES=256*1024;
const MAX_TOTAL_BYTES=4*1024*1024;

function normalizeText(value){
  return String(value||'').toLowerCase();
}

function tokenize(value){
  return [...new Set(normalizeText(value)
    .split(/[^a-z0-9_.-]+/g)
    .map(x=>x.trim())
    .filter(x=>x.length>=3))];
}

function jaccard(a,b){
  const A=new Set(a), B=new Set(b);
  if(!A.size&&!B.size) return 1;
  let overlap=0;
  for(const x of A) if(B.has(x)) overlap++;
  return overlap/(A.size+B.size-overlap||1);
}

function existingAxisCorpus(axis){
  return [
    axis.axisId,axis.label,
    ...(axis.failurePatterns||[]),
    ...(axis.changedPaths||[])
  ].join(' ');
}

function noveltyAgainstExisting(candidate,axes=AXES){
  const ct=tokenize([candidate.axisId,candidate.label,...(candidate.tags||[])].join(' '));
  let maxSimilarity=0;
  let nearestAxis=null;
  for(const axis of axes){
    const similarity=jaccard(ct,tokenize(existingAxisCorpus(axis)));
    if(similarity>maxSimilarity){
      maxSimilarity=similarity;
      nearestAxis=axis.axisId;
    }
  }
  return {
    noveltyScore:Number(((1-maxSimilarity)*100).toFixed(2)),
    nearestAxis,
    similarity:Number(maxSimilarity.toFixed(4))
  };
}

function walk(root){
  const out=[];
  let total=0;
  function visit(current){
    if(total>=MAX_TOTAL_BYTES) return;
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      if(total>=MAX_TOTAL_BYTES) break;
      if(IGNORE_DIRS.has(entry.name)) continue;
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){
        visit(full);
        continue;
      }
      const ext=path.extname(entry.name).toLowerCase();
      if(!TEXT_EXTENSIONS.has(ext) && !['README','README.md','Gemfile','Rakefile','package.json'].includes(entry.name)) continue;
      const stat=fs.statSync(full);
      if(stat.size>MAX_FILE_BYTES) continue;
      const text=fs.readFileSync(full,'utf8');
      total+=Buffer.byteLength(text);
      out.push({path:path.relative(root,full).replace(/\\/g,'/'),text});
    }
  }
  visit(root);
  return out;
}

function profileDirectory(root,{name=path.basename(root)}={}){
  const files=walk(root);
  return {
    name,
    root,
    fileCount:files.length,
    files,
    text:files.map(f=>'FILE:'+f.path+'\n'+f.text).join('\n')
  };
}

function matchedSignals(profile,rule){
  const corpus=normalizeText(profile.text);
  const groups=[];
  for(const group of rule.signalGroups){
    const hits=group.filter(term=>corpus.includes(normalizeText(term)));
    if(hits.length) groups.push(hits);
  }
  const files=profile.files
    .filter(file=>rule.signalGroups.flat().some(term=>normalizeText(file.text).includes(normalizeText(term))))
    .map(file=>file.path);
  return {groups,files:[...new Set(files)].sort()};
}

function buildCandidate(profile,rule,axes=AXES){
  const match=matchedSignals(profile,rule);
  if(match.groups.length<rule.minGroups) return null;
  const base={
    axisId:rule.axisId,
    label:rule.label,
    generationProposed:71,
    sourceProfile:profile.name,
    sourceSignals:match.groups,
    sourceFiles:match.files,
    riskStatement:rule.riskStatement,
    testHypothesis:rule.testHypothesis,
    oracle:rule.oracle,
    tags:rule.tags
  };
  const novelty=noveltyAgainstExisting(base,axes);
  const confidence=Math.min(100,50+(match.groups.length*10)+Math.min(10,match.files.length*2));
  const candidate={...base,...novelty,confidenceScore:confidence};
  candidate.meta=metaValidateCandidate(candidate);
  return candidate;
}

function metaValidateCandidate(candidate){
  const checks={
    falsifiable:Boolean(candidate.testHypothesis&&candidate.oracle),
    sourceGrounded:Array.isArray(candidate.sourceSignals)&&candidate.sourceSignals.length>=3,
    sourceFilesPresent:Array.isArray(candidate.sourceFiles)&&candidate.sourceFiles.length>=1,
    novelEnough:Number(candidate.noveltyScore)>=70,
    confidentEnough:Number(candidate.confidenceScore)>=75,
    machineReadable:Boolean(candidate.axisId&&candidate.label&&Number.isInteger(candidate.generationProposed))
  };
  return {
    checks,
    pass:Object.values(checks).every(Boolean),
    status:Object.values(checks).every(Boolean)?'PASS':'REJECT'
  };
}

function generateCandidates(profile,{axes=AXES}={}){
  return RISK_ONTOLOGY
    .map(rule=>buildCandidate(profile,rule,axes))
    .filter(Boolean)
    .sort((a,b)=>b.confidenceScore-a.confidenceScore || b.noveltyScore-a.noveltyScore || a.axisId.localeCompare(b.axisId));
}

function promoteCandidate(candidate,evidence,{generation=72}={}){
  if(!candidate?.meta?.pass) throw new Error('Candidate meta-validation has not passed');
  if(!evidence||!['detected','validated'].includes(evidence.outcome)) throw new Error('Accepted external Evidence is required');
  if(evidence.axisId!==candidate.axisId) throw new Error('Evidence axis mismatch');
  const inherited=selectEffectiveInheritedAxes([
    'auth.context-isolation',
    'promotion.shared-dna',
    'impact.test-selection',
    'change.diff-purity',
    'dispatch.branch-normalization',
    'axis.effectiveness-scoring'
  ],undefined,{maxCount:2,minCount:1});
  return {
    axisId:candidate.axisId,
    label:candidate.label,
    generationIntroduced:generation,
    inheritedFrom:['axis.novelty-generation',...inherited.selected].filter((v,i,a)=>a.indexOf(v)===i),
    sourceProfile:candidate.sourceProfile,
    riskStatement:candidate.riskStatement,
    oracle:candidate.oracle,
    evidenceId:evidence.evidenceId,
    evidenceOutcome:evidence.outcome,
    noveltyScore:candidate.noveltyScore,
    confidenceScore:candidate.confidenceScore
  };
}

function parseArgs(argv){
  const out={root:null,name:null,json:false};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--scan') out.root=argv[++i];
    else if(argv[i]==='--name') out.name=argv[++i];
    else if(argv[i]==='--json') out.json=true;
    else throw new Error('Unknown option: '+argv[i]);
  }
  return out;
}

if(require.main===module){
  try{
    const args=parseArgs(process.argv.slice(2));
    if(!args.root) throw new Error('--scan ROOT is required');
    const profile=profileDirectory(path.resolve(args.root),{name:args.name||path.basename(args.root)});
    const candidates=generateCandidates(profile);
    const output={profile:{name:profile.name,fileCount:profile.fileCount},candidates};
    console.log(args.json?JSON.stringify(output,null,2):candidates.map(c=>c.axisId+' '+c.meta.status+' novelty='+c.noveltyScore+' confidence='+c.confidenceScore).join('\n'));
  }catch(error){
    console.error(error.message);
    process.exitCode=2;
  }
}

module.exports={normalizeText,tokenize,jaccard,noveltyAgainstExisting,walk,profileDirectory,matchedSignals,buildCandidate,metaValidateCandidate,generateCandidates,promoteCandidate,parseArgs};
