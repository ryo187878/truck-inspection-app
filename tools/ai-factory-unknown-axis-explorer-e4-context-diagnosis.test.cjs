'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {exploreUnknownAxes}=require('./ai-factory-unknown-axis-explorer.cjs');

function count(content){
  return exploreUnknownAxes({files:[{path:'server.js',content}]}).candidates.length;
}

test('P7-E4-D1 isolated parameterized id route stays clean',()=>{
  assert.equal(count(`
    app.get('/getuser/:id',(req,res)=>{
      const id=parseInt(req.params.id);
      pool.query('SELECT * FROM users WHERE id = $1',[id],()=>{});
    });
  `),0);
});

test('P7-E4-D2 mixed file with unrelated response interpolation exposes context interaction',()=>{
  const n=count(`
    app.get('/getuser/:id',(req,res)=>{
      const id=parseInt(req.params.id);
      pool.query('SELECT * FROM users WHERE id = $1',[id],()=>{});
    });
    app.put('/updateuser/:id',(req,res)=>{
      const id=parseInt(req.params.id);
      const {name,email}=req.body;
      pool.query('UPDATE users SET name = $1, email = $2 WHERE id = $3',[name,email,id],()=>{
        res.status(200).send(\`User modified with ID: \${id}\`);
      });
    });
  `);
  console.log('P7-E4-D2 candidateCount',n);
  assert.equal(n,0);
});

test('P7-E4-D3 mixed file without response interpolation stays clean',()=>{
  assert.equal(count(`
    app.get('/getuser/:id',(req,res)=>{
      const id=parseInt(req.params.id);
      pool.query('SELECT * FROM users WHERE id = $1',[id],()=>{});
    });
    app.put('/updateuser/:id',(req,res)=>{
      const id=parseInt(req.params.id);
      const {name,email}=req.body;
      pool.query('UPDATE users SET name = $1, email = $2 WHERE id = $3',[name,email,id],()=>{
        res.status(200).send('User modified');
      });
    });
  `),0);
});
