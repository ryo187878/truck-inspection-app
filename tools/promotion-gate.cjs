#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const SHARED_FILES=[
  {name:'dispatch-service',root:'dispatch-service.js',mainRef:'./dispatch-service.js',testRef:'../dispatch-service.js',testCopy:'test/dispatch-service.js'},
  {name:'today-vehicle-status',root:'today-vehicle-status.js',mainRef:'./today-vehicle-status.js',testRef:'../today-vehicle-status.js',testCopy:'test/today-vehicle-status.js'},
  {name:'yamato-daily',root:'yamato-daily.js',mainRef:'./yamato-daily.js',testRef:'../yamato-daily.js',testCopy:'test/yamato-daily.js'}
];

const SHARED_BLOCKS=[
  {
    name:'board-metadata-loader',
    start:'async function ensureBoardMetadata(){',
    end:'async function promoteAdvanceRecords(){'
  },
  {
    name:'today-vehicle-status-ui',
    start:'function renderTodayVehicleLists(){',
    end:'function renderMasters(){'
  },
  {
    name:'general-dispatch-editor',
    start:'function dispatchMakeEmptySlot(){',
    end:'function dispatchOnFormCountChanged'
  }
];

function normalizeBlock(value){
  return String(value||'')
    .replace(/\r\n?/g,'\n')
    .split('\n')
    .map(line=>line.trim())
    .filter(Boolean)
    .join('\n');
}

function blockBetween(source,start,end){
  const a=source.indexOf(start);
  if(a<0) return null;
  const b=source.indexOf(end,a+start.length);
  if(b<0) return null;
  return source.slice(a,b);
}

function scriptRefPresent(html,ref){
  return html.includes('src="'+ref+'"') || html.includes("src='"+ref+"'");
}

function evaluatePromotionGate(rootDir){
  const issues=[];
  const checks=[];
  const mainPath=path.join(rootDir,'index.html');
  const testPath=path.join(rootDir,'test','index.html');

  if(!fs.existsSync(mainPath) || !fs.existsSync(testPath)){
    return {
      pass:false,
      issues:[{code:'MISSING_ENTRYPOINT',detail:'index.html または test/index.html がありません。'}],
      checks:[]
    };
  }

  const main=fs.readFileSync(mainPath,'utf8');
  const test=fs.readFileSync(testPath,'utf8');

  for(const file of SHARED_FILES){
    const rootPath=path.join(rootDir,file.root);
    const copyPath=path.join(rootDir,...file.testCopy.split('/'));
    const rootExists=fs.existsSync(rootPath);
    const mainUsesRoot=scriptRefPresent(main,file.mainRef);
    const testUsesRoot=scriptRefPresent(test,file.testRef);
    const duplicateExists=fs.existsSync(copyPath);

    checks.push({type:'shared-file',name:file.name,rootExists,mainUsesRoot,testUsesRoot,duplicateExists});

    if(!rootExists) issues.push({code:'MISSING_SHARED_FILE',name:file.name,detail:file.root});
    if(!mainUsesRoot) issues.push({code:'MAIN_NON_CANONICAL_REF',name:file.name,detail:file.mainRef});
    if(!testUsesRoot) issues.push({code:'TEST_NON_CANONICAL_REF',name:file.name,detail:file.testRef});
    if(duplicateExists) issues.push({code:'DUPLICATE_SHARED_FILE',name:file.name,detail:file.testCopy});
  }

  for(const block of SHARED_BLOCKS){
    const mainBlock=blockBetween(main,block.start,block.end);
    const testBlock=blockBetween(test,block.start,block.end);
    const exists=!!mainBlock && !!testBlock;
    const same=exists && normalizeBlock(mainBlock)===normalizeBlock(testBlock);

    checks.push({type:'shared-dna',name:block.name,exists,same});

    if(!exists){
      issues.push({code:'SHARED_DNA_MARKER_MISSING',name:block.name});
      continue;
    }
    if(!same){
      issues.push({code:'SHARED_DNA_MISMATCH',name:block.name});
    }
  }

  return {pass:issues.length===0,issues,checks};
}

function format(result){
  const lines=[];
  lines.push(result.pass?'PROMOTION GATE: PASS':'PROMOTION GATE: STOP');
  for(const issue of result.issues){
    lines.push('- '+issue.code+(issue.name?' ['+issue.name+']':'')+(issue.detail?' '+issue.detail:''));
  }
  lines.push('Human approval is required before promotion. This tool never promotes files automatically.');
  return lines.join('\n');
}

if(require.main===module){
  const root=path.resolve(__dirname,'..');
  const result=evaluatePromotionGate(root);
  console.log(format(result));
  process.exitCode=result.pass?0:2;
}

module.exports={SHARED_FILES,SHARED_BLOCKS,normalizeBlock,blockBetween,evaluatePromotionGate,format};
