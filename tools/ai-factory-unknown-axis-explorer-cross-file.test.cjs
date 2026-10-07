'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {exploreUnknownAxes}=require('./ai-factory-unknown-axis-explorer.cjs');

test('P7-E3-1 cross-file propagation from external boundary to structural sink must be discoverable',()=>{
  const project={files:[
    {
      path:'app/controllers/tutorial.controller.js',
      content:`
exports.findAll=(req,res)=>{
  const title=req.query.title;
  Tutorial.getAll(title,(err,data)=>res.send(data));
};`
    },
    {
      path:'app/models/tutorial.model.js',
      content:`
Tutorial.getAll=(title,result)=>{
  let query='SELECT * FROM tutorials';
  if(title){ query += \` WHERE title LIKE '%\${title}%'\`; }
  sql.query(query,(err,res)=>result(null,res));
};`
    }
  ]};

  const result=exploreUnknownAxes(project);
  assert.equal(result.candidates.length,1,
    'Missed Risk: external input crosses a file/function boundary before reaching a structural sink');
  assert.equal(result.candidates[0].meta.pass,true);
  assert.ok(result.candidates[0].provenance.length>=1);
});
