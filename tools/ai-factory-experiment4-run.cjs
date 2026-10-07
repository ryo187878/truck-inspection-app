'use strict';

const {exploreUnknownAxes}=require('./ai-factory-unknown-axis-explorer.cjs');
const frozen=require('./ai-factory-experiment4-frozen-targets.cjs');

const paths={
  'mongodb-developer/mongodb-express-rest-api-example':[
    'server/routes/posts.mjs','server/db/conn.mjs'
  ],
  'umagol/nodejs-postgresql':['server.js'],
  'fastify/demo':[
    'src/routes/api/tasks/index.ts',
    'src/plugins/app/tasks/tasks-repository.ts',
    'src/routes/api/users/index.ts',
    'src/plugins/app/users/users-repository.ts'
  ],
  'rwieruch/node-express-postgresql-server':[
    'src/routes/message.js','src/routes/user.js',
    'src/models/message.js','src/models/user.js'
  ]
};

async function fetchText(url){
  const r=await fetch(url,{headers:{'user-agent':'ai-factory-experiment4'}});
  if(!r.ok) throw new Error('fetch failed '+r.status+' '+url);
  return r.text();
}

async function main(){
  const started=process.hrtime.bigint();
  const results=[];
  for(const target of frozen.targets){
    const files=[];
    const t0=process.hrtime.bigint();
    for(const path of paths[target.repo]||[]){
      const url='https://raw.githubusercontent.com/'+target.repo+'/'+target.commit+'/'+path;
      files.push({path,content:await fetchText(url)});
    }
    const scan0=process.hrtime.bigint();
    const output=exploreUnknownAxes({files});
    const scan1=process.hrtime.bigint();
    results.push({
      repo:target.repo,
      commit:target.commit,
      files:files.map(f=>f.path),
      candidateCount:output.candidates.length,
      candidates:output.candidates,
      scanMs:Number(scan1-scan0)/1e6,
      totalRepoMs:Number(scan1-t0)/1e6
    });
  }
  const ended=process.hrtime.bigint();
  console.log(JSON.stringify({
    experiment:frozen.experiment,
    frozenBeforeSourceInspection:frozen.frozenBeforeSourceInspection,
    explorerProblemHint:null,
    results,
    totalMs:Number(ended-started)/1e6
  },null,2));
}
main().catch(err=>{console.error(err);process.exitCode=1;});
