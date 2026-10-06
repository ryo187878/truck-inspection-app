#!/usr/bin/env node
'use strict';

const path=require('node:path');
const cp=require('node:child_process');
const {AXES,AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');

function normalizePath(value){
  return String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').trim();
}

function textMatches(patterns,text){
  const hay=String(text||'').toLowerCase();
  return (patterns||[]).some(p=>hay.includes(String(p).toLowerCase()));
}

function pathMatches(axis,file){
  const f=normalizePath(file);
  return (axis.changedPaths||[]).some(p=>{
    p=normalizePath(p);
    return f===p || f.endsWith('/'+p);
  });
}

function inferAxes({explicitAxes=[],changedFiles=[],failureText=''}={}){
  const selected=new Set();
  for(const id of explicitAxes){
    if(!AXIS_BY_ID.has(id)) throw new Error('Unknown axis: '+id);
    selected.add(id);
  }
  for(const axis of AXES){
    if(changedFiles.some(file=>pathMatches(axis,file)) || textMatches(axis.failurePatterns,failureText)){
      selected.add(axis.axisId);
    }
  }

  // Shared canonical sources must always carry the shared-DNA and diff-purity guards.
  const shared=['dispatch-service.js','today-vehicle-status.js','yamato-daily.js','auth-context.js'];
  if(changedFiles.some(f=>shared.some(s=>normalizePath(f)===s || normalizePath(f).endsWith('/'+s)))){
    selected.add('promotion.shared-dna');
    selected.add('change.diff-purity');
  }

  // Inherited axes are part of the selected generation's safety envelope.
  let expanded=true;
  while(expanded){
    expanded=false;
    for(const id of [...selected]){
      const axis=AXIS_BY_ID.get(id);
      for(const parent of axis?.inheritedFrom||[]){
        if(!selected.has(parent)){selected.add(parent);expanded=true;}
      }
    }
  }
  return [...selected].sort();
}

function buildTargetedPlan(axisIds){
  const targets=new Map();
  for(const id of axisIds){
    const axis=AXIS_BY_ID.get(id);
    if(!axis) throw new Error('Unknown axis: '+id);
    for(const target of axis.testTargets){
      const key=target.file+'\u0000'+target.namePattern;
      targets.set(key,{...target,axes:[...(targets.get(key)?.axes||[]),id]});
    }
  }
  return [...targets.values()].sort((a,b)=>(a.file+a.namePattern).localeCompare(b.file+b.namePattern));
}

function targetToCommand(target){
  const args=['--test'];
  if(target.namePattern && target.namePattern!=='.*') args.push('--test-name-pattern='+target.namePattern);
  args.push(target.file);
  return {command:process.execPath,args};
}

function makePlan(input={}){
  const registry=validateRegistry();
  if(!registry.pass) throw new Error('Invalid axis registry: '+registry.issues.join(', '));
  const axes=inferAxes(input);
  const fallback=axes.length===0;
  const targeted=fallback
    ? [{file:'tools/*.test.cjs',namePattern:'.*',axes:['safe.full-regression-fallback']}]
    : buildTargetedPlan(axes);
  return {
    axes,
    fallback,
    targeted:targeted.map(t=>({...t,exec:targetToCommand(t)})),
    finalFullRegression:{
      required:true,
      command:process.execPath,
      args:['--test','tools/*.test.cjs'],
      note:'Targeted tests accelerate diagnosis only. Full regression remains mandatory before promotion.'
    }
  };
}

function parseArgs(argv){
  const out={explicitAxes:[],changedFiles:[],failureText:'',run:false,json:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--axis') out.explicitAxes.push(argv[++i]);
    else if(arg==='--changed') out.changedFiles.push(argv[++i]);
    else if(arg==='--failure') out.failureText=argv[++i]||'';
    else if(arg==='--run') out.run=true;
    else if(arg==='--json') out.json=true;
    else if(arg==='--help') out.help=true;
    else throw new Error('Unknown option: '+arg);
  }
  return out;
}

function executePlan(plan){
  for(const target of plan.targeted){
    const result=cp.spawnSync(target.exec.command,target.exec.args,{stdio:'inherit'});
    if(result.status!==0) return result.status||1;
  }
  return 0;
}

function formatPlan(plan){
  const lines=[];
  lines.push('AI FACTORY IMPACT TEST SELECTOR');
  lines.push('Axes: '+(plan.axes.length?plan.axes.join(', '):'(none; safe full-regression fallback)'));
  for(const t of plan.targeted){
    lines.push('- '+t.file+(t.namePattern==='.*'?'':' / '+t.namePattern));
  }
  lines.push('Final full regression required: YES');
  return lines.join('\n');
}

if(require.main===module){
  try{
    const options=parseArgs(process.argv.slice(2));
    if(options.help){
      console.log('Usage: node tools/ai-factory-select-tests.cjs [--axis ID] [--changed PATH] [--failure TEXT] [--run] [--json]');
      process.exit(0);
    }
    const plan=makePlan(options);
    console.log(options.json?JSON.stringify(plan,null,2):formatPlan(plan));
    if(options.run) process.exitCode=executePlan(plan);
  }catch(error){
    console.error(error.message);
    process.exitCode=2;
  }
}

module.exports={normalizePath,inferAxes,buildTargetedPlan,targetToCommand,makePlan,parseArgs,executePlan,formatPlan};
